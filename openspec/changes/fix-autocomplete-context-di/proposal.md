# 修复：autocomplete 上下文服务未注册导致的 DI 失败（fix-autocomplete-context-di）

## 背景

`enable-autocomplete-context` 的实现处于"半成品"状态，会导致依赖注入解析失败：

- `autocompleteService.ts:901` 已恢复注入 `@IContextGatheringService private readonly _contextGatheringService`，并在 L759 调用 `getCachedSnippets()`、L554-555 将结果拼入补全前缀。
- `contextGatheringService.ts:354` 通过 `registerSingleton(IContextGatheringService, ContextGatheringService, InstantiationType.Eager)` 注册服务。
- **但** `void.contribution.ts:56` 的 `import './contextGatheringService.js'` 仍被注释。

VS Code DI 中 `registerSingleton(...)` 是模块顶层副作用，**只有该文件被 import 时才执行**。import 被注释 ⇒ 服务从未注册 ⇒ `AutocompleteService` 构造时索要未注册的 `IContextGatheringService` ⇒ 运行时抛 "No service available"。

## 目标

- 恢复 `contextGatheringService.js` 的注册 import，使 `AutocompleteService` 能正确实例化。
- 确认补全上下文注入链路（snippets → prefix）端到端可用。

## 非目标

- 不改动 `ContextGatheringService` 的快照算法与缓存策略。
- 不调整 `autocompleteService` 的补全触发逻辑。

## 方案概述

取消注释 `void.contribution.ts:56`：`import './contextGatheringService.js'`。该服务为 `InstantiationType.Eager`（启动即实例化），需验证其构造函数不在启动期抛错或引入明显性能回退。

## 影响范围

- `browser/void.contribution.ts`（1 行）—renderer。

## 验收标准

1. `npx tsc -p src/tsconfig.json --noEmit` 输出 0 errors。
2. 启动后触发自动补全不再因 `IContextGatheringService` 解析失败而报错。
3. 当补全上下文非空时，请求 prefix 中出现 `// Relevant context:` 前缀（`getCompletionOptions` L554-555 路径生效）。
4. 启动期无新增可感知卡顿（Eager 服务实例化）。
