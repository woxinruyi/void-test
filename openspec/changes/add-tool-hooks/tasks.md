# 任务清单（add-tool-hooks）

## 1. 类型定义与服务骨架

- [ ] 1.1 新建 `hookTypes.ts`，定义 `HookEvent` / `HookConfig` / `HookPayload` / `HookResult` / `IHookService` 接口
- [ ] 1.2 新建 `hookService.ts`，实现 `HookService` 类并注册为 Singleton
- [ ] 1.3 实现 `registerBuiltinHook()` 内置 JS 钩子注册表

## 2. 配置加载

- [ ] 2.1 实现工作区级 `.void/hooks.json` 和用户级 `%APPDATA%/Void/hooks.json` 加载
- [ ] 2.2 实现 JSON 解析错误时的容错（跳过文件并通知用户）
- [ ] 2.3 实现配置合并（按 priority 排序，工作区优先）
- [ ] 2.4 实现 `reloadConfig()` 手动刷新
- [ ] 2.5 监听配置文件变更，自动重载

## 3. 钩子执行

- [ ] 3.1 实现 `trigger(event, payload)` 主入口：匹配 toolNames / pathPattern，按 priority 串行执行
- [ ] 3.2 实现命令钩子执行：`child_process.spawn()` + stdin 写入 payload JSON + stdout 解析
- [ ] 3.3 实现环境变量注入（`VOID_EVENT` / `VOID_TOOL_NAME` / `VOID_FILE_PATH` 等）
- [ ] 3.4 实现超时保护（`AbortController` + 默认 10 秒）
- [ ] 3.5 实现 JS 钩子执行（直接 await 注册的函数）
- [ ] 3.6 实现错误容错：钩子失败时记录日志但不中断 Agent 循环

## 4. ChatThreadService 集成

- [ ] 4.1 在 `ChatThreadService` 构造函数中注入 `IHookService`
- [ ] 4.2 在 `_runToolCall()` 开始处插入 `PreToolUse` 触发点
- [ ] 4.3 实现 PreToolUse 的 `deny` / `modify` 语义（拒绝时返回错误，修改时替换 params）
- [ ] 4.4 在 `_runToolCall()` 执行成功后插入 `PostToolUse` 触发点
- [ ] 4.5 将 PostToolUse 的 `message` 拼接到工具结果字符串
- [ ] 4.6 在 `_runToolCall()` 异常分支插入 `ToolUseError` 触发点
- [ ] 4.7 在 `openNewThread()` 中插入 `SessionStart` 触发点
- [ ] 4.8 在 `addUserMessage()` 中插入 `UserPromptSubmit` 触发点

## 5. 文档与示例

- [ ] 5.1 创建 `.void/hooks.example.json` 示例配置（formatter + lint + deny-danger）
- [ ] 5.2 创建 `.void/deny-danger.js` 示例脚本
- [ ] 5.3 在 README/docs 中补充 Hooks 使用文档（安全警告、配置示例、事件列表）

## 6. 构建与验证

- [ ] 6.1 TypeScript 编译通过，无类型错误
- [ ] 6.2 验证命令钩子返回 `allow` 时 Agent 正常执行
- [ ] 6.3 验证 `deny` 钩子中止工具执行并显示 message
- [ ] 6.4 验证 `modify` 钩子替换 params 后工具使用新参数
- [ ] 6.5 验证超时钩子被视为 deny
- [ ] 6.6 验证 `pathPattern` 仅对匹配路径触发
- [ ] 6.7 验证无配置时零开销（trigger 直接返回空）
- [ ] 6.8 验证配置文件错误时容错
