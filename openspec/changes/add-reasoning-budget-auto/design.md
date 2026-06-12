# 设计：推理预算自适应（add-reasoning-budget-auto）

## 一、背景与约束

- 当前推理档位数据流：`SidebarChat.tsx` 的 slider UI → `voidSettingsService.setOptionsOfModelSelection(feature, provider, model, { reasoningBudget/Effort })` → `chatThreadService._runChatAgent` 读取 `modelSelectionOptions` → `sendLLMMessage` → `getSendableReasoningInfo(feature, provider, model, options, overrides)` → 具体 provider 实现。
- 档位类型两种：`budget_slider`（Anthropic / Gemini，单位 tokens）与 `effort_slider`（OpenAI / Grok，枚举 low/medium/high）。
- `getSendableReasoningInfo` 是唯一把 options 映射为可发送 payload 的点，本 change 在其**上游**注入 `tier` 决策，不改动其下游协议映射。
- 约束：MUST 对不支持 reasoning 的模型无影响；MUST 对 `Autocomplete` / `CtrlK` 零影响；MUST 可一键开关回退旧行为。

## 二、目标设计

### 1. 档位抽象

`src/vs/workbench/contrib/void/common/helpers/reasoningAuto.ts`（新增）：

```ts
export type ReasoningTier = 'off' | 'default' | 'high' | 'max';

export type TierSource =
  | { kind: 'manual' }                    // 用户显式拖过 slider
  | { kind: 'keyword'; keyword: string }  // prompt 触发
  | { kind: 'heuristic'; reasons: string[] }
  | { kind: 'threadInherit'; fromTier: ReasoningTier }
  | { kind: 'defaultTier' }               // GlobalSettings.reasoningDefaultTier
  | { kind: 'modelDefault' };             // 模型 slider.default 兜底

export type EffectiveTier = { tier: ReasoningTier; source: TierSource };
```

### 2. 档位 → Sendable 映射

在 `modelCapabilities.ts` 新增：

```ts
export function tierToSendableReasoning(
  tier: ReasoningTier,
  providerName: ProviderName,
  modelName: string,
  overridesOfModel: OverridesOfModel | undefined,
): SendableReasoningInfo {
  const caps = getModelCapabilities(providerName, modelName, overridesOfModel);
  const slider = caps.reasoningCapabilities?.reasoningSlider;
  if (!slider) return null;
  if (tier === 'off' && caps.reasoningCapabilities?.canTurnOffReasoning) return null;

  if (slider.type === 'budget_slider') {
    const budget = (() => {
      switch (tier) {
        case 'off': return null;  // 兜底：若不支持关闭则走 default
        case 'default': return slider.default;
        case 'high': return Math.min(slider.default * 3, Math.floor(slider.max * 0.6));
        case 'max': return slider.max;
      }
    })();
    if (budget == null) return null;
    return { type: 'budget_slider_value', isReasoningEnabled: true, reasoningBudget: budget };
  }

  if (slider.type === 'effort_slider') {
    const idx = (() => {
      switch (tier) {
        case 'off': return -1;
        case 'default': return 0;
        case 'high': return Math.min(1, slider.values.length - 1);
        case 'max': return slider.values.length - 1;
      }
    })();
    if (idx < 0) return null;
    return { type: 'effort_slider_value', isReasoningEnabled: true, reasoningEffort: slider.values[idx] };
  }
  return null;
}
```

### 3. 关键词检测

```ts
const TIER_HIGH_KEYWORDS = [
  /\bthink\b/i,       // 英文 think 整词
  /想一下/,
  /思考一下/,
];
const TIER_MAX_KEYWORDS = [
  /\bthink\s+hard(er)?\b/i,
  /\bdeep\s+think\b/i,
  /\bultrathink\b/i,
  /\bthink\s+step\s+by\s+step\b/i,
  /深入思考/,
  /仔细思考/,
  /彻底想清楚/,
  /好好想一想/,
];

export function detectKeywordTier(prompt: string): { tier: ReasoningTier; keyword: string } | null {
  for (const re of TIER_MAX_KEYWORDS) {
    const m = prompt.match(re);
    if (m) return { tier: 'max', keyword: m[0] };
  }
  for (const re of TIER_HIGH_KEYWORDS) {
    const m = prompt.match(re);
    if (m) return { tier: 'high', keyword: m[0] };
  }
  return null;
}
```

### 4. 启发式

```ts
export function heuristicsTier(
  prompt: string,
  ctx: { toolChainDepth: number; retryCount: number },
): { tier: ReasoningTier; reasons: string[] } | null {
  const reasons: string[] = [];

  // 1. 长度
  const len = countContentLength(prompt); // 中文按字，英文按空格分隔 token 近似
  if (len >= 500) reasons.push('prompt-length');

  // 2. 复杂度关键词
  const COMPLEX = /refactor|重构|architect|架构|design|设计|audit|审计|refine|analyze|分析/i;
  if (COMPLEX.test(prompt)) reasons.push('complex-keyword');

  // 3. 工具链深度
  if (ctx.toolChainDepth >= 8) reasons.push('deep-tool-chain');

  // 4. 重试
  if (ctx.retryCount >= 2) reasons.push('retry');

  if (reasons.length === 0) return null;
  return { tier: reasons.length >= 2 ? 'max' : 'high', reasons };
}
```

### 5. 主决策函数

```ts
export function resolveEffectiveTier(args: {
  lastUserPrompt: string;
  manualOptions: ModelSelectionOptions | undefined;
  globalSettings: GlobalSettings;
  ctx: { toolChainDepth: number; retryCount: number; previousThreadTier?: ReasoningTier };
}): EffectiveTier {
  const { lastUserPrompt, manualOptions, globalSettings, ctx } = args;

  // 1. 手动
  if (manualOptions?.reasoningBudget !== undefined || manualOptions?.reasoningEffort !== undefined) {
    // 推断 manualTier 用于显示（不参与 sendable 计算）
    return { tier: inferTierFromOptions(manualOptions), source: { kind: 'manual' } };
  }

  // 2. 自动总开关
  if (!globalSettings.reasoningAutoEnabled) {
    return { tier: globalSettings.reasoningDefaultTier ?? 'default', source: { kind: 'defaultTier' } };
  }

  // 3. 关键词
  if (globalSettings.reasoningKeywordTriggersEnabled) {
    const kw = detectKeywordTier(lastUserPrompt);
    if (kw) return { tier: kw.tier, source: { kind: 'keyword', keyword: kw.keyword } };
  }

  // 4. 启发式
  if (globalSettings.reasoningHeuristicsEnabled) {
    const h = heuristicsTier(lastUserPrompt, ctx);
    if (h) return { tier: h.tier, source: { kind: 'heuristic', reasons: h.reasons } };
  }

  // 5. thread 继承
  if (globalSettings.reasoningThreadInherit && ctx.previousThreadTier) {
    return { tier: ctx.previousThreadTier, source: { kind: 'threadInherit', fromTier: ctx.previousThreadTier } };
  }

  // 6. 默认档
  return { tier: globalSettings.reasoningDefaultTier ?? 'default', source: { kind: 'defaultTier' } };
}
```

### 6. 链路接入

`chatThreadService._runChatAgent` 每轮 LLM 调用前：

```ts
const lastUser = extractLastUserPrompt(this.state.allThreads[threadId]);
const toolChainDepth = countRecentToolCalls(this.state.allThreads[threadId], 5);
const retryCount = nAttempts - 1;
const prevTier = this.state.allThreads[threadId]?.lastEffectiveTier;

const effective = resolveEffectiveTier({
  lastUserPrompt: lastUser,
  manualOptions: modelSelectionOptions,
  globalSettings: this._settingsService.state.globalSettings,
  ctx: { toolChainDepth, retryCount, previousThreadTier: prevTier },
});

// 覆写 modelSelectionOptions 的 budget/effort
const sendable = tierToSendableReasoning(effective.tier, modelSelection.providerName, modelSelection.modelName, overridesOfModel);
const effectiveOptions: ModelSelectionOptions = manualOptions ?? {};
if (sendable?.type === 'budget_slider_value') effectiveOptions.reasoningBudget = sendable.reasoningBudget;
if (sendable?.type === 'effort_slider_value') effectiveOptions.reasoningEffort = sendable.reasoningEffort;

// 记录到 thread 状态供 UI 显示 + 下轮继承
this._setLastEffectiveTier(threadId, effective);
```

注意：`getSendableReasoningInfo` 本身不改；我们在其上游把 `modelSelectionOptions` 的值覆盖为 tier 映射结果，`getSendableReasoningInfo` 再把 options 转为 payload。这样旧路径完全保留。

### 7. UI 显示（角标 + tooltip）

`SidebarChat.tsx` 的 `ReasoningOptionSlider` 组件旁：

```
思考 [━━●━━━━] [auto]  <- 角标
               ↑
             hover:
             ┌─────────────────────────────┐
             │ 本轮推理档位：高（high）    │
             │ 来源：关键词 "think hard"    │
             │ 实际 budget: 4915 tokens    │
             └─────────────────────────────┘
```

角标仅在 `reasoningAutoEnabled === true` 时显示。数据从 `thread.lastEffectiveTier` 读取。

### 8. 设置页

`Settings.tsx` → `General` 分区新增"推理策略"子区：

| 字段 | 控件 | 默认 |
|---|---|---|
| 启用自适应推理预算 | Switch | `true` |
| 默认档位 | Dropdown | `'default'` |
| 启用 prompt 关键词触发 | Switch | `true` |
| 启用任务复杂度启发式 | Switch | `true` |
| 在同一会话内沿用上一轮档位 | Switch | `true` |

## 三、分阶段实施顺序

1. **阶段 A — 类型与纯函数**：新增 `reasoningAuto.ts`、`tierToSendableReasoning`；为 helper 添加完整单测矩阵。
2. **阶段 B — 设置扩展**：`GlobalSettings` 五个字段 + 默认值 + 存储兼容（缺失视为默认 true）。
3. **阶段 C — 链路接入**：`chatThreadService._runChatAgent` 调用 `resolveEffectiveTier` + `tierToSendableReasoning`；在 thread 状态新增 `lastEffectiveTier`。
4. **阶段 D — UI 角标**：`SidebarChat.tsx` 的 `ReasoningOptionSlider` 旁加角标 + tooltip。
5. **阶段 E — 设置 UI**：`Settings.tsx` 新增"推理策略"子区。
6. **阶段 F — 文案 + 验证**：i18n 键位；单测 + 端到端。

## 四、验证策略

### 单元测试

- `detectKeywordTier`：
  - `"think"` 句首 → high；`"I think this"` → `null`（句首 think 但上下文拒绝；更严格地说，`/\bthink\b/` 会命中，容忍这点）
  - `"think hard"` / `"think harder"` / `"deep think"` → max
  - `"ultrathink"` → max
  - 中文 `"深入思考这个模块"` → max
  - 纯问候 `"hi"` → null
- `heuristicsTier`：
  - prompt 500 字 → high；+ 含 refactor → max
  - toolChainDepth=10 → high；+ retry=2 → max
  - 空上下文短 prompt → null
- `tierToSendableReasoning`：
  - Anthropic Claude Sonnet (budget_slider 1024-8192): tier=default→1024, high→3072, max→8192
  - OpenAI o1 (effort_slider low/medium/high): tier=default→low, high→medium, max→high
  - Grok 3 mini (effort_slider low/high 两档): tier=default→low, high→high, max→high
- `resolveEffectiveTier` 完整优先级矩阵。

### 动态

- Claude Sonnet，prompt `"think hard, refactor this module"`，实际发送的 `thinking.budget_tokens` MUST = 8192（max 档）。
- Claude Sonnet，prompt `"what is 2+2"`，MUST 发送 1024（default）。
- 关闭 `reasoningAutoEnabled`，上述 prompt 均 MUST 仅使用 slider 手动值（或 slider.default）。
- Onboarding 完成后 thread 1 首轮 prompt 触发 max → 第 2 轮短 prompt 无关键词也 MUST 因 `reasoningThreadInherit` 保持 max；在设置中关闭继承后，第 3 轮 MUST 回落 default。
- UI 角标 tooltip MUST 显示正确的来源与实际 budget。

## 五、风险与回滚

- **风险 A — 关键词 `think` 误触**：用户写 "I think..." 触发 high。
  - 缓解：匹配模式允许简单句首检测（`/^[\s\p{P}]*think\b/iu`）作为更严格选项；或文档里提示用户避免在首词用 think。
- **风险 B — 成本升高不可见**：自动升 max 导致 API 账单翻倍。
  - 缓解：UI 角标强制可见；tooltip 末行显示 "此档位可能增加 API 费用"（i18n `chat.reasoning.auto.hintBill`）；设置中有一键关闭。
- **风险 C — thread 继承叠加效应**：长 thread 首轮触发 max 后持续 max。
  - 缓解：继承只保留一轮，不做"多轮滑动平均"；开关可关。
- **回滚**：`reasoningAutoEnabled === false` 时整套机制短路，行为回到现状。完全删除 helper 调用点即可物理回滚，`getSendableReasoningInfo` 下游无变化。
