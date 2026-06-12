# 提案：修复设置面板挂载失败 + 加固 React 挂载层错误隔离

## 背景

点击齿轮打开 YWCode 设置后，设置 Tab 空白、无任何报错。经 import-图静态追踪 + 运行时 CDP 验证，确认这是一类**"已消费但未注册的服务"** 问题，叠加挂载层缺乏错误隔离被放大为"整页空白且静默"。共有**两层未注册**：

**第一层（首个抛错，运行时才暴露）—— `IVoidSCMService` 渲染进程未注册**：`common/voidSCMTypes.ts` 定义 `IVoidSCMService`（id `'voidSCMService'`），`convertToLLMMessageService.ts:567` 以 `@IVoidSCMService` 注入，`editCodeService` 经依赖它间接依赖。但渲染进程从未 `registerSingleton(IVoidSCMService, …)`（`browser/voidSCMService.ts` 只注册了 `IGenerateCommitMessageService`，内部自建 ProxyChannel 用）。`_registerServices` 第 5 步 `accessor.get(IEditCodeService)` 即抛 `editCodeService depends on voidSCMService which is NOT registered`，连锁拖垮 settings/autocomplete/sidebar。

**第二层（第二个抛错点，静态分析发现）—— `IMarketplaceService` 孤儿注册**：`marketplaceService.ts` 的 `registerSingleton` 只被 React bundle 引用，`void.contribution.ts` 从未 import → workbench 启动时不执行；`getReactAccessor` 的 `accessor.get(IMarketplaceService)` 抛错。

> 静态 import-图追踪只能发现"模块根本没进图"的孤儿（第二层），无法发现"模块进了图、但某 decorator 没 registerSingleton"的第一层 —— 后者必须运行时验证。本次正是 CDP 运行验证补全了这一盲区。

## 相关问题清单（本次一并梳理）

1. **P0-a 渲染进程漏注册**：`IVoidSCMService` 被注入但渲染进程无 `registerSingleton`（首个抛错，连锁拖垮 editCode/convertToLLMMessage/settings）。
2. **P0-b 孤儿注册**：`IMarketplaceService` 未进入 workbench 模块图（缺一行 contribution import）。
3. **P1 挂载层零错误隔离**：`mountFnGenerator` 对 `_registerServices` 与首次 render 无 try/catch；`Settings` 根级无 ErrorBoundary；`voidSettingsPane.ts` 用 `?.dispose` 静默吞错 —— 任一服务抛错都使整页空白无提示。
4. **系统性风险**：`getReactAccessor` 在 mount 时**一次性 eager 解析 46 个服务**，任一未注册即全盘崩溃；该 accessor 为所有 React 表面（设置/侧边栏等）共用，故影响面大。
5. **P3 次要**：`Settings.tsx` 以 `key={locale}` 触发语言切换整树重挂，放大故障面（本次不改，记录于后续）。
6. **无害项**：`_markerCheckService` / `_dummyContrib` 为下划线 scaffold，无 importer 亦无消费方，属死注册，非本次范围。

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
- 文件：`browser/voidSCMService.ts`（注册 IVoidSCMService）、`browser/void.contribution.ts`（注册 IMarketplaceService）、`react/src/util/mountFnGenerator.tsx`、`react/src/void-settings-tsx/index.tsx`。

## 验证结果（已通过，CDP 自动化）

用 `--remote-debugging-port` 启动 dev 应用，经 CDP 用命令面板打开设置并探测 DOM：
- 修复前：控制台 `editCodeService depends on voidSCMService which is NOT registered` + 设置面板显示"加载失败"降级文案。
- 修复后：设置 tab active；React 根 `.void-scope` 挂载；七个导航分区（Models/Feature Options/Tools & Trust/Code Index/MCP Servers/Skills/General）全部渲染；无降级文案；控制台无 SCM/marketplace/注册相关报错。
- 编译：`gulp compile-client` 0 errors；`npx tsc -p src/tsconfig.json --noEmit` 0 errors。

## 审计结论

`getReactAccessor`（`services.tsx:193-252`）全部 46 个服务 + 其余已注册 Void 服务经 import-图核对：**唯一真实孤儿为 `IMarketplaceService`（已修复）**，其余已消费服务均有图内可达 importer。React 挂载层完全合规。

## 验收标准

- 启动应用点击设置，Tab 正常渲染 models/features/trust/codeIndex/mcp/skill/general 七个分区。
- 故障注入（临时 `accessor.get` 一个不存在服务）时显示中文错误提示而非空白。
- `node build.js` 成功；`npx tsc -p src/tsconfig.json --noEmit` 0 errors。
