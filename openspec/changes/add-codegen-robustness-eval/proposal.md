# 新增：Codegen 链路鲁棒性确定性评测（add-codegen-robustness-eval）

## 背景

`optimize-agent-loop` 与 `optimize-codegen-llm-pipeline` 两份提案的多数 P0 优化**已落地**到源码：

- 工具结果中间截断 `truncateMiddle()`、`MAX_FILE_CHARS_PAGE=40_000`、`MAX_TERMINAL_CHARS=20_000`（`prompt/prompts.ts`）。
- SEARCH 块**容差匹配**回退链：精确 → 去空白（带唯一性校验）→ 行级模糊（`editCodeService.ts` 内 `findTextInCode` + `fuzzyFindLines` 等）。
- SEARCH/REPLACE 流式解析状态机 `extractSearchReplaceBlocks()`（`helpers/extractCodeFromResult.ts`）。

但这些改动**没有任何可量化的回归基准**——两份提案 tasks.md 中"记录基线 / CDP 验证"项均未勾选。改 System Prompt、调匹配阈值、动截断常量后，只能凭"感觉"判断有没有变好/有没有回退。`add-eval-harness` 提案面向 Agent 端到端质量（需真实 LLM、耗 token、有抖动），无法覆盖这些**纯函数级、确定性**的鲁棒性弱点。

## 目标

- 为 codegen 链路的**纯函数**建立确定性评测：容差匹配召回、误匹配安全性、块解析、结果截断。
- 定义明确的**指标分组与阈值（评定方式）**，可一条命令跑出报告并以退出码表达达标与否，便于 CI / pre-commit 与人工对比改动前后。
- 不依赖 LLM、不耗 token、无网络、毫秒级完成、零抖动。

## 非目标

- 不替代 `add-eval-harness`（端到端 Agent 质量评测）；二者互补：本提案管"链路零件正确性"，那份管"整机表现"。
- 不改变任何匹配/截断/解析的**行为**（仅为可测性做手术式抽取 + 新增测试）。
- 不引入新依赖（复用现有 mocha `test-node` 基建；harness 用仓库已有的 `tsx`）。

## 方案概述

1. **手术式抽取**：将 `editCodeService.ts` 中的纯匹配逻辑（`numLinesOfStr` / `removeWhitespaceExceptNewlines` / `normalizeLine` / `lineSimilarity` / `fuzzyFindLines` / `findTextInCode`）原样移到 `common/helpers/findTextInCode.ts` 并导出；`editCodeService.ts` 改为 `import` 复用。这些函数零浏览器依赖，移动后可在 node 下直测——这是让"第一失败源"可回归的前提。
2. **确定性 harness**：`test/eval/codegenRobustnessEval.ts`，对构造用例（空格/缩进/CRLF/模糊/不存在/重复/严格模式 + 块解析 + 截断）打分，输出分组报告，硬指标未达标则退出码 1。
3. **mocha 固化**：`test/common/codegenRobustness.test.ts` 把同一套用例纳入 `npm run test-node` 回归。

## 指标与评定方式

| 指标组 | 含义 | 阈值（硬指标）|
|---|---|---|
| RECALL_TOLERANT | 精确 / 尾随空格 / 缩进(Tab↔空格) / CRLF↔LF 变体命中正确行区间 | 100% |
| RECALL_FUZZY | 行内注释/小改动经行级模糊回退命中 | 100% |
| SAFETY | 不存在块→Not found；严格模式拒绝空白变体；去空白重复→Not unique | 100%（误匹配零容忍）|
| PARSE | SEARCH/REPLACE 单块/多块/流式部分块解析正确 | 100% |
| TRUNCATE | 短文本原样；长文本保首尾 + 截断标记 + 长度收缩 | 100% |

## 影响范围

- 新增 `common/helpers/findTextInCode.ts`（纯函数，导出）。
- 修改 `browser/editCodeService.ts`（删除已移走的本地定义，改 import；行为不变，3 处调用点不变）。
- 新增 `test/eval/codegenRobustnessEval.ts`、`test/common/codegenRobustness.test.ts`。

## 验收标准

1. `npx tsx .../test/eval/codegenRobustnessEval.ts` 输出五组指标报告，全部硬指标 100%，退出码 0。
2. `npx tsc -p src/tsconfig.json --noEmit` 0 errors（抽取未破坏类型 / 调用点）。
3. `editCodeService` 的 Apply / Fast Apply 行为与抽取前一致（匹配函数为原样搬运）。
4. 报告可用于对比：任何改动后重跑，分组通过率即为"改没改坏"的客观依据。
