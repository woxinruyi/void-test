# 任务：修复 autocomplete 上下文服务 DI

## Phase 1 — 恢复注册并验证

- [x] 取消注释 `browser/void.contribution.ts:56` 的 `import './contextGatheringService.js'`
- [x] 确认 `contextGatheringService.ts` 顶层 `registerSingleton(..., InstantiationType.Eager)` 会随 import 执行
- [x] 审查 `ContextGatheringService` 构造函数依赖（`ILanguageFeaturesService`/`IModelService`/`ICodeEditorService` 均已注册；副作用仅为轻量事件订阅），确认启动期不会抛错
- [x] **编译验证：`npx tsc -p src/tsconfig.json --noEmit` 0 errors**

## Phase 2 — 端到端确认（需打包运行）

- [ ] 打包启动后，在编辑器中触发 FIM 自动补全，确认无 DI 解析错误（控制台无 "No service available for IContextGatheringService"）
- [ ] 确认补全请求 prefix 在上下文非空时带 `// Relevant context:` 段
- [ ] 观察启动耗时无明显回退（Eager 实例化代价可接受）
- [ ] 同步更新 `enable-autocomplete-context` 的 tasks.md 勾选状态（与 reconcile-openspec-status 协同）
