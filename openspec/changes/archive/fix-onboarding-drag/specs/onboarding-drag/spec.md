# Onboarding 页面窗口拖动能力（onboarding-drag）

## ADDED Requirements

### Requirement: Onboarding 完成后 overlay 必须从 DOM 彻底移除
`VoidOnboarding` React 组件在 `isOnboardingComplete=true` 时 SHALL 返回 `null`，使 onboarding overlay 及其所有子元素从 DOM 中彻底移除，不再参与 Chromium app-region hit-test。

#### Scenario: Onboarding 完成后标题栏可拖动
- **WHEN** 用户完成 onboarding（`isOnboardingComplete=true`）
- **THEN** `VoidOnboarding` 组件返回 `null`，onboarding overlay 从 DOM 移除，标题栏 `.titlebar-drag-region` 的 `appRegion:drag` 可被 Chromium hit-test 命中，窗口可拖动

#### Scenario: Onboarding 完成后 elementsFromPoint 命中 drag 区域
- **WHEN** onboarding 完成后调用 `document.elementsFromPoint(200, 15)`
- **THEN** 返回的元素列表中 `.titlebar-drag-region` 出现在顶层，其 `appRegion` 为 `drag`

### Requirement: 不使用自定义 IPC 拖动覆盖层
`voidOnboardingService.ts` 的 `OnboardingContribution` SHALL NOT 创建自定义拖动覆盖层 div，SHALL NOT 通过 IPC `vscode:startWindowDrag/stopWindowDrag` 与主进程交互实现窗口拖动。

#### Scenario: Onboarding 容器无拖动覆盖层子元素
- **WHEN** `OnboardingContribution.initialize()` 执行后
- **THEN** `.void-onboarding-container` 容器内不存在 `_createDragOverlay` 创建的 div

### Requirement: 主进程不监听自定义窗口拖动 IPC
`app.ts` 的 Electron 主进程 SHALL NOT 监听 `vscode:startWindowDrag`、`vscode:stopWindowDrag`、`vscode:toggleMaximizeWindow` IPC 事件，SHALL NOT 使用 `setInterval` 轮询实现窗口位置更新。

#### Scenario: 主进程无拖动相关 IPC handler
- **WHEN** Void 启动后
- **THEN** 主进程中不存在 `vscode:startWindowDrag`、`vscode:stopWindowDrag`、`vscode:toggleMaximizeWindow` 的 IPC 监听器

### Requirement: Onboarding 进行中 overlay 不覆盖标题栏区域
`VoidOnboarding.tsx` 的内层 overlay div SHALL 从 `top:30px` 开始定位，高度为 `calc(100vh - 30px)`，不覆盖标题栏区域（约 30px 高）。Chromium 的 `-webkit-app-region` hit-test 不受 `pointer-events` 影响，`pointer-events:none` 仅影响 JS 事件分发，不能让底层 drag 区域被 hit-test 命中，唯一可靠方案是不覆盖标题栏。

#### Scenario: Onboarding 进行中标题栏可拖动
- **WHEN** onboarding 进行中（`isOnboardingComplete=false`），overlay 渲染在页面上
- **THEN** overlay 的 `top` 样式为 `30px`，标题栏区域（y=0~30）不被覆盖，`.titlebar-drag-region` 的 `appRegion:drag` 可被 Chromium hit-test 命中

#### Scenario: elementsFromPoint 在标题栏区域命中 drag 区域
- **WHEN** onboarding 进行中，调用 `document.elementsFromPoint(200, 15)`
- **THEN** 返回的元素列表中不包含 onboarding overlay 元素，`.titlebar-drag-region` 出现在列表中

### Requirement: Onboarding 容器不阻断原生拖动
`.void-onboarding-container` SHALL 设置 `pointer-events:none`，使其不参与 Chromium 的 hit-test，不阻断底层 `.titlebar-drag-region` 的原生拖动。

#### Scenario: Onboarding 容器 pointer-events 为 none
- **WHEN** `OnboardingContribution.initialize()` 创建 onboarding 容器后
- **THEN** 容器的 `pointerEvents` 计算样式为 `none`
