# 设计：设置面板挂载弹性

## 进程归属

全部位于 **renderer** 进程：
- workbench 模块图（`void.contribution.ts` 经 `import` 触发各服务 `registerSingleton`）。
- 设置 Pane（`voidSettingsPane.ts` 的 `EditorInput` + `EditorPane`）。
- React esbuild bundle（`react/`，独立打包，运行时挂载进 Pane）。

## 根因数据流

```
workbench 启动
  → void.contribution.ts 逐个 import 服务文件 → 各文件底部 registerSingleton 执行 → DI 容器登记
  （marketplaceService.ts 不在此图中 → IMarketplaceService 未登记）

打开设置
  → VoidSettingsPane.createEditor → mountVoidSettings(elt, accessor)
  → mountFnGenerator → _registerServices(accessor)
       → getReactAccessor: accessor.get(IMarketplaceService) → 未登记 → throw
  → （无 try/catch、无根 ErrorBoundary）→ 整树挂载失败 → 空白 Tab
```

关键证据：`marketplaceService.js` 全树唯一 importer 为 `react/src/util/services.tsx`；其余同批新增服务（IHookService / ITurnCheckpointService / IContextCompactionService 经 `chatThreadService.ts`，ICodeIndexService 经 `toolsService.ts`）均被图内文件 import，故注册正常。

## 与现有模块的关系

- **复用** 既有 `ErrorBoundary`（`react/src/sidebar-tsx/ErrorBoundary.tsx`，内部已用 `WarningBox` 作默认 UI），仅将其上提到设置根。
- **复用** 既有 contribution 注册模式：与 `voidSCMService.js` 等同样的一行 `import './marketplaceService.js'`。
- **扩展** `mountFnGenerator`：在不改变成功路径行为的前提下，为失败路径加兜底。

## 两层错误隔离的分工

- `_registerServices` 抛错发生在 React 之外、render 之前 → 由 `mountFnGenerator` 的 try/catch 捕获，向 `rootElement` 写入中文降级文案并 `console.error` 堆栈。
- 组件渲染期抛错 → 由根级 `ErrorBoundary` 捕获展示。
- 二者互补：前者保证"服务层失败有提示"，后者保证"渲染层失败有提示"。

## 技术风险与回滚

- 风险低：新增一行 import 仅触发已有服务注册；try/catch 与 ErrorBoundary 不改变正常路径。
- 回滚：三处改动相互独立，可单独 `git revert` 任一处；移除 import 即回到原故障态。

## 备注（非本次范围）

- `Settings.tsx` 用 `key={locale}` 导致语言切换整树重挂，与本问题叠加会放大故障面，列入后续优化（见 temp 文档 I-4），本次不动。
