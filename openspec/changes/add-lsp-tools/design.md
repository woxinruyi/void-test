# 设计说明（add-lsp-tools）

## 一、方案总览

在 Void 现有的内置工具体系中新增 5 个 LSP 代码导航工具。这些工具直接调用 VSCode 已有的 `ILanguageFeaturesService` 接口，无需引入新依赖，无需修改 Agent 循环逻辑，仅扩展工具定义层。

```
┌─────────────────────────────────────────────────────────────┐
│                    LSP 工具调用链路                           │
│                                                             │
│  LLM 生成工具调用 (XML/JSON)                                │
│       ↓                                                     │
│  ChatThreadService._runToolCall()                           │
│       ↓                                                     │
│  ToolsService.validateParams()  →  参数校验                  │
│       ↓                                                     │
│  ToolsService.callTool()                                    │
│       ↓                                                     │
│  ILanguageFeaturesService                                   │
│    ├─ definitionProvider.ordered(model)                     │
│    │    └─ provider.provideDefinition(model, pos, token)    │
│    ├─ referenceProvider.ordered(model)                      │
│    │    └─ provider.provideReferences(model, pos, opts)     │
│    ├─ typeDefinitionProvider.ordered(model)                  │
│    │    └─ provider.provideTypeDefinition(model, pos, token) │
│    ├─ documentSymbolProvider.ordered(model)                 │
│    │    └─ provider.provideDocumentSymbols(model, token)    │
│    └─ implementationProvider.ordered(model)                 │
│         └─ provider.provideImplementations(model, pos, token)│
│                                                             │
│  结果 → stringOfResult() → 工具结果消息                     │
└─────────────────────────────────────────────────────────────┘
```

## 二、关键决策

### 决策 1：工具参数使用 `line` + `character` 而非 `position` 字符串

LSP 操作需要精确定位到符号位置。选择 `line`（1-indexed）+ `character`（1-indexed）作为参数，与 VSCode 的 `Position` 类型一致，LLM 可通过 `search_in_file` 返回的行号或 `read_file` 的行号直接构造。

**替代方案**：使用符号名字符串 + 文件 URI，让服务端搜索匹配。但符号名可能重复（如多个 `handleClick` 函数），且需要额外的搜索步骤，效率更低。

### 决策 2：`list_symbols` 支持文件级和工作区级两种模式

- 当 `uri` 非空时：返回指定文件的文档符号（函数、类、变量等）
- 当 `uri` 为空且 `query` 非空时：返回工作区符号搜索结果（需 `workspaceSymbolProvider`）

这使 LLM 既能浏览单个文件的结构，也能在整个代码库中搜索符号。

### 决策 3：结果中包含代码片段（snippet）

LSP 工具返回的位置信息（URI + 行号）对 LLM 来说不够直观。设计为：对每个结果位置，自动读取该位置附近的代码片段（上下各 3 行），与位置信息一起返回。这样 LLM 无需再发起 `read_file` 调用即可理解上下文。

### 决策 4：所有 LSP 工具的 `approvalType` 为 `none`

LSP 工具均为只读操作（查找定义/引用/符号），不会修改任何文件或执行命令，无需用户审批。

### 决策 5：优雅降级

当目标语言的 LSP Provider 不可用时（如未安装对应语言扩展），工具返回空结果 + 提示信息（如 `"No definition provider available for this file type"`），而非抛出错误。这确保 Agent 循环不会因 LSP 不可用而中断。

## 三、类型定义设计

### 3.1 工具参数类型

```typescript
// 在 BuiltinToolCallParams 中新增
'go_to_definition': { uri: URI, line: number, character: number }
'find_references': { uri: URI, line: number, character: number, includeDeclaration: boolean }
'get_type_definition': { uri: URI, line: number, character: number }
'list_symbols': { uri: URI | null, query: string | null }
'find_implementations': { uri: URI, line: number, character: number }
```

### 3.2 工具结果类型

```typescript
// 在 BuiltinToolResultType 中新增

// 通用位置结果项
type LocationResult = {
  uri: URI           // 目标文件 URI
  range: IRange      // 目标范围
  snippet: string    // 位置附近的代码片段（上下各 3 行）
  symbolName?: string // 符号名称（如可用）
}

'go_to_definition': { locations: LocationResult[] }
'find_references': { locations: LocationResult[], totalMatches: number }
'get_type_definition': { locations: LocationResult[] }
'list_symbols': { symbols: { name: string, kind: string, range: IRange, uri: URI, snippet: string }[] }
'find_implementations': { locations: LocationResult[] }
```

### 3.3 审批类型

```typescript
// 在 approvalTypeOfBuiltinToolName 中新增
'go_to_definition': 'none'
'find_references': 'none'
'get_type_definition': 'none'
'list_symbols': 'none'
'find_implementations': 'none'
```

## 四、工具实现设计

### 4.1 ToolsService 修改

```typescript
// 构造函数新增注入
constructor(
  @ILanguageFeaturesService private readonly _langFeaturesService: ILanguageFeaturesService,
  // ... 现有依赖
)
```

### 4.2 callTool 中 LSP 工具分支

```typescript
// 伪代码 - callTool 中的 LSP 分支
case 'go_to_definition': {
  const model = this._modelService.getModel(params.uri)
  if (!model) return { locations: [] }
  const pos = new Position(params.line, params.character)
  const providers = this._langFeaturesService.definitionProvider.ordered(model)
  const locations: LocationResult[] = []
  for (const provider of providers) {
    const result = await provider.provideDefinition(model, pos, CancellationToken.None)
    if (result) {
      const links = Array.isArray(result) ? result : [result]
      for (const link of links) {
        locations.push({
          uri: link.uri,
          range: link.range,
          snippet: await this._readSnippet(link.uri, link.range),
        })
      }
    }
  }
  return { locations }
}
```

### 4.3 辅助方法：`_readSnippet`

```typescript
// 读取指定 URI 和范围附近的代码片段
private async _readSnippet(uri: URI, range: IRange, contextLines: number = 3): Promise<string> {
  const model = this._modelService.getModel(uri)
  if (!model) return ''
  const startLine = Math.max(1, range.startLineNumber - contextLines)
  const endLine = Math.min(model.getLineCount(), range.endLineNumber + contextLines)
  return model.getLineContent(startLine) // ... 拼接多行
}
```

### 4.4 validateParams 中 LSP 工具分支

```typescript
// 参数验证
case 'go_to_definition':
case 'find_references':
case 'get_type_definition':
case 'find_implementations': {
  const uri = validateURI(params.uri)
  const line = validateNumber(params.line, 'line')
  const character = validateNumber(params.character, 'character')
  // find_references 额外验证 includeDeclaration
  if (toolName === 'find_references') {
    const includeDeclaration = validateBoolean(params.includeDeclaration ?? true, 'includeDeclaration')
    return { uri, line, character, includeDeclaration }
  }
  return { uri, line, character }
}

case 'list_symbols': {
  const uri = params.uri ? validateURI(params.uri) : null
  const query = params.query ? validateStr(params.query, 'query') : null
  return { uri, query }
}
```

## 五、提示描述设计

### 5.1 prompts.ts 中新增的 builtinTools 条目

```typescript
go_to_definition: {
  name: 'go_to_definition',
  description: `Navigate to the definition of a symbol at the given position. Returns the location(s) where the symbol is defined, with surrounding code context.`,
  params: {
    ...uriParam('file'),
    line: { description: 'The 1-indexed line number of the symbol.' },
    character: { description: 'The 1-indexed column number of the symbol.' },
  },
},

find_references: {
  name: 'find_references',
  description: `Find all references to the symbol at the given position across the codebase. Returns a list of locations where the symbol is used, with surrounding code context.`,
  params: {
    ...uriParam('file'),
    line: { description: 'The 1-indexed line number of the symbol.' },
    character: { description: 'The 1-indexed column number of the symbol.' },
    include_declaration: { description: 'Optional. Default is true. Whether to include the symbol declaration in the results.' },
  },
},

get_type_definition: {
  name: 'get_type_definition',
  description: `Navigate to the type definition of the symbol at the given position. Useful for finding the interface or type that a variable implements.`,
  params: {
    ...uriParam('file'),
    line: { description: 'The 1-indexed line number of the symbol.' },
    character: { description: 'The 1-indexed column number of the symbol.' },
  },
},

list_symbols: {
  name: 'list_symbols',
  description: `List all symbols (functions, classes, variables, etc.) in a file or search the workspace by name. Use this to understand the structure of a file or find a specific symbol across the codebase.`,
  params: {
    uri: { description: 'Optional. The file to list symbols from. Leave empty to search the entire workspace.' },
    query: { description: 'Optional. A query string to filter symbols by name. Only used when uri is empty.' },
  },
},

find_implementations: {
  name: 'find_implementations',
  description: `Find all implementations of the interface or abstract class at the given position. Returns locations of concrete implementations.`,
  params: {
    ...uriParam('file'),
    line: { description: 'The 1-indexed line number of the symbol.' },
    character: { description: 'The 1-indexed column number of the symbol.' },
  },
},
```

## 六、结果字符串化设计

```typescript
// stringOfResult 中 LSP 工具分支

case 'go_to_definition':
case 'get_type_definition':
case 'find_implementations': {
  const { locations } = result
  if (locations.length === 0) return `No ${toolName.replace(/_/g, ' ')} found.`
  return locations.map((loc, i) =>
    `--- Result ${i + 1} ---\n` +
    `File: ${loc.uri.fsPath}\n` +
    `Line ${loc.range.startLineNumber}-${loc.range.endLineNumber}\n` +
    `${loc.snippet}`
  ).join('\n\n')
}

case 'find_references': {
  const { locations, totalMatches } = result
  if (locations.length === 0) return 'No references found.'
  return `Found ${totalMatches} reference(s):\n\n` +
    locations.map((loc, i) =>
      `--- Reference ${i + 1} ---\n` +
      `File: ${loc.uri.fsPath}\n` +
      `Line ${loc.range.startLineNumber}\n` +
      `${loc.snippet}`
    ).join('\n\n')
}

case 'list_symbols': {
  const { symbols } = result
  if (symbols.length === 0) return 'No symbols found.'
  return symbols.map(sym =>
    `${sym.kind} ${sym.name}\n` +
    `  File: ${sym.uri.fsPath}:${sym.range.startLineNumber}\n` +
    `  ${sym.snippet.split('\n')[0]}...`
  ).join('\n')
}
```

## 七、与现有代码的关系

### 7.1 ContextGatheringService 复用

`ContextGatheringService` 已实现：
- `_getSymbolsInRange()`：调用 `documentSymbolProvider` + `referenceProvider`
- `_getDefinitionSymbols()`：调用 `definitionProvider`

本次新增的 LSP 工具**不直接复用** `ContextGatheringService` 的方法，因为：
1. `ContextGatheringService` 是缓存服务，设计目标是光标附近的上下文收集
2. LSP 工具需要更灵活的参数（任意位置、任意文件）
3. LSP 工具需要返回结构化结果（位置 + 代码片段），而非缓存字符串

但实现模式（调用 `ILanguageFeaturesService` 的方式）完全一致，可参考其代码。

### 7.2 ChatThreadService 已有 LSP 调用

`ChatThreadService` 中已有 `definitionProvider` 的调用（用于代码跨度查找），本次新增的工具在 `ToolsService` 中实现，不修改 `ChatThreadService`。

## 八、验证策略

- **静态验证**：TypeScript 编译通过，无类型错误
- **单元验证**：在 TypeScript 项目中测试 `go_to_definition` 能正确跳转到函数定义
- **集成验证**：在 Agent 模式下，LLM 能通过 LSP 工具精确导航代码库
- **降级验证**：在无 LSP Provider 的文件类型（如纯文本）上调用工具，返回空结果 + 提示

## 九、风险与回滚

- **LSP Provider 不可用**：部分语言/文件可能无对应 Provider，已设计优雅降级
- **性能风险**：`find_references` 在大型代码库上可能返回大量结果，需限制返回数量（建议最多 20 个位置）
- **回滚**：仅修改 3 个文件（`toolsServiceTypes.ts`、`toolsService.ts`、`prompts.ts`），可完全回滚
