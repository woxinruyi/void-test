# 修复：SEARCH/REPLACE 块解析的 CRLF 兼容（add-searchreplace-crlf）

## 背景

`common/helpers/extractCodeFromResult.ts` 的 `extractSearchReplaceBlocks` 用 `ORIGINAL+'\n'` / `'\n'+DIVIDER+'\n'` 作标记、以 `indexOf` 定位。模型若输出 **CRLF**（`<<<<<<< ORIGINAL\r\n …`），这些以 `\n` 结尾的标记全部 `indexOf` 落空 → **整次 SEARCH/REPLACE 解析失败、所有块丢失**，Apply/Fast Apply 直接失败。Windows 环境、CRLF 文件、或模型偶发 CRLF 输出都会触发，是隐蔽的编辑失败源。

## 目标

- 让块解析对 CRLF 输出鲁棒：解析前将 `\r\n` 归一为 `\n`。
- 不回退 LF 行为（归一对 LF 输入是恒等变换）。

## 非目标

- 不改应用阶段 EOL 处理：`orig` 用于 `findTextInCode` 定位（已对行尾差异容差）；`final` 写入由文本模型按文件 EOL 处理。
- 不改标记常量或解析状态机结构。

## 方案

`extractSearchReplaceBlocks` 入口加一行 `str = str.replace(/\r\n/g, '\n')`。归一后 `orig`/`final` 为 LF；定位经 `findTextInCode` 的去空白/行级容差匹配兼容 CRLF 文件。

## 影响范围

- 修改 `common/helpers/extractCodeFromResult.ts`（一行）。
- 测试：`add-codegen-robustness-eval` 的 harness/单测 PARSE 组新增 "CRLF 块完整解析" 用例。

## 验收标准

1. CRLF 输入的完整块被解析为 `{state:'done', orig, final}`（与等价 LF 输入一致）。
2. 既有 LF 单块/多块/流式用例零回归。
3. 确定性 harness PARSE 组 4/4；`npx tsc -p src/tsconfig.json --noEmit` 0 errors。

## 状态

- **已执行（2026-06-13）**：一行归一 + PARSE 组 CRLF 用例（harness 14/14、mocha 已加）。
