# 服务接口索引

## 服务注册模式

所有 Void 服务遵循 VS Code DI 模式：
1. 在 `common/` 中声明 interface + `createDecorator`
2. 在 `browser/` 或 `electron-main/` 中实现
3. 通过 `registerSingleton()` 注册到 DI 容器
4. **该实现文件必须可从 `void.contribution.ts` 的 import 图到达**（直接 `import './xxx.js'`，或被图内某文件 import），`registerSingleton` 才会在 workbench 启动时执行。仅被 React bundle（`react/`，独立 esbuild）引用**不算**注册 —— 会成为"孤儿注册"，`accessor.get` 时抛错。`getReactAccessor`（`react/src/util/services.tsx`）在挂载时 eager 解析全部服务，任一孤儿都会让对应 React 面板整页空白。

## Renderer 进程服务（browser/）

| 服务接口 | 实现文件 | 职责 |
|----------|----------|------|
| `IChatThreadService` | `chatThreadService.ts` | Agent 循环状态机、对话管理、消息历史 |
| `IToolsService` | `toolsService.ts` | 工具执行引擎、审批流、循环检测 |
| `IEditCodeService` | `editCodeService.ts` | Apply/Fast Apply 代码修改 |
| `IConvertToLLMMessageService` | `convertToLLMMessageService.ts` | System Prompt 组装、上下文收集 |
| `ITerminalToolService` | `terminalToolService.ts` | 终端命令执行、持久终端管理 |
| `IAutocompleteService` | `autocompleteService.ts` | AI 自动补全 |
| `ICodeIndexService` | `codeIndexService.ts` | 语义代码索引 |
| `ISubagentService` | `subagentService.ts` | 并行子任务分发 |
| `IPlanningService` | `planningService.ts` | Todo/计划管理 |
| `IMemoryService` | `memoryService.ts` | 记忆存储与检索 |
| `IWebSearchService` | `webSearchService.ts` | 网页搜索、URL 读取 |
| `IIDEActivityService` | `ideActivityService.ts` | IDE 实时活动感知 |
| `IContextCompactionService` | `contextCompactionService.ts` | 对话上下文压缩 |
| `IRemoteIndexService` | `remoteIndexService.ts` | 远程仓库索引 |
| `IHookService` | `hookService.ts` | 工具钩子（前置/后置） |
| `ITurnCheckpointService` | `turnCheckpointService.ts` | 回合检查点（回滚） |
| `IContextGatheringService` | `contextGatheringService.ts` | 上下文收集（已注释） |
| `IMarketplaceService` | `marketplaceService.ts` | MCP/Skill 市场 |
| `IVoidSCMService` | `voidSCMService.ts` | Git 状态（IPC 代理到 main） |

## Common 层服务（common/）

| 服务接口 | 实现文件 | 职责 |
|----------|----------|------|
| `IVoidSettingsService` | `voidSettingsService.ts` | 全局设置（Provider/模型/API Key） |
| `IVoidModelService` | `voidModelService.ts` | 编辑器文本模型访问 |
| `ISendLLMMessageService` | `sendLLMMessageService.ts` | LLM 消息发送（IPC 到 main） |
| `IDirectoryStrService` | `directoryStrService.ts` | 目录树字符串生成 |
| `IMCPService` | `mcpService.ts` | MCP 外部工具管理 |
| `IRefreshModelService` | `refreshModelService.ts` | 模型列表刷新 |
| `IMetricsService` | `metricsService.ts` | 使用指标收集 |

## Main 进程服务（electron-main/）

| 服务接口 | 实现文件 | 职责 |
|----------|----------|------|
| `ISendLLMMessageMainService` | `llmMessage/` | 实际调用 LLM Provider API |
| `IVoidSCMMainService` | `voidSCMMainService.ts` | Git 命令执行（git stat/branch/log） |
| `IMCPMainService` | `mcpChannel.ts` | MCP 服务端实际连接 |
| `IVoidUpdateMainService` | `voidUpdateMainService.ts` | 自动更新下载安装 |
| `IMetricsMainService` | `metricsMainService.ts` | 指标上报 |

## IPC 通道（main↔renderer）

| 通道 | 文件 | 方向 |
|------|------|------|
| `sendLLMMessageChannel` | `sendLLMMessageChannel.ts` | renderer → main（LLM 调用） |
| `mcpChannel` | `mcpChannel.ts` | renderer → main（MCP 工具调用） |
| `voidSCMService` | `voidSCMService.ts` | renderer → main（Git 操作） |

---

## 更新日志

| 日期 | 内容 | 关联变更 |
|------|------|----------|
| 2026-05-26 | 初始创建：全服务索引 | enhance-agent-prompt-and-context |
| 2026-06-12 | 补注册图可达性约束；修复 IMarketplaceService 孤儿注册 | fix-settings-pane-mount-resilience |
