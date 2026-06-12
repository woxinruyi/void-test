# 设计：全面支持 Void AI 工具界面多语言与默认中文（localize-void-ai-ui）

## 一、背景与约束

- 已有的 `src/vs/workbench/contrib/void/browser/react/src/i18n/` 提供轻量 i18n 框架：
  - `index.ts` 暴露 `t(key, ...args)`、`setLocale`、`useLocale`、`getSupportedLocales`，默认 `zh-cn`，持久化到 `localStorage['void-locale']`。
  - `types.ts` 用接口 `TranslationKeys` 枚举所有键，`en.ts` / `zh-cn.ts` 各自实现。
  - 当前 `zh-cn` 覆盖的键主要集中在 `onboarding.*` 与少量 `settings.*`。
- React 岛屿通过 VSCode 的 iframe 注入，语言切换不能依赖 VSCode 的 NLS 机制，也不能触发窗口重载（会导致原生 Workbench 重启）。
- 本次变更不得回退既有的「产品层中文化」成果：
  - `product.json` 的 `defaultLocale = zh-cn` 与 `builtInExtensions` 中的 `ms-ceintl.vscode-language-pack-zh-hans` 保持不变。
  - `src/vs/base/node/nls.ts` 的首启兜底逻辑保持不变。

## 二、目标设计

### 1. 键位层级与命名

按岛屿/域划分前缀，层级 2-3 级，`camelCase` 叶子键：

| 前缀 | 含义 | 示例 |
| --- | --- | --- |
| `common.*` | 跨岛屿通用（保存、取消、关闭、错误） | `common.save`、`common.cancel` |
| `chat.*` | Chat 侧边栏（占位符、建议、线程标题、状态条） | `chat.inputPlaceholder`、`chat.suggestions.summarize` |
| `settings.*` | Void's Settings（导航、分区、开关描述） | `settings.nav.models`、`settings.tools.autoAcceptLLMChanges` |
| `onboarding.*` | Onboarding（已部分存在，补齐页 1/2） | `onboarding.welcome`、`onboarding.providers.title` |
| `quickEdit.*` | Quick Edit 输入 | `quickEdit.submit` |
| `warnings.*` | 空态/警告/错误 | `warnings.addModel`、`warnings.providerRequired` |
| `providers.*` | 提供商展示名（仅非品牌描述字段） | `providers.desc.openai` |

品牌/代码标识符/URL **不走** i18n，保持原文。

### 2. `t()` 的调用约束

- 动态拼接统一改成带参数模板：`t('chat.inputPlaceholder', keybindingStr)`，中文模板形如 `"@ 提及文件，{0} 添加选中内容，输入你的指令…"`。
- 组件接收文案时，尽量接收键（`textKey: keyof TranslationKeys`）而非最终字符串，避免把英文预先渲染到 common 层；特殊情况下（例如 `displayInfoOfProviderName`）允许返回 `{ title, descriptionKey }`，展示层再 `t(descriptionKey)`。

### 3. 共享组件改造方案

- `WarningBox`：新增 `textKey?: keyof TranslationKeys` 可选属性，与现有 `text` 互斥；当 `textKey` 存在时内部调用 `t()`。迁移期两者并存，最终逐步把 `text` 调用点替换为 `textKey`。
- `ModelDropdown` 的 `emptyMessage.message` 改为 `messageKey`；`isDisabled` 分支的硬编码字符串全部改成 `t('warnings.*')`。
- `ErrorDisplay`：保留服务端返回的原始错误 `message`（不翻译），但按钮、说明性文案（`Dismiss`、`Full error`）通过 `t('common.*')`。

### 4. `displayInfoOfFeatureName` / `displayInfoOfProviderName` / `displayInfoOfSettingName`

这些 helper 目前在 common 层直接返回英文字符串。为避免把 React i18n 扩散到 common：

- 在 helper 返回的对象上新增可选 `titleKey`、`descKey` 字段，保留旧的 `title`、`description` 作为英文回退。
- React 侧优先使用 `titleKey ? t(titleKey) : title`。
- 这样 common 层不依赖 React i18n，只新增一层可选键位映射。

### 5. 语言切换入口

- 保留 Onboarding 页 0 的语言选择器。
- 在 `Void's Settings` 的 `General` 分区新增“语言 / Language”小节，复用同一个 `useLocale`，与 Onboarding 的语言选择器状态双向同步（通过共享的 `localStorage['void-locale']` 和 `localeListeners`）。

### 6. 作用域隔离

- React i18n 仅影响岛屿内 DOM，不调用 `INativeHostService.reload()`、不写 `argv.json`，与 VSCode 原生 locale 解耦。
- 首启逻辑：`getInitialLocale` 维持现状（未持久化时返回 `zh-cn`）；不读取 `product.defaultLocale`（与 VSCode NLS 隔离，防止循环耦合）。

## 三、分阶段实施顺序

为降低风险，按文件分阶段合入，每阶段独立可部署（缺键自动回退英文）：

1. **阶段 A — 基础设施**：扩展 `types.ts` / `en.ts` / `zh-cn.ts`，新增 `common.*`、`warnings.*` 前缀；为 `WarningBox`、`ModelDropdown` 引入 `textKey` / `messageKey` 属性。
2. **阶段 B — Chat 侧边栏**：`SidebarChat.tsx` 与其子组件中所有用户可见英文接入 `chat.*` 键。
3. **阶段 C — Settings 面板**：`Settings.tsx` 左侧导航 + 全部分区标题/说明/按钮/开关描述接入 `settings.*` 键；在 `General` 分区加入语言切换入口。
4. **阶段 D — Onboarding 补齐**：`VoidOnboarding.tsx` 页 1 `AddProvidersPage` 与页 2 `OneClickSwitchButton` 附近文案接入 `onboarding.*` 键。
5. **阶段 E — Quick Edit 与扫尾**：`QuickEdit.tsx`、`ErrorDisplay`、`CommandBarInChat`、`ModelDump` 等剩余零散文案；加入静态残留审查脚本。

## 四、验证策略

- **静态**：`openspec validate localize-void-ai-ui` 通过。
- **静态**：新增 `build/lib/verify-void-ai-i18n.js`（或扩展现有 `verify-zh-localization.js`），对受影响文件运行正则扫描，报告潜在的硬编码英文可见字符串（长度 ≥ 2 词、非注释、非 URL、非品牌白名单）。允许白名单（例如 `VS Code`、`Cursor`、`Windsurf`、`Ollama`、`MCP` 等）。
- **动态**：以 `--user-data-dir="...\test-user-data"` 启动打包后的 `Void.exe`，依次：
  - 走完 Onboarding（3 页均中文）。
  - 打开 Chat（占位符、建议、空态、错误、命令栏均中文）。
  - 打开 `Void's Settings` 左侧 7 项导航与右侧全部分区（均中文）。
  - 在设置中将语言切到英文，预期 React 岛屿立即全部变英文，而 VSCode 原生菜单/设置页保持中文（由 `product.defaultLocale` 控制）。
  - 重启 `Void.exe`，预期 React 岛屿保持为上次选择的英文。

## 五、风险与回滚

- **风险 A — 键位爆炸**：Settings.tsx 单文件文案最多，可能引入 60-100 个键。
  - 缓解：按分区成组（`settings.nav.*`、`settings.models.*`、`settings.tools.*`…），PR 粒度按分区拆分。
- **风险 B — common 层污染**：`displayInfoOf*` 返回结构变化可能影响其他未纳入本次改造的调用方。
  - 缓解：新字段为可选，旧字段保留；调用方渐进迁移。
- **风险 C — 切换语言未刷新**：若某组件未订阅 `useLocale`，切换后仍显示旧文案。
  - 缓解：所有接入 `t()` 的组件要么直接处于 `useLocale` 订阅链路上（通过父组件触发 re-render），要么自身调用 `useLocale` 以强制订阅。
- **回滚**：本次变更为增量接入，回滚方式为将 `t('...')` 调用替换回原字符串（或 revert 对应 commit）；`zh-cn.ts` 缺键时已由 `en.ts` 兜底，不会导致空白或崩溃。
