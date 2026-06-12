# 启用：Autocomplete 上下文注入（enable-autocomplete-context）

## 背景

Void 编辑器的 `AutocompleteService`（FIM 自动补全）当前**没有注入项目上下文**。在 `autocompleteService.ts` 中，`IContextGatheringService` 的注入和调用已被注释掉：

```typescript
// @IContextGatheringService private readonly _contextGatheringService: IContextGatheringService,
```

```typescript
// const relevantSnippetsList = await this._contextGatheringService.readCachedSnippets(model, position, 3);
// const relevantSnippets = relevantSnippetsList.map((text) => `${text}`).join('\n-------------------------------\n')
const relevantContext = ''  // 当前为空字符串
```

这意味着 FIM 请求只包含光标前后的 prefix/suffix 文本，LLM 无法参考项目中的其他相关代码（如函数定义、类型声明、导入的模块等），补全质量受限。

`ContextGatheringService` 已实现完整的上下文收集能力：
- `_gatherNearbySnippets()`：光标附近 N 行代码
- `_gatherParentSnippets()`：父级函数/类代码
- 递归收集符号定义
- `getCachedSnippets()`：获取缓存片段

只需取消注释并调试即可启用，**投入极小，产出显著**。

## 目标

- 启用 `AutocompleteService` 对 `ContextGatheringService` 的调用
- 将上下文片段注入 FIM 请求的 prefix 中，提升补全质量
- 确保 FIM 请求的 Token 总量不超出模型限制

## 非目标（Non-goals）

- 不修改 `ContextGatheringService` 的核心逻辑
- 不实现语义搜索上下文注入（属于 `add-code-index` 变更）
- 不修改 FIM 模型选择逻辑
- 不修改 Autocomplete 的缓存/LRU 策略

## 方案

1. **取消注释**：恢复 `AutocompleteService` 构造函数中 `IContextGatheringService` 的注入
2. **读取缓存**：在 `_provideInlineCompletionItems()` 中调用 `getCachedSnippets()` 获取上下文片段
3. **注入 prefix**：在 `prepareFIMMessage()` 中将上下文片段以注释形式注入 FIM prefix
4. **Token 控制**：限制注入的上下文 Token 数量，确保不超出模型 FIM 窗口
5. **缓存更新**：确保 `ContextGatheringService.updateCache()` 在光标移动时被调用

## 影响

- 修改文件：`autocompleteService.ts`、`convertToLLMMessageService.ts`
- FIM 请求大小增加（prefix 中包含上下文注释），需确保 Token 不超限
- 补全质量提升：LLM 可参考函数定义、类型声明等上下文
- 风险：上下文注入可能增加 FIM 延迟（需控制注入量）
