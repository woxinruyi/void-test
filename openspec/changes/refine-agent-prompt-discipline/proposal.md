# 优化：Agent 提示词纪律（范围/输出 + 表格放宽）（refine-agent-prompt-discipline）

## 背景

深度审计（`temp-提示词与缓存深度审计.md` #3/#5/#6）发现 agent 系统提示缺两类现代最佳实践指引，并有一处过度限制：

1. **缺"范围纪律"**：Opus 4.6+ 倾向**过度工程**（加未要求的抽象/特性/防御代码）。本项目 `CLAUDE.md` 自身强调"手术式变更/只动必须动的"，但该原则未进 agent 系统提示。
2. **缺"结论先行/简洁"**：现代调优强调收尾结论先行、简洁。
3. **过度限制**：`Do NOT write tables`——表格在对比/参数场景常更清晰。

## 目标

- agent 模式新增 `## Scope and Output Discipline` 段：只做被要求的改动、不重构无关相邻代码、结论先行且简洁。
- 放宽表格限制为"必要时可用"。
- 仅 agent 注入新段；normal/gather 不受影响。

## 非目标

- 不动既有 8 段规则内容；不动缓存切分（`optimize-system-prompt-caching`）。
- 不软化工具名/路径等硬性约束（另议）。

## 方案

`prompt/prompts.ts`：新增 `outputDiscipline`（mode==='agent'）并入稳定块（在 codeQuality 之后、exploration 之前）；改写 markdown 格式那条为"Use tables only when…"。

## 影响范围

- `common/prompt/prompts.ts`（一段新增 + 一行改写）。
- 测试：`test/eval/agentPromptDisciplineEval.ts`（7）+ `test/common/agentPromptDiscipline.test.ts`。

## 验收标准

1. agent 系统提示含 `## Scope and Output Discipline` + "Make ONLY the changes" + "Do not refactor… adjacent code" + "Lead with the outcome"；normal 不含（模式隔离）。
2. 不再含 `Do NOT write tables`；含 "Use tables only when"。
3. `npx tsc -p src/tsconfig.json --noEmit` 0 errors。

## 状态

- **已执行（2026-06-13）**：段落新增 + 表格放宽 + 测试(7/7)。
