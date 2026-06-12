# 任务：后台/异步 Agent

## Phase 1 — worktree 隔离与服务骨架

- [ ] 扩展 `voidSCMMainService`（main）：创建/删除 git worktree 的 IPC 能力
- [ ] 新增 `browser/backgroundAgentService.ts`：任务队列 + 生命周期状态机
- [ ] 在 `void.contribution.ts` 注册新服务（`registerSingleton` + import）
- [ ] 启动期清理孤儿 worktree
- [ ] **编译验证：`npx tsc -p src/tsconfig.json --noEmit` 0 errors**

## Phase 2 — 后台执行内核

- [ ] 复用 chatThreadService 在独立 thread 中跑 agent 循环，编辑作用于 worktree
- [ ] 派发后主对话不阻塞（异步运行验证）
- [ ] 进度事件回传 + 完成通知
- [ ] 限制同时运行的后台任务数（首版 1-2）
- [ ] **编译验证：`npx tsc -p src/tsconfig.json --noEmit` 0 errors**

## Phase 3 — 产出呈现与采纳

- [ ] React 后台任务面板：列表、状态、查看 diff
- [ ] 采纳（合并/应用产出回主工作区）/ 丢弃（删除 worktree）
- [ ] 采纳时若主工作区已变更，走冲突提示
- [ ] 功能开关 gating（默认关闭，作为实验特性）
- [ ] **编译验证：`npx tsc -p src/tsconfig.json --noEmit` 0 errors**
