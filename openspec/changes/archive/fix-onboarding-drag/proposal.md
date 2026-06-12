# 修复：Onboarding 页面标题栏无法拖动窗口（fix-onboarding-drag）

## 背景

在 Void 编辑器的欢迎/Onboarding 页面（"欢迎使用聚合AI智能编码"）期间，标题栏顶部最小化/最大化那一行几乎无法拖动窗口，只有靠近右侧的一小部分区域支持拖动。进入编辑器主界面后拖动恢复正常。此问题导致用户在 Onboarding 阶段无法通过拖动标题栏移动窗口，严重影响首次使用体验。

## 方案

- **删除自定义 IPC 拖动覆盖层**：`voidOnboardingService.ts` 中 `_createDragOverlay()` 创建的全屏 `pointer-events:auto` div 通过 IPC `vscode:startWindowDrag/stopWindowDrag` 实现自定义拖动，该覆盖层吞掉了 Chromium 原生 `-webkit-app-region: drag` 的 mousedown 事件，导致原生拖动仅在覆盖层未覆盖的右侧小区域生效
- **删除主进程 IPC handlers**：`app.ts` 中 `vscode:startWindowDrag`、`vscode:stopWindowDrag`、`vscode:toggleMaximizeWindow` 监听器及 `setInterval` 轮询拖动逻辑
- **Onboarding 进行中：overlay 从 top:30px 开始，不覆盖标题栏**：`VoidOnboarding.tsx` 中全屏 overlay 改为 `top:30px; height:calc(100vh - 30px)`，标题栏区域（约 30px 高）完全不被覆盖，Chromium 原生 `-webkit-app-region:drag` 可达。Chromium 的 app-region hit-test 不受 `pointer-events` 影响，`pointer-events:none` 仅影响 JS 事件分发，不能让底层 drag 区域被 hit-test 命中，唯一可靠方案是不覆盖标题栏
- **Onboarding 完成后 React return null**：`VoidOnboarding.tsx` 中 onboarding 完成后直接 `return null`，从 DOM 彻底移除 overlay

## 能力

### New Capabilities

（无新增能力）

### Modified Capabilities

（无既有能力的需求变更——此为 bug 修复，恢复 Chromium 原生拖动行为）

## 影响

- **受影响文件**：
  - `src/vs/workbench/contrib/void/browser/voidOnboardingService.ts`（删除 `_createDragOverlay` 方法及调用）
  - `src/vs/code/electron-main/app.ts`（删除 3 个 IPC handlers + setInterval 拖动逻辑）
  - `src/vs/workbench/contrib/void/browser/react/src/void-onboarding/VoidOnboarding.tsx`（overlay top:30px 不覆盖标题栏 + onboarding 完成后 return null）
- **受影响功能**：窗口拖动、双击最大化/还原、窗口控制按钮
- **无破坏性变更**：恢复 Chromium 原生拖动，与 VSCode/Electron 标准行为一致

## Non-goals / 非目标

- 不修改 VSCode 原生标题栏的 `-webkit-app-region` CSS 定义
- 不修改 onboarding 的 UI 布局或交互流程
- 不引入新的自定义拖动实现
- 不修改 menubar 区域的 `no-drag` 行为（这是 VSCode 原生设计）
