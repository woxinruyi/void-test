# 新增：后台/异步 Agent（add-background-agents）

## 背景

YWCode 当前的 Agent 是**前台同步**的：用户发起对话后需等待 Agent 跑完，期间难以并行做别的事。`subagentService` 的 `dispatch_agents` 仅支持**只读探索**子任务（grep / read_file / semantic_search / list_symbols，≤10 并行），不能自治地编辑代码或跑命令。

对标主流：Cursor 的 background agents 可让长任务（大重构、批量修复、跑测试并修复）在后台运行，用户继续编辑当前文件；完成后回传结果。这是 2026 前沿 AI 编程工具的标志能力之一。

## 目标

- 引入后台 Agent：用户派发一个任务后，Agent 在独立上下文异步运行，不阻塞主对话。
- 后台 Agent 具备完整工具能力（编辑/终端），在**隔离工作区**（git worktree）中执行以避免与前台冲突。
- 提供进度回传与完成通知；用户可查看、采纳或丢弃其产出。

## 非目标（首版）

- 不做云端/远程执行；仅本地后台运行。
- 不做多后台 Agent 之间的复杂编排；首版单后台任务队列即可。
- 不替换现有前台 Agent 与 `dispatch_agents` 只读子任务。

## 方案概述

复用 `chatThreadService` 的 Agent 循环作为后台执行器，在隔离工作区（git worktree）中运行，状态独立于前台 thread。新增轻量任务队列与进度事件，UI 侧增加"后台任务"面板。产出以 diff/检查点形式呈现，用户一键采纳或丢弃。

## 影响范围

- 新增 `browser/backgroundAgentService.ts`（队列 + 生命周期）。
- 复用 `chatThreadService`、`turnCheckpointService`、`editCodeService`。
- 需要 worktree 隔离能力（main 进程 git 操作，复用 `voidSCMMainService`）。
- React UI 新增后台任务面板。

## 验收标准

1. 用户可派发一个后台任务并继续在前台编辑，主对话不被阻塞。
2. 后台 Agent 在隔离工作区执行，完成后通过通知告知，且不污染用户当前工作区。
3. 用户可查看后台产出（diff/检查点）并一键采纳或丢弃。
4. `npx tsc -p src/tsconfig.json --noEmit` 输出 0 errors。
