# 标题栏拖动可靠性能力（titlebar-drag）

## ADDED Requirements

### Requirement: 采用 Chromium 原生 `-webkit-app-region` 拖动机制

Void 的自定义标题栏 MUST 使用 Chromium 原生 `-webkit-app-region: drag` / `no-drag` 作为窗口拖动的唯一实现；MUST NOT 引入自定义 IPC 轮询（如 `vscode:startWindowDrag` / `setInterval` + `win.setPosition`）来手工驱动窗口位置。

#### Scenario: 不存在自定义拖动 IPC

- **WHEN** 构建 Void 渲染进程与主进程产物
- **THEN** 产物中 MUST NOT 包含 `vscode:startWindowDrag` 或 `vscode:stopWindowDrag` IPC channel 的监听器与发送器；MUST NOT 包含在主进程通过 `screen.getCursorScreenPoint()` 配合 `setInterval` 调用 `BrowserWindow.setPosition` 的拖动轮询代码

#### Scenario: 原生拖动 CSS 存在

- **WHEN** 渲染进程加载 `.monaco-workbench .part.titlebar > .titlebar-container > .titlebar-drag-region`
- **THEN** 该元素 MUST 具备 `-webkit-app-region: drag` 计算样式；其覆盖区域的交互子元素（按钮、菜单、command-center、resizer 等）MUST 具备 `-webkit-app-region: no-drag`

### Requirement: 标题栏全区域可拖动

用户 MUST 能够在标题栏的任意**非交互元素**区域（左 / 中 / 右，仅排除窗口最小化 / 最大化 / 关闭按钮与其他明确标注 `no-drag` 的控件）按住左键拖动窗口。

#### Scenario: 左侧拖动

- **WHEN** 用户在 `.titlebar-left` 内 `.titlebar-drag-region` 覆盖的空白像素按住左键并移动
- **THEN** 窗口 MUST 跟随光标移动

#### Scenario: 中央拖动

- **WHEN** 用户在 `.titlebar-center` 中 command-center 之外的空白像素按住左键并移动
- **THEN** 窗口 MUST 跟随光标移动

#### Scenario: 右侧拖动（控件之间空白）

- **WHEN** 用户在 `.titlebar-right` 中最小化 / 最大化 / 关闭按钮之间的空白像素按住左键并移动
- **THEN** 窗口 MUST 跟随光标移动；按钮本身单击 MUST NOT 被误判为拖动

### Requirement: 拖动退出窗口不产生粘滞

用户拖动过程中光标移出窗口边界后释放鼠标左键，窗口 MUST 立即停止跟随，不得出现"下次点击才停止"的粘滞态。

#### Scenario: 屏幕外释放

- **WHEN** 用户按住标题栏拖动，快速将光标移动到显示器边界外并松开左键
- **THEN** 窗口 MUST 在松开鼠标的时刻或 Chromium 原生窗口管理器收到系统事件后的下一帧停止跟随；MUST NOT 在鼠标松开后继续随系统光标位置变化

### Requirement: 标题栏空白处双击切换最大化

标题栏 `-webkit-app-region: drag` 区域内双击 MUST 在最大化与还原之间切换（Chromium 原生行为）。

#### Scenario: 空白处双击最大化

- **WHEN** 窗口处于未最大化状态，用户在标题栏空白区域双击左键
- **THEN** 窗口 MUST 最大化

#### Scenario: 最大化态双击还原

- **WHEN** 窗口处于最大化状态，用户在标题栏空白区域双击左键
- **THEN** 窗口 MUST 还原到之前的尺寸

### Requirement: Onboarding 完成后不遮挡标题栏拖动

`OnboardingContribution` 注入的 `.void-onboarding-container` 及其子节点 MUST 在 `isOnboardingComplete=true` 状态下对标题栏区域（顶部至少 35 px）保持 `pointer-events:none` 透传；不得包含 `pointer-events:auto` 的子元素覆盖该区域。

#### Scenario: 完成态不干扰拖动

- **WHEN** 用户已完成 Onboarding（`isOnboardingComplete=true`），随后尝试在标题栏拖动窗口
- **THEN** mousedown / pointerdown 事件 MUST 透过 `.void-onboarding-container` 命中底层 `.titlebar-drag-region`；Chromium 原生拖动 MUST 正常触发

#### Scenario: 未完成态允许覆盖（豁免）

- **WHEN** `isOnboardingComplete=false`，Onboarding 欢迎屏全屏覆盖
- **THEN** 本 Requirement MUST NOT 要求其时标题栏可拖（Onboarding 覆盖为预期交互，用户在 Onboarding 未完成前无需拖动主窗口）
