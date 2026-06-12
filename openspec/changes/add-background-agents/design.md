# 设计：后台/异步 Agent

## 背景

前台 Agent 同步阻塞；`dispatch_agents` 子任务只读。需要一个能在后台自治编辑/跑命令、且与前台工作区隔离的执行器。本设计为**探索性首版**，刻意收窄范围。

## 方案

### 与现有模块的关系

- **复用** `chatThreadService` 的 Agent 循环作为后台执行内核（以独立 thread 状态运行）。
- **复用** `turnCheckpointService`（产出以检查点/快照呈现）、`editCodeService`（应用编辑）。
- **复用** `voidSCMMainService`（main 进程）创建/清理 git worktree 实现工作区隔离。
- **新增** `browser/backgroundAgentService.ts`：任务队列、生命周期、进度事件。

### 隔离策略

每个后台任务在独立 git worktree 中运行（参考仓库已有 worktree 概念），编辑与命令作用于该副本，**不触碰用户当前工作区**。完成后以 diff 呈现，用户采纳时再合并回主工作区。

### 生命周期

```
派发(task) → 创建 worktree → 后台 thread 跑 agent 循环
  → 进度事件回传 UI（状态/当前步骤）
  → 完成 → 生成 diff + 通知
  → 用户：采纳(合并/应用) | 丢弃(删除 worktree)
```

### 进程归属

- 队列与编排：renderer（`backgroundAgentService`）。
- worktree 创建/删除：main（`voidSCMMainService` 扩展）。
- LLM 调用：沿用现有 IPC 到 main。

## 数据流

UI 派发 → backgroundAgentService 入队 → 请求 main 建 worktree → 独立 thread 驱动 agent 循环（编辑作用于 worktree）→ 进度/完成事件 → UI 面板 → 用户采纳 → editCodeService/SCM 合并。

## 边界情况

- **worktree 不可用**（非 git 仓库）：降级为只读后台分析，或提示不支持后台编辑。
- **前台与后台改同一文件**：因 worktree 隔离不直接冲突；采纳时若主工作区已变更，走 diff 冲突提示。
- **后台任务失败/超时**：保留 worktree 与日志供排查；提供取消。
- **资源占用**：限制同时运行的后台任务数（首版 1-2 个）。

## 回滚策略

- 功能以开关 gating；关闭即隐藏入口、不创建后台任务。
- 新增服务为独立模块，`git revert` 可整体移除；不改动前台 Agent 路径。

## 风险

| 风险 | 等级 | 缓解 |
|------|:--:|------|
| worktree 生命周期管理复杂（残留/清理） | 高 | 明确 teardown；启动时清理孤儿 worktree |
| 后台自治编辑的安全边界 | 中 | 沿用审批策略；隔离工作区降低误伤 |
| 范围蔓延（编排/云端） | 中 | 首版严格限定单机、单/少任务、不做编排 |
| 与现有 dispatch_agents 概念混淆 | 低 | 文档明确：只读子任务 vs 自治后台任务 |
