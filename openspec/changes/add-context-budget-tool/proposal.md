# 新增：上下文预算自省工具 get_context_remaining（add-context-budget-tool）

## 背景

三方设计对标（`temp-三方设计对标-YWCode-vs-Codex-vs-ClaudeCode.md`）列出的差距之一：**上下文压缩自省**。Codex 暴露 `get_context_remaining` / `new_context_window` 工具，让模型自查上下文预算并自我节制（提前收尾、主动压缩），降低长任务的上下文溢出与"跑飞"。YWCode 已有 `ContextCompactionService`（被动压缩），但**无面向模型的预算自省工具**。

## 目标

- 新增只读内置工具 **`get_context_remaining`**：返回当前线程的 `usedTokens / contextWindow / remainingTokens / usedPercent`，供模型自我节制。
- 预算口径复用既有能力：`ContextCompactionService.estimateTokens(messages)`（已用）+ 模型矩阵 `contextWindow`（总额）。
- 只读工具 → 默认自动审批（无 `approvalTypeOfBuiltinToolName` 条目）。

## 非目标

- **不**实现 Codex 的 `new_context_window`（重置上下文窗口），仅做只读自省。
- **不**改压缩触发逻辑（`ContextCompactionService` 不动）；本工具是旁路只读消费者。
- **不**改 token 估算算法（沿用 `estimateTokens`，其精度问题另议）。

## 方案要点

1. **纯计算**（已落地，可测）：`common/contextBudget.ts` 的 `computeContextBudget(usedTokens, contextWindow)` + `formatContextBudget`（钳制负值/超用、防除零）。
2. **接入内置工具**（Phase 2，需运行时验证）：
   - `toolsServiceTypes.ts`：`BuiltinToolCallParams['get_context_remaining'] = {}`；`BuiltinToolResultType['get_context_remaining'] = ContextBudget`。
   - `toolsService.ts`：`validateParams`（无参→{}）、`callTool`（取当前线程 messages→estimateTokens；取选中模型 contextWindow；调 computeContextBudget）、`stringOfResult`（formatContextBudget）。
   - `prompts.ts`：工具定义（描述 + 何时调用："长任务中先查预算，临近上限则收敛/压缩"）。
3. tsc 对内置工具映射的完整性强制校验（缺任一 map 即编译失败）→ 接好即完整。

## 影响范围

- 新增 `common/contextBudget.ts`（纯函数）+ 单测/eval。
- Phase 2：`common/toolsServiceTypes.ts`、`browser/toolsService.ts`、`common/prompt/prompts.ts` 各新增一处条目。

## 验收标准

1. `computeContextBudget` 边界正确（超用→remaining 0/pct 100；contextWindow 0 不除零；负值钳制）—— 确定性单测通过。
2. （Phase 2）`get_context_remaining` 被注册为只读内置工具，`tsc` 0 errors（映射完整）。
3. （Phase 2）运行时：Agent 可调用并得到合理预算；只读自动审批；不影响既有工具/压缩。

## 状态

- **Phase 1（纯计算 + 测试）已执行**：`contextBudget.ts` + `contextBudgetEval.ts`（6/6）+ `contextBudget.test.ts`。
- **Phase 2（工具接入）已执行（2026-06-13）**：
  - `toolsServiceTypes.ts`：`get_context_remaining` 加入 `BuiltinToolCallParams`({}) + `BuiltinToolResultType`(ContextBudget)。
  - `prompts.ts`：`builtinTools.get_context_remaining` 工具定义（只读、无参、自我节制说明）。
  - `toolsService.ts`：validateParams / callTool / stringOfResult 三映射补全；callTool 懒解析 `IChatThreadService` 取当前线程消息→`contextCompactionService.estimateTokens`→`getModelCapabilities().contextWindow`→`computeContextBudget`，避免构造期 DI 循环。
  - 无 `approvalTypeOfBuiltinToolName` 条目 → 只读自动审批。
  - tsc 对内置工具映射强制完整性校验通过 = 接线完整。
  - **运行时（模型实际调用效果）仍需在 Electron 实跑确认**。
