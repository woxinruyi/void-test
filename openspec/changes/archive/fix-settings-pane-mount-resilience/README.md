# 已归档：修复设置面板挂载失败 + 加固错误隔离（fix-settings-pane-mount-resilience）

- **状态**：✅ 已完成并归档（CDP 运行时验证通过）
- **归档日期**：2026-06-12
- **摘要**：点击设置后 Tab 空白且无报错。两层真因——(1) `IVoidSCMService` 被 `convertToLLMMessageService`/`editCodeService` 注入但渲染进程从未 `registerSingleton`（首个抛错，连锁拖垮 settings/autocomplete/sidebar，运行时才暴露）；(2) `IMarketplaceService` 孤儿注册（仅 React bundle 引用，未进 `void.contribution.ts` import 图，静态分析发现）。修复：`voidSCMService.ts` 注册渲染侧 ProxyChannel 代理；`void.contribution.ts` 补 marketplace import；并加固挂载层（`mountFnGenerator` try/catch + `Settings` 根级 ErrorBoundary），令服务注册失败从"静默空白"变为可见降级。
- **验证**：CDP 自动化——设置 tab active、`.void-scope` 挂载、七分区全渲染、无降级文案、控制台零报错；`gulp compile-client` + `tsc --noEmit` 0 errors。
- **提交**：`c433a82`（marketplace + 错误隔离）、`d61db0c`（架构文档）、`9b7c79d`（voidSCM + 提案）。
- **方法论**：静态 import-图只能发现"模块没进图"的孤儿，发现不了"模块进了图但 decorator 漏注册"的注入缺失——后者必须运行时验证。
