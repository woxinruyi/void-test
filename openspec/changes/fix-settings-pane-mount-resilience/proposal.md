# 提案：修复设置面板挂载失败 + 加固 React 挂载层错误隔离

## 背景

点击齿轮打开 YWCode 设置后，设置 Tab 空白、无任何报错。经 import-图静态追踪定位并完成全量审计，确认这是一类**"已消费但未注册的孤儿服务"** 问题，叠加挂载层缺乏错误隔离被放大为"整页空白且静默"。

直接触发源：`marketplaceService.ts` 内有 `registerSingleton(IMarketplaceService, …)`，但该文件在整个 `void` 目录里**只被 React bundle（`react/src/util/services.tsx`）引用**，`void.contribution.ts`（workbench 模块图根）从未 import 它 → workbench 启动时该注册从不执行。打开设置时 `getReactAccessor` 调用 `accessor.get(IMarketplaceService)` 抛错。

## 相关问题清单（本次一并梳理）

1. **P0 孤儿注册**：`IMarketplaceService` 未进入 workbench 模块图（缺一行 contribution import）。
2. **P1 挂载层零错误隔离**：`mountFnGenerator` 对 `_registerServices` 与首次 render 无 try/catch；`Settings` 根级无 ErrorBoundary；`voidSettingsPane.ts` 用 `?.dispose` 静默吞错 —— 任一服务抛错都使整页空白无提示。
3. **系统性风险**：`getReactAccessor` 在 mount 时**一次性 eager 解析 46 个服务**，任一孤儿即全盘崩溃；该 accessor 为所有 React 表面（设置/侧边栏等）共用，故影响面大。
4. **P3 次要**：`Settings.tsx` 以 `key={locale}` 触发语言切换整树重挂，放大故障面（本次不改，记录于后续）。
5. **无害项**：`_markerCheckService` / `_dummyContrib` 为下划线 scaffold，无 importer 亦无消费方，属死注册，非本次范围。

## 目标

1. `IMarketplaceService` 在 workbench 启动时正确注册，设置 Tab 恢复显示。
2. mount 期服务注册失败时给出可见中文降级提示并打印完整堆栈，渲染期抛错由根级 ErrorBoundary 兜底 —— 杜绝"静默空白"。
3. 全量核对 `getReactAccessor` 所有服务注册可达性，确认无其他孤儿。

## 非目标

- 不改 Marketplace 业务逻辑/UI、不重构设置信息架构、不调整其他服务注册方式。
- 不改 i18n / titlebar 既有行为。
- 不处理下划线 scaffold 死注册与 `key={locale}` 重挂（列为后续）。

## 影响范围

- 进程：renderer（React 挂载层 + 设置 Pane + workbench 注册图）。
- 文件：`browser/void.contribution.ts`、`react/src/util/mountFnGenerator.tsx`、`react/src/void-settings-tsx/index.tsx`。

## 审计结论

`getReactAccessor`（`services.tsx:193-252`）全部 46 个服务 + 其余已注册 Void 服务经 import-图核对：**唯一真实孤儿为 `IMarketplaceService`（已修复）**，其余已消费服务均有图内可达 importer。React 挂载层完全合规。

## 验收标准

- 启动应用点击设置，Tab 正常渲染 models/features/trust/codeIndex/mcp/skill/general 七个分区。
- 故障注入（临时 `accessor.get` 一个不存在服务）时显示中文错误提示而非空白。
- `node build.js` 成功；`npx tsc -p src/tsconfig.json --noEmit` 0 errors。
