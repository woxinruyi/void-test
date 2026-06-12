# 任务：刷新模型能力矩阵

## Phase 1 — Anthropic 新模型（聚合路径，ID 权威）

> 实施说明：经核查，现代模型（opus-4-6/sonnet-4-6/haiku-4-5）定义在**聚合路径** `aiyiweiModelOptions`（openai-style）。直连 `anthropicModelOptions` 用 anthropic-style + budget_slider，而 opus-4.7/4.8 直连 API 已移除 budget_tokens（发送即 400），当前矩阵抽象无 adaptive。故 Phase 1 聚焦聚合路径（项目默认），镜像 opus-4-6；直连路径 adaptive 支持留作后续。

- [x] 以 `claude-opus-4-6`（aiyiwei）条目为模板，确认新条目字段集
- [x] 在 `aiyiweiModelOptions` 新增 `claude-opus-4-8` 条目（镜像 opus-4-6：200k 上下文 / openai-style / budget_slider；定价 $5/$25）
- [x] 新增 `claude-opus-4-7` 条目（同上）
- [x] 将 opus-4-8 / opus-4-7 加入 aiyiwei 默认展示模型列表（UI 下拉可见）
- [x] **编译验证：`npx tsc -p src/tsconfig.json --noEmit` 0 errors**
- [ ] （后续）直连 Anthropic 路径的 opus-4.7/4.8 adaptive thinking 支持

## Phase 2 — OpenAI / Google 新模型（ID 需查证）

- [ ] 通过官方文档 / Models API 核验 GPT-5.x 系列确切 ID、上下文、价格、reasoning 形态
- [ ] 通过官方文档核验 Gemini 3 系列确切 ID 与能力
- [ ] 仅在核验通过后追加条目（未核验不写入占位 ID）
- [ ] 核对 aiyiwei 聚合端暴露的模型名与矩阵 key 对齐
- [ ] **编译验证：`npx tsc -p src/tsconfig.json --noEmit` 0 errors**

## Phase 3 — 校验

- [ ] `git diff` 确认仅为新增条目，既有模型零改动
- [ ] 在设置 UI 的模型下拉中确认新模型可选
- [ ] 更新 `architecture/services-index.md` 或相关文档的"更新日志"
