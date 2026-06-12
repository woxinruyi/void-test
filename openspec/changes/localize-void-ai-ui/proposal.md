# 全面支持 Void AI 工具界面多语言与默认中文（localize-void-ai-ui）

## 背景

当前版本通过 `product.defaultLocale = zh-cn` + 内置 `ms-ceintl.vscode-language-pack-zh-hans`，已让 VSCode 原生 Workbench（菜单、命令面板、设置页、文件树等）在打包后的 `Void.exe` 首启即为中文。

但是 Void 自身的 AI 编辑器岛屿（React 渲染的部分）并未全面接入多语言：

- `src/vs/workbench/contrib/void/browser/react/src/i18n/` 已存在一套简易 i18n 框架（`t()`、`useLocale`、`zh-cn` / `en` 两份 locale），默认值为 `zh-cn`。
- 目前只有 `VoidOnboarding.tsx` 与部分段落使用了 `t('onboarding.*')`。
- Chat 侧边栏（`SidebarChat.tsx`）、设置面板（`Settings.tsx`）、模型下拉（`ModelDropdown.tsx`）、Quick Edit（`QuickEdit.tsx`）、警告/错误文案（`WarningBox`、`ErrorDisplay`、`emptyMessage`）、占位符与建议提示（`Summarize my codebase` 等）绝大多数仍是硬编码英文。
- Chat 栏目下的“设置”入口以及所打开的 `Void's Settings` 侧栏（Models / Local Providers / Main Providers / Feature Options / General / MCP / All Settings）与正文（Tools、Editor、One-Click Switch、Import/Export、Metrics、AI Instructions 等）同样全部硬编码英文。

因此中文用户在启动 `Void.exe` 后会看到：原生 Workbench 已中文化，但 Void 的 AI 工具区（右侧 Chat、Void's Settings、Onboarding 第二/三页、状态条等）仍保持英文，造成明显的语言割裂。

## 目标

- 在现有 `react/src/i18n/` 框架基础上，将 Void 所有 React 岛屿的用户可见文案迁移为 `t(key)` 调用。
- 提供完整的 `zh-cn` / `en` 两份翻译表，默认 `zh-cn`，`Void.exe` 首启即全中文。
- 支持运行时切换语言（`useLocale`）且已有的 Onboarding 语言选择器可影响所有岛屿，无需重启。
- 语言选择持久化（已由 `localStorage['void-locale']` 支持）与 VSCode 原生 locale（`argv.json`）解耦，但在未设置时跟随 `product.defaultLocale`。

## 非目标

- **不**改动 VSCode 原生 NLS 运行时（`src/vs/base/node/nls.ts`、`windowImpl.ts`）。
- **不**重新实现完整 i18n 方案（如 ICU MessageFormat、复数、日期格式）；沿用当前 `t(key, ...args)` 简易占位符。
- **不**新增 `zh-cn` / `en` 之外的语言（预留扩展点即可）。
- **不**翻译第三方服务/供应商名称（Anthropic、OpenAI、Ollama、MCP、VSCode、Cursor、Windsurf 等）与代码标识符。
- **不**触碰 `product.json` 或 `builtInExtensions` 的中文语言包配置（已在 `introduce-zh-hans-language-pack` 等既有 change 中处理）。
- **不**涉及构建/打包脚本改造，语言清单走现有前端 bundle。

## 方案要点

1. **键位约定**：按岛屿 + 功能前缀组织，例如 `chat.placeholder`、`chat.suggestions.summarize`、`settings.nav.models`、`settings.models.title`、`settings.features.apply.desc`、`quickEdit.submit`、`warnings.addModel`。
2. **三步迁移**：
   - 抽取：按文件列出所有硬编码英文字符串与模板字符串（带参数的用占位符 `{0}/{1}`）。
   - 注入：在 `locales/en.ts` / `locales/zh-cn.ts` 的 `TranslationKeys` 中添加键值对，并更新 `types.ts` 的类型。
   - 替换：将 JSX 中的字符串替换为 `t('...')` 调用；动态拼接部分改成带参数的 `t`。
3. **共享组件改造**：`WarningBox`、`ErrorDisplay`、`ModelDropdown` 的 `emptyMessage` 等非组件内硬编码的文案改为接收 key，而不是接收最终字符串。
4. **语言切换同步**：现有 `localeListeners` 已能触发重渲染，无须改动；补齐 `VoidOnboarding` 外的 `Settings` 顶部也提供语言切换入口（可选，优先级次之）。
5. **回退策略**：`t()` 已对缺失键回退到英文，最终目标是 `zh-cn` 翻译覆盖率 100%。

## 影响范围

### 新增能力

- `void-ai-ui-i18n`：Void AI 编辑工具所有 React 岛屿的多语言能力；定义键位约定、默认 locale、切换与持久化规则、必须覆盖的文案清单。

### 修改能力

（`openspec/specs/` 当前为空，无既有能力需要修改 requirement。）

### 受影响代码

- `src/vs/workbench/contrib/void/browser/react/src/i18n/`：扩展 `en.ts` / `zh-cn.ts` / `types.ts`。
- `src/vs/workbench/contrib/void/browser/react/src/sidebar-tsx/SidebarChat.tsx`：Chat 侧边栏全部用户可见文案。
- `src/vs/workbench/contrib/void/browser/react/src/void-settings-tsx/Settings.tsx`：设置页导航、标题、说明、按钮、开关旁文案。
- `src/vs/workbench/contrib/void/browser/react/src/void-settings-tsx/ModelDropdown.tsx`、`WarningBox.tsx`：警告与空态文案。
- `src/vs/workbench/contrib/void/browser/react/src/void-onboarding/VoidOnboarding.tsx`：补齐页 2、页 3、AddProvidersPage、语言选择器之外尚未接入 `t()` 的段落。
- `src/vs/workbench/contrib/void/browser/react/src/quick-edit-tsx/QuickEdit.tsx`：Quick Edit 输入框与按钮。
- `src/vs/workbench/contrib/void/common/voidSettingsTypes.ts` 的 `displayInfoOfFeatureName` / `displayInfoOfSettingName` / `displayInfoOfProviderName`：返回值改为键（或在展示层用 `t()` 包一层），以避免把英文文案内嵌进 common 层。

### 验证

- 静态：`openspec validate localize-void-ai-ui` 通过。
- 静态：`grep` 审查上述文件不再出现 1+ 词的用户可见英文字符串（代码注释、标识符、URL、日志除外）。
- 动态：以 `--user-data-dir` 干净目录启动 `Void.exe`，观察 Onboarding / Chat / Void's Settings 三处默认全中文；切换到英文后全部变英文；刷新窗口后语言保持。
- 回归：原有 Chat / Settings / Onboarding 交互功能（发送消息、开关、模型选择、导入导出）不受影响。

## 风险与回滚

- **风险**：键位拆分过细导致翻译维护负担；`displayInfoOfFeatureName` 等返回纯字符串的工具函数改键需要多处调用方同步，改动面较大。
- **缓解**：分阶段 PR（SidebarChat → Settings → Onboarding → QuickEdit → 共享组件），每阶段独立可部署，未覆盖段落在 `t()` 缺键时自动回退英文，保证始终可用。
- **回滚**：i18n 为增量接入，`t('key')` 回退英文即可恢复旧行为；删除对应键或 revert 调用即可回滚。
