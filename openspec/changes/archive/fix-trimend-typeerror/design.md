## 背景

`ChatMarkdownRender.tsx` 的 `RenderToken` 组件负责将 marked.js 解析出的 token 渲染为 React 节点。组件在第 275 行将 `token` 参数赋给局部变量 `tk`：

```ts
const tk = token as MarkedToken
```

但在代码块分支（`tk.type === 'code'`）中，第 305/306/313 行误用了 `t`（第 18 行导入的 i18n 翻译函数）代替 `tk`：

- 第 305 行：`if (t.lang)` → 应为 `if (tk.lang)`
- 第 306 行：`convertToVscodeLang(languageService, t.lang)` → 应为 `tk.lang`
- 第 313 行：`t.raw.trimEnd().endsWith('```')` → 应为 `tk.raw.trimEnd()`

`t` 是函数，`t.raw` 和 `t.lang` 均为 `undefined`，导致 `trimEnd()` 抛 TypeError，React 错误边界捕获后重建组件树，但问题持续复现。

## 目标 / 非目标

**Goals:**
- 修正 3 处 `t.` → `tk.` 的变量名引用，恢复代码块渲染和 Apply 功能
- 保持 i18n 导入不变，不引入额外风险

**Non-Goals:**
- 不重命名 i18n 函数 `t` 或调整其导入方式
- 不重构 `RenderToken` 组件结构
- 不修改 `editCodeService` 或其他服务

## 决策

**决策 1：直接修正 `t.` → `tk.`（而非重命名 i18n 函数）**
- 理由：最小改动原则，3 行修正即可恢复功能
- 备选方案：将 `import { t }` 改为 `import { t as i18n }`，可避免未来同类冲突，但影响范围更大（所有使用 `t()` 的地方都需修改），非必要

**决策 2：不添加防御性空值检查**
- 理由：`tk` 在第 277 行已通过 `tk.raw.trim()` 验证存在，后续访问 `tk.lang` 和 `tk.raw` 安全；添加 `?.` 会掩盖真实错误

## 风险 / 权衡

- **[风险] 未来再次引入同名变量冲突** → 缓解：修正后代码中 `t`（i18n）和 `tk`（token）共存，语义清晰；若后续新增 i18n 调用点需注意区分
- **[风险] 其他文件是否存在同类 `t` vs `tk` 误用** → 缓解：已全局搜索 `trimEnd`，仅此 3 处受影响；其他文件无类似模式
