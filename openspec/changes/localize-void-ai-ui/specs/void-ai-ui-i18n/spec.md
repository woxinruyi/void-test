# Void AI 工具界面多语言能力（void-ai-ui-i18n）

## ADDED Requirements

### Requirement: 默认语言为简体中文

Void AI 工具的所有 React 岛屿（Onboarding、Chat 侧边栏、Void's Settings、Quick Edit、共享警告/错误组件）MUST 在首次启动、且未设置 `localStorage['void-locale']` 时，展示简体中文（`zh-cn`）文案。

#### Scenario: 首启未设置语言偏好

- **WHEN** 用户以干净的 `--user-data-dir` 启动打包后的 `Void.exe`，且浏览器 `localStorage` 中不存在 `void-locale`
- **THEN** Onboarding 第 0 页欢迎标题、语言选择器旁“开始使用”按钮、Chat 侧边栏占位符、Chat 栏目内设置面板左侧导航（模型 / 本地提供商 / 主提供商 / 功能选项 / 通用 / MCP / 全部设置）以及右侧正文段落 MUST 全部显示为简体中文

#### Scenario: 已持久化语言偏好优先于默认值

- **WHEN** `localStorage['void-locale']` 为合法值 `en`
- **THEN** 所有岛屿 MUST 展示英文文案，且不受 `product.defaultLocale` 影响

### Requirement: 统一 i18n 键位规范

所有用户可见文案 MUST 通过 `t('<prefix>.<name>')` 形式访问，`<prefix>` MUST 为岛屿或功能域名，且键位定义 MUST 集中在 `src/vs/workbench/contrib/void/browser/react/src/i18n/locales/*.ts` 与 `types.ts` 中。

#### Scenario: 键位前缀约束

- **WHEN** 开发者为 Chat 侧边栏新增一条建议文案
- **THEN** 新增键名 MUST 以 `chat.` 开头（例如 `chat.suggestions.summarize`），且 MUST 同时在 `en.ts`、`zh-cn.ts`、`types.ts` 三处新增

#### Scenario: 缺失键回退英文

- **WHEN** 当前 locale 为 `zh-cn` 但目标键在 `zhCN` 中缺失
- **THEN** `t()` MUST 回退到 `en` 表；若 `en` 也缺失，MUST 返回键名字符串本身

### Requirement: 覆盖 Chat 侧边栏全部用户可见文案

`SidebarChat.tsx` 及其直接渲染的子组件（包括占位符、建议提示、历史线程标题、错误提示、命令栏按钮、设置入口文案）MUST 不包含硬编码的英文可见字符串；所有文案 MUST 通过 `t(key)` 调用获取。

#### Scenario: Chat 落地页建议提示

- **WHEN** 用户首次打开 Chat 栏且不存在历史线程
- **THEN** “Suggestions / 建议”标题与三条示例提示（总结代码库、Rust 类型问答、生成 `.voidrules`）MUST 均来自 `t('chat.suggestions.*')` 键，并在 `zh-cn` 下显示中文

#### Scenario: Chat 输入框占位符

- **WHEN** 用户聚焦到 Chat 输入框
- **THEN** 占位符 MUST 来自 `t('chat.inputPlaceholder', keybinding)` 带参数的模板，且 `zh-cn` 模板 MUST 使用中文，例如 `@ 提及文件，{0} 添加选中内容，输入你的指令…`

### Requirement: 覆盖 Void 设置面板全部用户可见文案

`Settings.tsx` 的左侧导航（Models、Local Providers、Main Providers、Feature Options、General、MCP、All Settings）、页面标题 `Void's Settings`、各分区标题与说明、`Tools` / `Editor` / `SCM` / `Autocomplete` / `Apply` / `One-Click Switch` / `Import/Export` / `Built-in Settings` / `Metrics` / `AI Instructions` / `MCP` 章节文案、按钮标签、开关旁描述文本 MUST 全部通过 `t(key)` 调用获取。

#### Scenario: 左侧导航中文化

- **WHEN** 用户在 `zh-cn` 下打开 `Void's Settings`
- **THEN** 7 项导航项 MUST 显示为：模型、本地提供商、主提供商、功能选项、通用、MCP、全部设置

#### Scenario: 功能开关旁描述跟随语言

- **WHEN** 用户切换 `autoAcceptLLMChanges` 开关
- **THEN** 右侧描述文本 MUST 使用 `t('settings.tools.autoAcceptLLMChanges')`，并随 locale 立即刷新，无需重启或刷新窗口

### Requirement: 覆盖 Onboarding 全部页面

`VoidOnboarding.tsx` 页 0（欢迎）、页 1（`AddProvidersPage`：意图选择、提供商列表、模型下拉、表单提示）、页 2（设置与主题、一键迁移） MUST 全部通过 `t(key)` 获取文案，不留英文硬编码；且语言选择器切换 MUST 立即反映在全部三页。

#### Scenario: Onboarding 第二页迁移编辑器按钮

- **WHEN** 用户在 `zh-cn` 下进入 Onboarding 第 2 页
- **THEN** 标题与 `OneClickSwitchButton` 的 `fromEditor` 提示 MUST 显示为“从 VS Code 迁移”“从 Cursor 迁移”“从 Windsurf 迁移”等中文形式（编辑器品牌名保持原样）

#### Scenario: 语言选择器即时生效

- **WHEN** 用户在 Onboarding 第 0 页将语言从中文切到英文
- **THEN** Onboarding 页 0/1/2 所有可见文案 MUST 在下一次 React 渲染内刷新为英文，无需刷新窗口或重启应用

### Requirement: 覆盖 Quick Edit 与共享警告组件

`QuickEdit.tsx` 的输入提示、提交/取消按钮、`WarningBox` 的默认文案、`ModelDropdown` 的空态提示（`Enable a model` / `Add a model` / `Provider required` 等）MUST 全部通过 `t(key)` 调用获取。

#### Scenario: 模型下拉空态

- **WHEN** 用户处于 `zh-cn`，`Chat` 能力尚未配置任何可用模型
- **THEN** `ModelDropdown` MUST 显示来自 `t('warnings.*')` 的中文空态文案（如“请启用一个模型”“请添加模型”“需要提供商”），且点击后仍可跳转到设置页

### Requirement: 语言切换持久化与作用域隔离

语言切换 MUST 仅影响 Void React 岛屿；MUST 通过 `localStorage['void-locale']` 持久化；MUST NOT 修改 VSCode 的 `argv.json` 或触发 Workbench 重载。

#### Scenario: 语言选择持久化

- **WHEN** 用户在 Void 设置中切换 locale，然后重启 `Void.exe`
- **THEN** 新启动实例的 React 岛屿 MUST 使用上次选择的 locale，而 VSCode 原生 Workbench 的 locale MUST 保持由 `argv.json` / `product.defaultLocale` 控制，两者互不干扰

### Requirement: 验证用户可见英文残留

在本次变更完成后，对列入影响范围的源文件执行文案残留检查时，除代码标识符、URL、文件路径、品牌名、代码块内注释与日志语句外，MUST NOT 存在长度 ≥ 2 个英文单词的硬编码用户可见字符串。

#### Scenario: 静态审查脚本

- **WHEN** 维护者对 `SidebarChat.tsx`、`Settings.tsx`、`VoidOnboarding.tsx`、`QuickEdit.tsx`、`ModelDropdown.tsx`、`WarningBox.tsx` 运行文案残留检查
- **THEN** 检查 MUST 报告 0 条需要中文化但未接入 `t()` 的硬编码英文字符串
