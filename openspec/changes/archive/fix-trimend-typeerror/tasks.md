## 1. 代码修正

- [x] 1.1 修改 `ChatMarkdownRender.tsx` 第 305 行 `if (t.lang)` → `if (tk.lang)`
- [x] 1.2 修改 `ChatMarkdownRender.tsx` 第 306 行 `convertToVscodeLang(languageService, t.lang)` → `convertToVscodeLang(languageService, tk.lang)`
- [x] 1.3 修改 `ChatMarkdownRender.tsx` 第 313 行 `t.raw.trimEnd()` → `tk.raw.trimEnd()`

## 2. 构建与验证

- [x] 2.1 构建 React bundle 并复制到 out/ 目录
- [x] 2.2 重启 Void Dev，确认控制台无 `trimEnd` TypeError
- [x] 2.3 在聊天中发送含代码块的 AI 回复，验证代码块正常渲染、Apply 按钮可用
