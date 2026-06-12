# 任务清单（add-lsp-tools）

## 1. 类型定义

- [ ] 1.1 在 `toolsServiceTypes.ts` 的 `BuiltinToolCallParams` 中新增 `go_to_definition`、`find_references`、`get_type_definition`、`list_symbols`、`find_implementations` 五个工具的参数类型
- [ ] 1.2 在 `toolsServiceTypes.ts` 的 `BuiltinToolResultType` 中新增对应的结果类型（含 `LocationResult` 通用类型）
- [ ] 1.3 在 `toolsServiceTypes.ts` 的 `approvalTypeOfBuiltinToolName` 中将 5 个 LSP 工具标记为 `'none'`

## 2. 工具实现

- [ ] 2.1 在 `ToolsService` 构造函数中注入 `ILanguageFeaturesService`
- [ ] 2.2 在 `validateParams` 中新增 5 个 LSP 工具的参数验证分支
- [ ] 2.3 在 `callTool` 中新增 `go_to_definition` 实现（调用 `definitionProvider`）
- [ ] 2.4 在 `callTool` 中新增 `find_references` 实现（调用 `referenceProvider`，限制最多 20 个结果）
- [ ] 2.5 在 `callTool` 中新增 `get_type_definition` 实现（调用 `typeDefinitionProvider`）
- [ ] 2.6 在 `callTool` 中新增 `list_symbols` 实现（调用 `documentSymbolProvider` + `workspaceSymbolProvider`）
- [ ] 2.7 在 `callTool` 中新增 `find_implementations` 实现（调用 `implementationProvider`）
- [ ] 2.8 实现 `_readSnippet` 辅助方法（读取指定 URI 和范围附近的代码片段，上下各 3 行）
- [ ] 2.9 在 `stringOfResult` 中新增 5 个 LSP 工具的结果字符串化逻辑

## 3. 提示描述

- [ ] 3.1 在 `prompts.ts` 的 `builtinTools` 中新增 5 个 LSP 工具的名称、描述和参数说明

## 4. 构建与验证

- [ ] 4.1 TypeScript 编译通过，无类型错误
- [ ] 4.2 在 TypeScript 项目中测试 `go_to_definition` 能正确跳转到函数定义
- [ ] 4.3 在 Agent 模式下，LLM 能通过 `find_references` 查找符号引用
- [ ] 4.4 在无 LSP Provider 的纯文本文件上调用工具，验证优雅降级（返回空结果 + 提示）
- [ ] 4.5 构建完整应用，验证无回归问题
