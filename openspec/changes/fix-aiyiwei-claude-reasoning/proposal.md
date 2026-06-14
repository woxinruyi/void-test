# 修复：聚合路径 Claude 模型推理被静默丢弃（fix-aiyiwei-claude-reasoning）

> 设计提案。改动有打破主路径的潜在风险，需先真机核验聚合端 `reasoning_effort` 支持，故不盲改。

## 背景（深度审计发现）

`aiyiweiModelOptions` 的 Claude 条目（`claude-opus-4-8/4-7/4-6`、`claude-sonnet-4-6`、`claude-opus-4-1-...-thinking`）使用 `reasoningSlider: { type: 'budget_slider' }`。但 aiyiwei 走 openai-compatible 路径，其推理注入器 `openAICompatIncludeInPayloadReasoning` **只处理 `effort_slider_value`**（发 `reasoning_effort`），对 `budget_slider_value` 返回 `null`。

链路：
1. `tierToSendableReasoning(tier, aiyiwei, claude-opus-4-8)` → 模型是 budget_slider → 返回 `budget_slider_value`（设 reasoningBudget）。
2. impl aiyiwei 路径 `getSendableReasoningInfo` → budget_slider → `budget_slider_value`。
3. `openAICompatIncludeInPayloadReasoning(budget_slider_value)` → **null**。
4. → **不发任何推理参数**。

**后果**：用户在主路径（aiyiwei）选 Claude 模型并开启推理时，推理被**静默丢弃**——模型实际未思考。这是主路径上最常用模型的真实能力退化。

## 目标

- 让聚合路径 Claude 模型的推理真正下发（openai-style `reasoning_effort`）。

## 方案（待核验后执行）

把 aiyiwei 现代 Claude 条目的 `reasoningSlider` 由 `budget_slider` 改为 `effort_slider`（`['low','medium','high','xhigh','max']`，default `'high'`），与本项目 `gpt-5.5`/`gemini-3-pro` 一致。则：
`tierToSendableReasoning('high', aiyiwei, claude-opus-4-8)` → `effort_slider_value 'xhigh'` → `openAICompatIncludeInPayloadReasoning` → `{ reasoning_effort: 'xhigh' }` → 下发。

并复用 `optimize-reasoning-effort-mapping`：high→xhigh。

## 风险与为何不盲改

- 不确定 aiyiwei 聚合端对 Claude 是否接受 `reasoning_effort`：
  - **若透传/翻译为 claude effort** → 推理生效（理想）。
  - **若忽略未知参数** → 与现状一致（无害）。
  - **若 400 拒绝** → 打破主路径 Claude 请求（严重）。
- 多数 openai-compat 聚合（new-api）对未知参数宽松（忽略而非报错），但**无法在无 key 环境核验**。故标记为待核验，不盲改。

## 验收标准（执行时）

1. 改 aiyiwei Claude 条目为 effort_slider；`tierToSendableReasoning` 对其返回 effort_slider_value；映射 high→xhigh。
2. **真机核验**：配 aiyiwei key，对 claude-opus-4-8 开推理发一句，确认 ① 不报 400 ② 响应含思考/推理（cache/usage 或可见 reasoning）。
3. tsc 0 errors。

## 状态

- **分析 + 提案已建（2026-06-14）**。**实现待真机核验** aiyiwei `reasoning_effort` 支持后执行（一行条目改动 + 验证）。
