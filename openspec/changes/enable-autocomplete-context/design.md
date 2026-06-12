# 设计说明（enable-autocomplete-context）

## 一、方案总览

```
┌──────────────────────────────────────────────────────────────┐
│              FIM 上下文注入流程                                │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  光标移动（已有机制）                                          │
│    ↓                                                         │
│  ContextGatheringService.updateCache(model, position)        │
│    ├─ _gatherNearbySnippets()  →  附近代码片段               │
│    ├─ _gatherParentSnippets()  →  父级函数/类代码            │
│    └─ 递归收集符号定义                                        │
│                                                              │
│  用户键入 → AutocompleteService._provideInlineCompletionItems│
│    ↓                                                         │
│  getCachedSnippets()  →  string[]                            │
│    ↓                                                         │
│  取前 3 个片段，Token 限制 512                                │
│    ↓                                                         │
│  注入到 FIM prefix（注释形式）                                │
│    ↓                                                         │
│  ConvertToLLMMessageService.prepareFIMMessage()              │
│    ↓                                                         │
│  LLM FIM 请求                                                │
│                                                              │
│  prefix 示例：                                                │
│  // Relevant context:                                        │
│  // function handleSubmit(e: Event) { ... }                  │
│  // ----                                                     │
│  // interface UserForm { name: string; email: string; }      │
│  //                                                          │
│  <原有 prefix>                                                │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## 二、关键决策

### 决策 1：上下文以注释形式注入 prefix

将上下文片段以 `//` 注释形式（Python 等语言用 `#`）注入 FIM prefix 的最前面，与原有 prefix 之间用空行分隔。

**替代方案**：注入到 suffix 或单独的 context 字段
**否决原因**：大多数 FIM 模型只接受 `prefix` + `suffix` 两个输入，不支持额外字段；注释形式对模型是可识别的上下文提示，不会干扰补全内容。

### 决策 2：上下文 Token 限制为 512

FIM 模型上下文窗口有限（通常 2048–4096 Token），注入过多上下文会挤压 prefix/suffix 空间并增加延迟。策略：
- 上下文最多 **512 Token**（约 2000 字符）
- prefix + suffix + 上下文合计不超过模型 FIM 窗口的 75%
- 超限时按片段顺序截断（优先保留前面的片段）

### 决策 3：使用缓存而非实时收集

`ContextGatheringService` 已实现缓存机制：光标移动时异步更新缓存，补全请求时直接读取缓存。这避免了在补全请求路径上等待上下文收集，不影响补全延迟（<100ms）。

### 决策 4：上下文片段数量限制为 3

`getCachedSnippets()` 返回所有缓存片段。仅取前 3 个（`ContextGatheringService` 已按相关性/距离排序），避免注入过多噪音。

### 决策 5：按语言选择注释前缀

根据当前文件的 languageId 选择注释前缀：

| 语言 | 前缀 |
|------|------|
| typescript / javascript / tsx / jsx / java / c / cpp / go / rust | `//` |
| python / ruby / shell / yaml | `#` |
| html / xml / vue | `<!-- ... -->` |
| sql / lua | `--` |
| 其他/未知 | `//`（兜底） |

## 三、代码修改设计

### 3.1 autocompleteService.ts 修改

#### 3.1.1 恢复依赖注入

```typescript
constructor(
  @ILanguageFeaturesService private _langFeatureService: ILanguageFeaturesService,
  @ILLMMessageService private readonly _llmMessageService: ILLMMessageService,
  @IEditorService private readonly _editorService: IEditorService,
  @IModelService private readonly _modelService: IModelService,
  @IVoidSettingsService private readonly _settingsService: IVoidSettingsService,
  @IConvertToLLMMessageService private readonly _convertToLLMMessageService: IConvertToLLMMessageService,
  @IContextGatheringService private readonly _contextGatheringService: IContextGatheringService,  // ← 恢复
)
```

#### 3.1.2 在 `_provideInlineCompletionItems` 中收集上下文

```typescript
// 伪代码
private async _provideInlineCompletionItems(model: ITextModel, position: Position) {
  // ... 现有逻辑 ...

  // 新增：收集上下文片段
  const snippets = this._contextGatheringService.getCachedSnippets()
  const languageId = model.getLanguageId()
  const relevantContext = this._formatContextAsComments(snippets, languageId, /* maxTokens */ 512)

  // 将 relevantContext 作为 extraContext 传给 prepareFIMMessage
  const fimMessage = await this._convertToLLMMessageService.prepareFIMMessage({
    prefix,
    suffix,
    stopTokens,
    extraContext: relevantContext,   // ← 新增参数
  })

  // ... 现有 LLM 请求逻辑 ...
}

private _formatContextAsComments(snippets: string[], languageId: string, maxTokens: number): string {
  if (!snippets.length) return ''
  const prefix = this._commentPrefixFor(languageId)
  const lines: string[] = [`${prefix} Relevant context:`]
  let tokenEstimate = 0

  for (const snippet of snippets.slice(0, 3)) {
    const block = snippet.split('\n').map(l => `${prefix} ${l}`).join('\n')
    const blockTokens = Math.ceil(block.length / 4)  // 粗略：4 字符 ≈ 1 Token
    if (tokenEstimate + blockTokens > maxTokens) break
    lines.push(block, `${prefix} ----`)
    tokenEstimate += blockTokens
  }
  return lines.join('\n') + '\n\n'
}

private _commentPrefixFor(languageId: string): string {
  const hashLangs = new Set(['python', 'ruby', 'shellscript', 'yaml', 'makefile', 'dockerfile'])
  const dashLangs = new Set(['sql', 'lua', 'haskell'])
  if (hashLangs.has(languageId)) return '#'
  if (dashLangs.has(languageId)) return '--'
  return '//'
}
```

#### 3.1.3 确保缓存更新触发

`ContextGatheringService` 已在 `_subscribeToModel` 中订阅光标变化。`AutocompleteService` 无需额外触发 `updateCache()`，直接读取缓存即可。

### 3.2 convertToLLMMessageService.ts 修改

#### 3.2.1 扩展 `prepareFIMMessage` 接受 `extraContext`

```typescript
// 伪代码
interface PrepareFIMMessageParams {
  prefix: string
  suffix: string
  stopTokens: string[]
  extraContext?: string   // ← 新增
}

async prepareFIMMessage(params: PrepareFIMMessageParams) {
  const { prefix, suffix, stopTokens, extraContext = '' } = params

  // Token 预算控制
  const maxWindow = this._getFIMMaxTokens()       // 依据模型能力获取
  const extraTokens = Math.ceil(extraContext.length / 4)
  const budget = Math.floor(maxWindow * 0.75) - extraTokens

  const { truncatedPrefix, truncatedSuffix } = this._truncateFIM(prefix, suffix, budget)

  // 上下文作为 prefix 前缀
  const finalPrefix = extraContext + truncatedPrefix

  return {
    prefix: finalPrefix,
    suffix: truncatedSuffix,
    stopTokens,
  }
}
```

如果当前 `prepareFIMMessage` 已有 Token 裁剪逻辑，则仅新增 `extraContext` 参数并扣减其 Token 数，不重写现有裁剪规则。

## 四、与现有机制的关系

### 4.1 ContextGatheringService 已就绪

- 服务已在 `InstantiationType.Eager` 或 `Delayed` 注册（需确认）
- 已订阅 `onModelAdded` 和光标变化
- 已实现 `updateCache()` 和 `getCachedSnippets()`

本次仅**消费**该服务，无需修改其实现。

### 4.2 不影响 Agent 模式

`ContextGatheringService` 的上下文收集仅用于 FIM 补全。Agent 模式的系统提示和工具调用流程不受影响。

### 4.3 不依赖 add-code-index

本变更仅消费已有的 `ContextGatheringService`（基于 LSP 的符号收集），不依赖语义索引。语义索引上线后，可在后续变更中进一步增强 FIM 上下文。

## 五、性能分析

| 指标 | 启用前 | 启用后 | 影响 |
|------|--------|--------|------|
| 补全请求延迟 | ~500ms | ~500–600ms | 轻微增加（上下文读取缓存 <10ms，LLM 端处理增加） |
| FIM 请求大小 | ~1KB | ~3KB | 增加但可接受 |
| 补全质量 | 仅 prefix/suffix | 含项目上下文 | **显著提升** |
| 缓存更新开销 | N/A | 光标移动时异步 | 已有，不新增 |

## 六、验证策略

- **功能验证**：在 TypeScript 项目中键入函数调用，验证补全参数类型与定义匹配
- **Token 验证**：验证 prefix + suffix + context Token 不超模型窗口
- **降级验证**：当 `ContextGatheringService` 未就绪或缓存为空时，FIM 请求仍正常工作（`extraContext = ''`）
- **语言验证**：在 Python/SQL 文件中验证注释前缀正确
- **延迟验证**：对比启用前后补全延迟增加 < 100ms

## 七、风险与回滚

- **上下文噪音**：缓存片段可能与补全意图无关，反而降低质量。缓解：限制为 3 个片段，保持原 prefix/suffix 优先
- **Token 超限**：不同模型 FIM 窗口不同，需谨慎预算。缓解：按 75% 窗口预算控制
- **缓存滞后**：光标快速移动时缓存可能未更新。缓解：读取当前缓存即可，允许偶尔"一步之差"
- **回滚**：仅需恢复注释即可（2 个文件）
