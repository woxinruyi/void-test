# 分析：架构现状、对标差距与问题点

> 本文把原临时分析（temp-ai-coding-tools-benchmark / temp-settings-tab-and-optimization-plan）
> 的实质内容固化进 change，作为 proposal/design 的证据底稿。

## 1. 当前架构快照（事实，证据见 architecture/）

- 进程模型：renderer（Agent 状态机 `chatThreadService`、工具 `toolsService`、编辑 `editCodeService`、Prompt 组装 `convertToLLMMessageService`）＋ main（LLM 调用、MCP、git、更新）＋ common（类型/Prompt/设置）。
- 已具备：Agent 循环（chat/gather/agent 三模式、并行工具、≤50 轮、上下文压缩）、34 内建工具 + LSP 工具 + MCP 外部工具 + 工具审批/钩子、Apply/Fast Apply + 内联 diff、语义索引（AST+Merkle+RRF 框架）、子代理（只读 dispatch）、planning/memory/webSearch、Turn 级检查点、13+ Provider、Anthropic Prompt 缓存、推理预算自适应、完整 i18n（默认中文）、MCP 聚合市场。
- React 挂载层：所有 React 表面（设置/侧边栏等）共用 `react/src/util/services.tsx` 的 `getReactAccessor`，挂载时 **eager 解析 ~46 个服务**。

## 2. 对标矩阵（2026 年中主流工具）

图例：✅ 完整 ｜ ⚠️ 部分/占位 ｜ ❌ 无

| 能力 | YWCode | Cursor v3 | Windsurf | Copilot | Claude Code | Zed |
|---|---|---|---|---|---|---|
| 多文件 Agent 循环 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 预测式 Tab 补全 | ⚠️ 通用 LLM | ✅ 专用 | ✅ | ✅ | — | ✅ Zeta2 |
| Fast Apply 低延迟编辑 | ⚠️ 通用 LLM | ✅ Sonic | ✅ | ⚠️ | — | ✅ |
| 全仓库语义索引 | ⚠️ **占位** | ✅ | ✅ 关系图 | ⚠️ 按需 | ⚠️ 按需 | ⚠️ |
| LSP 代码导航 | ✅ 5 个 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 子代理 / Agent teams | ⚠️ 只读≤10 | ✅ | ⚠️ | ✅ | ✅ | ⚠️ |
| 后台/云端 Agent | ❌ 规划中 | ✅ | ⚠️ | ⚠️ | ✅ | ⚠️ |
| 工具钩子 | ✅ 5 事件 | ✅ | ⚠️ | ⚠️ | ✅ | ⚠️ |
| MCP + 市场 | ✅ 聚合 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 检查点/回滚 | ✅ Turn 级 | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ |
| AI 代码审查 | ⚠️ 基础已落地 | ✅ BugBot | ⚠️ | ✅ | ✅ | ⚠️ |
| 多 Provider | ✅ **13+** | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ |
| Prompt 缓存 | ✅ Anthropic | ✅ | ⚠️ | ⚠️ | ✅ | ⚠️ |
| 推理预算自适应 | ✅ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ |
| 默认中文 / i18n | ✅ **完整** | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ |
| 多端（JB/Web/移动） | ❌ | ✅ | ❌ | ✅ | ⚠️ CLI | ❌ |

护城河：多 Provider 聚合、默认中文、工具钩子、Prompt 缓存、推理自适应、MCP 市场。

## 3. 架构级问题点（"值得优化和存在问题的点"）

### 3.1【能力地基】语义索引是占位实现 — P0
- 现状架构：`codeIndexService` 有 tree-sitter AST 分块、Merkle 增量、RRF 混合搜索、ripgrep 降级——**框架完整**；但 **embedding = FNV-1a hash（384 维占位）**、**向量存储 = 内存占位**。
- 后果：`semantic_search` 实际召回≈关键词检索，"理解整个代码库"缺失。
- 目标架构：embedding provider 抽象 → ONNX `all-MiniLM-L6-v2`/bge-small（main/worker 推理，规避 renderer 阻塞）；store → SQLite + sqlite-vec（持久、随 Merkle 增量）。

### 3.2【日常手感】无专用编辑/Apply 模型 — P0
- 现状架构：Tab 补全（`autocompleteService`，FIM 已支持）与 Apply（`editCodeService` Diff Zone）都走**通用 LLM**。
- 后果：每分钟可感知的输入手感与落盘延迟落后 Cursor Sonic / Zed Zeta2。
- 目标架构：`modelCapabilities` 增"编辑预测/快速应用"能力位，接入专用低延迟模型，通用 LLM 降级。

### 3.3【放手跑】无后台 Agent — P0
- 现状：`add-background-agents` 仅规划；长任务全程占前台。
- 目标架构：git worktree 隔离 + 任务队列服务（复用 `subagentService` 调度骨架 + `turnCheckpointService` 隔离思路），先本机后台。

### 3.4【挂载层脆弱性】eager 解析 + 零错误隔离 — 已部分修复，需固化
- 现状架构：`getReactAccessor` 挂载时一次性 `accessor.get` ~46 个服务；任一**孤儿注册**（registerSingleton 未执行 / 未在 `void.contribution.ts` import）即**整页空白**。本会话两次命中：`IMarketplaceService` 孤儿、`IVoidSCMService` 渲染未注册（见 archive/fix-settings-pane-mount-resilience）。
- 已做：`mountFnGenerator` try/catch + 根 ErrorBoundary（失败可见而非静默空白）。
- 待固化：DI 注册自检（dev 下逐个 try-get 汇总缺失）+ 设置面板烟雾测试，防同类复发。

### 3.5【子代理受限】只读、≤10、gather 工具集 — P1
- 现状：`subagentService.dispatch` 仅跑只读搜索工具（grep/read/semantic/list_symbols），非独立 LLM 代理。
- 目标架构：升级为带角色（reviewer/tester/security）、可写、独立工具权限的 Agent teams（对标 Claude Code）；审批沿用 `toolsService`。

### 3.6【上下文】有自动注入但无关系图 — P1
- 现状：已注入目录树/git/栈/打开文件/计划/记忆；缺符号级调用/依赖关系图（依赖 3.1 真索引）。

### 3.7【工程细节】i18n 切换整树重挂 — P2
- 现状：`Settings.tsx` 以 `key={locale}` 触发整棵 React 树卸载重挂，切换语言闪烁且放大故障面。
- 目标：改 context 局部更新。

## 4. 取舍结论
放弃多端扩张（多端 = 巨大 scope、与"中文桌面分支"定位不符），资源集中在 3.1 索引质量 + 3.2 编辑手感——这两项是第一梯队拉开差距的根，也是护城河之外最该补的地基。优先级与路线图见 `proposal.md` / `tasks.md`。
