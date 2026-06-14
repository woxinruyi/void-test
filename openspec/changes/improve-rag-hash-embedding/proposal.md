# 优化：提升 RAG 哈希嵌入的检索质量（improve-rag-hash-embedding）

## 背景（深度审计发现）

`codeIndexService` 的语义检索基座是**特征哈希嵌入**（FNV-1a，零外部依赖，非神经模型）。原 `EmbeddingService._hashEmbed` 仅 **unigram + word-bigram、各 token 等权**，存在两大检索质量短板：

1. **无词权重**：`const/return/function/import/value/result` 等高频样板 token 与判别性标识符**等权**，向量被样板淹没——查询稀有函数名时相关 chunk 被大量样板重叠挤下去。
2. **无子词匹配**：`tokenize` 按非字母数字切分，`getUserName` 是**单 token**，查询 `user name`（两 token）与其**零重叠**——而标识符查询正是编码场景最主要的检索类型。

VectorStore 为**内存态**（无持久化向量，每会话重建），故改嵌入**无迁移成本/兼容风险**。

## 目标

- 在保持"零外部依赖"前提下，按业界代码检索最佳实践补两条（对标 Sourcegraph/Zoekt 的 trigram 子词索引 + TF-IDF 思路）：
  - **停用词降权**：编程关键字/高频样板 token 降权（默认 0.15），让判别性标识符主导相似度。
  - **字符 trigram 子词特征**：标识符内子词可被自然语言查询命中（`user name` ↔ `getUserName`）。
- 用**可复现指标**（MRR、Recall@3）证明改进，且不劣化非标识符类查询。

## 非目标

- 不引入 ONNG/神经嵌入或外部模型（保持零依赖；留作后续 `swap-in-onnx-embedding`）。
- 不改分块（AST chunker）、Merkle 增量、ripgrep 回退、VectorStore 接口。

## 方案

新增纯模块 `common/helpers/hashEmbed.ts`：`hashEmbed(text, {dims, stopWeight, charNgrams})`、`hashEmbedBaseline`（仅评测对比）、`cosineSimilarity`、`tokenizeForEmbed`、`STOP_TOKENS`。`codeIndexService` 的 `EmbeddingService.embed/embedBatch` 与 `VectorStore` 余弦改为调用该模块（删除随之孤立的 `_hashEmbed/_tokenize/_fnv1a/_cosineSimilarity`）。查询与 chunk 走同一 `embed`，对称一致。

## 影响范围

- 新增 `common/helpers/hashEmbed.ts`。
- `browser/codeIndexService.ts`（import + 委托 + 删除孤立私有方法）。
- 测试：`test/eval/embedRetrievalEval.ts`（MRR/Recall 对比）+ `test/common/hashEmbed.test.ts`（5）。

## 验收标准（指标驱动）

合成代码语料（10 chunk）+ 代表性查询（8，含 4 标识符/子词类），MRR + Recall@3 对比 baseline vs improved：

1. improved MRR ≥ baseline（全部查询）。
2. improved Recall@3 ≥ baseline（全部查询）。
3. improved MRR **严格 >** baseline（标识符/子词类）。
4. `npx tsc -p src/tsconfig.json --noEmit` 0 errors；mocha 全量无回归。

**实测**：全部查询 MRR 0.698→**0.917**、Recall@3 0.875→**1.000**；标识符/子词类 MRR 0.688→**1.000**、Recall@3 0.750→**1.000**。

## 状态

- **已执行（2026-06-14）**：纯模块 + 委托 + eval（3 项断言达标）+ mocha(5)。tsc 0 errors。
- **后续可选**：`swap-in-onnx-embedding`（all-MiniLM-L6-v2）、`persist-vector-store`（sqlite-vec）、真 TF-IDF（需两遍索引或冻结 IDF）。
