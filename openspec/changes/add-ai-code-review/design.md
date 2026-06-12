# 设计：AI 代码审查（/review）

## 进程归属

- renderer：`reviewService.ts`（编排）、结果视图（React 或原生 EditorPane）。
- main：复用 `void-channel-scm`（git）与 LLM 通道，无新增 main 服务。

## 复用的现成范式

`browser/voidSCMService.ts` 的 `GenerateCommitMessageService` 已演示完整链路，`reviewService` 直接镜像其构造与调用方式：

```
gather(git 信息)  →  prepareLLMSimpleMessages(systemMsg + userMsg)  →  llmMessageService.sendLLMMessage(...)  →  解析 → 落地
```

- 注入：`@ISCMService`（定位 git 仓库根，同 GenerateCommitMessageService.gitRepoInfo）、`@IVoidSCMService`、`@IConvertToLLMMessageService`、`@ILLMMessageService`、`@IVoidSettingsService`、`@INotificationService`、（可选）`@ISubagentService`。
- 模型选择：`voidSettingsService.state.modelSelectionOfFeature['Review']`，沿用 `'SCM'` 取值写法。需在 `voidSettingsTypes.ts` 的 `featureNames` 增加 `'Review'`（与现有 feature 同构）。

## 数据流

```
void.reviewChanges
  → reviewService.review(compareRef?)
  → 定位 git 根 (ISCMService)
  → 取 diff：IVoidSCMService.gitDiff(path, compareRef?)   ← 新增方法（见下）
  → [可选] 对改动涉及的符号用 subagentService.dispatch 拉 references/definitions 作上下文
  → convertToLLMMessageService.prepareLLMSimpleMessages({ systemMessage: review_systemPrompt, simpleMessages: [diff + 上下文], featureName:'Review' })
  → llmMessageService.sendLLMMessage(... onFinalMessage)
  → 解析 LLM 返回的 JSON 发现列表
  → 渲染到结果视图（点击跳转 editorService.openEditor + 行号）
```

## 需要新增的 SCM 方法

`IVoidSCMService` 当前只有 stat/sampledDiffs/branch/log，无完整 diff。在 `common/voidSCMTypes.ts` 接口与 `electron-main/voidSCMMainService.ts` 实现补：

```ts
// 完整 unified diff（未提交改动；compareRef 可选，默认工作区 vs HEAD）
gitDiff(path: string, compareRef?: string): Promise<string>
```

main 侧实现 = `git diff [compareRef]`（含 `--no-color`，截断到上限字符，复用项目现有 MAX_* 截断习惯）。

## 输出契约（LLM → 结构化）

要求模型按固定 JSON 返回，便于渲染与点击跳转：

```json
{ "findings": [ { "file": "src/x.ts", "line": 42, "severity": "bug|risk|nit", "title": "...", "detail": "...", "suggestion": "..." } ] }
```

system prompt 置于 `common/prompt/prompts.ts`（与 `gitCommitMessage_systemMessage` 同处），中文说明 + 严格 JSON 输出约束 + "无问题则返回空 findings"。

## 渲染目标（最终采用 C — 原生诊断）

实现时选择了比 A/B 更地道、风险更低的方案 **C**：

- **C（已采用）原生诊断**：用 `IMarkerService.changeAll('void-code-review', markers)` 把每条 finding 发布为 marker（bug→Error / risk→Warning / nit→Info），定位到 `file:line`。
  - 直接出现在 VS Code 原生「问题」面板，**原生可点击跳转**；并在编辑器对应行显示波浪线。
  - 同时打开一个 markdown 摘要编辑器供阅读。
  - 零新 UI 管线：不新增 EditorPane / React bundle / build.js 入口，不触碰 `getReactAccessor` 的 eager 列表（规避 fix-settings-pane-mount-resilience 那类风险）。仅改 `reviewService.ts` 一个文件。
- ~~A：自定义 React EditorPane~~ / ~~B：聊天消息~~ —— 相比 C 都更重且无原生跳转优势，未采用。

## Phase 2（非首版）

- 多视角对抗审查：对同一 diff 并行发起 correctness/security/perf 三个 LLM 调用，合并去重后再过一轮"是否真问题"校验（参考 benchmark 文档的对抗校验模式）。
- 与 `/code-review` 类命令对齐参数（effort、--fix）。

## 风险与回滚

- 风险低：纯新增服务 + 一个 SCM 方法 + 一个 feature 名 + 一个结果视图，不改既有路径。
- 回滚：移除 contribution 中 `import './reviewService.js'` 即停用；其余新增文件独立。
- 注意：`Review` 加入 `featureNames` 需同步检查所有 `featureNames` 的穷举处（设置 UI、modelSelectionOfFeature 初始化），避免遗漏键导致 undefined。
