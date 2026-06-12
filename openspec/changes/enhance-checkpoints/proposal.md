# 增强：命名检查点与跨工具回滚（enhance-checkpoints）

## 背景

Void 编辑器当前的检查点机制仅在 `edit_file` / `rewrite_file` 工具执行前保存单文件的快照，用于 Diff Zone 的 Apply/Reject。存在以下局限：

- 仅覆盖编辑工具，**不覆盖** `create_file_or_folder` / `delete_file_or_folder` / `run_command`
- 检查点**无命名**，用户难以识别"这是哪一轮 Agent 操作的"
- 无法一键回滚到某次对话的某个步骤（跨多文件、多工具）
- 无跨会话持久化（重启后丢失）

对比主流方案：
- **Cursor**：每次 Apply 前自动快照，可一键 Revert 到任意历史点
- **Windsurf**：Named Checkpoints + 悬停对话消息显示 Revert 按钮，跨所有工具类操作
- **Claude Code**：Session 级 Checkpoint + Undo，支持跨分支恢复

## 目标

- 将检查点机制从单工具扩展到**整个 Agent Turn**（一次用户消息触发的所有工具调用）
- 每个 Turn 自动创建一个命名检查点，以用户消息首行为默认名
- 用户可在对话历史中点击任意用户消息旁的"↶"按钮，回滚到该消息发送前的状态
- 支持手动创建命名检查点（`/opsx-checkpoint <name>`）
- 检查点涵盖：文件内容、文件/文件夹存在性
- 不涵盖：终端命令的副作用（不可回滚）

## 非目标（Non-goals）

- 不回滚终端命令的副作用（如删除文件系统外资源、修改数据库等）
- 不跨工作区保存检查点
- 不实现检查点 diff 查看器 UI（沿用 VSCode Timeline 或后续迭代）
- 不替代 Git，不作为版本控制工具（检查点是对话级的短期快照）
- 不支持部分回滚（要么回滚整个 Turn，要么不回滚）

## 方案

1. **TurnCheckpointService**：在 `ChatThreadService` 为每个用户消息创建 Turn 级检查点
2. **变更收集**：在 `_runToolCall()` 前对将被修改/删除/创建的文件记录"前态"
3. **存储结构**：检查点存放在 `.void/checkpoints/<threadId>/<turnId>/`
   - `manifest.json`（元数据 + 文件清单）
   - `files/<hash>.snapshot`（原文件内容快照，hash 去重）
4. **回滚逻辑**：从目标检查点逆序恢复所有快照文件，删除后续创建的文件，恢复后续删除的文件
5. **UI 集成**：在 Chat Thread 每条用户消息旁显示 Revert 按钮（✨ 已有 Reject 按钮位置）
6. **持久化**：检查点跨会话保留，清理策略为每个线程保留最近 30 个 Turn

## 影响

- 新增文件：`turnCheckpointService.ts`
- 修改文件：`chatThreadService.ts`、`editCodeService.ts`（统一接入）、Chat UI 组件（添加 Revert 按钮）
- 新增目录：`.void/checkpoints/`（自动加入 `.gitignore`）
- 磁盘占用：每个 Turn 约几 KB 到几 MB（取决于修改文件数量）
- 风险：大文件快照占用空间，需清理策略
