# 新增：Anthropic Prompt 缓存（add-prompt-caching）

## 背景

当前 YWCode 在所有 Provider 路径上**完全没有启用 Prompt 缓存**（已对 `src/vs/workbench/contrib/void/` 全量 grep `cache_control` / `ephemeral`，零命中）。

直连 Anthropic 的 `sendAnthropicChat`（`electron-main/llmMessage/sendLLMMessage.impl.ts:520`）当前将 system 作为**纯字符串**发送（L550 `system: separateSystemMessage ?? undefined`），tools 为原生数组、未加任何缓存断点。

Agent 模式下系统提示 ~3500 tokens + 31 个工具定义，每轮重发、最多 50 轮（见 `architecture/agent-loop.md`）。这正是 `optimize-agent-loop` 提案抱怨的"中等项目需数千万 token"的主因之一。Anthropic 显式 `cache_control`（5 分钟 TTL）对缓存命中部分可降约 **90% 输入成本**并降低首 token 延迟。

## 目标

- 在直连 Anthropic 路径为 **tools + system + 多轮对话前缀**注入 `cache_control: {type: 'ephemeral'}` 断点。
- 遵循"稳定内容前置、易变内容后置"原则布置断点，确保高缓存命中率（而非盲目加标记）。
- 提供设置开关 `anthropicPromptCaching`（默认开启），并在响应中读取 `cache_read_input_tokens` 用于验证。

## 非目标

- **不**改动 OpenAI / Gemini / Ollama 路径。OpenAI 兼容端点（含 aiyiwei 聚合）依赖服务端自动缓存，无需 `cache_control`，本次不处理。
- **不**重写 System Prompt 的段落生成逻辑；仅在组装末端调整易变段落的相对位置（最小必要）。
- **不**引入 1 小时 TTL（写成本 2×，当前对话节奏用 5 分钟 TTL 即可，留作后续）。

## 影响范围

- `electron-main/llmMessage/sendLLMMessage.impl.ts`（`sendAnthropicChat`、`anthropicTools`）—主进程。
- `common/voidSettingsTypes.ts`—新增 `anthropicPromptCaching` 开关（默认 `true`）。
- 可能涉及 `common/prompt/prompts.ts`—若需将易变段落后移以保护缓存前缀。

## 验收标准

1. 同一会话连续 ≥2 轮后，响应 `usage.cache_read_input_tokens > 0`（通过日志或 metrics 验证）。
2. 关闭 `anthropicPromptCaching` 开关后，请求体不含任何 `cache_control`，行为与现状一致。
3. `npx tsc -p src/tsconfig.json --noEmit` 输出 0 errors。
4. tools 定义或模型切换时缓存正确失效，不产生错误响应。
