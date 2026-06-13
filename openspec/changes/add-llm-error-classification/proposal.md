# 新增：LLM 错误分类与差异化重试（add-llm-error-classification）

## 背景

Agent 循环（`chatThreadService._runChatAgent`）对**所有** LLM 错误统一处理：重试至 `CHAT_RETRIES=3`、固定 `RETRY_DELAY=2500ms`。问题：

- **鉴权(401/403)/请求格式(400)/模型不存在(404)** 重试必然再失败 → 白白多花 ~5s + 两次请求 token，且延后向用户报错。
- **限流(429)/过载(529)/网络(5xx/超时)** 应**指数退避**；固定 2.5s 短延迟在限流下会被继续拒绝。

对标 Codex / Claude Code：按错误类型决定"是否重试 + 退避时长"。

## 目标

- 引入纯函数 `classifyLLMError(error)` → `{ kind, retryable, backoffMs(attempt) }`。
- Agent 循环按分类：不可重试错误立即报错（不浪费重试）；可重试错误用类型化退避（限流/过载/网络指数退避）。
- **保守**：未知错误维持原行为（可重试、2500ms），零回退风险。

## 非目标

- 不改 `CHAT_RETRIES` 上限。
- 不改 provider 调用协议；仅消费 onError 的 `{ message, fullError }`。
- 不分类编辑/工具层错误（仅 LLM 请求错误）。

## 方案

`common/helpers/classifyLLMError.ts`（纯、可测）：按 status code + 错误文本归类为 `auth / rate_limit / overloaded / bad_request / network / unknown`；auth/bad_request 不可重试；rate_limit/overloaded/network 指数退避（带上限）；unknown 维持 2500ms 可重试。`chatThreadService` 重试分支改用之（`if (errClass.retryable && nAttempts < CHAT_RETRIES) await timeout(errClass.backoffMs(nAttempts-1))`），删除已被取代的 `RETRY_DELAY` 常量。

## 影响范围

- 新增 `common/helpers/classifyLLMError.ts`。
- 修改 `browser/chatThreadService.ts`（重试分支 + 删除 `RETRY_DELAY` + import）。
- 测试：`test/eval/classifyLLMErrorEval.ts`（17）+ `test/common/classifyLLMError.test.ts`。

## 验收标准

1. auth/bad_request → `retryable=false`；rate_limit/overloaded/network → `retryable=true` 且退避指数递增有上限；unknown → 可重试 2500ms（原行为）。
2. 形状鲁棒（字符串 / `{message,fullError}` / null）。确定性测试通过。
3. `npx tsc -p src/tsconfig.json --noEmit` 0 errors；既有 Agent 重试路径对未知错误零回退。

## 状态

- **已执行（2026-06-13）**：classifier + eval(17/17) + mocha + chatThreadService 接入 + 删除 RETRY_DELAY。tsc 待确认。
