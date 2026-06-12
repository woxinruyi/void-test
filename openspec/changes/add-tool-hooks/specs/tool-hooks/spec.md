# 工具钩子系统规格（tool-hooks）

## 能力描述

Void 编辑器在 Agent 模式的工具调用链路中引入可编程事件钩子。用户可通过 `.void/hooks.json` 配置命令钩子或 JS 钩子，在 `PreToolUse` / `PostToolUse` / `ToolUseError` / `SessionStart` / `UserPromptSubmit` 等事件点注入自定义逻辑，用于校验、变换、拦截、观察工具调用行为。

## 场景

### 场景 1：PreToolUse 拒绝危险命令

- 前置条件：`.void/hooks.json` 配置了针对 `run_command` 的拒绝钩子
- LLM 调用 `run_command` 传入 `rm -rf /`
- 钩子读取 stdin JSON，匹配黑名单正则
- 钩子返回 `{"decision":"deny","message":"Blocked dangerous command"}`
- 工具执行被中止，结果为错误消息，message 返回给 LLM

### 场景 2：PreToolUse 修改参数（自动格式化）

- 前置条件：配置了 PreToolUse 钩子在 `edit_file` 前运行 formatter
- LLM 调用 `edit_file`
- 钩子对 params 中的代码片段进行格式化
- 钩子返回 `{"decision":"modify","modifiedParams":{...}}`
- 工具使用修改后的参数执行

### 场景 3：PostToolUse 附加 lint 结果

- 前置条件：配置了 PostToolUse 钩子在 `edit_file` 后运行 ESLint
- `edit_file` 成功执行
- 钩子对修改后的文件运行 eslint
- 钩子返回 `{"decision":"allow","message":"3 lint warnings: ..."}`
- lint 结果被拼接到工具结果字符串，LLM 可据此决定是否修复

### 场景 4：路径匹配过滤

- 前置条件：钩子配置 `pathPattern: **/*.ts`
- LLM 调用 `edit_file` 修改 `README.md`
- 钩子 pathPattern 不匹配，跳过
- LLM 调用 `edit_file` 修改 `src/foo.ts`
- 钩子 pathPattern 匹配，执行

### 场景 5：超时保护

- 前置条件：钩子配置 `timeoutMs: 5000`，钩子脚本 sleep 10 秒
- 工具调用触发钩子
- 5 秒后 AbortController 取消钩子进程
- 钩子结果视为 `deny`，工具执行中止
- Agent 循环不被阻塞

### 场景 6：多钩子串行执行与优先级

- 前置条件：配置了 3 个 PreToolUse 钩子，priority 分别为 200/100/50
- 工具调用触发 PreToolUse
- 按 200 → 100 → 50 顺序串行执行
- 任一钩子返回 `deny` 立即中止
- 多个 `modify` 钩子链式应用 modifiedParams

### 场景 7：无配置时零开销

- 前置条件：`.void/hooks.json` 不存在
- 工具调用触发 PreToolUse
- HookService.trigger() 匹配到 0 个钩子，立即返回空数组
- 工具调用链路无额外延迟

### 场景 8：配置错误容错

- 前置条件：`.void/hooks.json` 存在 JSON 语法错误
- Void 启动或配置重载时解析失败
- 通过 `notificationService` 通知用户配置错误
- 跳过该配置文件，Agent 继续使用用户级配置或无钩子运行

### 场景 9：SessionStart 加载项目上下文

- 前置条件：配置了 SessionStart 钩子，打印项目 schema 到 stdout message
- 用户新建聊天线程
- 钩子执行，返回 message
- message 被添加到线程的初始系统消息中

### 场景 10：JS 钩子（内置扩展点）

- 前置条件：Void 内部或扩展通过 `registerBuiltinHook()` 注册 JS 钩子
- 工具调用触发事件
- JS 钩子直接 await 执行，无进程启动开销
- 延迟 < 5ms
