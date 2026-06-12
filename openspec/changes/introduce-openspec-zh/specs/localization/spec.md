# 中文本地化能力（localization）

## ADDED Requirements

### Requirement: OpenSpec 产出物默认使用简体中文

当开发者在本仓库通过 OpenSpec（`openspec new change`、`/opsx-propose`、`openspec update` 等）创建或刷新任何产出物时，系统 SHALL 默认以**简体中文（zh-CN）**撰写正文、标题、任务条目与场景描述；AI 生成产出物时 MUST 遵循 `openspec/config.yaml` 中 `context` 与 `rules` 的中文化约束。

#### Scenario: 通过 CLI 创建新 change

- **WHEN** 开发者执行 `openspec new change <kebab-case-id> --description "<中文描述>"`
- **THEN** 在 `openspec/changes/<kebab-case-id>/` 下生成的 `README.md` 首行中文标题使用 `--description` 提供的中文内容
- **AND** 后续由 AI 生成的 `proposal.md`、`tasks.md`、`design.md` 正文使用简体中文
- **AND** change 目录名本身保持 kebab-case ASCII（CLI 强约束，不可违反）

#### Scenario: 通过 Windsurf 斜杠命令创建 proposal

- **WHEN** 开发者在 Windsurf 中触发 `/opsx-propose "<中文一句话描述>"`
- **THEN** AI 根据 `openspec/config.yaml` 的 `context` 与 `rules`，生成的 `proposal.md` 必须包含中文的“背景”“目标”“非目标”“方案”“影响”等章节
- **AND** `tasks.md` 中任务动词使用“新增/修改/删除/校验/验证”等中文动词
- **AND** `design.md` 仅对技术术语（API、NLS、Inno Setup 等）保留英文

#### Scenario: 技术术语保持英文

- **WHEN** AI 在生成中文产出物过程中涉及代码、路径、命令、技术缩写
- **THEN** 技术术语（TypeScript、VSCode、Electron、Open VSX、Gulp、NLS 等）保留英文原样
- **AND** 文件路径（如 `build/gulpfile.vscode.win32.js`）、命令行示例（如 `npm run compile-build`）保持英文
- **AND** 代码标识符（变量名、函数名、类名）保持英文

### Requirement: change 与 capability 目录命名遵守 kebab-case ASCII

由于 OpenSpec CLI 对目录名存在硬校验（仅允许 lowercase + 数字 + 连字符），所有 `openspec/changes/<change-id>/` 与 `openspec/specs/<capability>/` 目录名 MUST 使用 kebab-case ASCII；中文语境 SHALL 通过文档内部的中文标题与 `README.md` 首行标题提供。

#### Scenario: 使用中文目录名会被 CLI 拒绝

- **WHEN** 开发者尝试执行 `openspec new change 引入-openspec-中文化`
- **THEN** CLI 抛出错误 `Change name can only contain lowercase letters, numbers, and hyphens` 并退出
- **AND** 开发者必须改用 ASCII 名称（例如 `introduce-openspec-zh`）

#### Scenario: capability 目录名遵守同样约定

- **WHEN** 在 change 目录下创建 `specs/<capability>/spec.md`
- **THEN** `<capability>` 使用 kebab-case ASCII（例如 `localization`、`build-pipeline`）
- **AND** `spec.md` 首行使用中文能力名称，例如 `# 中文本地化能力（localization）`
