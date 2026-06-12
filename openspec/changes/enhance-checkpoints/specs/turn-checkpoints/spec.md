# Turn 级检查点规格（turn-checkpoints）

## 能力描述

Void 编辑器为 Agent 模式下每次用户消息触发的活动（Turn）自动创建磁盘级检查点，记录该 Turn 中所有文件的创建/编辑/删除操作，并允许用户通过对话界面一键回滚到任意历史 Turn 之前的状态。

## 场景

### 场景 1：单 Turn 内的 edit 自动记录

- 前置条件：Agent 模式，用户发送消息"重命名 foo 函数为 bar"
- `beginTurn` 创建新 Turn 目录
- LLM 调用 `edit_file` 修改 `src/foo.ts`
- `recordEdit` 写入 beforeContent 的 snapshot 文件
- Turn 完成后 manifest.json 包含 1 个 edit fileOp

### 场景 2：一次性回滚整个 Turn

- 前置条件：Turn 中执行了 edit + create + delete
- 用户点击该 Turn 的 Revert 按钮
- `revertTo(turnId)` 逆序恢复：
  - 删除 Turn 内创建的文件
  - 恢复 Turn 内删除的文件（从 snapshot）
  - 恢复 Turn 内编辑的文件到 beforeContent
- `RevertResult` 返回 filesRestored / filesDeleted 计数

### 场景 3：跨 Turn 回滚

- 前置条件：线程中有 5 个 Turn，用户点击 Turn 2 的 Revert
- 系统收集 Turn 2, 3, 4, 5 的 fileOps
- 按 Turn 5 → 4 → 3 → 2 逆序回滚
- 所有被波及的 Turn 在回滚成功后被删除（检查点清理）
- 对话历史中 Turn 2+ 的消息被标记为"已回滚"

### 场景 4：不可回滚命令告警

- 前置条件：Turn 中执行了 `run_command: npm install`
- 用户点击 Revert
- 确认对话框显示：
  - "以下命令无法自动回滚：npm install"
  - 用户确认后仍执行文件回滚
- `RevertResult.unrevertableCommands` 包含 `['npm install']`

### 场景 5：外部修改冲突

- 前置条件：Turn N 编辑了 `foo.ts`，用户之后在编辑器中手动又改了 `foo.ts`
- 用户点击 Revert 到 Turn N
- 系统检测文件当前哈希 ≠ Turn N 写入后的哈希
- 弹出冲突对话框：
  - "foo.ts 自 Turn N 以来被外部修改，回滚将丢失您的手动更改，是否继续？"
- 用户可选择继续或取消

### 场景 6：Snapshot 内容去重

- 前置条件：Turn 1 和 Turn 3 都修改了 `foo.ts`，且 Turn 1 的 beforeContent 与 Turn 3 的 afterContent 相同
- Turn 3 的 beforeHash 被复用，不重复写入 snapshot 文件
- 磁盘占用减少

### 场景 7：LRU 清理

- 前置条件：线程中已有 30 个 Turn，用户新增 Turn
- `gcOldTurns(threadId, 30)` 触发
- 删除最旧的 Turn 目录
- 所有未被引用的 snapshot 文件被 GC 清理

### 场景 8：命名检查点

- 前置条件：用户执行命令 `Void: Create Named Checkpoint`
- 输入名称 "修复登录 bug 之前"
- 系统记录当前所有跟踪文件的快照到特殊 Turn
- 该命名检查点可在 Revert 列表中选择

### 场景 9：重启后 Turn 历史保留

- 前置条件：用户关闭 Void 重启
- 打开相同工作区和线程
- 对话中所有 Turn 的 Revert 按钮仍可用
- 点击 Revert 正常恢复

### 场景 10：Turn 失败中止

- 前置条件：Turn 执行中用户打断（Stop 按钮）或发生错误
- `abortTurn(turnId)` 清理未提交的 Turn 目录
- 磁盘无残留

### 场景 11：快照写入失败降级

- 前置条件：磁盘写满，snapshot 写入失败
- 系统日志警告，但不中断 Agent
- 该 fileOp 在 manifest 中标记为 `snapshotFailed: true`
- Revert 到该 Turn 时该文件跳过并在 `RevertResult.conflicts` 中列出
