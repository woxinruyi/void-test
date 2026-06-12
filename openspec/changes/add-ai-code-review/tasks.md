# 任务：AI 代码审查（/review）

## Phase 1 — SCM diff + feature 名 ✅

- [x] `common/voidSCMTypes.ts`：`IVoidSCMService` 接口增加 `gitDiff(path, compareRef?)`
- [x] `electron-main/voidSCMMainService.ts`：实现 `gitDiff` = `git diff --no-color [compareRef]`，截断到 `MAX_FULL_DIFF_LENGTH`（60000）
- [x] `common/voidSettingsTypes.ts`：`featureNames` 增加 `'Review'` + `displayInfoOfFeatureName` 补 'Code Review' 分支
- [x] 穷举处补齐：`voidSettingsService.ts` 的 `modelFilterOfFeatureName`、`defaultState` 两处字面量、老用户迁移回填（仿 SCM）
- [x] **编译验证：`npx tsc -p src/tsconfig.json --noEmit` 0 errors**

## Phase 2 — 审查服务 ✅

- [x] `common/prompt/reviewPrompts.ts`（独立新文件，避免改 WIP 密集的 prompts.ts）：`codeReview_systemMessage` + `codeReview_userMessage(diff, context)` + `ReviewFinding` 类型，约束严格 JSON 输出
- [x] `browser/reviewService.ts`：镜像 `GenerateCommitMessageService`，实现 `IReviewService.reviewChanges(compareRef='HEAD')`：定位 git 根 → gitDiff → prepareLLMSimpleMessages(featureName:'Review') → sendLLMMessage → 解析 JSON → 渲染到 untitled markdown 编辑器 + 通知
- [x] `registerSingleton(IReviewService, ...)` + `void.contribution.ts` `import './reviewService.js'`（同时补，避免孤儿注册）
- [x] 注册命令 `void.reviewChanges`（f1:true）+ SCMTitle 菜单项
- [x] **编译验证：`npx tsc -p src/tsconfig.json --noEmit` 0 errors**
- [ ] 子代理取上下文（可选增强，暂未做）

## Phase 3 — 结果视图（采用原生诊断方案 C）✅

- [x] `IMarkerService.changeAll('void-code-review', markers)` 发布 findings 为诊断
      （bug→Error / risk→Warning / nit→Info；定位 file:line；repo 相对路径 → URI.joinPath）
- [x] 原生「问题」面板可点击跳转 + 编辑器行内波浪线；同时打开 markdown 摘要编辑器
- [x] 每次运行 changeAll 重置 owner 标记（清理上次结果 / 无发现时清空）
- [x] 无改动 / 无 git 仓库 / 无发现 / LLM 失败 的友好提示（沿用 Phase 2）
- [x] 仅改 `reviewService.ts` 一个文件，零新 UI 管线，不触碰 getReactAccessor
- [x] **编译验证：`npx tsc -p src/tsconfig.json --noEmit` 0 errors**

## Phase 4 — 验证与归档

- [x] CDP 自动化验证（命令注册路径）：编译 out → 启动 → 命令面板触发 `void.reviewChanges` →
  **0 条注册报错（IReviewService 已解析）+ 命令执行 + 优雅处理"无 git 仓库"通知**。
  注：完整 diff→LLM 路径未端到端跑通——dev 实例扩展宿主 10s 未启动致 SCM 无 git 仓库，
  且真实 LLM 需配置凭证；二者均为环境限制，非代码缺陷。
- [ ] 在扩展宿主就绪 + 配置 Review 模型的环境中跑通完整路径，确认发现可点击跳转（Phase 3 后）
- [ ] `git diff` 确认仅为本方案新增，无无关改动
- [ ] 更新 `architecture/services-index.md`（新增 IReviewService）
- [ ] 归档至 `openspec/changes/archive/` + `.openspec.yaml` + README

## 后续（非本变更）

- [ ] Phase 2 多视角对抗审查（correctness/security/perf 并行 + 去重 + 真伪校验）
- [ ] 与 `/code-review` 命令参数对齐（effort、--fix）
