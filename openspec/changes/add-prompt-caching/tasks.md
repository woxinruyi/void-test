# 任务：Anthropic Prompt 缓存

## Phase 1 — tools + system 缓存（最小可用）

- [x] 在 `common/voidSettingsTypes.ts` 的 `defaultGlobalSettings` 增加 `anthropicPromptCaching: true`（含类型定义）
- [x] 经 `LLMMessageService` 集中注入开关，穿线 `promptCaching` 至 main 的 `sendAnthropicChat`（局部变量）
- [x] 修改 `anthropicTools()` 调用后：当开关开启且数组非空时，给最后一个 tool 浅拷贝注入 `cache_control: { type: 'ephemeral' }`
- [x] 修改 `anthropic.messages.stream` 的 `system`：开关开启时转为 `[{ type: 'text', text, cache_control }]`，否则保持原字符串
- [x] 核对 `@anthropic-ai/sdk` 类型支持 `cache_control`（tsc 验证通过，无需 `as` 收敛）
- [x] **编译验证：`npx tsc -p src/tsconfig.json --noEmit` 0 errors**

## Phase 2 — 多轮对话前缀缓存 + 易变内容审计

- [ ] 在 `sendAnthropicChat` 给 `messages` 最后一条消息的最后一个 content block 注入断点（处理 string / block[] 两种形态）
- [ ] 审计 `prompts.ts` 系统提示各段：标注稳定段（header/corePrompt/tools/rules）与易变段（gitStatusInfo/workspaceInfo/ideActivityInfo/planInfo/memoriesInfo）
- [ ] 评估是否将高频易变段移至 system 末尾或注入 messages（仅在收益明显时改，遵循最小修改）
- [ ] 处理 20 块回溯窗口：长轮次下评估是否追加中间断点（≤4 断点上限内）
- [ ] **编译验证：`npx tsc -p src/tsconfig.json --noEmit` 0 errors**

## Phase 3 — 可观测与验证

- [ ] 从 Anthropic 流式响应的 `usage` 读取 `cache_read_input_tokens` / `cache_creation_input_tokens`
- [ ] 将缓存命中信息接入现有 metrics 或调试日志（不新增 UI）
- [ ] 手动验证：同会话连续 ≥2 轮，确认 `cache_read_input_tokens > 0`
- [ ] 手动验证：关闭开关后请求体无 `cache_control`，行为与现状一致
- [ ] 更新 `architecture/agent-loop.md` 或 `prompt-architecture.md`，补充缓存策略与"更新日志"条目
- [ ] **编译验证：`npx tsc -p src/tsconfig.json --noEmit` 0 errors**
