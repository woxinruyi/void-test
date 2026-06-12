# 维护：刷新模型能力矩阵（refresh-model-matrix）

## 背景

`common/modelCapabilities.ts` 的模型矩阵停留在约 2025 年中：最新条目为 `claude-opus-4-6` / `claude-sonnet-4-6` / `claude-haiku-4-5` / `gpt-4.1` / `o3` / `o4-mini` / `gemini-2.5-pro`。缺少各家当前旗舰：

- **Anthropic**：Claude Opus 4.8（`claude-opus-4-8`）、Opus 4.7（`claude-opus-4-7`）。
- **OpenAI**：GPT-5.x 系列（`optimize-agent-loop` 提案正文已多次提及 GPT-5.5）。
- **Google**：Gemini 3 系列。

矩阵决定 token 上限、推理（reasoning/effort）档位、工具格式等运行参数。即便主路径经 aiyiwei 聚合调用，矩阵缺项会导致这些新模型回退到默认/错误的能力配置（如 reasoning 不可用、token 上限偏低）。

## 目标

- 为各 Provider 补齐当前旗舰模型条目，沿用现有条目结构（token 限制、reasoning/effort、工具格式、价格等字段）。
- Anthropic 系新模型采用**自适应推理**（adaptive thinking）+ effort 档位，不使用已废弃的 `budget_tokens`。
- 保持现有条目不变（手术式新增）。

## 非目标

- 不重构 `modelCapabilities.ts` 的类型体系或矩阵组织方式。
- 不改动模型选择 UI 与调用逻辑。
- 不猜测未经查证的模型 ID（见 design.md：非 Anthropic ID 需实施时核验）。

## 影响范围

- `common/modelCapabilities.ts`—跨进程共享。

## 验收标准

1. Anthropic 至少新增 `claude-opus-4-8`、`claude-opus-4-7` 条目，能力字段与 4.6 同构并按自适应推理设置。
2. OpenAI / Gemini 新条目的模型 ID 均经官方文档核验后填入（无臆造 ID）。
3. 现有模型条目零改动（git diff 仅为新增）。
4. `npx tsc -p src/tsconfig.json --noEmit` 输出 0 errors。
