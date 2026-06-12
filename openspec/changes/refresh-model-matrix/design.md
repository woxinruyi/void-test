# 设计：刷新模型能力矩阵

## 背景与现状

`common/modelCapabilities.ts`（跨进程）以对象字面量维护每个模型的能力（token 上限、reasoning/effort 档位、工具格式 `specialToolFormat`、价格等）。新增模型 = 按既有条目结构追加一条，并在 Provider 的模型列表中可见。

## 方案

**纯新增**，不动既有条目。实施时：
1. 读取 `modelCapabilities.ts` 中一个近期模型条目（如 `claude-sonnet-4-6`）作为字段模板，确保新条目字段完整、命名一致。
2. 按 Provider 分别追加。

### Anthropic（ID 权威，可直接填）

| 模型 | ID | 上下文 | max output | 推理 |
|------|------|:--:|:--:|------|
| Claude Opus 4.8 | `claude-opus-4-8` | 1M | 128K | adaptive thinking + effort（low/medium/high/xhigh/max） |
| Claude Opus 4.7 | `claude-opus-4-7` | 1M | 128K | 同上 |

要点：4.7/4.8 **不支持** `budget_tokens`（发送即 400），采用 `thinking: {type:'adaptive'}`；采样参数 `temperature/top_p/top_k` 已移除。若现有矩阵以 `budget_slider` 表达推理，需为这两条改用 effort/adaptive 表达，或在调用层做映射（实施时按现有抽象决定，最小改动）。

### OpenAI / Google（ID 需查证，禁止臆造）

- GPT-5.x、Gemini 3 的**确切模型 ID、上下文窗口、价格、reasoning 形态**必须在实施时通过官方文档/Models API 核验后填入。
- 在未核验前，不写入占位 ID（避免 404）。design 阶段仅锁定"需要补齐"，不锁定具体字符串。

## 数据流

无运行时数据流变化；仅扩充静态能力表。调用链（`getModelCapabilities` → `sendXxxChat`）自动消费新条目。

## 边界情况

- 经 aiyiwei 聚合调用时，底层模型名需与矩阵 key 对齐，否则回退默认能力——实施时核对聚合端暴露的模型名。
- 新模型若 reasoning 形态与现有 slider 抽象不兼容，优先在调用层做映射，不重构矩阵类型。

## 回滚策略

纯新增条目，`git revert` 单 commit 即可；不影响既有模型。

## 风险

| 风险 | 等级 | 缓解 |
|------|:--:|------|
| 臆造非 Anthropic 模型 ID 致 404 | 中 | 实施时强制官方文档核验，未核验不写入 |
| 推理字段与现有抽象不匹配 | 中 | 调用层映射，避免改矩阵类型 |
| 误改既有条目 | 低 | 仅追加，diff 审查 |
