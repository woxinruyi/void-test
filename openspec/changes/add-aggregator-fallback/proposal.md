# 新增：聚合网关故障回退原生端点（add-aggregator-fallback）

## 背景

横向对比（`temp-主流AI编程工具横向对比.md`）指出 YWCode 的**独有架构风险**：主路径全压 aiyiwei 聚合网关，**网关故障（网络/5xx/过载）即全功能不可用**，无自动回退原生端点。Codex/Aider 等用原生 provider 端点无此单点。

本项目已有 `classifyLLMError`（区分可重试/退避）。在此之上，对**网关可重试故障**可解析到对应**原生 provider 端点**（前提：用户已配该原生 key），从而消除单点依赖。

## 目标

- 纯解析：聚合模型名 → 原生 provider（claude→anthropic / gpt·o系→openAI / gemini→gemini），且仅当该原生 key 存在时回退。
- 网关可重试故障（network/overloaded）时，换原生端点重试一次（鉴权/格式错误不回退）。

## 非目标

- 不改默认 provider 选择（仅故障时回退）。
- 不臆造原生不存在的模型映射（按前缀厂商映射，模型名透传）。
- 不引入新 provider。

## 方案

1. 纯函数 `common/helpers/aggregatorFallback.ts`：`resolveAggregatorFallback(modelName, hasNativeKey) → {providerName, modelName} | null`。
2. **接线（运行时，后续）**：`chatThreadService` 重试分支中，若当前 provider 为 `aiyiwei`、`classifyLLMError` 判定 network/overloaded、且 `resolveAggregatorFallback` 命中 → 用回退 provider 重发本轮（覆盖 modelSelection.providerName）。

## 影响范围

- 新增 `common/helpers/aggregatorFallback.ts`（纯函数）+ 测试。
- 后续：`browser/chatThreadService.ts` 重试分支（运行时接线，需真机验证回退实际生效）。

## 验收标准

1. 解析正确：claude/gpt/o系/gemini → 对应原生（有 key）；无 key/厂商不匹配/未知 → null。确定性测试通过。
2. `npx tsc -p src/tsconfig.json --noEmit` 0 errors。
3. 接线后端到端回退在网关故障时生效——需真机（构造网关失败 + 配原生 key）验证。

## 状态

- **纯解析层已执行（2026-06-14）**：helper + eval(9/9) + mocha。
- **重试接线未执行**：换 provider 重发涉及 Agent 循环 modelSelection 覆盖 + 真机验证回退生效，单列接线轮。
