# 设计说明（add-code-index）

## 一、方案总览

```
┌──────────────────────────────────────────────────────────────────────┐
│                    代码语义索引系统架构                                │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌────────────────────────────────────────────────────────────┐      │
│  │                 CodeIndexService（编排层）                   │      │
│  │                                                            │      │
│  │  ├─ 索引生命周期管理（启动/停止/重建）                       │      │
│  │  ├─ 协调分块 → 嵌入 → 存储                                 │      │
│  │  ├─ 定时增量同步（5 分钟间隔）                              │      │
│  │  └─ 暴露 search() 方法供 ToolsService 调用                 │      │
│  └────────────────────────────────────────────────────────────┘      │
│         │              │              │              │                 │
│         ↓              ↓              ↓              ↓                 │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐        │
│  │ CodeChunker │ │ Embedding  │ │ VectorStore│ │ MerkleTree │        │
│  │            │ │ Service    │ │            │ │            │         │
│  │ tree-sitter│ │ ONNX RT    │ │ SQLite +   │ │ 文件哈希树 │        │
│  │ AST 分块   │ │ MiniLM     │ │ sqlite-vec │ │ 变更检测   │        │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘        │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────┐      │
│  │                 semantic_search 工具                        │      │
│  │  query → 嵌入 → 向量搜索 → Top-K → 读取代码片段 → 返回    │      │
│  └────────────────────────────────────────────────────────────┘      │
│                                                                      │
│  数据存储：.void/index/                                               │
│    ├─ index.db          (SQLite + sqlite-vec 向量索引)               │
│    ├─ merkle.json       (Merkle Tree 快照)                           │
│    └─ embedding_model/  (ONNX 模型文件)                              │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

## 二、关键决策

### 决策 1：本地优先架构（Local-First）

所有数据和处理均在本地完成：
- 嵌入模型本地运行（ONNX Runtime WASM）
- 向量存储本地 SQLite
- 源码不离开用户机器

**替代方案**：远程嵌入 API（如 OpenAI Embeddings API）+ 远程向量库（如 Turbopuffer）
**否决原因**：源码隐私风险，网络延迟，依赖外部服务可用性

### 决策 2：嵌入模型选型 — all-MiniLM-L6-v2

| 维度 | all-MiniLM-L6-v2 | all-MiniLM-L12-v2 | bge-small-en-v1.5 |
|------|-------------------|--------------------|--------------------|
| 维度 | 384 | 384 | 384 |
| 模型大小 | ~23MB | ~33MB | ~33MB |
| 推理速度 | 快 | 中 | 中 |
| 代码搜索质量 | 良好 | 较好 | 良好 |

选择 all-MiniLM-L6-v2：模型小、推理快、质量可接受。后续可切换为更大的模型或专用代码嵌入模型（如 Nomic Embed Text）。

### 决策 3：向量存储选型 — SQLite + sqlite-vec

| 维度 | SQLite + sqlite-vec | LanceDB | Chroma |
|------|---------------------|---------|--------|
| 部署方式 | 嵌入式，零配置 | 嵌入式 | 需服务端 |
| 依赖 | 仅 SQLite 扩展 | Rust native 模块 | Python |
| 性能 | 万级向量足够 | 优秀 | 优秀 |
| Electron 兼容 | ✅ 原生支持 | ⚠️ 需 native 编译 | ❌ |

选择 SQLite + sqlite-vec：VSCode/Electron 已内置 SQLite 支持，sqlite-vec 是纯 C 扩展，兼容性最好。

### 决策 4：分块策略 — AST 感知 + Token 限制

- 使用 tree-sitter 解析源码为 AST
- 按顶层节点（函数声明、类声明、方法、import 块等）分块
- 每块 Token 上限 512（约 2000 字符），超出时按子节点拆分
- 每块附带元数据：`filePath`、`startLine`、`endLine`、`language`、`symbolName`、`symbolKind`

**降级策略**：当 tree-sitter 语法不可用时，按空行 + Token 限制进行朴素分块。

### 决策 5：增量更新 — Merkle Tree

- 为工作区构建文件哈希树（SHA-256）
- 每 5 分钟扫描变更（对比 Merkle Tree 叶节点哈希）
- 仅重新索引哈希变化的文件（删除旧嵌入 → 重新分块 → 重新嵌入）
- 新文件自动索引，删除文件自动清理

### 决策 6：索引数据存放位置

索引数据存放在工作区根目录下的 `.void/index/`：
- 与 `.voidrules` 同级，语义一致
- 可通过 `.voidignore` 排除路径
- `.void/index/` 自动加入 `.gitignore`（不提交到版本控制）

## 三、核心服务设计

### 3.1 CodeChunker

```typescript
interface CodeChunk {
  id: string              // 唯一标识（filePath:startLine:endLine 的哈希）
  filePath: string        // 文件路径
  startLine: number       // 起始行（1-indexed）
  endLine: number         // 结束行
  content: string         // 代码块文本
  language: string        // 语言标识
  symbolName?: string     // 符号名（如函数名/类名）
  symbolKind?: string     // 符号类型（function/class/method/variable）
  tokenCount: number      // 近似 Token 数
}

interface ICodeChunker {
  chunkFile(filePath: string, content: string, language: string): CodeChunk[]
}
```

### 3.2 EmbeddingService

```typescript
interface IEmbeddingService {
  // 初始化：加载 ONNX 模型
  initialize(): Promise<void>
  
  // 为文本生成嵌入向量
  embed(text: string): Promise<Float32Array>  // 384 维
  
  // 批量嵌入
  embedBatch(texts: string[]): Promise<Float32Array[]>
  
  // 模型是否已就绪
  isReady(): boolean
}
```

### 3.3 VectorStore

```typescript
interface ChunkMetadata {
  id: string
  filePath: string
  startLine: number
  endLine: number
  language: string
  symbolName?: string
  symbolKind?: string
}

interface SearchResult {
  metadata: ChunkMetadata
  score: number        // 余弦相似度 [0, 1]
  content: string      // 代码块文本（从本地文件读取）
}

interface IVectorStore {
  // 初始化/打开数据库
  open(dbPath: string): Promise<void>
  
  // 插入嵌入 + 元数据
  insert(embedding: Float32Array, metadata: ChunkMetadata): Promise<void>
  
  // 批量插入
  insertBatch(items: { embedding: Float32Array, metadata: ChunkMetadata }[]): Promise<void>
  
  // 搜索 Top-K
  search(queryEmbedding: Float32Array, topK: number, filter?: { language?: string, filePath?: string }): Promise<SearchResult[]>
  
  // 删除指定文件的所有嵌入
  deleteByFilePath(filePath: string): Promise<void>
  
  // 获取所有已索引文件路径
  getIndexedFiles(): Promise<string[]>
  
  // 关闭数据库
  close(): Promise<void>
}
```

### 3.4 MerkleTree

```typescript
interface MerkleNode {
  hash: string          // SHA-256 哈希
  filePath?: string     // 叶节点有，内部节点无
  children?: MerkleNode[]
}

interface IMerkleTree {
  // 从工作区构建完整 Merkle Tree
  build(workspaceRoot: string, ignorePatterns: string[]): Promise<MerkleNode>
  
  // 对比两棵树，返回变更文件列表
  diff(oldTree: MerkleNode, newTree: MerkleNode): { added: string[], modified: string[], deleted: string[] }
  
  // 保存/加载快照
  saveSnapshot(tree: MerkleNode, path: string): Promise<void>
  loadSnapshot(path: string): Promise<MerkleNode | null>
}
```

### 3.5 CodeIndexService（编排层）

```typescript
interface ICodeIndexService {
  // 索引状态
  readonly state: 'idle' | 'indexing' | 'ready' | 'error'
  readonly indexedFileCount: number
  readonly indexedChunkCount: number
  
  // 启动索引（首次或重建）
  startIndexing(workspaceRoot: string): Promise<void>
  
  // 增量更新
  incrementalUpdate(): Promise<void>
  
  // 语义搜索
  search(query: string, topK: number, filter?: { language?: string, searchInFolder?: string }): Promise<SearchResult[]>
  
  // 停止索引
  stop(): void
}
```

## 四、semantic_search 工具设计

### 4.1 工具参数

```typescript
'semantic_search': {
  query: string                    // 语义查询文本
  maxResults: number               // 最大返回结果数（默认 10，上限 20）
  searchInFolder: URI | null       // 可选，限制搜索范围
}
```

### 4.2 工具结果

```typescript
'semantic_search': {
  results: {
    uri: URI                       // 文件 URI
    startLine: number              // 代码块起始行
    endLine: number                // 代码块结束行
    score: number                  // 相似度分数
    snippet: string                // 代码块文本
    symbolName?: string            // 符号名
    symbolKind?: string            // 符号类型
  }[]
  totalMatches: number             // 总匹配数
  indexStatus: string             // 索引状态提示
}
```

### 4.3 审批类型

```typescript
'semantic_search': 'none'  // 只读操作，无需审批
```

### 4.4 提示描述

```typescript
semantic_search: {
  name: 'semantic_search',
  description: `Search your codebase using natural language. Unlike search_for_files which matches exact strings or regex, this tool understands the semantic meaning of your query and returns the most relevant code blocks. Use this when you want to find code related to a concept (e.g., "authentication flow", "error handling", "database connection") rather than a specific string.`,
  params: {
    query: { description: 'Your search query in natural language. Describe what you are looking for conceptually.' },
    max_results: { description: 'Optional. Maximum number of results to return. Default is 10, maximum is 20.' },
    search_in_folder: { description: 'Optional. Limit search to descendants of this folder.' },
  },
}
```

## 五、索引生命周期

```
┌─────────────────────────────────────────────────────────────┐
│                    索引生命周期                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. 工作区打开                                               │
│     ├─ 检查 .void/index/ 是否存在                           │
│     ├─ 存在 → 加载索引 + 启动增量同步定时器                  │
│     └─ 不存在 → 启动首次索引                                 │
│                                                             │
│  2. 首次索引                                                 │
│     ├─ 读取 .voidignore 排除列表                            │
│     ├─ 遍历工作区文件（排除 ignore 路径）                    │
│     ├─ 构建 Merkle Tree                                     │
│     ├─ 对每个文件：                                          │
│     │   ├─ CodeChunker.chunkFile() → 代码块列表             │
│     │   ├─ EmbeddingService.embedBatch() → 嵌入向量         │
│     │   └─ VectorStore.insertBatch() → 存储                 │
│     ├─ 保存 Merkle Tree 快照                                │
│     └─ 状态 → ready                                        │
│                                                             │
│  3. 增量同步（每 5 分钟）                                    │
│     ├─ 构建新 Merkle Tree                                   │
│     ├─ diff(old, new) → {added, modified, deleted}          │
│     ├─ deleted → VectorStore.deleteByFilePath()              │
│     ├─ added/modified → 重新分块 + 嵌入 + 存储              │
│     ├─ 保存新 Merkle Tree 快照                              │
│     └─ 无变更 → 跳过                                        │
│                                                             │
│  4. 语义搜索                                                 │
│     ├─ query → EmbeddingService.embed() → 查询向量          │
│     ├─ VectorStore.search(queryVec, topK, filter)           │
│     ├─ 对每个结果：从本地文件读取代码片段                     │
│     └─ 返回 SearchResult[]                                  │
│                                                             │
│  5. 工作区关闭                                               │
│     ├─ 停止增量同步定时器                                    │
│     └─ VectorStore.close()                                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 六、与现有系统的集成

### 6.1 ToolsService 集成

```typescript
// ToolsService 构造函数新增注入
@ICodeIndexService private readonly _codeIndexService: ICodeIndexService

// callTool 中新增分支
case 'semantic_search': {
  const results = await this._codeIndexService.search(
    params.query,
    params.maxResults,
    params.searchInFolder ? { searchInFolder: params.searchInFolder.fsPath } : undefined
  )
  return { results, totalMatches: results.length, indexStatus: this._codeIndexService.state }
}
```

### 6.2 系统提示集成

在 `ConvertToLLMMessageService._generateChatMessagesSystemMessage()` 中，当索引状态为 `ready` 时，在系统提示中添加索引可用提示：

```
A semantic search tool is available. Use semantic_search to find code by concept rather than exact string match.
```

### 6.3 .voidignore 支持

复用现有的文件忽略机制：
- 读取工作区根目录的 `.voidignore` 文件
- 格式与 `.gitignore` 一致
- 默认排除：`node_modules/`、`.git/`、`dist/`、`build/`、`.void/index/`

## 七、ONNX 模型部署方案

### 7.1 模型来源

从 HuggingFace 下载 all-MiniLM-L6-v2 的 ONNX 版本：
- 模型文件：`model.onnx`（~23MB）
- Tokenizer：`tokenizer.json`

### 7.2 模型存放位置

```
.void/index/embedding_model/
  ├─ model.onnx
  └─ tokenizer.json
```

首次索引时自动下载（从 HuggingFace），后续使用缓存。

### 7.3 ONNX Runtime WASM

使用 `onnxruntime-web` 包在渲染进程中运行：
- 无需 native 模块
- 与 Electron 渲染进程兼容
- 推理性能：单条嵌入 ~50ms（CPU），批量嵌入可并行

## 八、性能预估

| 指标 | 小项目（~200 文件） | 中项目（~1000 文件） | 大项目（~5000 文件） |
|------|---------------------|----------------------|----------------------|
| 首次索引时间 | ~30s | ~2min | ~8min |
| 增量同步时间 | ~2s | ~10s | ~30s |
| 语义搜索延迟 | ~100ms | ~200ms | ~500ms |
| 索引磁盘占用 | ~5MB | ~25MB | ~100MB |
| 内存占用 | ~50MB | ~100MB | ~200MB |

## 九、验证策略

- **分块验证**：对 TypeScript 文件验证 AST 分块结果，确保函数/类完整
- **嵌入验证**：验证语义相似的代码块嵌入距离近，不相关的距离远
- **搜索验证**：对已知代码库搜索 "authentication" 返回认证相关代码
- **增量验证**：修改文件后增量同步仅更新变更文件
- **降级验证**：tree-sitter 语法不可用时降级为朴素分块
- **性能验证**：中等项目首次索引 < 3 分钟

## 十、风险与回滚

- **模型下载失败**：HuggingFace 不可用时，降级为仅正则搜索（不影响现有功能）
- **WASM 兼容性**：ONNX Runtime WASM 在某些环境可能不兼容，需测试
- **sqlite-vec 编译**：需为 Windows x64 预编译 sqlite-vec 扩展
- **大项目性能**：5000+ 文件项目首次索引可能较慢，可考虑后台渐进式索引
- **回滚**：删除 `.void/index/` 目录 + 移除 `semantic_search` 工具定义即可完全回滚
