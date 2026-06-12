# 设计说明（add-tool-hooks）

## 一、方案总览

```
┌───────────────────────────────────────────────────────────┐
│                   Hooks 调用链路                           │
├───────────────────────────────────────────────────────────┤
│                                                           │
│  ChatThreadService._runToolCall(toolName, params)         │
│       │                                                   │
│       ├─► HookService.trigger('PreToolUse', payload)      │
│       │       ├─ 匹配配置中的钩子                          │
│       │       ├─ 按 priority 顺序执行                     │
│       │       ├─ 返回 {decision, modifiedParams, message} │
│       │       └─ decision='deny' → 中止工具执行           │
│       │                                                   │
│       ├─► validateParams + approvalCheck + callTool       │
│       │                                                   │
│       ├─► HookService.trigger('PostToolUse', {..., result})│
│       │       └─ 可变换 result，附加 lint/test 输出       │
│       │                                                   │
│       └─► 结果加入消息历史                                │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

## 二、关键决策

### 决策 1：两层配置合并（工作区 + 用户）

- 工作区级：`<workspace>/.void/hooks.json` — 项目特定钩子（如 formatter、lint）
- 用户级：`%APPDATA%/Void/hooks.json` — 个人偏好（如审计日志）

合并规则：数组拼接，工作区钩子优先级高于用户钩子（按 `priority` 字段排序，相同 priority 工作区在前）。

### 决策 2：命令钩子使用 stdin/stdout JSON 协议

与 Claude Code Hooks 一致，参考 LSP stdio 风格：

**输入（stdin）**：
```json
{
  "event": "PreToolUse",
  "toolName": "edit_file",
  "params": { "uri": "file:///...", "searchReplaceBlocks": "..." },
  "threadId": "abc123",
  "workspaceRoot": "i:/自动化执行/void-main"
}
```

**输出（stdout）**：
```json
{
  "decision": "allow",
  "modifiedParams": { "uri": "file:///...", "searchReplaceBlocks": "..." },
  "message": "Auto-formatted with prettier before edit"
}
```

**约定**：
- `decision` 为 `'allow' | 'deny' | 'modify'`（默认 `'allow'`）
- `modifiedParams` 仅对 `PreToolUse` 生效
- exit code ≠ 0 视为 `'deny'`，stderr 作为拒绝理由
- stdout 非 JSON 视为 `'allow'` + 原样日志

### 决策 3：JS 钩子（内置扩展点）

对于 Void 自身需要的内置行为（如 `edit_file` 后自动 lint），使用 JS 钩子而非命令钩子，避免进程启动开销。JS 钩子注册表：

```typescript
interface IHookService {
  registerBuiltinHook(event: HookEvent, hook: (payload) => Promise<HookResult>): IDisposable
}
```

### 决策 4：钩子匹配规则

配置中的每个钩子可通过以下字段过滤事件：

```json
{
  "event": "PreToolUse",
  "toolNames": ["edit_file", "rewrite_file"],   // 可选，缺省=全部
  "pathPattern": "**/*.ts",                     // 可选，基于 minimatch
  "command": "npx prettier --write $VOID_FILE_PATH",
  "priority": 100,
  "timeoutMs": 10000
}
```

环境变量注入：
- `VOID_EVENT`、`VOID_TOOL_NAME`、`VOID_THREAD_ID`
- `VOID_FILE_PATH`（从 params.uri 提取，若存在）
- `VOID_WORKSPACE_ROOT`

### 决策 5：超时与并发

- 每个钩子默认超时 10 秒，可在配置中覆盖
- 超时视为 `'deny'`，并发送告警通知（不阻塞 Agent 循环）
- 同一事件的多个钩子**串行执行**（保证 `modifiedParams` 链式应用）
- 超时钩子使用 `AbortController` 取消

### 决策 6：安全边界

命令钩子在用户权限下运行，与 `run_command` 工具同级风险：
- 不做沙箱隔离
- 配置文件必须由用户手动创建，不支持 AI 自动生成
- 首次加载配置时提示用户确认（showInformationMessage）

## 三、配置文件设计

### 3.1 hooks.json 结构

```json
{
  "$schema": "./hooks.schema.json",
  "hooks": [
    {
      "event": "PreToolUse",
      "toolNames": ["edit_file", "rewrite_file"],
      "pathPattern": "**/*.{ts,tsx,js,jsx}",
      "command": "npx prettier --check $VOID_FILE_PATH",
      "priority": 100,
      "timeoutMs": 5000,
      "description": "Verify code formatting before edit"
    },
    {
      "event": "PostToolUse",
      "toolNames": ["edit_file", "rewrite_file"],
      "pathPattern": "**/*.ts",
      "command": "npx eslint --format json $VOID_FILE_PATH",
      "priority": 50,
      "description": "Run lint after edit and append to tool result"
    },
    {
      "event": "PreToolUse",
      "toolNames": ["run_command"],
      "command": "node .void/deny-danger.js",
      "priority": 200,
      "description": "Block dangerous commands like rm -rf /"
    }
  ]
}
```

### 3.2 示例钩子脚本（.void/deny-danger.js）

```javascript
// 读取 stdin JSON，检查命令黑名单
const input = JSON.parse(require('fs').readFileSync(0, 'utf-8'))
const cmd = input.params.command || ''
const blacklist = [/rm\s+-rf\s+\//, /mkfs/, /:\(\)\{.*:\|:&/]

if (blacklist.some(re => re.test(cmd))) {
  console.log(JSON.stringify({
    decision: 'deny',
    message: `Blocked dangerous command: ${cmd}`
  }))
  process.exit(0)
}
console.log(JSON.stringify({ decision: 'allow' }))
```

## 四、HookService 接口设计

```typescript
// hookTypes.ts
export type HookEvent =
  | 'PreToolUse'
  | 'PostToolUse'
  | 'ToolUseError'
  | 'SessionStart'
  | 'UserPromptSubmit'

export interface HookConfig {
  event: HookEvent
  toolNames?: string[]
  pathPattern?: string
  command?: string           // 命令钩子
  jsHookId?: string          // JS 钩子引用（内置）
  priority?: number          // 默认 0
  timeoutMs?: number         // 默认 10000
  description?: string
}

export interface HookPayload {
  event: HookEvent
  toolName?: string
  params?: any
  result?: any
  error?: string
  threadId: string
  workspaceRoot: string
  message?: string
}

export interface HookResult {
  decision: 'allow' | 'deny' | 'modify'
  modifiedParams?: any
  modifiedResult?: any
  message?: string
}

export interface IHookService {
  readonly _serviceBrand: undefined
  trigger(event: HookEvent, payload: HookPayload): Promise<HookResult[]>
  registerBuiltinHook(event: HookEvent, hook: (p: HookPayload) => Promise<HookResult>): IDisposable
  reloadConfig(): Promise<void>
}
```

## 五、ChatThreadService 集成

```typescript
// 伪代码
private async _runToolCall(toolName: string, rawParams: any) {
  const payload: HookPayload = {
    event: 'PreToolUse',
    toolName,
    params: rawParams,
    threadId: this.state.currentThreadId,
    workspaceRoot: this._getWorkspaceRoot(),
  }

  // PreToolUse
  const preResults = await this._hookService.trigger('PreToolUse', payload)
  const denied = preResults.find(r => r.decision === 'deny')
  if (denied) {
    return { error: `Blocked by hook: ${denied.message}` }
  }

  // 应用 modifiedParams（最后一个 modify 生效）
  const modifyResult = preResults.reverse().find(r => r.decision === 'modify')
  const finalParams = modifyResult?.modifiedParams ?? rawParams

  // 现有流程
  const validatedParams = this._toolsService.validateParams(toolName, finalParams)
  await this._checkApproval(toolName, validatedParams)
  let result
  try {
    result = await this._toolsService.callTool(toolName, validatedParams)
  } catch (err) {
    await this._hookService.trigger('ToolUseError', { ...payload, error: String(err) })
    throw err
  }

  // PostToolUse
  const postResults = await this._hookService.trigger('PostToolUse', {
    ...payload,
    event: 'PostToolUse',
    result,
  })
  // 拼接 PostToolUse 的 message 到工具结果字符串
  const extraMessages = postResults
    .map(r => r.message)
    .filter(Boolean)
    .join('\n')

  return { result, extraMessages }
}
```

## 六、性能考虑

- 无钩子配置时 `trigger()` 直接返回空数组，零开销
- 命令钩子进程启动约 50-200ms（Node.js），建议用户合并钩子
- JS 钩子延迟 <5ms
- PreToolUse 为串行（保证 modifiedParams 链），PostToolUse 可并发

## 七、验证策略

- **命令钩子验证**：配置 `echo '{"decision":"allow"}'` 钩子，验证 Agent 继续执行
- **拒绝验证**：配置返回 `{"decision":"deny"}` 的钩子，验证工具被中止
- **变换验证**：配置返回 `{"decision":"modify","modifiedParams":{...}}` 的钩子，验证工具收到修改后的参数
- **超时验证**：配置超长 sleep 命令，验证 10 秒后视为 deny
- **路径匹配验证**：`pathPattern: **/*.ts` 仅对 TS 文件触发
- **合并验证**：工作区和用户级配置都存在时，按 priority 合并

## 八、风险与回滚

- **安全风险**：命令钩子执行外部命令，需文档中明确警告
- **性能风险**：钩子串行执行，配置过多会拖慢工具调用，需文档建议合并
- **配置错误**：JSON 格式错误时跳过整个配置文件并通知用户，不影响 Agent
- **回滚**：删除 `.void/hooks.json` 即禁用所有钩子；完全回滚需恢复 `chatThreadService.ts` 和删除 `hookService.ts`
