# 实施任务：全面支持 Void AI 工具界面多语言与默认中文（localize-void-ai-ui）

## 1. 阶段 A — i18n 基础设施扩展

- [ ] 1.1 在 `src/vs/workbench/contrib/void/browser/react/src/i18n/types.ts` 中扩展 `TranslationKeys`，新增 `common.*`、`chat.*`、`settings.*`、`warnings.*`、`quickEdit.*` 等前缀的键位定义
- [ ] 1.2 在 `locales/en.ts` 与 `locales/zh-cn.ts` 中为新增键补充英文与简体中文翻译，零缺失
- [ ] 1.3 修改 `WarningBox.tsx`，新增可选 `textKey: keyof TranslationKeys` 属性，与现有 `text` 互斥；内部按需调用 `t()`
- [ ] 1.4 修改 `ModelDropdown.tsx` 的 `emptyMessage`：新增 `messageKey` 字段；将 `'Enable a model'`、`'Add a model'`、`'Provider required'` 等硬编码字符串改为 `t('warnings.*')`
- [ ] 1.5 新增一个 `LanguageSelector` 可复用组件（提取自现有 Onboarding 内联实现），并导出以便 `Settings.tsx` 复用

## 2. 阶段 B — Chat 侧边栏中文化

- [ ] 2.1 在 `SidebarChat.tsx` 中，将 Chat 输入框 `placeholder`（`@ to mention, ... Enter instructions...`）改为 `t('chat.inputPlaceholder', keybindingString)`，并在 `zh-cn.ts` 写入中文模板
- [ ] 2.2 将落地页 `Suggestions` / `Previous Threads` 标题与三条示例提示（`Summarize my codebase`、`How do types work in Rust?`、`Create a .voidrules file for me`）改为 `t('chat.suggestions.*')`
- [ ] 2.3 将 `ErrorDisplay`、`WarningBox text='Open settings'` 等错误/警告文案改为 `t('warnings.*')` 或 `t('common.openSettings')`
- [ ] 2.4 将 `CommandBarInChat`、`ChatBubble` 内的按钮标签与 tooltip（如 `Edit`、`Retry`、`Stop`、`Checkpoint`）改为 `t('chat.*')`
- [ ] 2.5 将 `PastThreadsList` 中的线程标题/空态提示改为 `t('chat.threads.*')`

## 3. 阶段 C — Void 设置面板中文化

- [ ] 3.1 将 `Settings.tsx` 顶部标题 `Void's Settings` 与 7 项导航标签（Models / Local Providers / Main Providers / Feature Options / General / MCP / All Settings）改为 `t('settings.nav.*')`
- [ ] 3.2 将 Models 分区的说明、`RefreshModelButton` 的 `up-to-date` / `not found` / `Manually refresh ...` 模板改为 `t('settings.models.*')`，支持 `{0}` 占位提供商名
- [ ] 3.3 将 Local Providers、Main Providers 分区的标题与说明文案改为 `t('settings.providers.*')`
- [ ] 3.4 将 Feature Options 分区的 Autocomplete / Apply / Tools / Editor / SCM 子分区标题、说明、开关旁文本改为 `t('settings.features.*')`
- [ ] 3.5 将 General 分区的 One-Click Switch、Import/Export、Built-in Settings、Metrics、AI Instructions 的标题、说明、按钮标签改为 `t('settings.general.*')`
- [ ] 3.6 将 MCP 分区的说明与 `Add MCP Server` 按钮改为 `t('settings.mcp.*')`
- [ ] 3.7 将 `SimpleModelSettingsDialog` 的标题、说明、开关标签、`Cancel` / `Save` 按钮、`Invalid JSON` 错误改为 `t('settings.modelOverride.*')` 与 `t('common.*')`
- [ ] 3.8 在 General 分区新增“语言 / Language”小节，复用 `LanguageSelector`；切换后所有岛屿即时刷新

## 4. 阶段 D — Onboarding 补齐

- [ ] 4.1 审查 `VoidOnboarding.tsx` 页 1 `AddProvidersPage`：将意图选择、提供商卡片、模型下拉上下文、表单提示、按钮标签全部改为 `t('onboarding.providers.*')`
- [ ] 4.2 将页 2 的 `OneClickSwitchButton` 描述以及 `Transfer your editor settings into Void.` 等剩余硬编码字符串改为 `t('onboarding.transfer.*')`
- [ ] 4.3 将 `OllamaSetupInstructions` 内的步骤说明改为 `t('onboarding.ollama.*')`
- [ ] 4.4 验证 Onboarding 三页在 `zh-cn` 下无英文残留，并在切换到 `en` 后整体英文

## 5. 阶段 E — Quick Edit 与共享组件扫尾

- [ ] 5.1 将 `QuickEdit.tsx` 的输入占位符、`Submit` / `Cancel` / `Retry` 按钮文案改为 `t('quickEdit.*')`
- [ ] 5.2 将 `ModelDump`、`ModelDropdown`、`WarningBox` 剩余零散英文接入 `t()`
- [ ] 5.3 在 `voidSettingsTypes.ts` 的 `displayInfoOfFeatureName` / `displayInfoOfProviderName` / `displayInfoOfSettingName` 返回结构上追加可选 `titleKey` / `descKey`，并在 React 展示层优先使用
- [ ] 5.4 新增 `build/lib/verify-void-ai-i18n.js`：扫描受影响文件，报告硬编码用户可见英文残留（长度 ≥ 2 单词、非品牌/URL/代码标识符），并加入 `文档/temp-中文化最终验收记录.json` 产出

## 6. 打包与动态验收

- [ ] 6.1 运行 `npm run compile` 或对应前端构建，确认 React 产物无 TypeScript/构建错误
- [ ] 6.2 运行 `vscode-win32-x64-min-ci` 重建免安装目录，复用已打的补丁
- [ ] 6.3 运行 `vscode-win32-x64-inno-updater` 与 `vscode-win32-x64-user-setup`，产出新的 `VSCodeSetup.exe` 与 `VSCode-win32-x64/Void.exe`
- [ ] 6.4 以 `--user-data-dir="...\test-user-data"` 启动 `Void.exe`，按 spec 的 7 条 Scenario 逐项目测
- [ ] 6.5 运行 `node build/lib/verify-zh-localization.js` 与新增的 `verify-void-ai-i18n.js`，确保两者均 PASS，并把结果归档至 `文档/temp-中文化最终验收记录.md`

## 7. 归档与交付

- [ ] 7.1 运行 `openspec validate localize-void-ai-ui` 通过
- [ ] 7.2 提交变更并在 PR 描述中链接 `proposal.md` / `design.md` / `specs/void-ai-ui-i18n/spec.md`
- [ ] 7.3 根据 `/opsx-archive` 流程归档本 change，并在 `openspec/specs/` 下落盘 `void-ai-ui-i18n` 能力
