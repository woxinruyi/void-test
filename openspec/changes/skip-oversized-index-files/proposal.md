# 优化：索引跳过超大文件（skip-oversized-index-files）

## 背景（深度审计发现）

`codeIndexService._walkFilesStream` 已用 `resolveMetadata: true`（`child.size` 可得），但**对任意大小的文件都 yield**，仅按 `DEFAULT_IGNORE` 名称过滤。一个大体积生成物/数据文件（非 `.min` 的打包 JS、巨型 JSON、生成代码）会被完整 AST 分块并嵌入 → 用低价值 chunk **污染检索**、拖慢索引、挤占 topK。

最佳实践（Cursor/Sourcegraph 代码索引）：跳过超过尺寸阈值的文件——手写源码极少 > 1MB。

## 目标

- 索引遍历跳过 `size > 1MB` 的文件，减少检索噪声、加快索引。

## 非目标

- 不改分块/嵌入/忽略名单逻辑。

## 方案

`_walkFilesStream` 在 `child.isFile` 分支加 `if (child.size > MAX_INDEX_FILE_BYTES) continue`（`MAX_INDEX_FILE_BYTES = 1_000_000`）。`child.size` 由 `resolveMetadata: true` 提供，零额外 IO。

## 影响范围

- `browser/codeIndexService.ts`（常量 + 一行 skip）。

## 验收标准

1. `npx tsc -p src/tsconfig.json --noEmit` 0 errors（`child.size` 类型可用）。
2. mocha 全量无回归。

## 状态

- **已执行（2026-06-14）**：遍历加尺寸 skip。tsc 0 errors。配合 [[improve-rag-hash-embedding]]/[[rag-relevance-floor]] 提升检索信噪比。
