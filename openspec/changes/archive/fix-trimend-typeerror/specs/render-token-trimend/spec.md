# RenderToken trimEnd 修复（render-token-trimend）

## ADDED Requirements

### Requirement: RenderToken 代码块分支必须使用 tk 而非 t 访问 token 属性
`RenderToken` 组件在 `tk.type === 'code'` 分支中，所有 token 属性访问 SHALL 使用局部变量 `tk`（第 275 行定义），而非 i18n 翻译函数 `t`（第 18 行导入）。

#### Scenario: 代码块含语言标注时正确识别语言
- **WHEN** marked.js 解析出 `type='code'` 且 `lang` 非空的 token
- **THEN** `RenderToken` 使用 `tk.lang` 调用 `convertToVscodeLang`，不抛 TypeError

#### Scenario: 代码块已闭合时 Apply 按钮可用
- **WHEN** `isApplyEnabled=true` 且 token 的 `raw` 以 `` ``` `` 结尾
- **THEN** `tk.raw.trimEnd().endsWith('```')` 返回 `true`，Apply 按钮可点击，不抛 TypeError

#### Scenario: 代码块未闭合时 Apply 按钮禁用
- **WHEN** `isApplyEnabled=true` 且 token 的 `raw` 不以 `` ``` `` 结尾
- **THEN** `tk.raw.trimEnd().endsWith('```')` 返回 `false`，Apply 按钮禁用，不抛 TypeError
