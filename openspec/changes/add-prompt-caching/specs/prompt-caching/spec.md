# Prompt 缓存（prompt-caching）

## ADDED Requirements

### 需求：直连 Anthropic 请求启用 Prompt 缓存

系统 SHALL 在直连 Anthropic 路径（`sendAnthropicChat`）对稳定前缀注入 `cache_control: {type: 'ephemeral'}` 缓存断点，以降低多轮会话的输入 token 成本与首 token 延迟。

#### Scenario: 工具定义被缓存
- **WHEN** 以 `anthropic-style` 原生工具格式发起请求且缓存开关开启
- **THEN** 请求体 `tools` 数组的最后一个元素携带 `cache_control: {type: 'ephemeral'}`

#### Scenario: 系统提示被缓存
- **WHEN** 缓存开关开启且 `separateSystemMessage` 非空
- **THEN** `system` 以数组形态发送，且最后一个 text block 携带 `cache_control: {type: 'ephemeral'}`

#### Scenario: 多轮命中缓存
- **WHEN** 同一会话在 5 分钟内连续发起第 2 轮及以后的请求，且前缀（tools/system 或对话历史）未变
- **THEN** 响应 `usage.cache_read_input_tokens` 大于 0

### 需求：缓存可通过设置开关控制

系统 SHALL 提供全局设置项 `anthropicPromptCaching`（默认开启），用户可关闭以回到无缓存行为。

#### Scenario: 关闭缓存
- **WHEN** `anthropicPromptCaching` 为 `false`
- **THEN** 发往 Anthropic 的请求体不包含任何 `cache_control` 字段，且 `system` 维持原有字符串形态

#### Scenario: 默认开启
- **WHEN** 用户未显式配置该项
- **THEN** `defaultGlobalSettings.anthropicPromptCaching` 解析为 `true`

### 需求：缓存正确失效

系统 SHALL 确保在影响前缀的变更发生时缓存自然失效，且不产生错误响应。

#### Scenario: 工具集变化使缓存失效
- **WHEN** ChatMode 切换导致可用工具集发生变化
- **THEN** 后续请求重新写入缓存（`cache_creation_input_tokens > 0`），且请求成功无错误

#### Scenario: 仅其他 Provider 不受影响
- **WHEN** 使用 OpenAI / Gemini / Ollama 路径发起请求
- **THEN** 这些路径的请求构造逻辑保持不变，不注入 `cache_control`
