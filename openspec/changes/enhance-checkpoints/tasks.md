# 任务清单（enhance-checkpoints）

## 1. 服务骨架

- [ ] 1.1 新建 `turnCheckpointService.ts`，定义 `ITurnCheckpointService` / `TurnManifest` / `FileOp` / `RevertResult` 类型
- [ ] 1.2 实现 `TurnCheckpointService` 类，注册为 Singleton
- [ ] 1.3 实现存储目录初始化 `.void/checkpoints/<threadId>/<turnId>/`，自动写入 `.gitignore`

## 2. Turn 生命周期

- [ ] 2.1 实现 `beginTurn(threadId, turnId, userMessage)`：创建目录 + 初始化 manifest.json
- [ ] 2.2 实现 `commitTurn(turnId)`：manifest.status = committed
- [ ] 2.3 实现 `abortTurn(turnId)`：删除未提交的 Turn 目录

## 3. 文件操作记录

- [ ] 3.1 实现 `recordEdit(turnId, uri, beforeContent)`：写入 snapshot 文件，追加 fileOp
- [ ] 3.2 实现 `recordCreate(turnId, uri)`：追加 fileOp（无需快照）
- [ ] 3.3 实现 `recordDelete(turnId, uri, beforeContent)`：写入 snapshot + 追加 fileOp
- [ ] 3.4 实现 `recordCommand(turnId, command, cwd)`：追加 command fileOp（revertable=false）
- [ ] 3.5 实现内容哈希去重（sha256，同内容复用 snapshot 文件）

## 4. 回滚逻辑

- [ ] 4.1 实现 `revertTo(turnId)`：收集从 turnId 开始到最新的所有 Turn
- [ ] 4.2 实现逆序应用：edit → 写回 beforeHash；create → 删除文件；delete → 恢复 beforeHash
- [ ] 4.3 实现外部修改冲突检测：回滚前对比文件当前哈希
- [ ] 4.4 实现不可回滚命令汇总（`unrevertableCommands`）
- [ ] 4.5 实现 `RevertResult` 返回给调用方

## 5. 查询与清理

- [ ] 5.1 实现 `listTurns(threadId)` 返回 Turn 摘要列表
- [ ] 5.2 实现 `getTurn(turnId)` 返回完整 manifest
- [ ] 5.3 实现 `gcOldTurns(threadId, keepLatest=30)` LRU 清理
- [ ] 5.4 实现 snapshot GC：扫描所有 manifest 找出未引用的 snapshot 文件并删除

## 6. ChatThreadService 集成

- [ ] 6.1 在 `ChatThreadService` 注入 `ITurnCheckpointService`
- [ ] 6.2 在 `addUserMessage()` 中生成 turnId 并调用 `beginTurn()`
- [ ] 6.3 在 `_runToolCall()` 前为 edit/create/delete/command 分别记录前态
- [ ] 6.4 在 Turn 结束时调用 `commitTurn()` 并触发 `gcOldTurns()`
- [ ] 6.5 在线程切换时保存当前 turnId，恢复对应状态

## 7. UI 集成

- [ ] 7.1 在 Chat Messages 组件中为每条用户消息悬停时显示 Revert 按钮
- [ ] 7.2 实现 Revert 确认对话框（显示将影响的 Turn 数量 + 不可回滚命令）
- [ ] 7.3 注册命令 `void.checkpoint.createNamed`（手动命名检查点）
- [ ] 7.4 注册命令 `void.checkpoint.revertToTurn`
- [ ] 7.5 Revert 执行中显示进度提示，完成后刷新对话列表

## 8. 持久化与恢复

- [ ] 8.1 重启后从磁盘加载 Turn 历史
- [ ] 8.2 旧版本兼容：若存在 EditCodeService 的现有 checkpoint，不迁移但保留共存

## 9. 构建与端到端验证

- [ ] 9.1 TypeScript 编译通过
- [ ] 9.2 验证单 Turn 内 edit + create + delete 全部记录
- [ ] 9.3 验证 Revert 能正确恢复所有文件
- [ ] 9.4 验证跨 3 个 Turn 回滚
- [ ] 9.5 验证外部修改冲突对话框
- [ ] 9.6 验证命令不可回滚告警
- [ ] 9.7 验证 GC 清理超出 30 个的旧 Turn
- [ ] 9.8 验证重启后 Turn 历史仍可用
