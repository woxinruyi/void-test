# 任务清单（enable-autocomplete-context）

## 1. 依赖注入恢复

- [ ] 1.1 在 `autocompleteService.ts` 的 `AutocompleteService` 构造函数中取消注释 `@IContextGatheringService` 依赖
- [ ] 1.2 确认 `ContextGatheringService` 已注册为 Singleton 且在 `AutocompleteService` 之前初始化

## 2. 上下文收集与格式化

- [ ] 2.1 在 `AutocompleteService` 中新增 `_formatContextAsComments(snippets, languageId, maxTokens)` 方法
- [ ] 2.2 在 `AutocompleteService` 中新增 `_commentPrefixFor(languageId)` 方法，覆盖常见语言的注释前缀
- [ ] 2.3 在 `_provideInlineCompletionItems()` 中调用 `getCachedSnippets()`，取前 3 个片段
- [ ] 2.4 实现 Token 估算（粗略 4 字符 ≈ 1 Token），控制上下文 Token ≤ 512

## 3. FIM 消息构造集成

- [ ] 3.1 在 `ConvertToLLMMessageService.prepareFIMMessage()` 的参数类型中新增 `extraContext?: string`
- [ ] 3.2 在 `prepareFIMMessage()` 中从 `maxWindow * 0.75` 的预算中扣除 `extraContext` 的 Token
- [ ] 3.3 在 `prepareFIMMessage()` 中将 `extraContext` 拼接到 `truncatedPrefix` 的最前面
- [ ] 3.4 在 `AutocompleteService` 中将收集到的上下文作为 `extraContext` 传入 `prepareFIMMessage()`

## 4. 构建与验证

- [ ] 4.1 TypeScript 编译通过，无类型错误
- [ ] 4.2 在 TypeScript 项目中验证函数调用补全能参考函数定义的类型
- [ ] 4.3 在 Python 文件中验证注释前缀为 `#`
- [ ] 4.4 验证上下文为空时 FIM 请求正常（降级）
- [ ] 4.5 验证补全延迟增加 < 100ms
- [ ] 4.6 构建完整应用，验证无回归问题
