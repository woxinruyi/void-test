# 评估提案：引入 ONNX 语义嵌入替换哈希嵌入（swap-in-onnx-embedding）

> **可行性/设计评估**（非实现）。结论：**推荐采纳**，走 **WASM(transformers.js) + Web Worker + 模型随包/懒下载 + 哈希兜底** 路线；附 go/no-go 条件。

## 1. 现状与动机

当前 `codeIndexService` 的嵌入是 **FNV-1a 特征哈希**（[[improve-rag-hash-embedding]] 已补停用词降权 + 字符 trigram，MRR 0.698→0.917）。但哈希嵌入的本质天花板是 **词面/子词重叠**，无法捕捉**语义/释义**：查询 `"how to log in a user"` 与代码 `authenticateUser(credentials)` 词面几乎不重叠 → 仍会漏检。真正"领先开源最佳实践"（Cursor/Sourcegraph Cody/Continue）的语义检索都用**神经句向量**。

`all-MiniLM-L6-v2` 是业界标配的轻量句向量模型：**输出 384 维 —— 与现有 `DIMS=384` 完全一致**，~22M 参数，int8 量化 ONNX ~23MB。

## 2. 关键发现：本仓已有"进程内跑 ML 模型"的成熟先例

**这是本评估推荐采纳的核心依据**——无需从零趟坑：

1. **运行时**：`@vscode/vscode-languagedetection`（已是依赖）用 **TensorFlow.js** 在 **Web Worker** 内跑模型（`languageDetectionWebWorker.ts:141-170`），`modelJsonLoaderFunc`/`weightsLoaderFunc` 通过 `fetch(hostUri)` 加载权重。ONNX 嵌入器可**直接复刻该架构**（worker + fetch 权重）。
2. **打包**：`build/.webignore:43` 显式 `!@vscode/vscode-languagedetection/model/**` 把模型目录纳入包；tree-sitter 的 `.wasm` 同理选择性纳入（`.moduleignore`）。**模型资产随包发布的机制已存在**。
3. **离线**：模型随包 = 离线可用，无需运行时联网（符合桌面 IDE 预期）。

## 3. 集成点（极小面）

- **唯一替换点**：`EmbeddingService.embed/embedBatch`（`codeIndexService.ts:412/416`，仅 3 处调用全走此抽象）。`VectorStore`、余弦、topK、chunker、Merkle、相关性下限**全部不动**（384 维对齐）。
- **兜底**：保留 `hashEmbed` 为降级层——模型未就绪/加载失败/平台不支持时回退哈希（且已有 ripgrep 兜底），**零功能回退风险**。
- **分层策略（推荐）**：哈希索引**即时可用**（秒级），ONNX 索引**后台构建**，就绪后切换 `state`。用户始终有可用检索，质量渐进提升。

## 4. 路线对比与推荐

| 维度 | A. onnxruntime-node（原生） | **B. transformers.js / onnxruntime-web（WASM）✅推荐** |
|---|---|---|
| 打包 | 每平台预编译 `.node`、node-gyp、Inno Setup 需带二进制 | 纯 JS+WASM，跨平台单份，复用 `.webignore` 机制 |
| 与本仓先例 | 无 | **与 languagedetection 架构同构** |
| 加速 | CPU/CUDA | WASM SIMD（Electron 34 亦支持 WebGPU，未来可选） |
| 风险 | 原生 ABI 跟 Electron 34 绑定、签名/公证复杂 | WASM 与 Electron 解耦，风险低 |
| 推理速度 | 略快 | 稍慢但足够（batch + worker 摊薄） |

**推荐 B**：风险/打包成本显著低，且与本仓既有 ML 先例同构。

## 5. 风险与缓解

| 风险 | 评估 | 缓解 |
|---|---|---|
| 包体 +23~90MB | int8 量化 ~23MB；或**首次索引时懒下载**（offline 换体积） | 默认随包 int8；提供"按需下载 fp32 高精度"开关 |
| 冷启动 0.5~2s + WASM init | 一次/会话、在 worker | 懒加载、与后台索引并行 |
| 全量索引变慢（神经推理 ~5~20ms/chunk，万级 chunk 可能数分钟） | 哈希近即时，ONNX 慢 | 分层（哈希先用）、batch、worker、`sqlite-vec` 持久化避免每会话重算（见 [[persist-vector-store]]） |
| chunk 超模型 256 token 上限（`MAX_CHUNK_CHARS=2000`≈500 token） | 尾部被截断丢信息 | AST chunk 多为函数级（常 <256 token）；超长 chunk 做窗口均值池化 |
| 新增依赖 `@huggingface/transformers` | npm 体积/审计 | 锁版本、license 审计（Apache-2.0 系） |
| 跨平台非比特一致 | 余弦检索不敏感 | 同机自洽即可（query 与 chunk 同模型） |

## 6. 验证方法（指标驱动，复用现有 harness）

1. **检索质量**：扩展 `test/eval/embedRetrievalEval.ts`——新增**释义/语义类**查询（词面不重叠），三方对比 `hashEmbedBaseline` / `hashEmbed(改进)` / `onnx`，指标 MRR、Recall@3、nDCG。**预期 ONNX 在语义类查询显著领先**（哈希在此类近乎失败）。
2. **性能基线**：单 chunk / batch=32 推理延迟、冷启动、万 chunk 全量索引耗时；与哈希对比并设回归阈值。
3. **兜底正确性**：模型缺失/加载失败 → 自动回退 `hashEmbed`，`state` 正确，检索仍可用（mocha）。
4. **打包冒烟**：产物含模型资产、离线可索引可检索。
5. `tsc` 0 errors + mocha 全量无回归。

## 7. 分阶段落地（建议）

- **P0（本评估）**：方案/风险/验证定稿 ← 当前。
- **P1**：worker + transformers.js 加载 all-MiniLM-L6-v2（int8），`EmbeddingService` 接 ONNX + 哈希兜底，384 维直连 VectorStore；扩展 eval 出语义类指标。
- **P2**：`sqlite-vec` 持久化（[[persist-vector-store]]）避免每会话重算；分层即时哈希→后台 ONNX 切换。
- **P3（可选）**：WebGPU 加速、按需下载高精度模型、重排序（cross-encoder rerank top-k）。

## 8. Go / No-Go 结论

**Go（推荐采纳，走 B 路线）**，条件：
1. 接受 **+~23MB 包体**（int8 随包）或采纳**懒下载**；
2. 接受**全量索引耗时上升**（用分层 + 持久化缓解）；
3. P1 的 eval **语义类查询 ONNX 须显著优于哈希**（否则不值引入依赖，回退仅保留哈希改进）。

**No-Go 触发**：若团队要求纯离线**且**严格控包体且拒绝懒下载，则维持哈希改进版（已达"对标"，未达"语义领先"），将本提案挂起。

## 状态

- **评估完成（2026-06-14）**。结论 **Go/B 路线**，待人工拍板包体策略（随包 int8 vs 懒下载）与 P1 排期后实施。集成面极小（仅 `EmbeddingService` 两方法，384 维天然对齐），架构有本仓 languagedetection 先例，风险可控。
