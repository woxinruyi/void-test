# 任务：修复设置面板挂载失败 + 加固错误隔离

## Phase 0 — 根因修复（治标）

- [x] `void.contribution.ts` 增加 `import './marketplaceService.js'`，使 `IMarketplaceService` 在 workbench 启动时注册
- [x] **编译验证：`node build.js`（React bundle）Build success**
- [x] **编译验证：`npx tsc -p src/tsconfig.json --noEmit` 0 errors**
- [ ] 启动应用点击设置，确认 Tab 恢复显示（人工）

## Phase 1 — 错误隔离（治本）

- [x] `mountFnGenerator.tsx`：`_registerServices` 包 try/catch，失败时向 rootElement 写中文降级文案 + `console.error` 堆栈
- [x] `void-settings-tsx/index.tsx`：根级 `ErrorBoundary` 包裹 `<Settings/>`
- [x] **编译验证：`node build.js` + `npx tsc -p src/tsconfig.json --noEmit` 0 errors**
- [ ] 故障注入验证：临时 `accessor.get` 一个不存在的服务，确认显示错误提示而非空白（人工）

## Phase 2 — 防复发复核

- [x] 逐一核对 `getReactAccessor`（`services.tsx:193-252`）全部 46 个服务均有图内可达的 `registerSingleton`
- [x] 结论：唯一孤儿为 `IMarketplaceService`（已于 Phase 0 修复）；其余 Void 自定义服务 importer 均在图内：
  - IConvertToLLMMessageService ← autocompleteService / chatThreadService / editCodeService / voidSCMService
  - IMCPService ← chatThreadService / sendLLMMessageService
  - IVoidCommandBarService ← editCodeService / toolsService
  - IExtensionTransferService ← miscWokrbenchContrib
  - ICodeIndexService ← toolsService；IHook/ITurnCheckpoint/IContextCompaction ← chatThreadService
- [ ] （可选）新增设置面板烟雾测试：服务缺失时渲染 fallback 而非抛错
- [ ] （可选·更大范围）审计未进入 `getReactAccessor` 的其余已注册服务（IPlanningService / IMemoryService / ISubagentService / IWebSearchService 等）是否也有图内可达 importer —— 与本 Bug 无关，列为后续

## Phase 3 — 归档

- [ ] `git diff` 确认改动仅为本方案三处，无无关"顺手改进"
- [ ] 更新 `architecture/services-index.md`（如需记录 IMarketplaceService 注册路径）
- [ ] 移动至 `openspec/changes/archive/` 并补 `.openspec.yaml` 与归档 README
