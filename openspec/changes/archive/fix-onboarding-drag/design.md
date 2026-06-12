## Context

Void 编辑器使用 Electron + Chromium 原生 `-webkit-app-region: drag/no-drag` CSS 实现标题栏窗口拖动。VSCode 的 `titlebarpart.css` 定义了 `.titlebar-drag-region`（`app-region: drag`）和交互挖洞区域（`app-region: no-drag`，如 menubar、窗口控制按钮）。

Void 在 onboarding 阶段引入了两层覆盖，阻断了原生拖动：

1. **`voidOnboardingService.ts` 的 `_createDragOverlay()`**：创建全屏 `pointer-events:auto` div，通过 IPC 与主进程交互实现自定义拖动（`vscode:startWindowDrag/stopWindowDrag` + `setInterval` 轮询）。该覆盖层吞掉 mousedown 事件，原生 `-webkit-app-region: drag` 仅在覆盖层未覆盖的区域生效（右侧小区域）。

2. **`VoidOnboarding.tsx` 的 React 内层 div**：`z-index:99999`、`pointer-events:auto`、`app-region:none`，盖在 `.titlebar-drag-region` 之上。Chromium 的 app-region hit-test 从最顶层元素沿 DOM 树向上查找，overlay 在不同 DOM 子树，walk-up 永远找不到 `appRegion:drag`，默认 `no-drag`。`pointer-events:none` **不影响** app-region hit-test。

CDP 验证数据（修复前，overlay top:0）：
- `elementsFromPoint(200,15)`：`[0]` 为 onboarding 内层 div（`appRegion:none`），`[4]` 才是 `.titlebar-drag-region`（`appRegion:drag`）
- 移除 onboarding 容器后：`elementsFromPoint(200,15)` 直接命中 `.titlebar-drag-region`

CDP 验证数据（修复后，overlay top:30px）：
- `elementsFromPoint(200,15)`：直接命中 `.menubar-menu-title`，深度 3 命中 `.titlebar-drag-region`（`appRegion:drag` ✅）
- y=0~30 全部命中 `titlebar-drag-region`，y≥35 为 overlay 区域
- overlay `overlayTop:30px`，`overlayHeight:770px`，`overlayPtrEvents:auto`

## Goals / Non-Goals

**Goals:**
- 恢复 Chromium 原生 `-webkit-app-region: drag` 拖动机制
- Onboarding 页面期间标题栏可拖动窗口
- Onboarding 完成后 overlay 从 DOM 彻底移除，不残留阻断

**Non-Goals:**
- 不修改 VSCode 原生标题栏 CSS
- 不引入新的自定义拖动实现
- 不修改 onboarding UI 布局

## Decisions

**决策 1：删除自定义 IPC 拖动，恢复原生 Chromium drag**
- 理由：自定义 IPC 拖动存在鼠标出窗松开事件丢失导致窗口粘滞的问题，原生 Chromium drag 无此问题
- 备选方案：修复 IPC 拖动的粘滞问题 → 放弃，原生方案更可靠

**决策 2：Onboarding 进行中 overlay 从 `top:30px` 开始，不覆盖标题栏**
- 理由：Chromium app-region hit-test 不受 `pointer-events` 影响，`appRegion:none` 的元素即使 `pointer-events:none` 仍阻断底层 drag 区域。`pointer-events:none` 仅影响 JS 事件分发，不能让底层 drag 区域被 hit-test 命中。唯一可靠方案是让 overlay 不覆盖标题栏区域（约 30px 高），改为 `top:30px; height:calc(100vh - 30px)`
- 备选方案 1：给 overlay 内层 div 设 `app-region:drag` → 放弃，overlay 是全屏覆盖，设 drag 会导致整个页面可拖动（包括 onboarding 内容区域）
- 备选方案 2：overlay `pointer-events:none` + 内容 `pointer-events:auto` → 放弃，CDP 验证 `elementsFromPoint` 跳过 `pointer-events:none` 元素，但 Chromium 内部 app-region hit-test 不尊重 `pointer-events:none`，仍阻断

**决策 3：Onboarding 完成后 React `return null`**
- 理由：完成后 overlay 不再需要，从 DOM 彻底移除避免任何残留阻断

**决策 4：保留外层容器 `.void-onboarding-container`（`pointer-events:none`）**
- 理由：容器设了 `pointer-events:none`，React `return null` 后容器为空，无子元素参与 hit-test

## Risks / Trade-offs

- **[风险] Onboarding 进行中标题栏上方 30px 无背景色** → 缓解：标题栏本身由 VSCode 原生 titlebar 渲染，overlay 从 30px 以下覆盖，视觉上标题栏区域仍显示原生标题栏样式，无视觉断裂
- **[风险] 删除 IPC 拖动后其他依赖该机制的代码** → 缓解：全局搜索 `startWindowDrag/stopWindowDrag` 仅在已删除的代码中使用，无其他依赖
