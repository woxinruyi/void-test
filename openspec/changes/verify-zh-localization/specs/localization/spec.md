# 中文本地化能力（localization）

## ADDED Requirements

### Requirement: 构建产物必须默认加载简体中文

Windows 本地构建产物（`VSCode-win32-x64/` 目录与其打包成的 `VSCodeSetup.exe`）在**干净 `user-data-dir`** 下启动时，系统 SHALL 默认以简体中文（`zh-cn`）加载 Workbench 界面；`product.json` 中 `defaultLocale` 字段 MUST 等于 `zh-cn`，内建扩展中 MUST 包含 `vscode-language-pack-zh-hans`（或等价语言包）。

#### Scenario: 静态核对 product.json

- **WHEN** 验收脚本读取 `I:\自动化执行\VSCode-win32-x64\resources\app\product.json`
- **THEN** JSON 中 `defaultLocale` 字段等于 `zh-cn`
- **AND** `nameShort`、`nameLong` 与仓库一致

#### Scenario: 静态核对语言包

- **WHEN** 验收脚本枚举 `resources\app\extensions\` 目录
- **THEN** 存在 `vscode-language-pack-zh-hans`（或仓库自定义等价目录）
- **AND** 该目录 `package.json` 的 `contributes.localizations` 至少包含 `languageId=zh-cn` 项

#### Scenario: 静态核对 NLS 翻译内容

- **WHEN** 验收脚本读取 `resources\app\out\nls.messages.json`（或同目录 `zh-cn` 变体）
- **THEN** 文件大小 > 0
- **AND** 在全文中匹配到核心中文关键字（“文件”“编辑”“视图”“终端”“帮助”）中至少 4 个

#### Scenario: 动态启动验收

- **WHEN** 在临时空目录 `user-data-dir` 下启动 `Void.exe --user-data-dir=<temp> --new-window`
- **THEN** 进程在 10 秒内不崩溃
- **AND** 其 `logs\` 下日志出现 `zh-cn` 或 `zh-hans` 相关 locale 选择记录
- **AND** 未出现 `Failed to load nls` 类致命错误

### Requirement: 验收结论必须可追溯

每一次中文化最终验收 MUST 产生一份结构化记录，列出每个 Scenario 的通过/不通过判定、证据路径、证据摘录，便于后续回归与审计。

#### Scenario: 验收记录落盘

- **WHEN** 验收脚本结束
- **THEN** 生成 `文档/temp-中文化最终验收记录.md` 与 `文档/temp-中文化最终验收记录.json`
- **AND** 记录中包含每项 Scenario 的：判定（通过/不通过）、证据路径、证据片段、时间戳
