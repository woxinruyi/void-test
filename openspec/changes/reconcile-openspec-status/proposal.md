# 流程：OpenSpec 状态对账与归档（reconcile-openspec-status）

## 背景

OpenSpec 的 `tasks.md` 复选框已与真实代码**严重脱节**，且 `openspec/specs/` 为空（无任何已固化能力规范）。经逐一对照源码验证，多个标记为"0%"的提案其实**已在代码中完整实现**：

| 提案 | 复选框 | 真实状态（代码证据） |
|------|:--:|------|
| add-lsp-tools | 0/18 | ✅ 已完成（5 个 LSP 工具在 prompts.ts） |
| add-tool-hooks | 0/33 | ✅ 已完成（Pre/Post/Error hook 接入 chatThreadService:750-915） |
| enhance-checkpoints | 0/40 | ✅ 已完成（turnCheckpointService 记录 edit/create/abort） |
| add-reasoning-budget-auto | 22/33 | ✅ 关键词触发已接入 chatThreadService:1062 |
| enable-autocomplete-context | 0/16 | ⚠️ 注入已恢复但服务未注册（见 fix-autocomplete-context-di） |
| optimize-agent-loop | 16/41 | ✅ 核心（并行工具+提示词）已被 enhance-agent-prompt-and-context 接管完成 |

这破坏了 spec-driven 工作流的可信度——状态不可信则无法据其决策。

## 目标

- 逐个 change 对照真实代码核定状态，更新 `tasks.md` 复选框使其反映现实。
- 将已实质完成的 change 走 archive 流程，移入 `openspec/changes/archive/`。
- 将归档 change 的 spec deltas 合并进 `openspec/specs/`，让 specs/ 成为"能力真相源"。

## 非目标

- 不修改任何功能代码（autocomplete DI 修复由 fix-autocomplete-context-di 单独承担）。
- 不删除未完成的 change；仅完成或归档，不丢历史。

## 方案概述

1. 对每个 change 做"代码 vs tasks.md"核对（已完成大部分核查）。
2. 已完成：勾选 → 归档 → 合并 spec 到 specs/。
3. 部分完成（improve-tool-approval-policy 26/41、simplify-settings-aggregated-ai 14/17、localize-void-ai-ui、verify-zh-localization、build-latest-win32-exe）：更新复选框至真实进度，保留在 changes/，标注剩余项。

## 影响范围

- `openspec/changes/*/tasks.md`、`openspec/changes/archive/`、`openspec/specs/`—纯文档。

## 验收标准

1. 每个 change 的 tasks.md 复选框与代码实际一致（抽查 5 个"0%"项均已修正）。
2. `openspec/specs/` 不再为空，至少包含已归档 change 的能力规范。
3. `openspec/changes/` 仅保留真正未完成的 change。
4. 不触碰任何 `.ts` 源码（git diff 仅含 openspec/ 下文件）。
