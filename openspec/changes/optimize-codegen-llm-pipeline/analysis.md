# 分析：调用模型生成代码的链路机制与弱点（证据底稿）

> 行号为梳理时的指示值，实施前以当前源码为准。

## 链路总览

```
用户意图
 → convertToLLMMessageService（组装消息 + 上下文注入 + 修剪 + 工具格式适配）
 → sendLLMMessageService（IPC → main）
 → electron-main/llmMessage/*（provider 适配 + 流式 SSE + prompt caching）
 → 模型输出（文本 / SEARCH·REPLACE 块 / 工具调用）
 → extractCodeFromResult（解析代码 / 块 / FIM）
 → editCodeService（Apply / Fast Apply → DiffZone 流式落地 + 重试）
```

## A. Prompt 组装（`common/prompt/prompts.ts`）

- 编辑块标记：`ORIGINAL='<<<<<<< ORIGINAL'`、`DIVIDER='======='`、`FINAL='>>>>>>> UPDATED'`（~行 38-40）。
- 工具：`edit_file`（单文件 SEARCH/REPLACE，~312-323）、`batch_edit`（多文件，~325-331）、`rewrite_file`（全文重写，>50% 改动推荐，~333-344）。
- 分页/截断常量（~25-29）：`MAX_FILE_CHARS_PAGE=40_000`（≈10K token）、`MAX_TERMINAL_CHARS=20_000`、`MAX_PREFIX_SUFFIX_CHARS=20_000`。
- Ctrl+K 前后缀提取 `voidPrefixAndSuffix()`（~1080-1124）：从选区上下扩展到字符上限。
- **弱点**：块要求"EXACTLY match"，对 tab/空格/尾随空格/`\r\n` 敏感；System Prompt 每轮全量重发；前后缀按字符截断、不感知块结构。

## B. LLM 调用管线

- `sendLLMMessageService.ts`（~148-186）：`sendLLMMessage({messagesType:'chatMessages'|'FIMMessage', messages, separateSystemMessage, modelSelection, modelSelectionOptions, overridesOfModel, onText, onFinalMessage, onError, onAbort, logging})`；IPC 打包附 `promptCaching=globalSettings.anthropicPromptCaching`（**仅 Anthropic**，~182）。
- `convertToLLMMessageService.ts`：
  - `_chatMessagesToSimpleMessages()`（~750-780）统一中间表示，保留 `anthropicReasoning`。
  - `prepareOpenAIOrAnthropicMessages()`（~260-456）：插系统消息；**按权重修剪**（user×1 / system×0.01 / assistant×10，首1+末3 ×0.05，`TRIM_TO_LEN=120`）；工具格式三分支（XML / anthropic / openai）。
  - Gemini 转换（~463-511）。
- 缓存注入（`electron-main/llmMessage/sendLLMMessage.impl.ts` ~540-557）：给**最后一个工具**与 **system** 加 `cache_control:{type:'ephemeral'}`。
- **弱点**：修剪权重固定、可能误删关键前置上下文；缓存仅工具+system、仅 Anthropic、无用户上下文段缓存；无输出 token 硬上限。

## C. Apply / Fast Apply（`browser/editCodeService.ts`）

- 触发 `startApplying()`（~1252-1277）：QuickEdit→Writeover；ClickApply 且 `enableFastApply` 时，文件 <1000 字符→Writeover，否则→Search/Replace。
- Writeover（~1468-1682）：`rewriteCode_systemMessage` + `rewriteCode_userMessage(original, applyStr, lang)`；流式 `extractCodeFromRegular()`；逐行写入 DiffZone。
- Fast Apply（~1787-2115）：`searchReplaceGivenDescription_*` 提示，**整原文件**作上下文 → 模型产 SEARCH/REPLACE 块。
  - 重试（~1890-2010）：`N_RETRIES=4`；块在文件中找不到（`findTextInCode`，~1957）→ push `{assistant: fullText}`+`{user: 错误+"previous outputs ignored"}` 重发；块从右到左应用、检重叠（~1754-1785）。
- **弱点**：①SEARCH 精确匹配，空格/缩进/EOL 差异即失败 ②重试**全量累积消息**→上下文爆炸、可能触发修剪 ③4 次失败**直接抛异常、无降级** ④Apply/Fast Apply 复用通用模型、无低延迟专用模型 ⑤DiffZone 实时渲染大文件可能卡。

## D. 输出解析（`common/helpers/extractCodeFromResult.ts`）

- `extractCodeFromRegular()`（~120-130）去 ``` 包裹。
- `extractCodeFromFIM()`（~137-163）去 `<mid>` 标签。
- `extractSearchReplaceBlocks()`（~187-246）状态机（writingOriginal→writingFinal→done），支持流式部分块。
- **弱点**：`ORIGINAL_=ORIGINAL+'\n'`、`DIVIDER_='\n'+DIVIDER+'\n'` 对换行/`\r\n` 敏感；块不匹配无纠错（依赖 C 的重试）。

## E. FIM 自动补全（`browser/autocompleteService.ts`）

- LRU 缓存（~69-144，基于 prefix）；预测类型 single-line-fill-middle / redo-suffix / multi-line-start-next（~146-150）。
- FIM 提示（prompts.ts ~1141-1188）：`<pre>prefix</pre>`/`<mid>selection</mid>`/`<suf>suffix</suf>`。
- 能力位 `supportsFIM`（modelCapabilities.ts）。
- **弱点**：缓存仅按 prefix（忽略 suffix）；无防抖；上下文固定字符窗、不感知 AST/缩进；缺括号平衡等后处理；无超轻量专用模型。

## F. 重试 / 错误恢复

- Fast Apply 重试见 C（消息累积、无降级）。
- 编辑失败 `onError`（~1551-1590）：`onDone()`+`_undoHistory(uri)` 回滚后抛错；`onWillUndo` 中 abort 流。
- **弱点**：错误无分类（网络/限流/模型格式/编辑不匹配同等处理）、无差异化重试策略。

## 弱点 → 优化 速查

| 环节 | 现状 | 弱点 | 优化（对应 proposal 编号）|
|---|---|---|---|
| 块匹配 | 精确匹配 | 空格/缩进/EOL 失败 | 模糊匹配（P0-1）|
| Fast Apply 重试 | 全量累积、4 次抛错 | 上下文爆炸、无降级 | 增量纠错 + 降级 Writeover（P0-2）|
| 生成模型 | 复用通用大模型 | 延迟/成本高 | 专用低延迟模型位（P0-3）|
| 缓存 | 仅工具+system、仅 Anthropic | 命中面窄 | 扩展断点 + 多 provider（P1-4）|
| 修剪 | 固定权重 | 误删关键上下文 | 语义感知保护（P1-5）|
| FIM | prefix-only 缓存、固定窗 | 召回/手感弱 | AST 感知 + suffix 缓存 + 防抖 + 后处理（P1-6）|
| Reasoning | Apply 默认关、无 UI | 不可调 | Apply 可配档位（P2-7）|
| 错误 | 统一处理 | 不可区分重试 | 分类差异化（P2-8）|
| DiffZone | 实时渲染 | 大文件卡 | 合批延迟渲染（P2-9）|
