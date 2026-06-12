# 新增：代码语义索引系统（add-code-index）

## 背景

Void 编辑器当前**完全没有代码语义索引能力**。LLM 在理解代码库时只能通过 `search_for_files`（关键字/正则搜索）和 `read_file`（逐文件读取）来探索代码，效率极低，且无法理解代码的语义关系。

对比主流方案：
- **Cursor**：tree-sitter AST 分块 → 自研嵌入模型 → Turbopuffer 向量存储 → Merkle Tree 增量同步 → 混合搜索（语义 + ripgrep）。仅存储嵌入和元数据，源码始终留在本地。
- **Windsurf**：RAG 索引引擎 + M-Query 检索 + SWE-grep Fast Context 子代理（20x 更快检索）。支持本地 + 远程仓库索引。
- **Claude Code**：无专用嵌入索引，依赖 LSP + grep + 文件读取，但通过完整的 LSP 工具集弥补。

Void 需要**本地优先**的代码索引方案：源码不上传、嵌入本地生成、向量本地存储，避免隐私问题。

## 目标

- 实现**本地代码语义索引系统**，包含 AST 感知分块、嵌入生成、向量存储、语义搜索、增量更新
- 新增 `semantic_search` 内置工具，使 LLM 能通过语义查询搜索代码库
- 实现混合搜索策略：语义搜索 + 现有 ripgrep 正则搜索互补
- 实现 Merkle Tree 增量更新机制，仅重新索引变更文件
- 所有数据本地存储，不上传源码或嵌入到远程服务器

### 核心组件

| 组件 | 功能 | 技术选型 |
|------|------|----------|
| AST 分块器 | 将代码按函数/类/块级语义分块 | tree-sitter (WASM) |
| 嵌入生成器 | 为每个代码块生成向量表示 | ONNX Runtime + all-MiniLM-L6-v2 |
| 向量存储 | 存储嵌入向量 + 元数据 | SQLite + sqlite-vec |
| 语义搜索引擎 | 查询嵌入 + 相似度匹配 | 余弦相似度 + Top-K |
| 增量更新器 | 检测变更文件并重新索引 | Merkle Tree (文件哈希) |
| `semantic_search` 工具 | LLM 可调用的语义搜索工具 | 集成到 ToolsService |

## 非目标（Non-goals）

- 不实现远程向量存储或云端嵌入生成（隐私优先，全部本地）
- 不实现远程仓库索引（属于后续增强）
- 不实现 Fine-tuning（属于企业级方案）
- 不修改现有 `search_for_files` / `search_in_file` 工具的行为（语义搜索作为补充，不替代）
- 不实现文件路径混淆/加密（Cursor 的隐私方案，本地存储不需要）
- 不实现嵌入缓存共享（AWS S3 等，本地方案不需要）

## 实现状态（2026-04-23 更新）

| 组件 | 状态 | 说明 |
|------|------|------|
| AST 分块器 | ✅ 已实现 | tree-sitter + 降级分块，支持 TS/JS/Python/Rust/Go/CSS |
| 嵌入生成器 | ⚠️ 占位 | FNV-1a hash 占位，待替换为 ONNX all-MiniLM-L6-v2 |
| 向量存储 | ⚠️ 占位 | 纯内存实现，待替换为 SQLite + sqlite-vec |
| Merkle Tree | ✅ 已实现 | build/diff/save/load 完整 |
| CodeIndexService | ⚠️ 部分修复 | `DEFAULT_IGNORE` 已合并，进度事件已添加，待改流式遍历 |
| semantic_search 工具 | ✅ 已实现 | 端到端集成（types + prompts + toolsService） |
| 系统提示 | ✅ 已实现 | 索引 ready 时注入提示 |
| 设置页 UI | ✅ 已实现 | 状态/缓存管理/清理/重建（超出原设计范围） |

## 方案

### Phase 1：基础设施 ✅（已完成，有 Bug 待修）

1. **tree-sitter 集成**：使用 `ITreeSitterParserService`（VSCode 内置），支持 TS/JS/Python/Rust/Go/CSS
2. **AST 分块器**：按函数/类/方法/块级语义分块，降级为按空行朴素分块
3. **嵌入生成器**：当前 FNV-1a hash 占位（384 维），后续替换为 ONNX Runtime + all-MiniLM-L6-v2
4. **向量存储**：当前内存实现，后续替换为 SQLite + sqlite-vec
5. **Merkle Tree**：文件哈希树 + diff + 快照持久化

### Phase 2：搜索与工具 ✅（已完成）

6. **语义搜索引擎**：查询嵌入 → 余弦相似度 Top-K → 读取代码片段
7. **`semantic_search` 工具**：端到端集成到 ToolsService
8. **系统提示**：索引 ready 时自动注入语义搜索可用提示

### Phase 3：增量更新 ✅（已完成）

9. **Merkle Tree**：5 分钟定时检测变更，diff 识别 added/modified/deleted
10. **增量索引**：删除旧嵌入 → 重新分块 → 重新嵌入变更文件

### Phase 4：Bug 修复 + 混合检索（当前重点）

> 关键洞察：单靠向量语义搜索不够，需要与 ripgrep 关键词搜索互补。这是 Cursor、Windsurf 的共同做法。

11. ~~**修复 `_walkFiles` Bug**~~：✅ 合并 `DEFAULT_IGNORE`，与 `MerkleTree.build` 一致
12. **流式索引**：async generator 边遍历边索引 + 定期 `setTimeout(0)` 让出渲染帧 ← 进行中
13. ~~**进度事件**~~：✅ `onDidChangeProgress` 每个文件索引完后 fire + Settings UI 进度条
14. ~~**ripgrep 保底层**~~：✅ 索引未就绪时 `semantic_search` 降级调用 `ISearchService`（`ITextQuery` API）
15. **按钮交互修复**：indexing 状态下允许停止/清理，加禁用态视觉反馈 ← 进行中
16. **RRF 结果融合**：索引就绪后，同时查询向量 + ripgrep，用 Reciprocal Rank Fusion 合并排序

### Phase 5：嵌入质量 + 持久化（后续）

16. **ONNX Runtime + all-MiniLM-L6-v2**：替换 FNV-1a hash，提供真正语义理解
17. **SQLite + sqlite-vec**：持久化存储，重启无需重新索引
18. **模型自动下载**：首次索引时从 HuggingFace 下载模型

## 影响

- 新增文件：`codeIndexService.ts`（索引服务主文件，含分块器/嵌入/向量存储/Merkle Tree）
- 新增类型：`codeIndexTypes.ts`（CodeChunk, SearchResult, MerkleNode 等）
- 待新增依赖：ONNX Runtime WASM、sqlite-vec（Phase 5）
- 已集成工具：`semantic_search`（端到端完成）
- 数据目录：工作区下 `.void/index/`
- 配置文件：`.voidignore`（排除索引路径）+ `DEFAULT_IGNORE` 内置规则
- 磁盘占用：每个代码块约 1.5KB，1 万块约 15MB
- 首次索引时间：中等项目（~1000 文件）约 1-3 分钟（Phase 4 修复后）
- 启动体验：ripgrep 保底层确保 0 延迟即时可用，后台渐进索引
