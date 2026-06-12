# 推荐方案 OpenSpec 变更总览

基于 `void-programming-workflow-analysis.md` 中的差距分析，已创建变更提案，覆盖 P0 ~ P2 级别的核心差距。
参考代码仓库：[claude-code-best/claude-code](https://github.com/claude-code-best/claude-code)（CCB V5）

> **更新时间**: 2026-04-20 — Phase 1/2/3/4 已全部完成 ✅；Phase 4 测试已通过（153 用例 0 失败）

## 实施路线图

```
Phase 1 (P0 - 核心能力) ✅ 已完成
  ├─ add-lsp-tools            ✅ 已完成
  └─ add-code-index           ⚠️ 类型定义已就绪，实现待推进 → 移至 Phase 4

Phase 2 (P1 - 效率提升) ✅ 已完成
  ├─ enable-autocomplete-context  ✅ 已完成
  ├─ add-tool-hooks              ✅ 已完成
  └─ enhance-checkpoints         ✅ 已完成

Phase 3 (P1.5 - 上下文与编辑增强) ✅ 已完成
  ├─ add-context-compaction      ✅ 已完成
  ├─ enhance-edit-fuzzy-match    ✅ 已完成
  ├─ add-batch-edit-tool         ✅ 已完成
  └─ add-active-context          ✅ 已完成

Phase 4 (P2 - 体验增强) ✅ 已完成
  ├─ implement-code-index          ✅ 已完成（hash嵌入+AST分块+内存向量库）
  ├─ add-planning-management       ✅ 已完成（update_plan 工具 + 持久化 + 系统提示注入）
  ├─ add-subagents                 ✅ 已完成（dispatch_agents 并行搜索/读取）
  ├─ add-web-search                ✅ 已完成（web_search + read_url 工具）
  ├─ enhance-voidrules             ✅ 已完成（save_memory/delete_memory + 系统提示注入）
  ├─ enhance-permissions           ✅ 已完成（perToolRules + mustAlwaysApprovePatterns）
  ├─ add-realtime-awareness        ✅ 已完成（IDE活动追踪 + 系统提示注入）
  └─ add-remote-index              ✅ 已完成（GitHub API + 文件树/读取/搜索）
```

## 变更清单

### Phase 1：核心能力 ✅

#### 1. `add-lsp-tools` ✅ 已完成

**目标**：新增 5 个 LSP 代码导航工具（go_to_definition / find_references / get_type_definition / list_symbols / find_implementations）

**核心依据**：
- Void 已注入 `ILanguageFeaturesService`（`ContextGatheringService`、`ChatThreadService` 均在使用）
- `definitionProvider` / `referenceProvider` / `documentSymbolProvider` 已有调用先例
- 零新增外部依赖

**改动范围**：`toolsServiceTypes.ts`、`toolsService.ts`、`prompts.ts`（3 个文件）

---

#### 2. `add-code-index` ⚠️ 类型定义已就绪

**目标**：实现本地代码语义索引系统，新增 `semantic_search` 工具

**当前状态**：`codeIndexTypes.ts` 类型定义已创建，实现待推进

**核心组件**（待实现）：
- AST 分块：tree-sitter (WASM)
- 嵌入生成：ONNX Runtime + all-MiniLM-L6-v2（本地）
- 向量存储：SQLite + sqlite-vec
- 增量更新：Merkle Tree

---

### Phase 2：效率提升 ✅

#### 3. `enable-autocomplete-context` ✅ 已完成

**目标**：启用 `AutocompleteService` 对 `ContextGatheringService` 的调用，将光标附近的符号定义注入 FIM prefix

**改动范围**：`autocompleteService.ts`、`convertToLLMMessageService.ts`（2 个文件）

---

#### 4. `add-tool-hooks` ✅ 已完成

**目标**：在工具调用链路中引入 `PreToolUse` / `PostToolUse` / `ToolUseError` 事件钩子

**核心能力**：
- `hookService.ts` + `hookTypes.ts` — 事件钩子系统
- 支持 `deny` / `modify` / `allow` 三种决策
- 集成到 `chatThreadService.ts` Agent 循环中

---

#### 5. `enhance-checkpoints` ✅ 已完成

**目标**：从单工具检查点升级为 Turn 级磁盘持久化检查点，支持跨工具一键回滚

**核心能力**：
- `turnCheckpointService.ts` + `turnCheckpointTypes.ts`
- 每个用户消息创建一个 Turn 检查点，覆盖 edit / create / delete / command 四类操作
- 对话消息旁显示"↶ 回滚到此处"按钮
- batch_edit 为每个文件分别记录检查点

---

### Phase 3：上下文与编辑增强 ✅

#### 6. `add-context-compaction` ✅ 已完成

**目标**：长对话上下文自动压缩，防止超出 LLM context window

**核心能力**：
- `contextCompactionService.ts` + `contextCompactionTypes.ts`
- 当对话 token 超过 context window 60% 时自动触发
- 用 LLM 摘要替换旧消息，保留最近 10 条完整
- 集成到 `chatThreadService.ts` Agent 循环（LLM 调用前检查）
- 注册在 `void.contribution.ts`，React accessor 已接入

---

#### 7. `enhance-edit-fuzzy-match` ✅ 已完成

**目标**：增强 `edit_file` 工具的文本定位能力，降低 LLM 生成代码与实际代码微小差异导致的编辑失败

**核心能力**：
- `editCodeService.ts` `findTextInCode()` 新增第3层回退
- 匹配链路：精确匹配 → 空白规范化 → **行级 LCS 模糊匹配**
- `normalizeLine()` 去空白/标点规范化
- `lineSimilarity()` LCS 相似度计算（0~1），阈值 0.7
- `fuzzyFindLines()` 滑动窗口匹配
- 修复了 LCS 实现中 `curr` 数组每行需 reset 的 bug

---

#### 8. `add-batch-edit-tool` ✅ 已完成

**目标**：新增 `batch_edit` 工具，支持单次调用编辑多个文件

**核心能力**：
- `toolsServiceTypes.ts` — 参数/返回值类型（edits 数组）
- `prompts.ts` — 工具定义
- `toolsService.ts` — 参数验证、逐文件执行、lint 错误收集、结果格式化
- `chatThreadService.ts` — 为每个文件分别记录检查点
- 部分失败不影响其他文件

---

#### 9. `add-active-context` ✅ 已完成

**目标**：在系统提示中自动注入工作区活跃状态，让 LLM 感知用户当前正在编辑的文件

**核心能力**：
- `convertToLLMMessageService.ts` — 收集 dirty files 列表
- `prompts.ts` — `chat_systemMessage` 新增 `recentlyModifiedFiles` 参数
- 渲染为 `<recently_modified>` XML 标签，插入系统提示
- 通过 `modelService.getModels()` 检测未保存更改

---

### Phase 4：体验增强 ✅

#### 10. `implement-code-index` ✅ 基础版已实现 — **高优先级**

**目标**：实现本地代码语义索引 + `semantic_search` 工具

**已完成**：
- tree-sitter AST 感知分块（支持 TS/JS/Python/Rust/Go/CSS，不支持的语言回退到 naive 分块）
- FNV-1a hash-based 特征嵌入（unigrams + bigrams + L2 归一化，384 维，零外部依赖）
- 内存向量库 + 余弦相似度搜索
- Merkle Tree 增量更新（build → diff → 增量重索引）
- 自动启动（workspace open 后 5s 触发，workspace folder 变更时重索引）
- `semantic_search` 工具端到端集成（prompts → validation → execution → result formatting）
- Bug 修复：MerkleTree filePath 传播、_flattenChildren 映射、search content 填充

**待增强**：ONNX 嵌入模型（all-MiniLM-L6-v2）→ SQLite+vec 持久化 → 混合搜索(语义+ripgrep) → UI 状态指示器

**参考**：Cursor RAG 管线 / Windsurf M-Query

---

#### 11. `add-planning-management` ✅ 已完成 — **中优先级**

**目标**：Agent 自动规划与任务管理（Todo List 生成 + 进度跟踪 + 跨轮次持续）

**已完成**：
- `planningServiceTypes.ts` — TodoItem/Plan/PlanningToolResult 类型定义
- `planningService.ts` — CRUD + 持久化(.void/plan.json) + 自动加载 + 事件通知
- `update_plan` 工具 — prompts 定义 + toolsService validation/execution/formatting
- 系统提示注入 — `<current_plan>` 标签注入 LLM 上下文
- 无需审批（只读工具）

**参考**：Claude Code Todo / Windsurf Plans / CCB `toolUseSummary`

---

#### 12. `add-subagents` ✅ 已完成 — **中优先级**

**目标**：并行子代理加速大代码库探索（主 Agent 派生 → 并行搜索 → 结果汇聚）

**已完成**：
- `subagentServiceTypes.ts` — SubagentTask/SubagentTaskResult/SubagentDispatchResult 类型定义
- `subagentService.ts` — ISubagentService 接口 + dispatch() 并行执行器
- 支持 4 种任务类型：grep (文本搜索)、read_file (读文件)、semantic_search (语义搜索)、list_symbols (符号列表)
- `dispatch_agents` 工具 — prompts 定义 + toolsService validation/execution/formatting
- 最大 10 个并行任务，每任务独立失败不影响其他
- 无需审批（只读工具）

**参考**：Windsurf Fast Context (SWE-grep) / CCB `AgentSummary` + Subagents

---

#### 13. `add-web-search` ✅ 已完成 — **中优先级**

**目标**：新增 `web_search` / `read_url` 工具，获取在线文档和 API 信息

**已完成**：
- `webSearchServiceTypes.ts` — WebSearchResult/WebSearchResponse/ReadUrlResult 类型定义
- `webSearchService.ts` — IWebSearchService 接口 + 实现
- `web_search` 工具 — DuckDuckGo HTML 搜索（无 API Key 依赖）
- `read_url` 工具 — 通过 IRequestService 获取页面，HTML→纯文本提取（去除 script/style/nav/footer），支持 JSON/纯文本直接返回
- 最大内容长度 50K 字符，超出截断
- 无需审批（只读工具）

**参考**：Cursor @Web/@Docs / Windsurf Web Search

---

#### 14. `enhance-voidrules` ✅ 已完成 — **中优先级**

**目标**：增强项目规则 — Memories 自动记忆 + Rules 层级继承（全局→工作区→子目录）+ Session Memory

**已完成**：
- `memoryServiceTypes.ts` — MemoryItem/SaveMemoryResult/DeleteMemoryResult 类型定义
- `memoryService.ts` — IMemoryService 接口 + CRUD + 持久化(.void/memories.json) + 自动加载 + 事件通知
- `save_memory` 工具 — 保存/更新记忆（content + tags + 可选 existingId）
- `delete_memory` 工具 — 按 ID 删除记忆
- 系统提示注入 — `<memories>` 标签注入 LLM 上下文，每条记忆包含 id、tags、content
- 层级 .voidrules 基础架构（getHierarchicalRules 方法，支持根目录到子目录逐级收集）
- 无需审批（只读工具）

**参考**：CCB `extractMemories`/`SessionMemory` / Windsurf Memories+Rules / Claude Code `CLAUDE.md`

---

#### 15. `enhance-permissions` ✅ 已完成 — **低优先级**

**目标**：精细化工具权限 — rule-based 匹配(allow/deny/ask) + forceDecision + 参数修改能力

**已完成**：
- `perToolRules` 字段 — 按工具名细粒度 allow/deny/ask 规则（最高优先级，覆盖类级设置）
- `mustAlwaysApprovePatterns` 激活 — 危险命令硬审批（匹配即强制 manual，即使 terminalAny=true）
- `DEFAULT_MUST_ALWAYS_APPROVE_PATTERNS` — 内置危险命令清单（rm -rf、sudo、npm publish、git push --force 等）
- 所有三档信任级别预设均注入 mustAlwaysApprovePatterns
- `resolveAutoApprove()` 增强：第 0 层 perToolRules → 第 1 层 mustAlwaysApprovePatterns → 常规类级判定

**参考**：CCB `toolPermission/` 子系统

---

#### 16. `add-realtime-awareness` ✅ 已完成 — **低优先级**

**目标**：实时感知用户 IDE 中的 diff/cursor/文件切换活动，注入 Agent 上下文

**已完成**：
- `ideActivityTypes.ts` — FileVisitRecord/CursorContext/SelectionContext/IDEActivitySnapshot 类型定义
- `ideActivityService.ts` — IIDEActivityService 接口 + 实现
- 跟踪光标位置（防抖 500ms）+ 周围代码片段（±5行，当前行 >>> 标记）
- 跟踪最近文件访问（最多 15 个，去重，含语言/行号/时间戳）
- 跟踪最近选区（最多 5 个，文本截断 500 字符）
- 系统提示注入 — `<ide_activity>` 标签注入 LLM 上下文
- 注册在 void.contribution.ts，InstantiationType.Delayed

**参考**：Windsurf Real-time Awareness

---

#### 17. `add-remote-index` ✅ 已完成 — **低优先级**

**目标**：远程仓库索引，跨仓库代码理解

**已完成**：
- `remoteIndexTypes.ts` — RemoteRepoInfo/RemoteFileResult/RemoteSearchResult/RemoteTreeResult 类型定义
- `remoteIndexService.ts` — IRemoteIndexService 接口 + 实现
- `remote_repo_tree` 工具 — 获取远程 GitHub 仓库文件树（递归，缓存 30 分钟，最多 5000 文件）
- `remote_repo_read` 工具 — 读取远程仓库文件内容（base64 解码，100K 截断）
- `remote_repo_search` 工具 — GitHub Code Search API 搜索（回退到文件名匹配）
- 端到端集成：验证 + 执行 + 结果格式化
- 无需审批（只读工具）

**参考**：Windsurf Remote Indexing

---

## 变更之间的依赖关系

```
Phase 1-3 (已完成):
  add-lsp-tools ── 独立 ✅
  add-code-index ── 类型已就绪 ✅ → 实现移至 Phase 4
  enable-autocomplete-context ── 独立 ✅
  add-tool-hooks ── 独立 ✅
  enhance-checkpoints ── 依赖 add-tool-hooks ✅
  add-context-compaction ── 独立 ✅
  enhance-edit-fuzzy-match ── 独立 ✅
  add-batch-edit-tool ── 依赖 enhance-checkpoints ✅
  add-active-context ── 独立 ✅

Phase 4 (已完成 ✅):
  implement-code-index ── 独立 ✅
  add-planning-management ── 独立 ✅
  add-subagents ── 独立 ✅
  add-web-search ── 独立 ✅
  enhance-voidrules ── 独立 ✅
  enhance-permissions ── 依赖 add-tool-hooks ✅
  add-realtime-awareness ── 独立 ✅
  add-remote-index ── 依赖 implement-code-index ✅
```

> **Phase 1/2/3/4 全部完成**（17 项）。单元测试覆盖 153 用例，0 失败（详见 `docs/testing/phase4-test-results.md`）。
