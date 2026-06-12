# 任务清单（add-code-index）

> 更新于 2026-04-23 21:00。标记已完成项，新增流式遍历和按钮交互修复任务。

## 1. 基础设施 — AST 分块器

- [x] 1.1 `CodeChunk` 类型定义 → `codeIndexTypes.ts`（内嵌在 `codeIndexService.ts`）
- [x] 1.2 集成 tree-sitter → 使用 `ITreeSitterParserService.getTree()`
- [x] 1.3 AST 遍历 + 语义分块（TS/JS/Python/Rust/Go/CSS，按函数/类/方法分块）
- [x] 1.4 降级分块 → `_chunkNaive()` 按空行 + 字符限制朴素分块
- [ ] 1.5 Token 上限截断（当前按字符 2000 截断，应按 512 Token）
- [ ] 1.6 单元测试

## 2. 基础设施 — 嵌入服务

- [x] 2.1 `EmbeddingService` 接口 + `embed()` / `embedBatch()`（内嵌在 `codeIndexService.ts`）
- [ ] **2.2 集成 ONNX Runtime + all-MiniLM-L6-v2 模型**（当前为 FNV-1a hash 占位）
- [ ] **2.3 实现 Tokenizer（基于 tokenizer.json）**（当前为简单正则分词）
- [ ] **2.5 模型自动下载（HuggingFace）**
- [ ] 2.6 单元测试

## 3. 基础设施 — 向量存储

- [x] 3.1 `VectorStore` 接口 + 内存实现（内嵌在 `codeIndexService.ts`）
- [ ] **3.2 集成 SQLite + sqlite-vec 持久化**（当前纯内存，重启丢失）
- [x] 3.3 `insert()` / `insertBatch()` 嵌入 + 元数据写入
- [x] 3.4 `search()` 余弦相似度 Top-K（内存线性扫描版）
- [x] 3.5 `deleteByFilePath()` / `getIndexedFiles()`
- [ ] 3.6 单元测试

## 4. 基础设施 — Merkle Tree 增量更新 ✅

- [x] 4.1 `MerkleNode` 类型 + `MerkleTree` 类（内嵌在 `codeIndexService.ts`）
- [x] 4.2 `build()` 从工作区构建文件哈希树（含 DEFAULT_IGNORE 合并）
- [x] 4.3 `diff()` 对比两棵树，返回 added/modified/deleted
- [x] 4.4 `saveSnapshot()` / `loadSnapshot()` 快照持久化
- [ ] 4.5 单元测试

## 5. 编排层 — CodeIndexService

- [x] 5.1 `ICodeIndexService` 接口 + `CodeIndexService` 类 + DI 注册
- [x] 5.2 `startIndexing()` 首次索引流程
- [x] 5.3 `incrementalUpdate()` 增量同步
- [x] 5.4 `search()` 语义搜索（查询嵌入 → 向量搜索 → 读取代码片段）
- [x] 5.5 注册为 Singleton 服务（InstantiationType.Delayed）
- [x] 5.6 自动启动索引（5s 延迟）+ 5 分钟定时增量同步
- [x] 5.7 `.voidignore` 文件读取和路径排除
- [x] 5.8 `onDidChangeState` 事件 + `getCachePath` / `getCacheSize` / `clearCache`

## 6. 工具集成 — semantic_search ✅

- [x] 6.1 `BuiltinToolCallParams` 中 `semantic_search` 参数类型
- [x] 6.2 `BuiltinToolResultType` 中 `semantic_search` 结果类型
- [x] 6.3 审批类型：无需审批（只读工具）
- [x] 6.4 `ToolsService` 构造函数注入 `ICodeIndexService`
- [x] 6.5 `validateParams` / `callTool` / `stringOfResult` 三个分支
- [x] 6.6 `prompts.ts` 中 `semantic_search` 工具描述

## 7. 系统提示集成 ✅

- [x] 7.1 索引 ready 时在系统提示中添加语义搜索可用提示

## 8. 设置页 UI（新增，超出原 OpenSpec）✅

- [x] 8.1 `CodeIndexManagement` React 组件（状态/文件数/块数/缓存路径/大小/清理/重建）
- [x] 8.2 设置页新增"代码索引"标签
- [x] 8.3 i18n 中英文翻译

---

## 9. P0 — Bug 修复 + 基础可用（新增）

- [x] **9.1 修复 `_walkFiles` 未合并 `DEFAULT_IGNORE`**（致命 Bug：遍历 node_modules 卡死）
- [x] **9.3 添加 `onDidChangeProgress` 事件**（每个文件索引完后 fire，UI 实时更新进度）
- [x] **9.4 ripgrep 保底层**（索引未就绪时 `semantic_search` 降级调用 ISearchService）
- [x] **9.5 Settings UI 进度条**（订阅 `onDidChangeProgress` + 进度条动画）
- [ ] **9.6 流式文件遍历**（async generator 边遍历边索引 + 定期 yield 渲染帧）
- [ ] **9.7 按钮交互修复**（indexing 状态下允许停止/清理，加禁用态视觉反馈）

## 10. P1 — 嵌入质量 + 持久化（新增）

- [ ] 10.1 集成 ONNX Runtime + all-MiniLM-L6-v2 模型（替换 FNV-1a hash）
- [ ] 10.2 Tokenizer 实现（基于 tokenizer.json）
- [ ] 10.3 模型自动下载（HuggingFace）
- [ ] 10.4 SQLite + sqlite-vec 持久化（替换内存 VectorStore）
- [ ] 10.5 RRF 结果融合（ripgrep + 向量搜索结果合并排序）

## 11. P2 — 体验打磨（新增）

- [ ] 11.1 文件 watcher 实时增量更新（替代 5 分钟定时器）
- [ ] 11.2 Worker 线程 embedding（避免阻塞主线程）
- [ ] 11.3 索引健康检查 + 自修复
- [ ] 11.4 Token 上限截断（512 Token）

## 12. 端到端验证

- [ ] 12.1 TypeScript 编译通过，无类型错误
- [ ] 12.2 中等项目首次索引完成，耗时 < 3 分钟
- [ ] 12.3 `semantic_search` 搜索返回语义相关代码
- [ ] 12.4 增量同步仅更新变更文件
- [ ] 12.5 `.voidignore` + `DEFAULT_IGNORE` 排除路径生效
- [ ] 12.6 tree-sitter 不可用时降级为朴素分块
- [ ] 12.7 索引未就绪时 ripgrep 降级搜索可用
- [ ] 12.8 构建完整应用，验证无回归问题
