# 调用模型生成代码：链路细节与优化方案（临时工作文档）

> temp 前缀临时文档（已被 .gitignore 排除，不进仓库）
> 正式版见 `openspec/changes/optimize-codegen-llm-pipeline/`（proposal + analysis + design + tasks）
> 编写日期：2026-06-12
> 行号为指示值，实施前以当前源码为准

---

## 0. 一句话

"调用模型生成/修改代码"链路功能完整，但有三类影响**生成成功率/延迟/成本**的细节弱点：①编辑块匹配脆弱（空格/缩进/CRLF 差异即失败）②无专用低延迟生成模型（Apply/FIM 复用通用大模型）③重试与上下文管理粗糙（重试消息累积爆炸、修剪权重固定、缓存断点单一）。

---

## 1. 链路总览

```
用户意图
 → convertToLLMMessageService（组装消息 + 上下文注入 + 修剪 + 工具格式适配）
 → sendLLMMessageService（IPC → main）
 → electron-main/llmMessage/*（provider 适配 + 流式 SSE + prompt caching）
 → 模型输出（文本 / SEARCH·REPLACE 块 / 工具调用）
 → extractCodeFromResult（解析代码 / 块 / FIM）
 → editCodeService（Apply / Fast Apply → DiffZone 流式落地 + 重试）
```

---

## 2. 各环节机制 + 弱点（带 file:line）

### A. Prompt 组装 `common/prompt/prompts.ts`
- 块标记：`ORIGINAL='<<<<<<< ORIGINAL'` / `DIVIDER='======='` / `FINAL='>>>>>>> UPDATED'`（~38-40）
- 工具：`edit_file`（~312-323）/ `batch_edit`（~325-331）/ `rewrite_file`（>50% 改动，~333-344）
- 截断常量（~25-29）：`MAX_FILE_CHARS_PAGE=40_000`、`MAX_TERMINAL_CHARS=20_000`、`MAX_PREFIX_SUFFIX_CHARS=20_000`
- Ctrl+K 前后缀 `voidPrefixAndSuffix()`（~1080-1124）
- **弱点**：块要求 EXACTLY match（tab/空格/尾随空格/`\r\n` 敏感）；System Prompt 每轮全量重发；前后缀按字符截断不感知块结构

### B. LLM 调用
- `sendLLMMessage({messagesType, messages, separateSystemMessage, modelSelection, modelSelectionOptions, overridesOfModel, onText, onFinalMessage, onError, onAbort, logging})`（sendLLMMessageService.ts ~148-186）；IPC 附 `promptCaching`（**仅 Anthropic**，~182）
- 修剪 `prepareOpenAIOrAnthropicMessages()`（~260-456）：权重 user×1 / system×0.01 / assistant×10，首1末3×0.05，`TRIM_TO_LEN=120`；工具格式 XML/anthropic/openai 三分支
- 缓存注入（sendLLMMessage.impl.ts ~540-557）：仅最后一个工具 + system 加 `cache_control:ephemeral`
- **弱点**：修剪权重固定→误删关键上下文；缓存面窄且仅 Anthropic；无输出 token 硬上限

### C. Apply / Fast Apply `browser/editCodeService.ts`
- 触发 `startApplying()`（~1252-1277）：QuickEdit→Writeover；ClickApply+enableFastApply 时 <1000 字符→Writeover，否则→Search/Replace
- Writeover（~1468-1682）：`rewriteCode_*` 提示 + 流式 `extractCodeFromRegular()` 逐行写 DiffZone
- Fast Apply（~1787-2115）：整原文件作上下文 → 模型产 SEARCH/REPLACE 块；重试 `N_RETRIES=4`（~1890-2010），块找不到（`findTextInCode` ~1957）→ push `{assistant:全量}`+`{user:错误}` 重发；块右→左应用、检重叠（~1754-1785）
- **弱点**：①精确匹配脆弱 ②重试**全量累积消息**→爆炸 ③4 次**抛异常无降级** ④无低延迟专用模型 ⑤DiffZone 大文件实时渲染卡

### D. 输出解析 `common/helpers/extractCodeFromResult.ts`
- `extractCodeFromRegular()`（~120-130）/ `extractCodeFromFIM()`（~137-163）/ `extractSearchReplaceBlocks()` 状态机（~187-246，支持流式部分块）
- **弱点**：`ORIGINAL_=ORIGINAL+'\n'`、`DIVIDER_='\n'+DIVIDER+'\n'` 对 `\r\n` 敏感；块不匹配无纠错

### E. FIM 补全 `browser/autocompleteService.ts`
- LRU 缓存（~69-144，**仅基于 prefix**）；FIM 提示 `<pre>/<mid>/<suf>`（prompts.ts ~1141-1188）；能力位 `supportsFIM`
- **弱点**：缓存忽略 suffix；无防抖；固定字符窗不感知 AST/缩进；缺括号平衡后处理；无超轻量专用模型

### F. 重试 / 错误恢复
- 编辑失败 `onError`（~1551-1590）：`_undoHistory(uri)` 回滚后抛错
- **弱点**：错误无分类（网络/限流/格式/编辑不匹配同等处理）、无差异化重试

---

## 3. 优化方案（按 ROI）

| 优先级 | 优化 | 针对弱点 |
|---|---|---|
| **P0-1** | SEARCH 块**容差匹配**：精确→行 trim→EOL 归一→缩进无关 回退链 + 唯一性校验 | 块匹配脆弱（第一失败源）|
| **P0-2** | Fast Apply 重试**增量化**（只回灌未匹配块）+ 达上限**降级 Writeover** | 重试爆炸 / 无降级 |
| **P0-3** | **专用低延迟生成模型位**（Apply/Ctrl+K/Autocomplete），通用模型降级 | 无快速模型（对标 Cursor Sonic/Zed Zeta2）|
| **P1-4** | 缓存断点扩展到稳定用户上下文段 + provider 缓存能力位抽象 | 缓存面窄、仅 Anthropic |
| **P1-5** | 修剪语义化：保护集（当前任务 + 最近 N 轮 + 被引用文件）+ 保结构截断 | 固定权重误删 |
| **P1-6** | FIM：suffix-aware 缓存键 + 防抖 + AST/缩进感知窗 + 括号平衡后处理 | FIM 召回/手感弱 |
| **P2-7** | Apply/Ctrl+K 推理档位可配 | reasoning 不可调 |
| **P2-8** | 错误分类差异化重试（网络退避 / 格式·不匹配降级 / 其它提示）| 错误不可区分 |
| **P2-9** | DiffZone 流式渲染合批 + 节流（大文件阈值）| 大文件卡 |

---

## 4. 落地建议

- 从 **P0-1（块容差匹配）** 起步：第一失败源、改动内聚（`editCodeService` 块定位 + `extractCodeFromResult` 下游适配器），可用构造的编辑用例（空格/缩进/CRLF/多块/故意不匹配）做 CDP 端到端验证。
- 纪律：容差匹配保留"精确优先 + 唯一性校验"防误改；新能力位 `registerSingleton` + `void.contribution.ts` import 同步补；每项带开关可回滚。
- 路线：P0（手感/成功率）→ P1（成本/上下文）→ P2（健壮/性能）。详见 `openspec/changes/optimize-codegen-llm-pipeline/tasks.md`。
