# 编程项目软件：业务流程 / 数据流程 / 问题点 / 优化方案

> temp 前缀临时工作文档（梳理用，非正式提案）
> 项目：基于 VS Code 源码的 Void 编辑器定制分支（品牌 **YWCode**），Electron 桌面应用
> 编写日期：2026-06-13
> 范围：`src/vs/workbench/contrib/void/` 下的 AI 编码能力（Chat/Agent、Ctrl+K、Apply、Autocomplete）
> 说明：行号为指示值，实施前以当前源码为准。本文偏"全局业务/数据视图"；纯生成链路细节见 `temp-codegen-llm-pipeline-optimization.md`

---

## 0. 一句话总览

YWCode 是把"对话式 Agent + 内联编辑 + 自动补全"三套 AI 能力嵌进 VS Code 的编辑器分支。所有 LLM 请求由 **Renderer（UI）经 IPC 通道转交 Main 进程** 发起（绕过 Chromium CORS），主路径走 **aiyiwei 聚合网关**（`https://aiyiwei.vip`）。功能完整，但存在 **Agent 循环效率低（串行工具调用、token 浪费 5-10 倍）**、**编辑块匹配脆弱**、**无专用低延迟模型**、**模型能力矩阵滞后** 四类核心问题，已有多份 openspec 提案对应。

---

## 1. 系统分层与进程模型

```
┌──────────────────────── Renderer 进程（Chromium / UI）────────────────────────┐
│  React 组件 (browser/react/)                                                   │
│    Sidebar.tsx(Chat) · QuickEdit.tsx(Ctrl+K) · diff/index.tsx(Diff)            │
│           │                                                                    │
│  前端服务 (browser/ + common/)                                                 │
│    ChatThreadService   ← 对话线程 / Agent 循环 / 工具调度                       │
│    EditCodeService     ← Apply/Ctrl+K 落地、DiffZone 渲染、接受/拒绝            │
│    AutocompleteService ← FIM 补全、防抖、LRU 缓存                               │
│    ToolsService        ← 28 内置工具 校验+执行                                  │
│    ConvertToLLMMessageService ← 内部消息 → 各家 API 格式 + 上下文注入 + 修剪    │
│    VoidSettingsService ← Provider 配置 / 模型选择 / 加密                        │
│    LLMMessageService   ← 渲染端 LLM 调度器（生成 requestId、登记回调钩子）      │
└───────────────────────────────────┬───────────────────────────────────────────┘
                                     │  IPC（IChannel / IServerChannel）
                                     │  通道名：void-channel-llmMessage / -mcp / -scm / -metrics / -update
┌───────────────────────────────────┴──────────── Main 进程（Node.js / 全网络权限）─┐
│  LLMMessageChannel (electron-main/sendLLMMessageChannel.ts)                       │
│    └ sendLLMMessage.ts → sendLLMMessage.impl.ts                                   │
│         provider 适配：anthropic / openAI / gemini / aiyiwei / ollama / ...(20+)  │
│         实际 HTTP/SDK 调用（fetch / @anthropic-ai/sdk / openai / @google/genai）  │
│    MCPChannel        ← MCP server 生命周期 + 工具执行                             │
│    VoidSCMChannel    ← git / 生成 commit message                                 │
└──────────────────────────────────────────────────────────────────────────────────┘
                                     │  HTTPS（SSE 流式）
                                     ▼
              aiyiwei.vip/v1 聚合网关（主路径） · 或各 Provider 原生端点
```

**关键约束**：Renderer 受 Chromium CORS 限制不能直连跨域 API → 一切外部 LLM/HTTP 请求必须经 IPC 到 Main 进程执行；流式结果再通过 `channel.fire()` 事件回传 Renderer。

---

## 2. 核心业务流程（4 条主线）

### 业务线 A — 对话式 Agent（Chat，Ctrl+L）

**用户视角**：侧边栏输入需求 → AI 边思考边回复 → 自动调用工具（读文件/搜索/改代码/跑命令）→ 反复迭代直到完成。

**数据流**：
```
用户输入消息(Sidebar.tsx)
 → ChatThreadService.addUserMessageAndStreamResponse()
 → 建立 checkpoint（改动前快照，用于回滚）
 → _runChatAgent() 进入 Agent 循环（chatThreadService.ts ~930-1272）：
     ┌─► [1] 上下文压缩检查（窗口将满 → 摘要旧消息）
     │   [2] ConvertToLLMMessageService 组装 system + 历史 + 工具定义
     │   [3] LLMMessageService.sendLLMMessage()（重试 3 次, 间隔 2500ms）
     │        → IPC → Main → provider → SSE 流
     │        → onText 流式更新 displayContent/reasoning/toolCall
     │   [4] onFinalMessage：解析 tool_use
     │        ├ 无工具调用 → 结束，等待用户
     │        └ 有工具调用 → _runToolCall()：
     │             PreToolUse 钩子 → 参数校验 → 审批门控
     │             → ToolsService.callTool / MCPService.callMCPTool
     │             → 结果字符串化 → PostToolUse 钩子
     │             → 写回 tool 结果消息
     └──◄ 回到 [1]（带工具结果继续）  ── 硬上限 50 轮 / 循环检测（窗口5,阈值3）
```

**关键数据结构**：`ThreadType{ id, messages[], state{currCheckpointIdx, stagingSelections} }`；`ChatMessage` 联合类型（user/assistant/tool(11 态)/checkpoint）。

### 业务线 B — 内联快速编辑（Ctrl+K Quick Edit）

```
选中代码 + Ctrl+K
 → quickEditActions.ts 注册 CtrlKZone（editCodeService.addCtrlKZone）
 → 编辑器内挂载 QuickEdit.tsx 输入框（ViewZone）
 → 用户输入指令 → startApplying()（editCodeService.ts ~1252）
 → Writeover 策略：rewriteCode 提示 + FIM 前后缀
 → 流式 onText → extractCodeFromFIM → findDiffs → 逐行写入 DiffZone
 → 绿/红高亮 + sweep 光标 → 用户 Accept/Reject
```

### 业务线 C — 应用代码改动（Apply / Fast Apply）

```
Chat 产出代码块，用户点 Apply（或 Agent 调 edit_file/rewrite_file 工具）
 → startApplying() 选策略：
     · <1000 字符 或 关闭 fastApply → Writeover（整段重写流式落地）
     · ≥1000 字符 且 开 fastApply → Search/Replace（模型产 SEARCH/REPLACE 块）
         findTextInCode() 精确匹配 → 失败回退模糊(lineSimilarity)
         块右→左应用避免索引漂移；解析失败重试 N_RETRIES=4
 → DiffZone 渲染 diff → Accept 落盘 / Reject 回滚（IUndoRedoElement 快照）
```

### 业务线 D — 自动补全（Autocomplete / FIM）

```
编辑器内键入
 → inlineCompletionsProvider 触发 _provideInlineCompletionItems
 → LRU 缓存命中（key=prefix，max 20）→ 直接返回
 → 未命中：500ms 防抖 → getCompletionOptions 判定补全类型(4种)
 → sendLLMMessage(FIMMessage, <pre>/<mid>/<suf> 模板, 超时 60s)
 → onFinalMessage → extractCodeFromRegular → 后处理(去空格/括号平衡/行匹配)
 → toInlineCompletions 渲染灰字 → Tab 接受 → 出缓存 + 预载下一行
```

### 横切支撑

| 支撑能力 | 服务 | 作用 |
|---|---|---|
| 模型能力矩阵 | `common/modelCapabilities.ts` | token 上限、reasoning 档位、工具格式、价格、FIM 支持 |
| Provider 配置 | `common/voidSettingsTypes.ts` + VoidSettingsService | endpoint / apiKey / 模型选择，aiyiwei 默认 `https://aiyiwei.vip` |
| 上下文/索引 | CodeIndexService · ContextGatheringService · DirectoryStrService | 符号索引、邻近片段、目录树文本化 |
| MCP 扩展工具 | MCPService + MCPChannel | 外部 MCP server 工具发现与执行 |
| 检查点/回滚 | TurnCheckpointService + checkpoint 消息 | 每轮/每次编辑前文件快照，支持跳转回滚 |

---

## 3. 端到端数据流程图（一次 Chat → 改代码）

```
[Renderer] 用户发消息
   │ ① addUserMessageAndStreamResponse → checkpoint
   ▼
[Renderer] ConvertToLLMMessageService
   │ ② 组装 system+历史+工具定义；按权重修剪(user×1/system×0.01/assistant×10)
   ▼
[Renderer] LLMMessageService.sendLLMMessage
   │ ③ 生成 requestId(UUID)，登记 onText/onFinalMessage/onError 钩子
   │    channel.call('sendLLMMessage', params)  ──── IPC ───►
   ▼
[Main] LLMMessageChannel._callSendLLMMessage
   │ ④ sendLLMMessage.ts → sendLLMMessage.impl.ts
   │    provider=aiyiwei → new OpenAI({baseURL:'https://aiyiwei.vip/v1'})
   │    prompt caching：仅 Anthropic，最后一个工具+system 加 cache_control
   ▼
[网关/Provider] SSE 流式返回 delta（text / reasoning / tool_calls）
   │ ⑤ onText(p) → emitters.onText.fire({requestId,...}) ──── IPC 事件 ───►
   ▼
[Renderer] llmMessageHooks.onText[requestId](e)
   │ ⑥ 流式刷新 UI（streaming 文本 / DiffZone 逐行）
   ▼
[Renderer] onFinalMessage：tool_use?
   │ ⑦ 有 → _runToolCall → ToolsService.callTool（如 edit_file）
   │        → EditCodeService 落地 DiffZone → 回灌工具结果 → 回 ②
   │ 无 → 结束
   ▼
[Renderer] 用户 Accept/Reject diff → 落盘 / 回滚
```

---

## 4. 问题点（按影响域分类）

### P0 类 — 直接影响成功率 / token 成本（已有 `optimize-agent-loop` 提案）

| # | 问题 | 位置 | 影响 |
|---|---|---|---|
| 1 | **工具串行调用**："Only use ONE tool call at a time" | `prompts.ts:633` | 读 5 文件需 5 轮，每轮重发全量上下文，token 浪费 5-7 倍 |
| 2 | **系统提示词偏弱**（~500 字 vs 头部工具 ~3000 字） | `prompts.ts` | 缺自主性/代码质量/循环检测/Plan 纪律规则，一次成功率低 |
| 3 | **工具结果截断粗糙** | `prompts.ts` MAX 常量 | 大文件/终端输出曾达 ~125K token，挤占上下文 |
| 4 | **循环防护薄弱** | `chatThreadService.ts ~630-661` | 仅 hash 检测（窗5阈3）+ 硬上限 50，易误报且无用户覆盖 |

### P1 类 — 代码生成/编辑链路脆弱（已有 `optimize-codegen-llm-pipeline` 提案）

| # | 问题 | 位置 | 影响 |
|---|---|---|---|
| 5 | **SEARCH 块精确匹配脆弱**：tab/空格/尾随空格/`\r\n` 差异即失败 | `editCodeService.ts findTextInCode ~1957`、`extractCodeFromResult.ts` | 编辑失败首要来源 |
| 6 | **Fast Apply 重试全量累积**：失败 push 全量 assistant+user 消息重发 | `editCodeService.ts ~1890-2010` | 4 次重试消息爆炸；达上限直接抛异常无降级 |
| 7 | **无专用低延迟生成模型**：Apply/Ctrl+K/Autocomplete 复用通用大模型 | `modelCapabilities.ts` | 延迟高（对标 Cursor Sonic / Zed Zeta2 缺位） |
| 8 | **上下文修剪权重固定**：user×1/system×0.01/assistant×10 | `prepareOpenAIOrAnthropicMessages ~260-456` | 误删关键上下文，无保护集 |
| 9 | **prompt caching 面窄且仅 Anthropic** | `sendLLMMessage.impl.ts ~540-557` | 非 Anthropic（含主路径聚合）无缓存收益 |
| 10 | **FIM 缓存仅按 prefix、无 AST/缩进感知** | `autocompleteService.ts ~69-144` | 补全召回与手感弱 |

### P2 类 — 配置/健壮性/性能

| # | 问题 | 位置 | 影响 |
|---|---|---|---|
| 11 | **模型能力矩阵滞后**（停留 ~2025 中，缺 Opus 4.8/4.7、GPT-5.x、Gemini 3） | `modelCapabilities.ts` | 新模型回退默认能力（reasoning 不可用、token 上限偏低）→ 已有 `refresh-model-matrix` 提案 |
| 12 | **错误无分类**：网络/限流/格式/编辑不匹配同等处理 | `editCodeService.ts onError ~1551` | 无差异化重试/退避 |
| 13 | **DiffZone 大文件实时逐行渲染** | `editCodeService.ts ~1632` | 大文件流式落地卡顿 |
| 14 | **聚合网关单点依赖**：主路径全压 aiyiwei.vip | `sendLLMMessage.impl.ts ~198` | 网关故障 = 全功能不可用，无自动回退原生端点 |
| 15 | **autocomplete FIM 60s 硬超时 + 防抖串行** | `autocompleteService.ts ~864` | 慢响应阻塞后续补全 |

---

## 5. 优化方案（按 ROI 排序，标注对应提案）

| 优先级 | 优化 | 针对 | 对应 openspec 提案 |
|---|---|---|---|
| **P0-1** | 启用**并行工具调用**（只读并行/写串行）+ `toolCalls[]` 解析 | #1 | `optimize-agent-loop` |
| **P0-2** | **重写系统提示词**（自主性/代码质量/循环检测/Plan 纪律） | #2 | `optimize-agent-loop` |
| **P0-3** | 工具结果**中间截断**到 ~10K token（truncateMiddle） | #3 | `optimize-agent-loop` |
| **P0-4** | SEARCH 块**容差匹配**：精确→行trim→EOL归一→缩进无关 回退链 + 唯一性校验 | #5 | `optimize-codegen-llm-pipeline` |
| **P1-1** | Fast Apply 重试**增量化**（只回灌未匹配块）+ 达上限**降级 Writeover** | #6 | `optimize-codegen-llm-pipeline` |
| **P1-2** | **专用低延迟模型位**（Apply/Ctrl+K/Autocomplete），通用模型降级 | #7 | `optimize-codegen-llm-pipeline` |
| **P1-3** | **刷新模型能力矩阵**（补 Opus 4.8/4.7、GPT-5.x、Gemini 3，自适应推理） | #11 | `refresh-model-matrix` |
| **P1-4** | 上下文修剪**语义化**：保护集（当前任务+最近N轮+被引用文件） | #8 | `optimize-codegen-llm-pipeline` |
| **P1-5** | prompt caching **provider 能力位抽象** + 断点扩展到稳定上下文段 | #9 | `add-prompt-caching` / codegen |
| **P2-1** | FIM：suffix-aware 缓存键 + AST/缩进感知窗 + 括号平衡后处理 | #10 | codegen |
| **P2-2** | 错误**分类差异化重试**（网络退避/格式降级/限流提示） | #12 | codegen |
| **P2-3** | DiffZone 流式渲染**合批节流**（大文件阈值） | #13 | codegen |
| **P2-4** | 聚合网关故障**自动回退**原生 Provider 端点 | #14 | （新增建议） |

**综合预期**（来自 `optimize-agent-loop`）：token 消耗降低 5-10 倍，任务完成率从 ~30% → ~70%+。

---

## 6. 落地建议

1. **顺序**：P0（手感/成功率，Agent 循环 + 块容差）→ P1（成本/上下文/模型矩阵）→ P2（健壮/性能）。每项带开关、可独立 `git revert`。
2. **纪律**（遵循 CLAUDE.md 手术式变更）：
   - 容差匹配必须保留"精确优先 + 唯一性校验"防误改；
   - 新增能力位/服务务必 `registerSingleton` + `void.contribution.ts` 同步 `import`；
   - 模型矩阵仅**手术式新增**，非 Anthropic ID 须官方文档核验，零改动既有条目。
3. **验证**：任何改动后跑 ① `node build.js`（react 目录）② `npx tsc -p src/tsconfig.json --noEmit` 确认 0 errors；端到端用构造编辑用例（空格/缩进/CRLF/多块/故意不匹配）+ 难度梯度任务（建文件 / 修 Bug / 从零建 Express）验证轮数与成功率。
4. **关联文档**：纯生成链路细节见 `temp-codegen-llm-pipeline-optimization.md`；正式提案见 `openspec/changes/{optimize-agent-loop, optimize-codegen-llm-pipeline, refresh-model-matrix}/`。

---

## 附：关键文件索引（void/-相对）

| 模块 | 文件 | 关键符号/行 |
|---|---|---|
| Chat/Agent 循环 | `browser/chatThreadService.ts` | `_runChatAgent` ~930-1272、`_runToolCall` ~728-925、循环检测 ~630-661 |
| 编辑/Apply/Diff | `browser/editCodeService.ts` | `startApplying` ~1252、Writeover ~1468-1682、Search/Replace ~1787-2095 |
| 自动补全 | `browser/autocompleteService.ts` | trigger ~635-737、heuristics ~536-612、后处理 ~175-363 |
| 工具 | `browser/toolsService.ts` | `validateParams` ~201-539、`callTool` ~542+ |
| 消息组装/修剪 | `browser/convertToLLMMessageService.ts` | `prepareOpenAIOrAnthropicMessages` ~260-456 |
| 渲染端 LLM 调度 | `common/sendLLMMessageService.ts` | `sendLLMMessage` ~148-186、回调路由 ~120-144 |
| Main 通道 | `electron-main/sendLLMMessageChannel.ts` | `_callSendLLMMessage` ~93-115 |
| Provider 实现 | `electron-main/llmMessage/sendLLMMessage.impl.ts` | 路由 ~941-1030、aiyiwei ~198-201、caching ~540-557 |
| 模型矩阵 | `common/modelCapabilities.ts` | 能力字段 ~179-215、aiyiwei 默认 ~69-72 |
| 设置类型 | `common/voidSettingsTypes.ts` | provider 显示名 ~144-146 |
| 提示词 | `common/prompt/prompts.ts` | 块标记 ~38-40、工具定义 ~312-344、FIM 模板 ~1141-1188 |

---

## 7. 执行记录（2026-06-13）— 提案落地与评测

### 7.1 现状核对（执行前）

逐一核对第 4 节问题点，发现**多数 P0/P1 优化已落地**（位于 `4feee85 二次开发` 提交），但**无任何量化回归基准**（两份提案的"记录基线/CDP 验证"任务均未勾选）：

| 问题 | 优化 | 现状 |
|---|---|---|
| #1 工具串行 | 并行工具调用 | ✅ 已实现（`prompts.ts:688` agent 模式并行，gather 模式单工具；`dispatch_agents` 工具）|
| #3 结果不截断 | `truncateMiddle` | ✅ 已实现（`MAX_FILE_CHARS_PAGE=40_000`、`MAX_TERMINAL_CHARS=20_000`）|
| #5 块匹配脆弱 | 容差匹配回退链 | ✅ 已实现（`findTextInCode`：精确→去空白(带唯一性)→行级模糊 `fuzzyFindLines`）|
| #11 模型矩阵滞后 | 刷新矩阵 | 🟡 部分（aiyiwei 已含 `claude-opus-4-8/4-7`，见 `refresh-model-matrix` 提案）|

**结论**：当务之急不是重复实现，而是补上**确定性、可量化的评定方式**，让这些已落地优化"可回归、可对比改动前后"——这正是用户强调的"设置指标和评定方式，方便测试验证"。

### 7.2 新建并执行的提案：`add-codegen-robustness-eval`

`openspec/changes/add-codegen-robustness-eval/`（proposal + spec + tasks）。聚焦 codegen 链路**纯函数**的确定性评测（无需 LLM、不耗 token、毫秒级、零抖动），与 `add-eval-harness`（端到端 Agent 质量）互补。

**已执行改动（手术式）**：
1. 抽取纯匹配逻辑 `editCodeService.ts` → 新建 `common/helpers/findTextInCode.ts`（导出，零浏览器依赖，逐字搬运不改行为）；`editCodeService` 改 import，3 处调用点不变。
2. `test/eval/codegenRobustnessEval.ts` — 确定性 harness，分组打分 + 阈值 + 退出码。
3. `test/common/codegenRobustness.test.ts` — 同套用例 mocha 固化，纳入 `npm run test-node`。

### 7.3 指标与评定方式

| 指标组 | 用例 | 阈值（硬指标）| 实测 |
|---|---|---|---|
| RECALL_TOLERANT | 精确 / 尾随空格 / 缩进(Tab↔空格) / CRLF↔LF | 100% | ✅ 4/4 |
| RECALL_FUZZY | 行内注释/小改动→行级模糊回退 | 100% | ✅ 1/1 |
| SAFETY | 不存在→Not found / 严格模式拒绝 / 重复→Not unique | 100%（误匹配零容忍）| ✅ 3/3 |
| PARSE | SEARCH/REPLACE 单块·多块·流式部分块 | 100% | ✅ 3/3 |
| TRUNCATE | 短文本原样 / 长文本保首尾+标记+收缩 | 100% | ✅ 2/2 |

### 7.4 测试执行情况

```
$ npx tsx src/vs/workbench/contrib/void/test/eval/codegenRobustnessEval.ts
总计：13/13 通过，总体鲁棒性得分 100.0%
结论：✅ 所有硬指标达标       (退出码 0)
```

- 五组硬指标全部 100%，退出码 0 → 已落地的容差匹配/截断/解析在构造用例上行为正确。
- 该报告即"评定方式"：日后调匹配阈值、动截断常量、改块解析后**重跑即得客观回归依据**；可接入 CI / pre-commit。
- 编译验证 `npx tsc -p src/tsconfig.json --noEmit`：见执行末尾结论（抽取仅搬运纯函数 + 改 import，预期 0 errors）。

### 7.5 后续（未在本次执行范围）

P1-2 专用低延迟模型位、P1-4 修剪语义化、P2-4 网关回退等仍属设计/实现阶段；建议下一步把 `add-eval-harness`（端到端）跑通，与本次确定性评测共同构成"零件正确性 + 整机表现"双层评测闭环。

---

## 8. 执行记录（2026-06-13）— refresh-model-matrix 提案落地与评测

### 8.1 现状核对

- `refresh-model-matrix` 的 **Phase 1（aiyiwei 聚合路径）此前已完成**：`aiyiweiModelOptions` 已含 `claude-opus-4-8`/`claude-opus-4-7`（openai-style，价格 $5/$25）。
- 唯一被显式推迟的是 **"直连 Anthropic 路径 opus-4.7/4.8 adaptive thinking 支持"**——当时矩阵抽象无 adaptive、缺权威数据而搁置（问题 #11 的直连补全）。
- Phase 2（OpenAI GPT-5.x / Gemini 3）：design 明确"非 Anthropic ID 须核验、未核验不写入"。

### 8.2 本次执行（先核验，后手术式实现）

1. **权威核验**：经 `claude-api` skill 取得权威值——`claude-opus-4-8`/`claude-opus-4-7`：**1M 上下文 / 128K 输出 / $5·$25**；budget_tokens 已移除（发送即 400），采用 **adaptive thinking + effort 档位**。
2. **新增原生条目**：`common/modelCapabilities.ts` 的 `anthropicModelOptions` 追加两条（`anthropic-style` / `separated` / `effort_slider`，cost 含 cache_read·cache_write）。
3. **推理负载适配**：扩展 `anthropicSettings.providerReasoningIOSettings.input.includeInPayload`——`effort_slider_value → { thinking: { type: 'adaptive' } }`（**关键**：不再发 budget_tokens，规避 4.7/4.8 的 400），既有 `budget_slider` 分支零改动。

### 8.3 指标与评定方式

| 指标 | 阈值 | 实测 |
|---|---|---|
| 新条目识别 + 字段（ctx 1M / $5·$25 / anthropic-style / effort_slider）| 全对 | ✅ 4-8、4-7 |
| effort 档位 → `thinking.adaptive`，**不含 budget_tokens** | 必须 | ✅ |
| budget 档位 → `thinking.enabled+budget_tokens`（旧模型零回退）| 必须 | ✅ |
| 未开启推理 → null | 必须 | ✅ |
| 既有条目（opus-4-20250514）未受影响 | 必须 | ✅ |

```
$ npx tsx .../test/eval/modelMatrixEval.ts   → 6/6 通过，退出码 0
$ npx tsc -p src/tsconfig.json --noEmit      → 0 errors（实现 + mocha 测试均类型干净）
```

产物：`test/eval/modelMatrixEval.ts`（确定性 harness）+ `test/common/modelMatrix.test.ts`（mocha 回归）。

### 8.4 Phase 2（OpenAI / Gemini）补齐（2026-06-13 二次执行）

按用户提示——**价格从聚合端 `aiyiwei.vip` 取、上下文等联网核验**：

- **数据来源（不臆造）**：用 Playwright 渲染发现 `aiyiwei.vip/pricing` 为 SPA，定位其后端 `GET /api/pricing`（new-api 后端）→ `model_group['default'].ModelPrice`=输入 $/M、`model_completion_ratio`=输出/输入倍数；模型 ID 直接取自该端点真实 key（与聚合端对齐，避免 404/回退）。上下文/输出/reasoning 形态经官方文档联网核验。
- **追加到 `aiyiweiModelOptions`（openai-style，主路径）**：
  - `gpt-5.5` —— 输入 $2.5 / 输出 $15（default 分组，ratio6）；1M 原生上下文 / 128K 输出 / effort=low·medium·high·xhigh。
  - `gemini-3-pro-preview` —— 输入 $3 / 输出 $18（官转gemini 分组）；1M 原生上下文 / 64K 输出 / thinking_level=low·high。
  - 推理经 `openAICompatIncludeInPayloadReasoning` 下发 `reasoning_effort`（已测）；均加入 `defaultModelsOfProvider.aiyiwei`（下拉可见）。
- **评测**：harness 扩到 **9/9 通过**(退出码 0);`tsc` 0 errors;diff 纯新增。
- **仍未做**:原生 `openAIModelOptions`/`geminiModelOptions` 直连条目(主路径为 aiyiwei,且原生 gemini 推理走 thinkingBudget 与 gemini-3 的 thinking_level 形态不同,需另行适配);UI 下拉 CDP 可视化确认(需启动 Electron)。
