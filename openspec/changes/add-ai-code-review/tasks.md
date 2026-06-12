# 任务：AI 代码审查（/review）

## Phase 1 — SCM diff + feature 名

- [ ] `common/voidSCMTypes.ts`：`IVoidSCMService` 接口增加 `gitDiff(path, compareRef?)`
- [ ] `electron-main/voidSCMMainService.ts`：实现 `gitDiff` = `git diff --no-color [compareRef]`，按现有 MAX_* 习惯截断
- [ ] `common/voidSettingsTypes.ts`：`featureNames` 增加 `'Review'`，并核对所有穷举 featureNames 处（设置 UI、modelSelectionOfFeature 初始化）补齐
- [ ] **编译验证：`npx tsc -p src/tsconfig.json --noEmit` 0 errors**

## Phase 2 — 审查服务

- [ ] `common/prompt/prompts.ts`：新增 `codeReview_systemMessage` + `codeReview_userMessage(diff, context)`，约束严格 JSON 输出
- [ ] `browser/reviewService.ts`：镜像 `GenerateCommitMessageService`，实现 `IReviewService.review(compareRef?)`：定位 git 根 → gitDiff →（可选 subagent 取上下文）→ prepareLLMSimpleMessages(featureName:'Review') → sendLLMMessage → 解析 JSON 发现
- [ ] `registerSingleton(IReviewService, ...)` + 在 `void.contribution.ts` `import './reviewService.js'`（避免孤儿注册，参考 fix-settings-pane-mount-resilience 教训）
- [ ] 注册命令 `void.reviewChanges`（f1:true）+ SCM 标题栏菜单项
- [ ] **编译验证：`npx tsc -p src/tsconfig.json --noEmit` 0 errors**

## Phase 3 — 结果视图

- [ ] 新增只读"审查结果"EditorInput/Pane（镜像 voidSettingsPane）+ React 列表渲染发现
- [ ] 挂载层复用 `mountFnGenerator` try/catch + 根 ErrorBoundary（错误隔离）
- [ ] 点击发现 → `editorService.openEditor` 跳转文件 + 行
- [ ] 无改动 / 无发现 / LLM 失败的友好提示
- [ ] **编译验证：`node build.js` + `npx tsc -p src/tsconfig.json --noEmit` 0 errors**

## Phase 4 — 验证与归档

- [ ] 在有未提交改动的仓库执行 `void.reviewChanges`，确认发现可点击跳转（CDP 自动化或人工）
- [ ] `git diff` 确认仅为本方案新增，无无关改动
- [ ] 更新 `architecture/services-index.md`（新增 IReviewService）
- [ ] 归档至 `openspec/changes/archive/` + `.openspec.yaml` + README

## 后续（非本变更）

- [ ] Phase 2 多视角对抗审查（correctness/security/perf 并行 + 去重 + 真伪校验）
- [ ] 与 `/code-review` 命令参数对齐（effort、--fix）
