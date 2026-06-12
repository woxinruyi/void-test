# Void 编码模式架构分析与优化方案

> 日期：2026-04-18（初稿） | 2026-04-20（状态更新）
> 模式：openspec explore（只分析，不落地实现）
> 对标：Windsurf（Cascade）、Claude Code OSS（Anthropic, 2025）
>
> **ℹ️ 实施状态更新（ 2026-04-20）**：本文识别的 4 大痛点均已通过 Phase 1–4 实现解决。
> - **痛点 1（推理 token）**：✅ 已实现自适应推理档位（reasoningAuto）— 关键词/启发式/thread 继承
> - **痛点 2（审批策略）**：✅ 已重构为分层信任模型（Phase 4.6）— perToolRules + mustAlwaysApprovePatterns
> - **痛点 3（上下文检索）**：✅ 已实现语义索引、Memories、层级 .voidrules、子代理并行搜索
> - **痛点 4（多 agent/Plan）**：✅ 已实现 dispatch_agents + update_plan + Hooks
> - 详见 `docs/analysis/void-programming-workflow-analysis.md` 和 `docs/testing/phase4-test-results.md`

---

## 一、当前 Void 编码模式全景

### 1.1 核心代码位置索引

| 关注点 | 文件 | 关键函数/类型 |
|---|---|---|
| Chat 主循环 | `src/vs/workbench/contrib/void/browser/chatThreadService.ts` | `_runChatAgent` (line 732-911)、`_runToolCall` (line 605-727) |
| 工具清单/审批类型 | `src/vs/workbench/contrib/void/common/toolsServiceTypes.ts` | `approvalTypeOfBuiltinToolName` (line 21) |
| 工具实现 | `src/vs/workbench/contrib/void/browser/toolsService.ts` | - |
| 模式与工具可见性 | `src/vs/workbench/contrib/void/common/prompt/prompts.ts` | `availableTools` (line 361-376)、`chat_systemMessage` (line 428) |
| 全局设置（含 autoApprove） | `src/vs/workbench/contrib/void/common/voidSettingsTypes.ts` | `GlobalSettings` (line 490)、`defaultGlobalSettings` (line 506) |
| 推理预算/能力 | `src/vs/workbench/contrib/void/common/modelCapabilities.ts` | `reasoningCapabilities`、`getSendableReasoningInfo` (line 1576) |
| 上下文装配 | `src/vs/workbench/contrib/void/browser/convertToLLMMessageService.ts` | `prepareLLMChatMessages` (line 670) |
| 编辑器邻域片段 | `src/vs/workbench/contrib/void/browser/contextGatheringService.ts` | `updateCache` (line 66)，仅用于 FIM 自动补全 |

### 1.2 Chat 主循环结构（单线 single-agent）

```
┌─────────────────────────────────────────────────────────────┐
│              _runChatAgent (chatThreadService.ts)           │
│                                                             │
│  while (shouldSendAnotherMessage) {                         │
│     ┌────────────────────────────────────────────────┐      │
│     │ 1. prepareLLMChatMessages                      │      │
│     │    - 注入 system: workspace/open/active files  │      │
│     │    - 注入 directoryStr（目录树字符串，截断）   │      │
│     │    - 过去消息 + SELECTIONS（用户 @ 的文件）    │      │
│     └──────────────────┬─────────────────────────────┘      │
│                        ▼                                    │
│     ┌────────────────────────────────────────────────┐      │
│     │ 2. sendLLMMessage (streaming)                  │      │
│     │    可能返回 0 个或 1 个 tool_call              │      │
│     └──────────────────┬─────────────────────────────┘      │
│                        ▼                                    │
│     ┌────────────────────────────────────────────────┐      │
│     │ 3. if (toolCall) _runToolCall                  │      │
│     │    - 校验参数                                  │      │
│     │    - 若需审批 && !autoApprove → await 用户按钮 │      │
│     │    - 执行 tool                                 │      │
│     │    - 追加 tool 结果到 thread                   │      │
│     │    - shouldSendAnotherMessage = true           │      │
│     └──────────────────┬─────────────────────────────┘      │
│                        ▼                                    │
│     (若 awaiting_user → 退出循环等用户；否则继续 while) │
│  }                                                          │
└─────────────────────────────────────────────────────────────┘
```

**关键性质**：
- **严格单工具/轮**：`prompts.ts:471` 明确要求 `Only use ONE tool call at a time`。
- **无并行**：一个 tool 结束才能下一个。
- **无子 agent/子任务**：全代码库搜索 `subAgent|delegate|spawn.*agent|subtask` 均为 0 命中。

### 1.3 ChatMode 三档 — 工具可见性由此决定

定义：`voidSettingsTypes.ts:487` `ChatMode = 'agent' | 'gather' | 'normal'`

`prompts.ts:361 availableTools`：

| Mode | 可见 builtin 工具 | MCP 工具 | 语言 |
|---|---|---|---|
| `agent`（默认）| **全部** 15 个（含 edit/create/delete/run_command）| ✅ | "expert coding agent" |
| `gather` | 仅只读（read/ls/search/lint）| ❌ | "search, understand, reference" |
| `normal` | **0 个**（完全无工具）| ❌ | "coding assistant"（只回复文本） |

### 1.4 工具审批机制（默认不改代码/不新建文件的根因）

`toolsServiceTypes.ts:21` 定义了哪些工具属于哪类审批：

```
approvalTypeOfBuiltinToolName = {
  'create_file_or_folder': 'edits',
  'delete_file_or_folder': 'edits',
  'rewrite_file':          'edits',
  'edit_file':             'edits',
  'run_command':           'terminal',
  'run_persistent_command':'terminal',
  'open_persistent_terminal':'terminal',
  'kill_persistent_terminal':'terminal',
  // read/ls/search/lint 等 → undefined（无审批）
}
```

默认值 `defaultGlobalSettings.autoApprove = {}` → 三类（`edits` / `terminal` / `MCP tools`）**全部未勾选**。

**流程**（`chatThreadService.ts:642-652`）：

```
LLM 请求 edit_file
     │
     ▼
approvalType = 'edits'
autoApprove['edits'] = undefined (= false)
     │
     ▼
写入 tool_request 消息（UI 显示黄色待审批卡片）
返回 awaitingUserApproval: true → 中断主循环
     │
     ▼
用户点"接受"→ approveLatestToolRequest → 重入 _runToolCall(preapproved:true)
用户点"拒绝"→ rejectLatestToolRequest → 写 rejected，循环终止
```

**这就是"默认无法修改/新增文件"的真相**：不是能力缺失，而是审批策略保守 + UI 没有"整会话信任"开关默认开启。用户必须进入设置勾选 `autoApprove: edits` 才能跑全自动。

### 1.5 上下文检索方案（两条独立路径）

```
┌────────────────────────────────────────────────────────┐
│            Chat 上下文检索（LLM-driven grep）          │
│                                                        │
│  system prompt 静态注入：                              │
│   ├─ workspace folders                                 │
│   ├─ 当前活动文件 URI                                  │
│   ├─ 所有打开的文件 URIs                               │
│   └─ directoryStr（目录树字符串，长度截断）            │
│                                                        │
│  用户手动：@ 选中文件 → SELECTIONS 段落                │
│                                                        │
│  LLM 自主：通过工具检索（每轮只能一个）                │
│   ├─ search_pathnames_only  (按路径 grep)              │
│   ├─ search_for_files       (按内容 grep, 可 regex)    │
│   ├─ search_in_file         (单文件内搜)               │
│   ├─ read_file              (分页 read)                │
│   ├─ ls_dir / get_dir_tree                             │
│   └─ read_lint_errors                                  │
│                                                        │
│  ✅ 【Phase 4.1】semantic_search 语义搜索工具           │
│  ✅ 【Phase 4.5】save_memory/delete_memory 跨会话记忆   │
│  ✅ 【Phase 4.5】层级 .voidrules 持久约定文件           │
│  ✅ 【Phase 4.3】dispatch_agents 子代理并行检索         │
│  ✅ 【Phase 4.7】IDE 活动实时感知注入                   │
└────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────┐
│      FIM 自动补全上下文（contextGatheringService）     │
│                                                        │
│   ├─ ±3 行邻域代码                                     │
│   ├─ 父级 DocumentSymbol 片段（最多 MAX_SNIPPET_LINES=7)│
│   └─ 不跨文件                                          │
│                                                        │
│   仅服务于 autocomplete，不参与 Chat                   │
└────────────────────────────────────────────────────────┘
```

**痛点**：大仓库下 LLM "grep+read" 路径长（多轮消耗 token），没索引导致 agent 迷路/重复搜。

### 1.6 推理 Token 必须手动设定的原因

`modelCapabilities.ts` 对每个支持 reasoning 的模型定义两种 slider：

| Slider 类型 | 适用 | 范围 | 默认 |
|---|---|---|---|
| `budget_slider` | Anthropic、Gemini | 1024 – 8192 tokens | **1024**（很低）|
| `effort_slider` | OpenAI、Grok | low/medium/high | **low** |

**"必须手动"的根源**：

1. **默认值偏保守**：Anthropic Claude Sonnet 的 budget 默认 1024 tokens，仅够浅层思考；复杂任务（大规模重构、跨文件分析）远不够。
2. **无任务难度感知**：Void 不根据用户 prompt 长度、工具调用链深度、涉及文件数等自动调 budget，全部依赖用户在侧边栏拖动 slider。
3. **UI 在哪里拖**：`SidebarChat.tsx:197-213` 的 `ReasoningOptionSlider`，每个会话都要重新设。
4. **无"think harder"等自然语言触发器**：Claude Code 支持 prompt 中写 `think hard` / `ultrathink` 自动升档，Void 没有。

### 1.7 多 agent 设计 ✅ 【Phase 4.3 已实现】

~~全仓库搜索 `subAgent|sub_agent|delegate|spawn.*agent|subtask` → **0 命中**。~~

**已实现（Phase 4.3）：**
- `subagentService.ts` — `dispatch_agents` 工具支持最多 10 个并行子任务
- 子任务类型：grep / read_file / semantic_search / list_symbols
- 每个子任务独立执行、独立失败，结果汇聚后返回主 Agent
- `planningService.ts` — `update_plan` 工具实现 plan-execute 分离（Phase 4.2）
- Hooks 系统（Phase 2）— PreToolUse / PostToolUse / ToolUseError 可编程拦截

---

## 二、对标：Windsurf Cascade 与 Claude Code OSS

### 2.1 Windsurf（Cascade）关键特性

| 维度 | Windsurf 实现 |
|---|---|
| **默认工具策略** | 只读类（view_file/grep_search/list_dir）**默认自动运行**；修改类工具（write_to_file/edit）显示 diff 预览后用户一键确认；终端命令默认询问但有 allowlist |
| **语义代码索引** | 启动即为 workspace 建立向量索引（含 AST 符号 + 嵌入），`code_search` 工具做语义检索而非 grep |
| **工具并行** | 同一轮可发多个独立工具（parallel tool use），仅依赖关系才串行 |
| **@ 上下文** | @file、@symbol、@folder、@web、@docs 多种挂载源，自动聚合 |
| **Plan/多步** | `update_plan` 管理长任务 todo，`planning_mode` 先规划后执行 |
| **多 agent** | 主 agent + "Fast Context" 子 agent（专门做多轮 grep+read，结果精炼后返回） |
| **记忆系统** | 持久化 memory database（用户偏好、技术栈、代码片段），跨会话可用 |
| **Hook/规则** | `.windsurf/rules/*.md`、`.windsurf/workflows/*.md`、`.windsurf/skills/*` |

### 2.2 Claude Code OSS 新特性（2025 开源后）

| 特性 | 说明 |
|---|---|
| **`Task` 工具** | 真正的子 agent：主 agent 生成子任务描述 + 限定工具集，子 agent 独立上下文运行、返回压缩摘要。节省主窗口 token 同时支持大规模探索 |
| **Plan Mode** | 只读模式，强制先出计划不改代码，按 Shift+Tab 切换 |
| **`CLAUDE.md`** | 仓库根/目录级持久上下文文件，自动注入 system，承载约定、架构、禁区 |
| **`/memory`** | 跨会话的用户/项目记忆 |
| **Hooks** | `PreToolUse` / `PostToolUse` / `UserPromptSubmit` 等生命周期钩子，可用于审计/拦截/注入 |
| **MCP 原生** | 工具、资源、提示均可通过 MCP 服务器扩展 |
| **Thinking 自适应** | prompt 中写 `think` / `think hard` / `think harder` / `ultrathink` 自动匹配不同 budget 档位 |
| **并行工具** | 单轮内多个独立工具并发 |
| **Skills** | 声明式工作流，AI 可按需 invoke |
| **Slash 命令** | `/init`、`/clear`、`/compact` 等内置管理命令 |

---

## 三、Void 当时设计的四大痛点（根因） — 均已解决

```
┌──────────────────────────────────────────────────────────────────┐
│  痛点 1：推理 token 需手动设置       ✅ 已解决（reasoningAuto） │
│  解决：reasoningAuto.ts 关键词/启发式/thread继承自动升档     │
│        detectKeywordTier + heuristicsTier + resolveEffectiveTier │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  痛点 2：默认不能改代码/新建文件   ✅ 已解决（Phase 4.6）    │
│  解决：分层信任模型 + perToolRules (allow/deny/ask)                 │
│        mustAlwaysApprovePatterns 危险命令硬审批                  │
│        三档信任级别预设（保守/标准/无缝）                      │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  痛点 3：上下文检索低效           ✅ 已解决（Phase 3+4）     │
│  解决：① semantic_search 语义索引 (Phase 4.1)                      │
│        ② dispatch_agents 子代理并行检索 (Phase 4.3)               │
│        ③ 层级 .voidrules + save_memory 持久记忆 (Phase 4.5)        │
│        ④ 上下文压缩 contextCompaction (Phase 3)                   │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  痛点 4：缺多 agent / Plan 机制   ✅ 已解决（Phase 2+4）      │
│  解决：① dispatch_agents 子代理 (Phase 4.3, 最多10并行)          │
│        ② update_plan 规划/任务管理 (Phase 4.2)                    │
│        ③ Hooks 系统 Pre/Post/Error (Phase 2)                     │
│        ④ Turn 级检查点/回滚 (Phase 2)                              │
└──────────────────────────────────────────────────────────────────┘
```

---

## 四、优化方案（按优先级分期）

### 方案总览

```
                       立即见效            需架构改动
                    ┌──────────────┬──────────────────┐
    低成本          │  P0 信任策略 │  P1 Plan Mode    │
                    │  P0 推理档位 │  P1 CLAUDE.md    │
                    ├──────────────┼──────────────────┤
    高成本          │  P2 工具并行 │  P3 Task 子 agent│
                    │              │  P3 语义索引     │
                    └──────────────┴──────────────────┘
```

### P0：低成本立即见效 ✅ 已完成

#### P0-1：审批策略重构 ✅ Phase 4.6 已完成

**目标**：默认能改代码、能建文件，但保留关键审批。

- **分层信任模型**（参考 Windsurf）：
  - `autoApprove.reads` → 始终默认 `true`（已经无审批）
  - `autoApprove.edits.workspace` → 默认 `true`（仓库内改/建）
  - `autoApprove.edits.outsideWorkspace` → 默认 `false`（外部路径仍需审批）
  - `autoApprove.terminal.allowlist` → 默认允许 `npm/git status/ls/cat`；危险命令（rm/sudo/curl）仍需审批
  - `autoApprove.mcp.perServer` → 按 MCP server 粒度
- **UI**：Onboarding 加一步"选择信任级别"（保守/标准/无缝），对应预设 autoApprove 组合。
- **侧边栏**：tool request 卡片加 `Accept & trust this kind for session` 按钮。
- **落地点**：`voidSettingsTypes.ts` 扩展 autoApprove 结构；`chatThreadService.ts:644-652` 的审批判断改为分层。

#### P0-2：推理档位自适应 ✅ reasoningAuto 已完成

**目标**：用户不用碰 slider。

- **Prompt 关键词触发**（参考 Claude Code）：
  - prompt 含 `think` → budget = default*2
  - prompt 含 `think hard` / `deep think` → budget = max*0.5
  - prompt 含 `think harder` / `ultrathink` → budget = max
- **任务类型启发式**：
  - 工具链 >= 5 轮 → 自动升档
  - 涉及文件 >= 10 → 自动升档
  - 含 refactor/设计/架构关键词 → 升档
- **持久化默认**：`voidSettingsService` 记住用户上次拖过的 slider，同一 thread 沿用。
- **提高默认下限**：`budget_slider.default` 从 1024 调到 4096（覆盖 80% 真实任务）。
- **落地点**：`modelCapabilities.ts:1576 getSendableReasoningInfo` 增加一个 `inferReasoningBudget(prompt, threadState)` 预处理步骤。

### P1：中成本架构增强 ✅ 已完成

#### P1-1：Plan Mode ✅ Phase 4.2 已完成（update_plan 工具）

新增 ChatMode `'plan'`：
- 工具集：只读 + 一个新工具 `propose_plan(tasks[])`
- system prompt：强制先输出结构化 plan（TODO list），用户 Accept 后才切回 agent mode 执行
- UI：Plan 预览卡片 + `Accept & Execute` 按钮
- **落地点**：`voidSettingsTypes.ts:487` 扩 `ChatMode`、`prompts.ts:361` 改 `availableTools`、新增 `ProposePlanCard.tsx`

#### P1-2：`.voidrules` 持久上下文 ✅ Phase 4.5 已完成

- 仓库根 `.voidrules` + 目录级 `.voidrules`（就近合并）
- 启动时读取注入 system prompt
- `/init` 命令：AI 扫仓库自动起草 `.voidrules` 供用户 commit
- **落地点**：`convertToLLMMessageService.ts:570 _getSystemMessage` 前置加载
- **兼容**：同步支持读取 `CLAUDE.md` / `AGENTS.md`（兼容其他工具生态）

#### P1-3：Memory 系统 ✅ Phase 4.5 已完成（memoryService.ts）

- 结构化记忆存储（用户偏好、栈选、约定）
- 新建工具：`create_memory(title, content, tags)`
- 检索：新 thread 时按 tag 召回 top-N 注入 system
- **落地点**：新增 `memoryService.ts` + SQLite（VSCode 自带）

### P2：并行工具 ✅ Phase 4.3 已完成（dispatch_agents）

- 放宽 `prompts.ts:471` "only one tool at a time"
- `sendLLMMessage` 的 `onFinalMessage` 支持多个 `toolCalls[]`
- `_runChatAgent` 并发调度 + 汇总结果回灌
- 风险：edit 类工具之间仍需串行（避免文件冲突），grep/read 可并行
- **落地点**：`chatThreadService.ts:884-898` 改 for-each + Promise.all（仅对只读工具）

### P3：高成本突破 ✅ 已完成

#### P3-1：`Task` 子 agent 工具 ✅ Phase 4.3 已完成（dispatch_agents）

- 新建 builtin `dispatch_task({ description, allowed_tools })`
- 子 agent 独立 context window + 受限工具集 + 独立消息历史
- 执行完返回**压缩摘要**给主 agent，不污染主窗口
- 典型用途：大规模 grep、跨模块分析、代码库审计
- **落地点**：`toolsService.ts` 加 `dispatch_task`，内部调 `chatThreadService` 创建 shadow thread

#### P3-2：语义代码索引 ✅ Phase 4.1 已完成（codeIndexService.ts）

- 后台进程构建仓库嵌入（local embedding 模型如 Qwen/Ollama nomic-embed）
- 新建工具 `semantic_search(query, top_k)`
- 增量更新：文件变更 → 增量重嵌入
- 存储：SQLite + hnswlib / sqlite-vec 扩展
- **落地点**：新 `codeIndexService.ts`（common/browser 分层），改 onboarding 加"索引此仓库"步骤
- **成本最高**：需要设计嵌入策略、分块、性能、隐私

#### P3-3：Hook 生命周期 ✅ Phase 2 已完成（hookService.ts）

- 暴露 `PreToolUse` / `PostToolUse` / `UserPromptSubmit` 事件
- 用户可在 `.windsurf/hooks/*.js`（或 `.void/hooks/`）挂载自定义脚本
- 用途：审计日志、敏感信息拦截、CI 钩子、格式化

---

## 五、优先级建议与风险

### 落地次序（实际执行记录）

```
Phase 1:  LSP 工具集成                              ✅ 已完成
Phase 2:  Autocomplete上下文 + Hooks + 检查点    ✅ 已完成
Phase 3:  上下文压缩 + 模糊编辑 + batch_edit + 活跃上下文  ✅ 已完成
Phase 4:  语义索引 + 规划 + 子代理 + 网络搜索 + Memories    ✅ 已完成
          + 精细权限 + 实时感知 + 远程仓库索引        ✅ 已完成
          + 推理自适应 (reasoningAuto)                     ✅ 已完成
测试:    153 用例全部通过，0 失败                      ✅ 已完成
```

### 风险清单

| 风险 | 缓解 |
|---|---|
| 改审批默认值可能"破坏性"（用户不期望自动修改）| 在 onboarding 加明确选择，旧用户迁移保持原值 |
| 推理档位自适应误判大小任务 | 提供"强制档位"侧边栏开关覆盖自动 |
| Plan mode 与 agent mode 切换体验繁琐 | Shift+Tab 快捷键、UI 角标 |
| `.voidrules` 与 CLAUDE.md/AGENTS.md 兼容 | 统一加载顺序 + 首启动提示 |
| Task 子 agent 预算失控 | 强制 max_depth + max_tokens 配额 |
| 语义索引首次构建慢 | 后台异步 + 进度条 + 可关闭 |
| 并行工具文件写入冲突 | 仅对只读工具并行，edit/create/delete 仍串行 |

---

## 六、与 OpenSpec 流程的衔接

本文档作为 **explore 阶段产物** 已完成其使命。所有提出的优化方案均已通过 Phase 1–4 实现：

| 原提案 | 实现状态 |
|---------|----------|
| `improve-tool-approval-policy`（P0-1） | ✅ Phase 4.6 perToolRules + mustAlwaysApprovePatterns |
| `add-reasoning-budget-auto`（P0-2） | ✅ reasoningAuto.ts |
| `add-plan-mode`（P1-1） | ✅ Phase 4.2 update_plan + planningService.ts |
| `add-voidrules-and-memory`（P1-2 + P1-3） | ✅ Phase 4.5 memoryService.ts + 层级 .voidrules |
| `add-parallel-tools`（P2） | ✅ Phase 4.3 dispatch_agents |
| `add-task-subagent`（P3-1） | ✅ Phase 4.3 subagentService.ts |
| `add-semantic-code-index`（P3-2） | ✅ Phase 4.1 codeIndexService.ts |

详细实现记录见 `docs/analysis/recommended-openspec-changes.md`。

---

## 七、开放问题（原始决策点 — 已解决）

- [x] **信任策略**：✅ 已实现三档信任级别预设（TRUST_LEVEL_PRESETS）+ mustAlwaysApprovePatterns 危险命令硬审批
- [x] **推理自适应触发词**：✅ 已支持中英混用（`深入思考` / `think hard` / `ultrathink` 等）
- [x] **语义索引模型**：✅ 当前使用 FNV-1a hash 嵌入（本地零依赖），ONNX 模型为待增强项
- [x] **Task 子 agent 的 UI**：✅ dispatch_agents 结果汇聚后格式化返回主 Agent
- [x] **是否先做 P0**：✅ 实际执行顺序为 Phase 1→4，全部完成
- [x] **change proposal**：✅ 详见 `docs/analysis/recommended-openspec-changes.md`

### 待增强方向（非阻塞）

- [ ] ONNX 嵌入模型（all-MiniLM-L6-v2）替代 FNV-1a hash 嵌入
- [ ] SQLite-vec 持久化向量存储
- [ ] 混合搜索（语义 + ripgrep）
- [ ] UI 状态面板（索引进度、工具统计、记忆管理）
- [ ] GitHub Token 支持（提升远程仓库 API 速率限制）

---

> 本文档为 explore 产出（已完成）。所有提案均已实现，实现记录见 `docs/analysis/` 下对应文档。
