## 1. 删除自定义 IPC 拖动覆盖层

- [x] 1.1 删除 `voidOnboardingService.ts` 中 `_createDragOverlay` 方法及其在 `initialize()` 中的调用
- [x] 1.2 删除 `app.ts` 中 `vscode:startWindowDrag`、`vscode:stopWindowDrag`、`vscode:toggleMaximizeWindow` IPC 监听器及 `setInterval` 轮询逻辑
- [x] 1.3 删除 `app.ts` 中不再需要的 `import`（如 `screen` 等）

## 2. 修复 Onboarding React overlay 阻断拖动

- [x] 2.1 修改 `VoidOnboarding.tsx`：overlay 从 `top:30px` 开始，不覆盖标题栏区域（`height:calc(100vh - 30px)`）
- [x] 2.2 修改 `VoidOnboarding.tsx`：`isOnboardingComplete=true` 时 `return null`，从 DOM 彻底移除 overlay

## 3. 构建与验证

- [x] 3.1 构建 React bundle 并复制到 `out/` 目录
- [x] 3.2 CDP 验证：`elementsFromPoint` 确认 y=0~30 命中 `.titlebar-drag-region`（`appRegion:drag`），overlay 从 y=30 开始
- [x] 3.3 用户实测：onboarding 页面标题栏可拖动窗口
