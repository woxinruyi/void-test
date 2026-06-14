# 优化：语义检索加相关性下限，裁掉噪声（rag-relevance-floor）

## 背景（深度审计发现）

`semantic_search` 工具（`toolsService.ts:907`）直接返回 `codeIndexService.search` 的 topK 结果，**不设相关性下限**。`VectorStore.search` 按 cosine 降序取 topK——当代码库**无相关内容**时，仍返回 topK 个"最不相关"的 chunk，被当作匹配灌给智能体 → 污染上下文、误导推理（"看起来检索到了，其实是噪声"）。

最佳实践（检索增强）：对 agentic 上下文**重精确率**，设相关性下限，宁可返回更少/为空，也不返回噪声。

## 目标

- 给语义检索结果加**保守**的相关性下限（绝对 + 相对），只裁近正交噪声与远低于最佳匹配的长尾，保留真实弱匹配。

## 非目标

- 不改向量检索/嵌入/topK 上限本身。
- 不做激进过滤（避免误伤真实弱匹配）；阈值取保守值。

## 方案

新增纯函数 `common/helpers/retrievalFilter.ts`：`filterByScoreFloor(results, minAbsolute=0.05, minRelative=0.2)`，保留 `score >= max(minAbsolute, minRelative * topScore)`；空输入或最高分 ≤0 → 空。`semantic_search` 工具对 `codeIndexService.search` 结果套用该过滤后再返回（`totalMatches` 随之反映真实匹配数）。

## 影响范围

- 新增 `common/helpers/retrievalFilter.ts`。
- `browser/toolsService.ts`（semantic_search 套用过滤 + import）。
- 测试：`test/common/retrievalFilter.test.ts`（5）。

## 验收标准

1. 空输入→空；全噪声(<绝对下限)→全裁；高分保留、长尾按相对下限裁；最高分≤0→空；自定义下限生效。
2. `npx tsc -p src/tsconfig.json --noEmit` 0 errors；mocha 全量无回归。

## 状态

- **已执行（2026-06-14）**：纯函数 + 工具套用 + mocha(5)。tsc 0 errors。配合 [[improve-rag-hash-embedding]] 一起提升检索精确率。
