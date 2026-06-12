# 提案：AI 代码审查（/review）

## 背景

对标 Cursor BugBot、Claude Code 审查子代理后发现：YWCode 缺少"对改动做 AI 代码审查"的闭环（见 `temp-ai-coding-tools-benchmark.md` 差距 P1-2）。而本仓库已具备拼出该能力的全部零件——`IVoidSCMService`（git diff 信息）、`llmMessageService`（LLM 调用）、`ISubagentService`（只读上下文检索）、工具系统与设置中的 per-feature 模型选择。现有 `GenerateCommitMessageService`（`browser/voidSCMService.ts`）就是"聚合 git 信息 → 建 prompt → 调 LLM → 落地结果"的完整范式，直接镜像即可低成本实现。

## 目标

1. 提供命令 `void.reviewChanges`（命令面板 + SCM 标题栏按钮）对当前工作区改动做 AI 审查。
2. 审查输入为 git diff（未提交改动；可选指定与某 ref 比较），输出结构化发现：文件 + 行 + 严重级（bug/risk/nit）+ 说明 + 建议。
3. 审查结果在一个只读结果视图（或聊天消息）中呈现，支持点击跳转到对应文件行。
4. 模型走设置中的 per-feature 选择（新增 `Review` feature，沿用现有 `SCM` 的取值方式）。

## 非目标

- 不做 PR 级/远程 GitHub 集成（仅本地工作区 diff）；不做 inline PR 评论。
- 不引入新的并行编排框架；首版单次 LLM 调用，"多视角对抗校验"留作 Phase 2。
- 不改 `ISubagentService` 现有只读语义；如需上下文检索仅复用其 `dispatch`。

## 影响范围

- 进程：renderer（新审查服务 + 结果 UI）+ 复用 main 的 SCM/LLM 通道。
- 复用：`IVoidSCMService`、`ILLMMessageService`、`IConvertToLLMMessageService`、`ISubagentService`、`IVoidSettingsService`、`voidSettingsTypes.featureNames`。
- 新增：`browser/reviewService.ts`（镜像 GenerateCommitMessageService）；`IVoidSCMService.gitDiff()`（SCM 缺完整 diff，需补一个方法）；结果视图组件。

## 验收标准

- 在有未提交改动的 git 仓库执行 `void.reviewChanges`，得到带文件/行/严重级的审查发现，点击可跳转。
- 无改动时给出"无改动可审查"的友好提示，不报错。
- `Review` feature 的模型选择在设置中可配；未配时回退默认模型。
- `node build.js` + `npx tsc -p src/tsconfig.json --noEmit` 0 errors。
