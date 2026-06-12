# 新增：推理预算自适应（add-reasoning-budget-auto）

## 背景

当前 Void 的推理（reasoning）预算完全由用户在侧边栏的 `ReasoningOptionSlider` 手动拖动决定（`SidebarChat.tsx:197-213`、`modelCapabilities.ts:1576 getSendableReasoningInfo`）。实际体验存在三类痛点：

1. **默认值偏低**：`modelCapabilities.ts` 对 Anthropic Claude Sonnet / Gemini 2.5 Pro 等模型的 `budget_slider.default` 设为 `1024` tokens，仅够浅层思考；复杂任务（跨文件重构、架构分析、长链工具调用）默认下思考严重不足。OpenAI `effort_slider` 默认 `'low'` 同理。
2. **无任务难度感知**：Void 不根据用户 prompt 的长度、关键词、涉及工具调用链的深度等做任何自动调档；每次会话用户需手动拖 slider。
3. **无 prompt 关键词触发**：对标 Claude Code，在用户 prompt 中写 `think` / `think hard` / `think harder` / `ultrathink`（及对应中文 `深思` / `细想` / `深入思考`）可自动升档。Void 无此机制。

同时，用户手动拖过的 slider 值不会被"记住"到后续 thread（每次新建 thread 都回归默认），造成反复设置。

## 目标

- 提供**prompt 关键词触发**的推理档位自动切换（含中英双语关键词）。
- 提供**任务复杂度启发式**：基于 prompt 长度、上一轮工具链深度、当前 chatMode 对档位做自适应提升。
- 允许用户在设置中**提高默认下限**（从 1024 → 可配置，例如 4096），同时保留 slider 手动覆盖。
- 在侧边栏 UI 明确显示"当前推理档位由：默认值 / 用户手动 / 自动升档"，消除用户"我不知道为什么 AI 没深入思考"的困惑。
- 保持对不支持 reasoning 的模型和 `Autocomplete` / `CtrlK` 等非 Chat 功能的**零影响**。

## 非目标

- **不**新增新的 reasoning 档位类型（继续沿用现有 `budget_slider` / `effort_slider` 二分类）。
- **不**改动 LLM 供应商的调用协议（Anthropic `thinking.budget_tokens` / OpenAI `reasoning.effort` / Gemini `thinkingBudget` 保持不变）。
- **不**实现"自动裁剪思考内容以控制成本"——仅决策档位，不干预流式输出。
- **不**把关键词触发做到 `Autocomplete` / `CtrlK`（这些场景无 chat prompt，本 change 仅覆盖 `Chat` 与 `Agent`）。
- **不**引入云端的"prompt 复杂度分类 API"——全部启发式在本地计算。

## 方案要点

### 1. 档位映射（分级模型）

定义统一的 `ReasoningTier`：`'off' | 'default' | 'high' | 'max'`，由新 helper 映射到各模型的具体值：

| Tier | `budget_slider` 模型 | `effort_slider` 模型 |
|---|---|---|
| `off` | 不发送 reasoning 字段（若 `canTurnOffReasoning`） | 同左 |
| `default` | `slider.default`（原有默认） | `'low'` |
| `high` | `min(slider.default * 3, slider.max * 0.6)` | `'medium'` 若存在，否则 `'high'` |
| `max` | `slider.max` | `'high'`（或 values 最后一档） |

### 2. 触发来源（优先级从高到低）

```
用户手动拖 slider (ModelSelectionOptions.reasoningBudget/Effort)
        │
        ▼
prompt 关键词触发（本次 prompt 单轮生效）
        │
        ▼
任务复杂度启发式（本次 prompt 单轮生效）
        │
        ▼
thread 继承（上一轮档位沿用到本轮，若未被上方覆盖）
        │
        ▼
GlobalSettings.reasoningDefault（用户配置的默认下限）
        │
        ▼
模型 slider.default（现有兜底）
```

### 3. 关键词触发规则

内置中英双语关键词映射，匹配在 prompt 文本上做**整词 + 不区分大小写**的查找：

| 关键词 | 触发档位 |
|---|---|
| `think` / `想一下` | `high` |
| `think hard` / `think harder` / `deep think` / `深入思考` / `仔细思考` | `max` |
| `ultrathink` / `think step by step` / `彻底想清楚` | `max` |
| 无匹配 | 走启发式 |

关键词提取在 `convertToLLMMessageService` 准备最后一条 user message 时执行，不污染历史消息。

### 4. 启发式规则（在关键词未触发时生效）

```
prompt 字数 >= 500 字 (中文按字计，英文按词计)                → 升到 high
prompt 含 refactor/重构/架构/design/设计/audit/审计 关键词    → 升到 high
最近 5 轮工具调用链 >= 8 个 tool call                         → 升到 high
本轮已是第二次重试（previous llmError）                       → 升到 high
同时满足 2 条以上                                             → 升到 max
```

启发式结果作为**浮层**应用到档位，不修改 `GlobalSettings`，不影响 slider 显示值。

### 5. 新增全局设置

`GlobalSettings` 增加：
```ts
reasoningAutoEnabled: boolean;            // 默认 true，关闭后仅用手动值
reasoningKeywordTriggersEnabled: boolean; // 默认 true
reasoningHeuristicsEnabled: boolean;      // 默认 true
reasoningDefaultTier: ReasoningTier;      // 默认 'default'，可提升到 'high'
reasoningThreadInherit: boolean;          // 默认 true，同 thread 内沿用上一轮档位
```

### 6. UI 呈现

- 侧边栏 `ReasoningOptionSlider` 旁显示一个极小的"自动"角标 + tooltip，悬浮显示本轮实际档位与来源（"用户手动"/"关键词 think hard"/"复杂度启发式"/"默认"）。
- 设置页 `General` 分区新增"推理策略"小节，包含：`reasoningAutoEnabled`、`reasoningDefaultTier`、`reasoningKeywordTriggersEnabled`、`reasoningHeuristicsEnabled`、`reasoningThreadInherit` 五个开关/下拉。

### 7. 关键词不落入 prompt

Void 当前把用户文本原样发给 LLM，无需剥离关键词；关键词同时作为信号又作为 prompt 的一部分对 LLM 也是自然语义（`think hard` 在 LLM 自身就会影响行为），无需剔除。

## 影响范围

### 新增能力

- `reasoning-budget-auto`：推理预算自适应能力；定义档位、触发优先级、关键词规则、启发式、设置项与 UI 呈现。

### 修改能力

（`openspec/specs/` 当前为空，无既有能力需要修改。）

### 受影响代码

- `src/vs/workbench/contrib/void/common/modelCapabilities.ts`：新增 `ReasoningTier` 类型、`tierToSendableReasoning(tier, model)` 函数；`getSendableReasoningInfo` 签名扩展，接收可选的 `tier` 参数。
- `src/vs/workbench/contrib/void/common/helpers/reasoningAuto.ts`（新增）：`detectKeywordTier(prompt)`、`heuristicsTier(prompt, toolChainDepth, retryCount)`、`resolveEffectiveTier(...)` 纯函数 + 单测。
- `src/vs/workbench/contrib/void/common/voidSettingsTypes.ts`：`GlobalSettings` 增加上述五个字段；`defaultGlobalSettings` 赋默认值。
- `src/vs/workbench/contrib/void/browser/chatThreadService.ts`：在 `_runChatAgent` 组装 `modelSelectionOptions` 处调用 `resolveEffectiveTier`，将结果写入本轮 `modelSelectionOptions.reasoningBudget / reasoningEffort`；同时在 thread 状态上记录"本轮实际使用的 tier"供 UI 显示。
- `src/vs/workbench/contrib/void/browser/convertToLLMMessageService.ts`：提取最后一条 user message 的 prompt 文本，传给 `chatThreadService`。
- `src/vs/workbench/contrib/void/browser/react/src/sidebar-tsx/SidebarChat.tsx`：`ReasoningOptionSlider` 旁加"自动"角标与 tooltip。
- `src/vs/workbench/contrib/void/browser/react/src/void-settings-tsx/Settings.tsx`：`General` 分区新增"推理策略"UI。
- `i18n/types.ts` + `locales/en.ts` + `locales/zh-cn.ts`：新增 `settings.reasoning.*`、`chat.reasoning.auto.*` 键位。

### 验证

- 静态：`openspec validate add-reasoning-budget-auto` 通过。
- 单测：`detectKeywordTier`、`heuristicsTier`、`resolveEffectiveTier` 的完整矩阵；`tierToSendableReasoning` 对每种 slider 类型的映射。
- 动态：
  - prompt 写 "think hard, refactor this module" 并发送给 Claude Sonnet，观察实际发送的 `thinking.budget_tokens` 为 `slider.max`。
  - prompt 写 "what's 2+2" 发送 → `budget_tokens` 为 `slider.default`。
  - 在设置中关闭 `reasoningAutoEnabled`，上述 prompt 均只用 slider 手动值。
  - UI 角标 tooltip 显示来源正确。
- 回归：`Autocomplete` / `CtrlK` 调用链未被影响；`normal`/`gather` chatMode 行为不变。

## 风险与回滚

- **风险 A — 关键词误触**：用户写 "I think this is wrong" 触发 `high` 档位虚耗 token。
  - 缓解：对 `think` 做整词 + 上下文约束（`^think\b` 或 `^\s*think\b` 表示句首 think 才算触发，嵌句 think 不触发）；`think hard` 等组合词强约束必须连续。
- **风险 B — 启发式导致成本不可控**：用户不察觉下自动升到 `max`，API 账单上升。
  - 缓解：设置中"启发式"开关默认 true 但可关；UI 角标明确显示本轮档位；`chat.reasoning.auto.hintBill` i18n 文案可在 tooltip 末提示"自动升档可能增加 API 费用"。
- **风险 C — thread 继承导致一次误触长期高档**：首轮 prompt 触发 `max` 后续轮次全程 max。
  - 缓解：继承策略只保留一轮；关键词 / 启发式仅影响当前轮；thread 继承开关可关。
- **回滚**：全部逻辑走 `reasoningAutoEnabled` 总开关；回滚只需将其默认值改 false 或删除 helper 的调用点，现有手动 slider 行为完全保留。
