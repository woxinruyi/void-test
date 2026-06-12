# 设计说明（enhance-checkpoints）

## 一、方案总览

```
┌──────────────────────────────────────────────────────────────┐
│                   Turn 级检查点机制                            │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  用户发送消息                                                  │
│       ↓                                                      │
│  ChatThreadService.addUserMessage()                          │
│       ├─ turnId = 生成 UUID                                  │
│       └─ TurnCheckpointService.beginTurn(threadId, turnId,   │
│             userMessage.firstLine)                           │
│                ↓                                             │
│          创建 .void/checkpoints/<threadId>/<turnId>/          │
│                                                              │
│  Agent Loop：工具调用                                         │
│       ↓                                                      │
│  _runToolCall() 前置：                                        │
│       ├─ edit_file/rewrite_file：快照原文件                   │
│       ├─ create_file_or_folder：记录"创建"意图                │
│       └─ delete_file_or_folder：快照被删除内容                │
│                ↓                                             │
│          追加到 manifest.json 的 fileOps 列表                 │
│                                                              │
│  Turn 结束（无更多工具调用或用户打断）                        │
│       ↓                                                      │
│  TurnCheckpointService.commitTurn(turnId)                    │
│       └─ manifest.json 标记 status=committed                 │
│                                                              │
│  用户点击消息旁 ↶ Revert                                     │
│       ↓                                                      │
│  TurnCheckpointService.revertTo(turnId)                      │
│       ├─ 对该 Turn 及之后所有 Turn 的 fileOps 逆序恢复        │
│       │    ├─ edit → 写回原快照                              │
│       │    ├─ create → 删除创建的文件                        │
│       │    └─ delete → 从快照恢复                            │
│       └─ 清理被回滚的 Turn 检查点                             │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## 二、关键决策

### 决策 1：Turn 为检查点粒度

一个"Turn"定义为：一次用户消息触发的所有 Agent 活动（多个工具调用）。选择 Turn 而非单工具为粒度的原因：

- 用户心智模型是"我刚才让 AI 做的这件事"，不是"第 3 个工具调用"
- Turn 级回滚符合 Cursor/Windsurf 的用户体验
- 单工具级回滚已由 Diff Zone Apply/Reject 覆盖（更细粒度）

### 决策 2：快照存储去重

同一文件内容在多个 Turn 中可能被重复快照。使用内容哈希作为存储文件名（`files/<sha256>.snapshot`），manifest 只存引用，节省磁盘。

### 决策 3：不快照终端副作用

`run_command` 工具不创建文件快照，但**记录命令到 manifest.json**（用于 Revert 时通知用户"这个 Turn 执行了命令 X，无法自动回滚，请手动处理"）。

### 决策 4：跨 Turn 逆序回滚

回滚到 Turn N 时，需逆序回滚 Turn N, N+1, N+2, ...（最新的先回滚）：

- 最新 Turn 的 edit → 先恢复
- 上一个 Turn 的 create → 删除
- 上一个 Turn 的 edit → 恢复更早的快照

这保证回滚是原子的：要么全回到 Turn N 的前态，要么失败报错。

### 决策 5：检查点清理策略

- 每个线程最多保留 30 个 Turn 检查点（LRU）
- 超过时自动删除最旧的 Turn 目录（及其 files/）
- 被其他 Turn 引用的 snapshot 文件需要引用计数（简化方案：每 5 个 Turn 做一次 GC，扫描所有 manifest 找出未引用的 snapshot 删除）
- 清理由后台定时任务执行，不阻塞 Agent

### 决策 6：外部编辑检测

若用户在 Turn 过程中手动编辑了文件，Revert 回 Turn N 可能覆盖用户手动编辑。对策：
- 回滚前读取当前文件哈希，与 Turn 中记录的"前态"或"最新 Turn 写入态"比较
- 不一致时显示确认对话框："文件 X 自 Turn Y 以来被外部修改，回滚会丢失您的手动更改，是否继续？"

## 三、数据结构设计

### 3.1 manifest.json

```json
{
  "turnId": "abc123",
  "threadId": "thread-xyz",
  "name": "添加用户登录接口",
  "createdAt": "2026-04-19T10:00:00Z",
  "committedAt": "2026-04-19T10:03:45Z",
  "status": "committed",
  "userMessage": "给 /api/login 增加邮箱密码登录",
  "fileOps": [
    {
      "kind": "edit",
      "uri": "file:///i:/proj/src/api/login.ts",
      "beforeHash": "a9f3...",
      "afterHash": "b2c1..."
    },
    {
      "kind": "create",
      "uri": "file:///i:/proj/src/api/auth.ts",
      "afterHash": "d4e5..."
    },
    {
      "kind": "delete",
      "uri": "file:///i:/proj/src/legacy.ts",
      "beforeHash": "f6g7..."
    },
    {
      "kind": "command",
      "command": "npm install bcrypt",
      "cwd": "i:/proj",
      "revertable": false
    }
  ]
}
```

### 3.2 存储目录

```
.void/
  checkpoints/
    <threadId>/
      <turnId>/
        manifest.json
        files/
          a9f3....snapshot
          f6g7....snapshot
```

## 四、服务接口设计

```typescript
// turnCheckpointService.ts
export interface ITurnCheckpointService {
  readonly _serviceBrand: undefined

  // Turn 生命周期
  beginTurn(threadId: string, turnId: string, userMessage: string): Promise<void>
  commitTurn(turnId: string): Promise<void>
  abortTurn(turnId: string): Promise<void>

  // 文件操作记录
  recordEdit(turnId: string, uri: URI, beforeContent: string): Promise<void>
  recordCreate(turnId: string, uri: URI): Promise<void>
  recordDelete(turnId: string, uri: URI, beforeContent: string): Promise<void>
  recordCommand(turnId: string, command: string, cwd: string): Promise<void>

  // 回滚
  revertTo(turnId: string): Promise<RevertResult>

  // 查询
  listTurns(threadId: string): Promise<TurnSummary[]>
  getTurn(turnId: string): Promise<TurnManifest | null>

  // 清理
  gcOldTurns(threadId: string, keepLatest?: number): Promise<void>
}

export interface RevertResult {
  revertedTurns: string[]
  filesRestored: number
  filesDeleted: number
  unrevertableCommands: string[]   // 需要用户手动处理的命令列表
  conflicts: { uri: URI, reason: string }[]  // 用户手动修改冲突
}
```

## 五、ChatThreadService 集成

```typescript
// 伪代码
async addUserMessage(text: string) {
  const turnId = generateUuid()
  this._currentTurnId = turnId
  await this._turnCheckpointService.beginTurn(
    this.state.currentThreadId, turnId, text
  )
  // ... 现有逻辑 ...
}

private async _runToolCall(toolName: string, params: any) {
  // 记录前态
  switch (toolName) {
    case 'edit_file':
    case 'rewrite_file': {
      const content = await this._readFile(params.uri)
      await this._turnCheckpointService.recordEdit(
        this._currentTurnId, params.uri, content
      )
      break
    }
    case 'create_file_or_folder':
      await this._turnCheckpointService.recordCreate(this._currentTurnId, params.uri)
      break
    case 'delete_file_or_folder': {
      const content = await this._readFile(params.uri).catch(() => '')
      await this._turnCheckpointService.recordDelete(
        this._currentTurnId, params.uri, content
      )
      break
    }
    case 'run_command':
    case 'run_persistent_command':
      await this._turnCheckpointService.recordCommand(
        this._currentTurnId, params.command, params.cwd ?? ''
      )
      break
  }

  // 现有工具调用流程
  return this._toolsService.callTool(toolName, params)
}

private async _completeTurn() {
  if (this._currentTurnId) {
    await this._turnCheckpointService.commitTurn(this._currentTurnId)
    // 启动后台 GC
    this._turnCheckpointService.gcOldTurns(this.state.currentThreadId, 30)
  }
  this._currentTurnId = null
}
```

## 六、UI 集成

### 6.1 对话气泡中的 Revert 按钮

在 `ChatMessages.tsx`（或对应用户消息组件）中，每条用户消息悬停时显示 Revert 按钮：

```
┌──────────────────────────────────────────┐
│  用户：给 /api/login 增加邮箱密码登录     │  [↶ 回滚到此处]
│  [2026-04-19 10:00]                      │
└──────────────────────────────────────────┘
   AI：好的，我将...
   [Tool: edit_file]  [Tool: create_file]
```

### 6.2 Revert 确认对话框

点击 Revert 后弹出确认：

```
回滚到 "添加用户登录接口" 之前？
将撤销 3 个 Turn 的更改：
  ✓ 恢复 src/api/login.ts 的 3 个历史版本
  ✓ 删除 src/api/auth.ts（Turn 新增）
  ⚠️ 以下命令无法自动回滚，请手动处理：
    - npm install bcrypt
```

### 6.3 手动命名检查点

通过 Command Palette：`Void: Create Named Checkpoint...`
输入名称后记录当前工作区状态，可随后 Revert。

## 七、与现有 EditCodeService 的关系

`EditCodeService` 已有自己的 Diff Zone checkpoint（用于 Apply/Reject）。关系如下：

| 场景 | 机制 | 粒度 | 持久化 |
|------|------|------|--------|
| Diff Zone Apply/Reject | EditCodeService checkpoint | 单次 edit_file 调用 | 内存 |
| Turn Revert | TurnCheckpointService | 整个 Turn 的所有文件操作 | 磁盘 |

两者互补：Diff Zone 是"还没 Apply 前预览并选择接受/拒绝"，Turn Checkpoint 是"已经 Apply 之后回到某个历史状态"。

## 八、性能与可靠性

- 快照写入异步，不阻塞工具调用（失败时降级为"跳过快照"但不中断 Agent，日志告警）
- GC 后台执行，每次最多清理 5 个 Turn
- 大文件（>5MB）快照发出警告，用户可在设置中配置阈值
- 重启后自动加载最近线程的 Turn 列表

## 九、验证策略

- **基础回滚**：编辑文件后 Revert，验证文件恢复
- **跨工具回滚**：Turn 中包含 edit + create + delete，Revert 后全部恢复
- **跨 Turn 回滚**：回滚到 3 个 Turn 前，验证中间 Turn 也被撤销
- **命令不可回滚告警**：Turn 中包含 `run_command`，Revert 时显示警告
- **外部修改冲突**：用户手动改文件后 Revert，显示确认对话框
- **GC 验证**：超过 30 个 Turn 后旧 Turn 被清理

## 十、风险与回滚

- **磁盘占用**：频繁编辑大文件可能占用数百 MB，通过 LRU + GC 控制
- **一致性**：回滚过程中崩溃可能留下半完成状态，通过 `status` 字段和事务性设计缓解
- **外部副作用**：`run_command` 不可回滚，已明确告警
- **回滚方案本身回滚**：删除 `TurnCheckpointService` 调用点 + 移除 `.void/checkpoints/` 即完全回滚
