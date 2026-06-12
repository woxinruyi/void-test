# 修复：标题栏拖动可靠性（fix-titlebar-drag-reliability）

## 背景

现状：Void 在 `OnboardingContribution`（`src/vs/workbench/contrib/void/browser/voidOnboardingService.ts`）里手动创建一个固定定位的 `dragRegion` 覆盖层（`top:0 height:80px zIndex:100000 pointer-events:auto`），并通过自定义 IPC（`vscode:startWindowDrag` / `vscode:stopWindowDrag`）在主进程用 `setInterval(16ms)` 轮询 `screen.getCursorScreenPoint()` 然后 `win.setPosition(...)` 来"手动实现"窗口拖动。主进程处理见 `src/vs/code/electron-main/app.ts:520-540`。

注释原因："bypass Chromium's hit-test mechanism (100% reliable)"。但实际表现不稳定：

- **可见症状**：用户反映标题栏只有**最右侧一小部分**（约 150 px，即 `WINDOW_CONTROLS_WIDTH` 区域）能被拖动；中央与左侧区域多数情况下点了没反应，或偶尔才响应。
- **次生症状（推断）**：鼠标在窗口外松开时，渲染进程的 `mainWindow.mouseup` 不触发，主进程 `setInterval` 永不 stop → 窗口随光标乱跑直至下次点击时 `stopDrag()` 被触发。

## 根因

**React onboarding 根节点与原生 Chromium 拖动被同一个覆盖层同时干扰**：

1. `OnboardingContribution` 始终（无论 onboarding 是否完成）把 `onboardingContainer`（`pointer-events:none`）+ `dragRegion`（`pointer-events:auto`，zIndex 100000）+ React onboarding 根（`mountVoidOnboarding`）挂到 `.monaco-workbench` 之上。
2. React `VoidOnboarding` 根 `div` 使用 `fixed inset-0 z-[99999]`，`isOnboardingComplete=false` 时 `pointer-events-auto` 全屏接管；完成后虽 `pointer-events-none + opacity-0`，但 CSS transition 期内仍有边界态。
3. `dragRegion` 设置了 `pointer-events:auto` 但它**挡住了原生 `.titlebar-drag-region`**（后者在 VSCode 默认布局已设 `-webkit-app-region: drag`）。覆盖层自己走 IPC 路径，原生路径被彻底屏蔽。
4. IPC 路径只在覆盖层的 `mousedown` 事件处理器中触发，若 React 子节点或其他高 z-index 元素覆盖到顶部 → 整个 IPC 路径失效；且拖动过程鼠标出窗外 → 主进程 interval 永不停 → 下次点击才复位。

## 目标

- **回归 Chromium 原生拖动**：依赖 `-webkit-app-region: drag` / `no-drag` CSS（主流 Electron 应用的标准方案，VSCode 自身默认已配置好），让整个标题栏（除窗口控制按钮外）任意位置均可稳定拖动。
- **彻底移除**自定义 IPC 拖动覆盖层与主进程 `startWindowDrag` / `stopWindowDrag` 轮询机制，消除"鼠标出窗→窗口粘光标"的间歇性故障。
- **保留双击最大化行为**：若用户依赖覆盖层的双击最大化，迁移至原生 `-webkit-app-region: drag` 区域的默认双击行为（Chromium 已原生支持）。

## 非目标

- **不**修改 VSCode 默认 titleBar 结构（`.titlebar-container > .titlebar-drag-region / .titlebar-left / .titlebar-center / .titlebar-right`）
- **不**改变 Onboarding UI 的外观与交互（仅剥离它对拖动的劫持）
- **不**引入新的原生模块（不使用 `electron-window-manager` 等第三方方案）

## 方案要点

### 1. 删除自定义拖动覆盖层（渲染进程）

`voidOnboardingService.ts`：
- 移除 `_createDragOverlay` 方法、`dragRegion` 元素创建、`mousedown` / `dblclick` / `mouseup` 监听、`ipcSend('vscode:startWindowDrag' | 'vscode:stopWindowDrag' | 'vscode:toggleMaximizeWindow')` 调用
- `onboardingContainer` 保持 `pointer-events:none`；React onboarding 根仅在 `!isOnboardingComplete` 时 `pointer-events:auto`（现状已如此）——完成后**不再挡住**原生标题栏

### 2. 删除主进程 IPC 处理器（主进程）

`app.ts:520-540`：
- 删除 `vscode:startWindowDrag` / `vscode:stopWindowDrag` 监听器、`dragInterval` / `stopDrag` 闭包
- 保留 `vscode:toggleMaximizeWindow` 监听器（其他处可能仍在用；若仅此处用则一并删除——本 change 审计后决定）

### 3. 保证原生 `-webkit-app-region: drag` 链路可达

审计 `.monaco-workbench .part.titlebar > .titlebar-container > .titlebar-drag-region`（`titlebarpart.css:56-64`）的 CSS 未被覆盖：
- 该元素 `position:absolute width:100% height:100% -webkit-app-region:drag` 应在所有交互元素（按钮、菜单、breadcrumb、command-center）之**下**，通过后者的 `-webkit-app-region:no-drag` 形成"底色可拖、交互元素不拖"的分层
- 目前 Void onboarding 容器 `zIndex:99998` 全屏固定，会遮挡 titlebar 原生拖动区。解决：onboarding 容器在 `isOnboardingComplete=true` 时应**完全不存在**（`display:none` 或不挂载），或其 `pointer-events:none` 必须严格生效（确保 React 完成态下无子节点 opt-in auto）

### 4. 回归测试用例

- **T1 全区可拖**：标题栏从最左 → 中央 → 最右（控件前一像素）任意按住拖动，窗口应跟随；无 150 px "死区"。
- **T2 出窗不粘滞**：按住标题栏，快速拖到屏幕外松开，窗口停止跟随，不再粘光标。
- **T3 双击最大化**：标题栏空白处双击，窗口在最大化 / 还原间切换（Chromium 原生行为）。
- **T4 控件可用**：最小化 / 最大化 / 关闭按钮单次点击生效，不被拖动逻辑吞。
- **T5 Onboarding 首启**：全新 profile 首次进入，Onboarding 欢迎屏覆盖全屏，期间不要求拖动可用（拖动被 onboarding 覆盖层阻挡是预期行为，与现状一致）。
- **T6 Onboarding 完成后**：点完成进入主界面，标题栏立即恢复 T1~T4 全部行为。

## 受影响代码

- `src/vs/workbench/contrib/void/browser/voidOnboardingService.ts`：移除 `_createDragOverlay` 及相关 mousedown/mouseup/dblclick/IPC 调用
- `src/vs/code/electron-main/app.ts`：移除 `startWindowDrag` / `stopWindowDrag` IPC handlers 与 `dragInterval` 闭包；视审计结果保留或移除 `toggleMaximizeWindow`
- `src/vs/workbench/contrib/void/browser/react/src/void-onboarding/VoidOnboarding.tsx`：移除顶部注释中对 "drag region handled by voidOnboardingService" 的提示（该承诺已不成立）
- （可选）`voidOnboardingService.ts` 的 `onboardingContainer` 在 `isOnboardingComplete=true` 时改为不挂载 / 挂载后 `remove`，消除其对底层 titlebar 的遮挡风险

## 验证

- 静态：`openspec validate fix-titlebar-drag-reliability`、`tsc` 无错
- 动态：新建空 `--user-data-dir` 启动 → 完成 Onboarding → 按 T1~T6 逐项实测
- 回归：`improve-tool-approval-policy` 的三档预设、tool_request 卡片等不受影响

## 风险与回滚

- **风险 A — Chromium hit-test bug 历史原因**：原注释提到 "bypass Chromium's hit-test mechanism"。若 VSCode 在 Windows 某些 Chromium 版本曾有 bug 导致 `-webkit-app-region` 失灵，恢复原生后可能重现。
  - 缓解：VSCode 主仓库至今仍使用原生 `-webkit-app-region: drag`（未见此问题上游修复记录），且 Electron 34.x / Chromium 128+ 未见相关 open issue；回归测试在 Windows 10 / 11 两个主版本分别验证。
- **风险 B — 覆盖层删除破坏 Onboarding 布局**：dragRegion 与 onboardingContainer 实现耦合。
  - 缓解：只删 `_createDragOverlay` 调用与方法体，`onboardingContainer` 本身保留（React 根仍挂在上面）。
- **回滚**：本 change 为删除性变更。回滚即 revert 两处代码，恢复 IPC 机制。
