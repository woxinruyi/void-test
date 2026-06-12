# 修复：RenderToken 中 trimEnd TypeError（fix-trimend-typeerror）

## 背景

`ChatMarkdownRender.tsx` 的 `RenderToken` 组件在渲染代码块时崩溃，报 `TypeError: Cannot read properties of undefined (reading 'trimEnd')`。根因是 i18n 导入的翻译函数 `t`（第 18 行）与 token 局部变量 `tk`（第 275 行）命名冲突——代码块分支中第 305/306/313 行误用 `t.lang` / `t.raw` 代替 `tk.lang` / `tk.raw`，导致 `t.raw`（函数对象无 `raw` 属性）为 `undefined`，调用 `trimEnd()` 立即抛错。此 bug 阻断了 AI 生成代码的 Apply 功能和代码块渲染。

## 方案

- 将 `ChatMarkdownRender.tsx` 第 305、306、313 行的 `t.` 修正为 `tk.`，恢复对 token 属性的正确访问
- 无其他逻辑变更，无 API 变更

## 能力

### New Capabilities

（无新增能力）

### Modified Capabilities

（无既有能力的需求变更）

## 影响

- **受影响文件**：`src/vs/workbench/contrib/void/browser/react/src/markdown/ChatMarkdownRender.tsx`（3 行修正）
- **受影响功能**：AI 聊天消息中的代码块渲染、Apply 按钮、文件创建/修改提示
- **无破坏性变更**：仅修正变量名引用，行为恢复到 i18n 导入前的正确状态

## Non-goals / 非目标

- 不重构 `RenderToken` 组件结构
- 不修改 i18n 函数 `t` 的命名或导入方式
- 不涉及 `editCodeService.ts` 或其他服务的逻辑
