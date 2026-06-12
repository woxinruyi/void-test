# 任务清单：fix-titlebar-drag-reliability

## 1. 阶段 A — 审计

- [ ] 1.1 确认 `titlebarpart.css` 的 `.titlebar-drag-region` 选择器仍具备 `-webkit-app-region: drag`（基线未被 Void 改动）
- [ ] 1.2 搜索并列出所有 `vscode:toggleMaximizeWindow` 调用处；决定是否连带删除（若仅 voidOnboardingService 使用）
- [ ] 1.3 搜索并确认 `mainWindow.addEventListener('mouseup', ...)` 仅在 `_createDragOverlay` 内被使用（避免误删影响其他特性）

## 2. 阶段 B — 渲染进程清理

- [ ] 2.1 从 `voidOnboardingService.ts` 删除 `_createDragOverlay` 方法
- [ ] 2.2 删除 `this._createDragOverlay(onboardingContainer)` 调用
- [ ] 2.3 删除未使用的 `mainWindow` / `h` / 其他相关 import（如成孤立）
- [ ] 2.4 `VoidOnboarding.tsx` 顶部注释 "Drag region is now handled by voidOnboardingService.ts via Electron IPC" 清理为"拖动交由 Chromium 原生 `-webkit-app-region: drag` 处理"

## 3. 阶段 C — 主进程清理

- [ ] 3.1 删除 `app.ts` 的 `vscode:startWindowDrag` 监听器与 `dragInterval` / `stopDrag` 闭包
- [ ] 3.2 删除 `vscode:stopWindowDrag` 监听器
- [ ] 3.3 视 1.2 审计结果，决定是否删除 `vscode:toggleMaximizeWindow`
- [ ] 3.4 清理 `screen.getCursorScreenPoint` 若成为未使用 import

## 4. 阶段 D — Onboarding 容器 DOM 护栏

- [ ] 4.1 审查 `onboardingContainer` 在 `isOnboardingComplete=true` 后是否仍留在 DOM。保持挂载不影响原生拖动（因为 `pointer-events:none`），但需确保 React 子节点内无 `pointer-events:auto` 元素遮住顶部 35-80 px
- [ ] 4.2 若发现遮挡：给 `.void-onboarding-container` 增加 `display:none`（或 unmount）当 `isOnboardingComplete=true` 的条件（本步仅在 4.1 验证后实施）

## 5. 阶段 E — 验收

- [ ] 5.1 watch-client 增量编译 0 errors
- [ ] 5.2 mocha 现有 65 passing 不回归
- [ ] 5.3 启动新 Void Dev（清 `.tmp/user-data-dev`），执行 T1~T6 用例：
  - [ ] T1 全区可拖（最左 / 中央 / 最右-150px 均拖得动）
  - [ ] T2 鼠标出窗外松开后窗口停止跟随（无粘滞）
  - [ ] T3 标题栏空白处双击切换最大化 / 还原
  - [ ] T4 最小/最大/关闭按钮单击生效，不被拖动吞
  - [ ] T5 Onboarding 首启覆盖全屏（期间不拖动是预期）
  - [ ] T6 Onboarding 完成进入主界面后拖动立即恢复
- [ ] 5.4 `openspec validate fix-titlebar-drag-reliability` 通过

## 6. 归档

- [ ] 6.1 将本 change 归档到 `openspec/changes/archive/` 并在 `openspec/specs/titlebar-drag/` 落盘能力 spec
