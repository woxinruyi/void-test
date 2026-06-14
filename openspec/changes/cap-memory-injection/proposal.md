# 优化：记忆注入加字符预算上限（cap-memory-injection）

## 背景（深度审计发现）

`convertToLLMMessageService` 构建 `memoriesSummary` 时**全量注入** `memoryService.memories`（`memLines.join('\n')`，无上限）。`save_memory` 工具会持续累积记忆，记忆数量随使用单调增长 → 每次请求的系统提示无界膨胀，污染上下文、抬高 token 成本。

对标 **Claude Code**：`MEMORY.md` 自动加载有明确上限（首约 200 行 / 25KB），超出不全量塞入。YWCode 当前缺此约束。

## 目标

- 给记忆注入加字符预算上限（保留最近的，丢弃最早的），有效约束上下文体量。
- 纯函数实现，可单元测试；少量记忆场景零行为变化。

## 非目标

- 不引入语义检索/向量相似度（记忆量级小，按"最近优先"截断已足够，且无嵌入依赖）。
- 不改记忆的存储/读写逻辑（`memoryService` 不动）。

## 方案

新增纯函数 `common/helpers/capByCharBudget.ts`：在 `maxChars` 预算内保留列表尾部（最近）项，超预算从尾向前累积、丢弃最早，至少保留 1 项。

`convertToLLMMessageService` 记忆注入处：`MAX_MEMORY_CHARS = 8000`（约 2K token），裁剪后若有丢弃则前缀 `(showing N most recent of M memories)`。记忆已在缓存"易变块"内（见 `optimize-system-prompt-caching`），裁剪不影响稳定前缀缓存命中。

## 影响范围

- 新增 `common/helpers/capByCharBudget.ts`。
- `browser/convertToLLMMessageService.ts`（记忆注入处 + import）。
- 测试：`test/eval/capByCharBudgetEval.ts`（6）+ `test/common/capByCharBudget.test.ts`（5）。

## 验收标准

1. 预算内全保留、超预算保留最近项并报告丢弃数、空列表、单项超预算至少留 1、恰好等于预算全保留 —— eval 6/6 + mocha 5/5。
2. `npx tsc -p src/tsconfig.json --noEmit` 0 errors。
3. mocha 全量无回归（仅既有 2 个预存失败）。

## 状态

- **已执行（2026-06-14）**：helper + 注入裁剪 + 测试（eval 6/6）。
