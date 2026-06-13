# 任务：刷新模型能力矩阵

## Phase 1 — Anthropic 新模型（聚合路径，ID 权威）

> 实施说明：经核查，现代模型（opus-4-6/sonnet-4-6/haiku-4-5）定义在**聚合路径** `aiyiweiModelOptions`（openai-style）。直连 `anthropicModelOptions` 用 anthropic-style + budget_slider，而 opus-4.7/4.8 直连 API 已移除 budget_tokens（发送即 400），当前矩阵抽象无 adaptive。故 Phase 1 聚焦聚合路径（项目默认），镜像 opus-4-6；直连路径 adaptive 支持留作后续。

- [x] 以 `claude-opus-4-6`（aiyiwei）条目为模板，确认新条目字段集
- [x] 在 `aiyiweiModelOptions` 新增 `claude-opus-4-8` 条目（镜像 opus-4-6：200k 上下文 / openai-style / budget_slider；定价 $5/$25）
- [x] 新增 `claude-opus-4-7` 条目（同上）
- [x] 将 opus-4-8 / opus-4-7 加入 aiyiwei 默认展示模型列表（UI 下拉可见）
- [x] **编译验证：`npx tsc -p src/tsconfig.json --noEmit` 0 errors**
- [x] （已完成）直连 Anthropic 路径的 opus-4.7/4.8 adaptive thinking 支持
  - [x] 经 `claude-api` skill 核验权威值：`claude-opus-4-8`/`claude-opus-4-7`，1M 上下文 / 128K 输出 / $5·$25，budget_tokens 已移除（400），采用 adaptive + effort
  - [x] `anthropicModelOptions` 新增两条原生条目（anthropic-style / separated / effort_slider，价格含 cache_read·cache_write）
  - [x] 扩展 `anthropicSettings.includeInPayload`：`effort_slider_value → { thinking: { type: 'adaptive' } }`（不再发 budget_tokens，规避 4.7/4.8 的 400）
  - [x] 确定性评测 + mocha 回归：6/6 通过（含"effort→adaptive 不发 budget_tokens"与"旧模型 budget 零回退"）

## Phase 2 — OpenAI / Google 新模型（已核验后追加，2026-06-13）

> 核验来源：模型 ID + 价格取自聚合端 `https://aiyiwei.vip/api/pricing`（new-api 后端：`model_group['default'].ModelPrice` = 输入 $/M，`model_completion_ratio` = 输出/输入倍数）；上下文/输出/reasoning 形态经官方文档联网核验。**未臆造任何 ID**。

- [x] 核验 GPT-5.x 旗舰：聚合端暴露至 `gpt-5.5`（default 分组 $2.5/M，completion_ratio 6 → 输出 $15/M）；官方文档：1M 上下文 / 128K 输出 / `reasoning.effort`=low·medium·high·xhigh
- [x] 核验 Gemini 3 旗舰：聚合端 `gemini-3-pro-preview`（base price 1 × 官转gemini 倍率 3 → 输入 $3/M，输出 $18/M）；官方文档：1M 上下文 / 64K 输出 / `thinking_level`=low·high
- [x] 在 `aiyiweiModelOptions` 追加 `gpt-5.5`、`gemini-3-pro-preview`（openai-style / system-role / effort_slider，经 `openAICompatIncludeInPayloadReasoning` 下发 `reasoning_effort`）
- [x] key 与聚合端暴露名对齐（`gpt-5.5`、`gemini-3-pro-preview` 均为 `/api/pricing` 中的真实 key）
- [x] 加入 aiyiwei 默认展示模型列表（UI 下拉可见）
- [x] **编译验证：`npx tsc -p src/tsconfig.json --noEmit` 0 errors**
- [x] 确定性评测 + mocha 回归：9/9 通过（含两新条目价格/工具格式/effort 下发）

> 说明：上下文沿用聚合层保守值 200K（与同组 claude 条目一致，避免向聚合端超发）；价格为 informative 字段（不参与请求构造），取 aiyiwei 对应分组。未追加非旗舰变体（gpt-5.1/5.2、gemini-3-flash 等）以保持手术式最小新增。

## Phase 3 — 校验

- [x] `git diff` 确认仅为新增条目 + includeInPayload 增量分支，既有模型零改动（评测含回归断言）
- [ ] 在设置 UI 的模型下拉中确认新模型可选（需运行 Electron，CDP 验证留待集成）
- [x] 确定性评测 harness（`test/eval/modelMatrixEval.ts`）+ mocha 回归（`test/common/modelMatrix.test.ts`）作为"评定方式"

## 评测结果（2026-06-13）

```
$ npx tsx src/vs/workbench/contrib/void/test/eval/modelMatrixEval.ts
  ✅ 条目存在且字段正确：claude-opus-4-8  (ctx=1000000 in=5 out=25 tool=anthropic-style slider=effort_slider)
  ✅ 条目存在且字段正确：claude-opus-4-7
  ✅ effort 档位 → thinking.adaptive（无 budget_tokens，避免 400）   {"thinking":{"type":"adaptive"}}
  ✅ budget 档位 → thinking.enabled+budget_tokens（旧模型零回退）    {"thinking":{"type":"enabled","budget_tokens":4096}}
  ✅ 未开启推理 → null
  ✅ 既有条目未受影响：claude-opus-4-20250514  (in=15 out=30 ctx=200000)
  总计：6/6 通过   (退出码 0)
```

## 仍未做（明确标注）

- ~~Phase 2（OpenAI / Gemini）~~ → **已完成**（见上，经 aiyiwei pricing + 官方文档核验后追加 gpt-5.5 / gemini-3-pro-preview）。
- 原生 `openAIModelOptions` / `geminiModelOptions` 直连条目：未追加。本项目主路径为 aiyiwei 聚合，且原生 gemini 推理走 thinkingBudget（与 gemini-3 的 thinking_level 形态不同，需另行适配），故仅在聚合路径补齐；直连补全留作后续。
- UI 下拉的 CDP 可视化确认：需启动 Electron，留待集成验证（已加入 `defaultModelsOfProvider.aiyiwei`，数据层面可见）。
