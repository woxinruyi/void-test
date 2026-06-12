# 新增：LSP 代码导航工具集成（add-lsp-tools）

## 背景

Void 编辑器当前内置 14 个工具（`read_file`、`search_for_files`、`edit_file` 等），但**缺少所有 LSP 级别的代码导航工具**。LLM 在理解代码时只能通过关键字/正则搜索和逐文件读取来探索代码库，无法进行精确的定义跳转、引用查找、类型信息获取等操作。

对比主流方案：
- **Cursor**：通过 `@Codebase` 语义搜索 + LSP 定义/引用跳转实现精确导航
- **Windsurf**：Cascade Agent 内置代码智能工具，支持定义/引用/符号查找
- **Claude Code**：完整 LSP 工具集（go_to_definition / find_references / get_type_info / list_symbols / find_implementations / call_hierarchy）

Void 已具备完整的基础设施：
- `ILanguageFeaturesService` 已在 `ContextGatheringService` 和 `ChatThreadService` 中使用
- `definitionProvider`、`referenceProvider`、`documentSymbolProvider` 已有调用先例
- `ChatThreadService` 构造函数已注入 `ILanguageFeaturesService`

只需在 `ToolsService` 中新增工具定义并调用现有 LSP 接口即可，**投入产出比极高**。

## 目标

- 在 `BuiltinToolCallParams` / `BuiltinToolResultType` 中新增 5 个 LSP 工具类型定义
- 在 `ToolsService` 中实现 5 个 LSP 工具的参数验证与调用逻辑
- 在 `prompts.ts` 中为 5 个 LSP 工具生成 LLM 可理解的描述和参数说明
- 在 `toolsServiceTypes.ts` 中为 LSP 工具配置正确的 `approvalType`（均为 `none`，只读操作）
- LLM 可通过这些工具精确导航代码库，大幅减少"盲人摸象"式的文件探索

### 新增工具清单

| 工具名 | 功能 | 关键参数 | 审批类型 |
|--------|------|----------|----------|
| `go_to_definition` | 跳转到符号定义 | `uri`, `line`, `character` | none |
| `find_references` | 查找符号的所有引用 | `uri`, `line`, `character`, `includeDeclaration` | none |
| `get_type_definition` | 获取类型定义 | `uri`, `line`, `character` | none |
| `list_symbols` | 列出文件/工作区符号 | `uri`, `query` | none |
| `find_implementations` | 查找接口的实现 | `uri`, `line`, `character` | none |

## 非目标（Non-goals）

- 不实现 `call_hierarchy` 工具（调用层级追踪，复杂度高，优先级低，留待后续）
- 不修改 `ContextGatheringService` 的现有逻辑（本次仅新增工具层调用入口）
- 不实现语义搜索/嵌入索引（属于 `add-code-index` 变更）
- 不修改 Autocomplete 的上下文注入（属于 `enable-autocomplete-context` 变更）
- 不修改 `ChatThreadService` 的 Agent 循环逻辑

## 方案

1. **类型定义**：在 `toolsServiceTypes.ts` 的 `BuiltinToolCallParams` 和 `BuiltinToolResultType` 中新增 5 个 LSP 工具的参数和结果类型
2. **审批配置**：在 `approvalTypeOfBuiltinToolName` 中将 5 个 LSP 工具标记为 `none`（只读，无需审批）
3. **工具实现**：在 `ToolsService` 中注入 `ILanguageFeaturesService`，实现 `validateParams` 和 `callTool` 中的 LSP 工具分支
4. **提示描述**：在 `prompts.ts` 的 `builtinTools` 中为 5 个 LSP 工具添加名称、描述和参数说明
5. **结果格式化**：在 `stringOfResult` 中为 LSP 工具结果添加字符串化逻辑

## 影响

- 修改文件：`toolsServiceTypes.ts`、`toolsService.ts`、`prompts.ts`
- 新增依赖：`ToolsService` 需注入 `ILanguageFeaturesService`（已在 `ContextGatheringService` 中使用，无额外包依赖）
- LLM 行为变化：Agent 模式下 LLM 可调用 LSP 工具进行精确代码导航，减少对 `search_for_files` / `read_file` 的依赖
- 风险：LSP Provider 可能在某些语言/文件上不可用，需优雅降级（返回空结果 + 提示信息）
