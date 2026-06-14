# 优化：推理档位→effort 映射对齐编码最佳实践（optimize-reasoning-effort-mapping）

## 背景

`tierToSendableReasoning`（`modelCapabilities.ts`）把自适应推理档位（`default/high/max`）映射为 effort_slider 的具体档，原实现**按索引取值**：

- `default` → `idx 0` = 最低档（如 **low**）
- `high` → `idx 1` = 第二档（如 **medium**）
- `max` → 最后一档

对 opus-4-8（`low/medium/high/xhigh/max`）这意味着"**high 档 → medium effort**"。但 `claude-api` 最佳实践明确：**xhigh 是编码/agentic 用例的最佳设置（Claude Code 默认值），智力敏感任务最低用 high**。YWCode 是 agentic 编码工具，原映射对编码**显著偏低**。

## 目标

- 按"偏好 effort 名"映射而非索引：`high`→xhigh（编码甜点），`default`→medium（平衡基线，优于 low），`max`→max。
- 缺该档时优雅回退到最高可用档；budget_slider（旧 Anthropic）路径零改动。

## 非目标

- 不改档位决策（关键词/启发式/继承）逻辑。
- 不改 budget_slider（budget_tokens）映射。

## 方案

`tierToSendableReasoning` 的 effort_slider 分支改为 `pick(preferred[])`：
- `default` → `['medium','low','high']`
- `high` → `['xhigh','high','medium']`
- `max` → `['max','xhigh','high']`
找不到则回退最高可用档。

## 影响范围

- `common/modelCapabilities.ts`（effort_slider 分支）。
- 测试：`test/eval/reasoningEffortMappingEval.ts`（7）+ `test/common/reasoningEffortMapping.test.ts`。

## 验收标准

1. opus-4-8：default→medium、high→xhigh、max→max；gpt-5.5：high→xhigh、max→xhigh（无 max 回退）；gemini-3-pro：high→high（无 xhigh）。
2. budget_slider 模型仍走 budget（零回退）。
3. `npx tsc -p src/tsconfig.json --noEmit` 0 errors。

## 状态

- **已执行（2026-06-14）**：映射改写 + 测试(7/7)。
