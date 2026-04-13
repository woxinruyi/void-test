# 语言选择器交互优化方案

## 1. 问题描述

当前 Onboarding 首页（Page 0）的语言切换为一个原生 `<select>` 下拉框，仅显示"简体中文"文字：

```
┌─────────────────────────────┐
│                             │
│      [ 简体中文  ▾ ]        │  ← 当前：无图标、无标签，用户不知道这是语言切换
│                             │
│     欢迎使用 Void            │
│        (Void 图标)           │
│                             │
│       [ 开始使用 ]           │
│                             │
└─────────────────────────────┘
```

**用户反馈**："看到一个简体中文的显示，都不知道能切换语言。"

### 核心问题

| 问题 | 原因 |
|------|------|
| 不可识别 | 没有 🌐 图标或"Language"标签，用户无法将其与语言切换关联 |
| 存在感低 | 原生 select 样式低调，与页面设计风格不融合 |
| 位置不够直觉 | 放在标题上方正中，但没有视觉锚点 |
| 缺少引导 | 首次进入无任何提示表明可以切换语言 |

---

## 2. 设计方案

### 方案 A：🌐 图标 + 标签式切换按钮（推荐）

将原生 `<select>` 替换为带地球图标的**按钮组**，直接显示两种语言选项，当前选中项高亮：

```
┌──────────────────────────────────────────┐
│                                     🌐   │  ← 右上角固定
│                                 [中文|EN] │  ← 按钮组，当前选中项高亮
│                                          │
│          欢迎使用 Void                    │
│             (Void 图标)                   │
│                                          │
│            [ 开始使用 ]                   │
│                                          │
└──────────────────────────────────────────┘
```

**交互细节**：
- **位置**：页面右上角绝对定位（`absolute top-4 right-4`）
- **布局**：🌐 地球图标 + 分段按钮 `[中文 | EN]`
- **选中态**：当前语言按钮有高亮背景色（与 Onboarding 主按钮同色系 `#0e70c0`）
- **未选中态**：半透明文字，hover 时亮度提升
- **切换**：点击即切换，无二次确认，页面立即刷新文字
- **过渡**：文字切换时加 150ms 的 opacity 过渡

**优点**：
- ✅ 地球图标是语言切换的国际通用视觉暗示
- ✅ 所有选项一目了然，无需展开下拉
- ✅ 当语言只有 2-3 个时，按钮组比 select 更高效
- ✅ 自定义样式，与 Onboarding 页面设计统一

**缺点**：
- ⚠️ 语言超过 3 个时按钮组会过宽（当前仅 2 个，不是问题）

---

### 方案 B：🌐 图标 + 美化下拉（备选）

保留下拉机制，但增加图标和视觉优化：

```
┌──────────────────────────────────────────┐
│                              🌐 简体中文 ▾│  ← 右上角，带地球图标
│                                          │
│          欢迎使用 Void                    │
│             (Void 图标)                   │
│                                          │
│            [ 开始使用 ]                   │
│                                          │
└──────────────────────────────────────────┘
```

**交互细节**：
- **位置**：右上角绝对定位
- **触发**：点击展开原生下拉菜单
- **图标**：🌐 地球图标作为前缀，提升可辨识度
- **样式**：半透明边框 + hover 提亮

**优点**：
- ✅ 改动最小，仅增加图标和调位置
- ✅ 语言数量增多时天然支持滚动

**缺点**：
- ⚠️ 原生 select 在不同 OS/浏览器外观不统一
- ⚠️ 下拉仍需点击才能发现有其他选项

---

### 方案 C：右上角悬浮 + 首次 tooltip 提示

在方案 A 基础上，首次访问时显示一个短暂的 tooltip 气泡提示：

```
┌──────────────────────────────────────────┐
│                                          │
│                          ┌─────────────┐ │
│                          │ 切换语言     │ │  ← 2 秒后自动消失
│                          │ Switch Lang  │ │
│                          └──────┬──────┘ │
│                            🌐 [中文|EN]  │
│                                          │
│          欢迎使用 Void                    │
│                                          │
└──────────────────────────────────────────┘
```

**交互细节**：
- 首次加载后 500ms 展示 tooltip，持续 3 秒后 fade out
- tooltip 消失后不再出现（localStorage 标记）
- tooltip 样式：暗底白字小气泡，箭头指向按钮组

---

## 3. 方案对比

| 维度 | A: 图标+按钮组 | B: 图标+美化下拉 | C: A + tooltip |
|------|:---:|:---:|:---:|
| 可发现性 | ★★★★ | ★★★ | ★★★★★ |
| 实现复杂度 | 低 | 极低 | 中 |
| 扩展性（>3语言） | 一般 | 好 | 一般 |
| 视觉一致性 | 高 | 中 | 高 |
| 推荐度 | **推荐** | 备选 | 最佳但可后续迭代 |

## 4. 推荐实施路径

**第一步（本次）**：实施 **方案 A** — 🌐 图标 + 按钮组，右上角定位

改动范围：
- 仅修改 `LanguageSelector` 组件（`VoidOnboarding.tsx` 约 20 行）
- 新增 `Globe` 图标 import（已有 `lucide-react` 依赖）
- 调整 Page 0 的 `LanguageSelector` 放置位置（从 content 内部移到 shell 外层绝对定位）

**第二步（可选后续）**：叠加方案 C 的 tooltip 首次引导

---

## 5. 方案 A 实现要点

### 5.1 LanguageSelector 组件改造

```tsx
const LanguageSelector = () => {
    const [locale, changeLocale] = useLocale();
    const locales = getSupportedLocales();

    return (
        <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
            <Globe className="w-4 h-4 text-void-fg-3 opacity-60" />
            <div className="flex rounded-md overflow-hidden border border-void-border-2">
                {locales.map(l => (
                    <button
                        key={l.id}
                        onClick={() => changeLocale(l.id)}
                        className={`px-3 py-1 text-xs font-medium transition-all duration-150
                            ${locale === l.id
                                ? 'bg-[#0e70c0]/80 text-white'
                                : 'bg-void-bg-2/50 text-void-fg-3 hover:bg-void-bg-2 hover:text-void-fg-1'
                            }`}
                    >
                        {l.shortLabel}
                    </button>
                ))}
            </div>
        </div>
    );
};
```

### 5.2 getSupportedLocales 增加 shortLabel

```ts
export function getSupportedLocales() {
    return [
        { id: 'zh-cn', label: '简体中文', shortLabel: '中文' },
        { id: 'en', label: 'English', shortLabel: 'EN' },
    ];
}
```

### 5.3 Page 0 定位调整

将 `<LanguageSelector />` 从 content 内部移到 OnboardingPageShell 外面，使用 `relative` 容器 + `absolute` 定位：

```tsx
0: <div className="relative w-full">
    <LanguageSelector />
    <OnboardingPageShell content={...} />
</div>
```

### 5.4 视觉效果

切换前（中文选中）：
```
🌐 [中文] EN
     ^^^^
     高亮蓝底白字
```

切换后（EN 选中）：
```
🌐  中文 [EN]
          ^^
          高亮蓝底白字
```

---

## 6. 测试要点

| 编号 | 用例 | 预期 |
|------|------|------|
| UI-1 | 首页加载 | 右上角可见 🌐 + 按钮组，中文默认高亮 |
| UI-2 | 点击 EN | EN 高亮，页面文字立即切换为英文 |
| UI-3 | 点击中文 | 中文高亮，页面文字立即切换为中文 |
| UI-4 | 进入 Page 1 | 语言选择器不显示（仅 Page 0 展示） |
| UI-5 | 窗口缩小 | 按钮组不溢出，保持右上角可见 |
