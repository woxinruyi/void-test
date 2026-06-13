# 优化：系统提示缓存结构（稳定/易变切分）（optimize-system-prompt-caching）

## 背景

深度审计（`temp-提示词与缓存深度审计.md`）发现：Anthropic 路径把**整条系统消息**作为单个块打 `cache_control`（`sendLLMMessage.impl.ts`）。但 `chat_systemMessage` 把**易变内容**（活动文件、打开文件、IDE 实时活动、git 状态、目录树、今日日期）与**稳定内容**（8 段 agent 规则 + 工具定义 + important notes）**拼成一条字符串**。

后果：易变内容几乎每请求都变 → system 缓存断点**几乎永不命中**（`usage.cache_read`≈0），占系统提示大头的"规则 + 工具定义"本可缓存却被浪费。对标 Anthropic prompt-caching / Codex frozen-prompt 最佳实践：**稳定前缀在前并打断点，易变上下文在后不打断点**（前缀匹配下易变变化不破坏已缓存前缀）。

## 目标

- 把系统消息切为 `[稳定块(cache_control) , 易变块(无缓存)]`，使 Anthropic 路径稳定前缀可靠命中缓存。
- 非 Anthropic 路径（openai-compat/聚合、gemini）拿到**去标记的干净系统消息**，仅顺序调整，行为不变。

## 非目标

- 不改提示**内容**（仅重排：稳定段在前、易变段在后；今日日期移入易变块）。
- 不改非 Anthropic 的缓存机制（其自动缓存按各自策略）。
- 不改 trim/修剪逻辑。

## 方案

1. `chat_systemMessage` 重排：`稳定块(header+8段规则+工具定义+important notes)` + `CACHE_BREAKPOINT_MARKER` + `易变块(system_info/目录/IDE/git/stack/最近/计划/记忆/技能/日期)`。
2. 新增纯函数 `splitSystemForCaching(sys) → {cacheable, volatile}` 与 `stripCacheMarker(sys)`。
3. 消费端：
   - `convertToLLMMessageService`：`system-role`/`developer-role` 用 `stripCacheMarker`（主路径干净）；`separated`(Anthropic) 保留标记。
   - `sendLLMMessage.impl`（Anthropic）：`splitSystemForCaching` → `[{稳定, cache_control}, {易变}]`；关闭缓存时 `stripCacheMarker`。
   - `sendLLMMessage.impl`（Gemini）：`stripCacheMarker`。

## 影响范围

- `common/prompt/prompts.ts`（重排 + marker + 两个纯函数）。
- `browser/convertToLLMMessageService.ts`（system-role/developer-role 去标记 + import）。
- `electron-main/llmMessage/sendLLMMessage.impl.ts`（anthropic 切分 / gemini 去标记 + import）。
- 测试：`test/eval/systemPromptCacheEval.ts`（12）+ `test/common/systemPromptCache.test.ts`。

## 验收标准

1. `splitSystemForCaching` 正确切分（有/无标记）；`stripCacheMarker` 去标记。
2. agent 系统提示：稳定块含规则段 + important notes，**不含**活动文件/目录/日期；易变块含活动文件/目录/日期。
3. 非 Anthropic 系统消息不含标记（仅重排，行为不变）。
4. `npx tsc -p src/tsconfig.json --noEmit` 0 errors。
5. 缓存命中率真实提升需 Anthropic 真机看 `usage.cache_read`（运行时验证）。

## 状态

- **已执行（2026-06-13）**：重排 + 切分 + 三端接入 + 测试(12/12)。tsc 待确认；缓存命中真实效果待真机。
