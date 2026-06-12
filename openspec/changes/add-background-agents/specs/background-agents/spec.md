# 后台 Agent（background-agents）

## ADDED Requirements

### 需求：后台任务异步执行且不阻塞前台

系统 SHALL 允许用户派发后台 Agent 任务，在独立上下文异步运行，不阻塞主对话与前台编辑。

#### Scenario: 派发后继续工作
- **WHEN** 用户派发一个后台任务
- **THEN** 主对话与编辑器保持可用，后台任务在独立 thread 中运行

#### Scenario: 完成通知
- **WHEN** 后台任务运行结束
- **THEN** 系统发出完成通知，并在后台任务面板中可查看其产出

### 需求：后台 Agent 在隔离工作区执行

系统 SHALL 在独立 git worktree 中运行后台 Agent 的编辑与命令，不污染用户当前工作区。

#### Scenario: 工作区隔离
- **WHEN** 后台 Agent 执行 edit/run_command 类工具
- **THEN** 这些操作作用于该任务的独立 worktree，用户当前工作区文件不被直接修改

#### Scenario: 采纳产出
- **WHEN** 用户对完成的后台任务选择"采纳"
- **THEN** 其产出以 diff/检查点形式合并回主工作区；若主工作区已变更则提示冲突

#### Scenario: 丢弃产出
- **WHEN** 用户对后台任务选择"丢弃"
- **THEN** 系统删除该任务的 worktree 与中间产物，主工作区不受影响

### 需求：后台 Agent 为可控实验特性

系统 SHALL 通过开关 gating 后台 Agent，默认关闭。

#### Scenario: 默认关闭
- **WHEN** 用户未启用后台 Agent 开关
- **THEN** 不暴露派发入口，也不创建任何后台任务或 worktree
