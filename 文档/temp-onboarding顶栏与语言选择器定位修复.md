# Onboarding 顶栏与语言选择器定位修复

## 1. 问题清单

| # | 问题 | 根因 |
|---|------|------|
| P1 | 顶部白色横栏（标题栏）不显示 | Onboarding 使用 `fixed top-0 z-[99999]` 全屏覆盖，遮住了 Electron 自定义标题栏 |
| P2 | 窗口不可拖动 | 覆盖层没有 `-webkit-app-region: drag` 属性，Electron 无法识别拖拽区域 |
| P3 | 语言选择器在居中位置而非右上角 | `LanguageSelector` 用 `absolute top-4 right-4`，但父容器 `relative w-full` 被外层 flex 居中约束（`max-w-[600px]` + `items-center`），导致 `right-4` 相对于一个窄容器而非视口 |

## 2. 布局分析

当前 DOM 层级：
```
.monaco-workbench
  └─ .void-onboarding-container
       └─ VoidOnboarding (React)
            └─ div.fixed.top-0.z-[99999]  ← 全屏覆盖层（100vh）
                 └─ VoidOnboardingContent
                      └─ div.w-full.h-[80vh].flex.items-center.justify-center
                           └─ contentOfIdx[0]
                                └─ div.relative.w-full  ← LanguageSelector 的定位容器
                                     ├─ LanguageSelector (absolute top-4 right-4)
                                     └─ OnboardingPageShell (max-w-[600px])
```

**问题链**：
- `div.relative.w-full` 虽然设了 `w-full`，但它在 flex 居中布局中，实际宽度被 `OnboardingPageShell` 的 `max-w-[600px]` 约束
- `absolute right-4` 因此只是相对于 600px 容器的右边，不是屏幕右边
- 全屏覆盖层占据 `top-0`，完全遮住 Electron 自定义标题栏（约 30-35px 高）

## 3. 修复方案

### 3.1 LanguageSelector 定位：absolute → fixed

将 `LanguageSelector` 的定位从 `absolute` 改为 `fixed`，直接相对于视口定位：

```diff
- <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
+ <div className="fixed top-2 right-4 flex items-center gap-2 z-[100000]">
```

**要点**：
- `fixed` 定位不受任何父容器约束
- `z-[100000]` 高于覆盖层的 `z-[99999]`
- `top-2`（8px）预留标题栏空间

### 3.2 顶部拖动区域 + 标题栏空间

在 Onboarding 全屏覆盖层顶部添加一个拖动区域：

```tsx
{/* 顶部拖动区域 - 替代被遮住的标题栏 */}
<div
    className="fixed top-0 left-0 right-0 h-9 z-[100000]"
    style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
/>
```

**要点**：
- `h-9`（36px）= Electron 自定义标题栏的标准高度
- `-webkit-app-region: drag` 让 Electron 识别为可拖拽区域
- 语言选择器按钮需要 `-webkit-app-region: no-drag` 防止点击被拖拽行为吞掉

### 3.3 LanguageSelector 不遮挡拖动区

```diff
  <div className="fixed top-2 right-4 flex items-center gap-2 z-[100000]"
+     style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
  >
```

### 3.4 完整布局效果

```
┌──────────────────────────────────────────────────────┐
│ ░░░░░░░░░░░ 拖动区域 (36px, drag) ░░░░ 🌐 [中文|EN] │  ← fixed top, 可拖动 + 语言切换
├──────────────────────────────────────────────────────┤
│                                                      │
│                   欢迎使用 Void                       │
│                    (Void 图标)                        │
│                                                      │
│                   [ 开始使用 ]                        │
│                                                      │
└──────────────────────────────────────────────────────┘
```

## 4. 改动范围

| 文件 | 改动 |
|------|------|
| `VoidOnboarding.tsx` | LanguageSelector: absolute→fixed, 加 no-drag |
| `VoidOnboarding.tsx` | VoidOnboarding 外层: 加顶部 drag 区域 |
| `VoidOnboarding.tsx` | 移除 Page 0 的 `<div className="relative w-full">` 包裹（不再需要） |

## 5. 测试要点

| 编号 | 用例 | 预期 |
|------|------|------|
| FIX-1 | 首页加载 | 🌐 [中文\|EN] 显示在屏幕右上角 |
| FIX-2 | 拖动窗口 | 顶部 36px 区域可拖动窗口 |
| FIX-3 | 点击语言按钮 | 语言切换正常，不被拖动行为吞掉 |
| FIX-4 | Page 1/2 | 语言选择器和拖动区域在所有页面可见 |
| FIX-5 | 完成 Onboarding | 覆盖层消失后，拖动区域和选择器也消失 |
