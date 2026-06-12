# 新增：工具钩子系统（add-tool-hooks）

## 背景

Void 编辑器当前的工具调用流程在 `ChatThreadService._runToolCall()` 中是**闭合的**——参数验证 → 审批 → 执行 → 结果字符串化，中间没有可编程的扩展点。对比主流方案：

- **Claude Code**：提供完整的 Hooks 系统（`PreToolUse` / `PostToolUse` / `SessionStart` / `UserPromptSubmit` / `Stop` 等），用户可通过 shell 脚本或命令在事件点注入自定义逻辑
- **Windsurf Cascade**：提供 pre/post read/write/command/mcp 钩子，支持自定义校验和变换

典型用例：
- 在 `edit_file` 前自动运行 formatter，保证代码风格一致
- 在 `run_command` 前根据白名单拒绝危险命令
- 在 `PostToolUse` 中自动运行 lint / test，将结果反馈给 LLM
- 在 `SessionStart` 时自动加载项目特定的上下文（如数据库 schema）

## 目标

- 在 `ChatThreadService._runToolCall()` 的前后增加 Hooks 调用点
- 支持工作区级和用户级 Hooks 配置文件
- 支持两种钩子形式：
  - **命令钩子**：执行外部 shell 命令，stdin 接收事件 JSON，stdout/exit code 决定结果
  - **JS 钩子**：直接在主进程中执行 JS 代码（内置/扩展提供）
- 钩子可拦截（阻止工具执行）、变换（修改参数/结果）、观察（仅记录日志）

### 钩子事件

| 事件 | 触发时机 | 载荷 | 可否拦截 |
|------|----------|------|----------|
| `PreToolUse` | 工具参数验证后、审批前 | `{ toolName, params, threadId }` | ✅ |
| `PostToolUse` | 工具执行成功后 | `{ toolName, params, result, threadId }` | ❌（仅观察/变换结果） |
| `ToolUseError` | 工具执行失败后 | `{ toolName, params, error, threadId }` | ❌ |
| `SessionStart` | 新聊天线程创建时 | `{ threadId, workspaceRoot }` | ❌ |
| `UserPromptSubmit` | 用户发送消息时 | `{ threadId, message }` | ✅ |

## 非目标（Non-goals）

- 不实现跨工作区的全局钩子（仅工作区级 + 用户级）
- 不实现钩子的 UI 可视化管理界面（通过配置文件管理）
- 不实现钩子的沙箱隔离（命令钩子在用户权限下运行，信任由配置者承担）
- 不替代现有的 MCP 工具机制（Hooks 是工具调用前后的切面，MCP 是工具本身）

## 方案

1. **配置格式**：`.void/hooks.json`（工作区级）和 `%APPDATA%/Void/hooks.json`（用户级），合并后共同生效
2. **HookService**：新建服务，负责加载配置、匹配事件、执行钩子、处理结果
3. **ChatThreadService 集成**：在 `_runToolCall()` 前后插入钩子调用点
4. **事件载荷**：以 JSON 传递给命令钩子的 stdin，JS 钩子以对象参数传入
5. **钩子响应契约**：
   - `decision: 'allow' | 'deny' | 'modify'`
   - `modifiedParams?: {...}`（仅 PreToolUse）
   - `message?: string`（显示给用户/LLM）
6. **超时保护**：命令钩子默认 10 秒超时，避免阻塞 Agent 循环

## 影响

- 新增文件：`hookService.ts`、`hookTypes.ts`、`.void/hooks.example.json`
- 修改文件：`chatThreadService.ts`（增加钩子调用点）
- 新增配置：`.void/hooks.json`
- 依赖：无新增外部依赖（使用 Node `child_process`）
- 风险：命令钩子可能引入安全问题（执行外部命令），需明确用户责任

