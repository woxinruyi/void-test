# 设计：Anthropic Prompt 缓存

## 背景

`sendAnthropicChat`（`electron-main/llmMessage/sendLLMMessage.impl.ts:520`，**main 进程**）通过官方 `@anthropic-ai/sdk` 的 `anthropic.messages.stream({...})` 发起请求。当前：

```ts
const stream = anthropic.messages.stream({
  system: separateSystemMessage ?? undefined,   // ← 纯字符串，无缓存
  messages: messages as AnthropicLLMChatMessage[],
  model: modelName,
  max_tokens: maxTokens ?? 4_096,
  ...includeInPayload,
  ...nativeToolsObj,                              // ← { tools, tool_choice } 或 {}
})
```

`anthropicTools()`（L506）返回 `Anthropic.Messages.ToolUnion[]`；`nativeToolsObj` 仅在 `specialToolFormat === 'anthropic-style'` 时携带原生 tools，否则工具以 XML 形式内嵌在 `separateSystemMessage` 中。

## 关键约束（来自 Anthropic 官方缓存语义）

1. **前缀匹配**：渲染顺序 `tools → system → messages`。前缀任一字节变化使其后所有缓存失效。
2. **最小可缓存前缀**：Opus 系列 **4096 tokens**、Sonnet 4.6 2048、Sonnet 4.5/3.7 1024。低于阈值静默不缓存（`cache_creation_input_tokens: 0`）。
3. **最多 4 个断点**/请求。
4. **失效层级**：改 tools 定义或换 model → 全部失效；改 system 内容 → system+messages 失效（tools 仍命中）；改 message 内容 → 仅 messages 失效。
5. **20 块回溯窗口**：每个断点向前最多回溯 20 个 content block。
6. **计价**：缓存读 ~0.1×、写 1.25×（5 分钟 TTL）；2 次请求即回本。

## 方案

### 与现有模块的关系

**扩展**，不替换。仅在 `sendAnthropicChat` 与 `anthropicTools` 内增加缓存断点；System Prompt 生成逻辑（`prompts.ts`）保持不变，仅在确有必要时调整段落顺序。

### 断点布局（≤3 个，留 1 个余量）

| 断点 | 位置 | 缓存内容 | 稳定性 |
|:--:|------|------|:--:|
| 1 | 原生 tools 数组**最后一个**元素 | 全部工具定义 | 极高（仅 chatMode 变化时改） |
| 2 | system 数组**最后一个** text block | 完整系统提示 | 中（含 git/目录树等易变段） |
| 3 | `messages` **最后一条**的最后一个 content block | 对话历史前缀 | 随轮次增长，逐轮累积命中 |

> 断点 1 与 2：因渲染顺序 tools 在前，断点 2 同时覆盖 tools+system；但**单独**给 tools 加断点 1，可在 system 内容变化（git 状态变了）时仍保住 tools 缓存。这是分层失效的关键收益。

### 接口设计

1. **tools**（`anthropicTools` 返回前）：给数组末元素浅拷贝注入 `cache_control`：
   ```ts
   tools[tools.length - 1] = { ...tools[tools.length - 1], cache_control: { type: 'ephemeral' } }
   ```
2. **system**：字符串 → 单元素数组：
   ```ts
   system: caching && separateSystemMessage
     ? [{ type: 'text', text: separateSystemMessage, cache_control: { type: 'ephemeral' } }]
     : (separateSystemMessage ?? undefined)
   ```
3. **messages**：仅给最后一条消息的最后一个 content block 注入断点（需处理 string / block[] 两种 content 形态）。
4. **开关**：`caching = !!settingsOfProvider...anthropicPromptCaching`，关闭时完全走旧路径。

### 数据流

renderer 组装 messages/system → IPC → main `sendAnthropicChat` → **注入 cache_control** → Anthropic API → 流式响应 →（新增）从 `message_start`/`message_delta` 的 `usage` 读取 `cache_read_input_tokens` → 经现有 `onText`/`onFinalMessage` 透出供 metrics/日志。

## 边界情况

- **低于最小阈值**：小型 system + 无原生 tools（XML 模型）可能 <4096 tokens → 静默不缓存。可接受（无副作用），仅得不到收益。
- **易变前缀**：若 `gitStatusInfo`/`workspaceInfo`/`ideActivityInfo` 每轮变化，断点 2 的写入会被浪费（付 1.25× 少有读）。**缓解**：断点 1（tools）不受影响仍稳定命中；断点 2 收益取决于这些段落的实际变动频率，Phase 2 评估是否将易变段后移到 messages。
- **20 块回溯**：长 agentic 轮次（多 tool_use/tool_result）下断点 3 可能丢失命中 → Phase 2 视情况追加中间断点。
- **content 形态**：messages 的 content 可能是 string 或 block 数组，注入前需类型判定，避免破坏既有结构。

## Token / 成本影响

- 不增加 prompt token 数量（`cache_control` 是元数据，不计入内容 token）。
- 首轮写缓存：tools+system ~5500 tokens × 1.25×（一次性）。
- 后续每轮：命中部分按 0.1× 计费。50 轮长会话理论可省命中段约 85–90% 输入成本。

## 回滚策略

- 设置开关 `anthropicPromptCaching=false` 即时回到原行为（运行时生效，无需重启）。
- 代码层面：改动集中在 `sendAnthropicChat`/`anthropicTools` 两处，`git revert` 单 commit 即可。

## 风险

| 风险 | 等级 | 缓解 |
|------|:--:|------|
| 误改多 Provider 文件影响其他路径 | 中 | 改动严格限定在 anthropic 分支内，OpenAI/Gemini/Ollama 不触碰 |
| SDK 类型不接受 `cache_control` | 低 | `@anthropic-ai/sdk` 的 TextBlockParam/Tool 均支持该字段；tsc 验证 |
| 易变 system 导致缓存写浪费 | 中 | 分层断点保住 tools；Phase 2 审计易变段 |
| 命中率无法验证 | 低 | 读取 `usage.cache_read_input_tokens` 落日志 |
