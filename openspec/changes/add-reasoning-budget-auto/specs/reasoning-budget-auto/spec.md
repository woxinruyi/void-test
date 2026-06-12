# 推理预算自适应能力（reasoning-budget-auto）

## ADDED Requirements

### Requirement: 档位抽象与模型映射

系统 MUST 定义统一的 `ReasoningTier`（`'off' | 'default' | 'high' | 'max'`），并提供纯函数 `tierToSendableReasoning(tier, providerName, modelName, overridesOfModel)` 将档位映射到各模型的 `SendableReasoningInfo`。映射 MUST 支持 `budget_slider`（tokens）与 `effort_slider`（枚举）两种类型。

#### Scenario: budget_slider 档位映射

- **WHEN** 模型为 Anthropic `claude-3-7-sonnet`（`slider.default = 1024`、`slider.max = 8192`），tier 为 `'high'`
- **THEN** `tierToSendableReasoning` 返回的 `reasoningBudget` MUST 等于 `min(1024 * 3, floor(8192 * 0.6)) = 3072`

#### Scenario: budget_slider max 档位

- **WHEN** 模型为 Anthropic `claude-3-7-sonnet`，tier 为 `'max'`
- **THEN** 返回的 `reasoningBudget` MUST 等于 `slider.max`（8192）

#### Scenario: effort_slider 三档映射

- **WHEN** 模型为 OpenAI `o1`（values = `['low','medium','high']`），tier 分别为 `default` / `high` / `max`
- **THEN** 返回的 `reasoningEffort` MUST 分别等于 `'low'` / `'medium'` / `'high'`

#### Scenario: effort_slider 两档退化

- **WHEN** 模型为 Grok `grok-3-mini`（values = `['low','high']`），tier 为 `'high'`
- **THEN** 返回的 `reasoningEffort` MUST 等于 `'high'`（`min(1, values.length - 1)` 即索引 1）

#### Scenario: 不支持关闭推理时 off 不生效

- **WHEN** 模型 `canTurnOffReasoning === false`，tier 为 `'off'`
- **THEN** `tierToSendableReasoning` MUST 回退到 `'default'` 档的 sendable 值，MUST NOT 返回 `null`

### Requirement: 优先级链路决策档位

`resolveEffectiveTier` MUST 按以下优先级由高到低依次决策档位：用户手动 slider 值 > prompt 关键词触发 > 启发式升档 > thread 继承 > 全局默认档 > 模型默认档。

#### Scenario: 用户手动覆盖其他所有来源

- **WHEN** `manualOptions.reasoningBudget !== undefined` 且用户 prompt 含 `"think hard"`
- **THEN** `resolveEffectiveTier.source.kind` MUST 等于 `'manual'`，MUST NOT 被关键词覆盖

#### Scenario: 关键词优先于启发式

- **WHEN** 无手动值，prompt `"think hard"`（关键词），同时长度 500 字（启发式条件）
- **THEN** `source.kind` MUST 等于 `'keyword'`，`tier` MUST 等于 `'max'`

#### Scenario: 启发式多条件组合升 max

- **WHEN** 无手动值、无关键词，prompt 长度 600 字且含 "refactor"
- **THEN** `source.kind` MUST 等于 `'heuristic'`，`tier` MUST 等于 `'max'`，`reasons` MUST 包含 `'prompt-length'` 与 `'complex-keyword'`

#### Scenario: thread 继承在无关键词无启发式时生效

- **WHEN** 无手动、无关键词、无启发式命中，`ctx.previousThreadTier === 'high'`，`globalSettings.reasoningThreadInherit === true`
- **THEN** `tier` MUST 等于 `'high'`，`source.kind` MUST 等于 `'threadInherit'`

#### Scenario: 自适应总开关关闭后仅用默认档

- **WHEN** `globalSettings.reasoningAutoEnabled === false`
- **THEN** 关键词、启发式、thread 继承 MUST 全部被跳过，`tier` MUST 等于 `globalSettings.reasoningDefaultTier ?? 'default'`

### Requirement: Prompt 关键词触发规则

关键词检测 MUST 基于正则表达式对 prompt 做整词 + 不区分大小写匹配。`max` 档关键词集合 MUST 覆盖 `think hard`、`think harder`、`deep think`、`ultrathink`、`think step by step`、`深入思考`、`仔细思考`、`彻底想清楚`、`好好想一想`；`high` 档关键词集合 MUST 覆盖 `think`（整词）、`想一下`、`思考一下`。检测 MUST 优先返回 `max` 档匹配。

#### Scenario: max 关键词优先匹配

- **WHEN** prompt 为 `"think hard about this"`
- **THEN** `detectKeywordTier` MUST 返回 `{ tier: 'max', keyword: 'think hard' }`，MUST NOT 返回 high 档

#### Scenario: 中文关键词匹配

- **WHEN** prompt 为 `"请深入思考下这段代码的边界条件"`
- **THEN** `detectKeywordTier` MUST 返回 `{ tier: 'max', keyword: '深入思考' }`

#### Scenario: 整词约束拒绝子串

- **WHEN** prompt 为 `"overthinking won't help"`
- **THEN** `detectKeywordTier` MUST 返回 `null`（`thinking` 不是整词 `think`）

#### Scenario: 无关键词返回 null

- **WHEN** prompt 为 `"what is 2+2"`
- **THEN** `detectKeywordTier` MUST 返回 `null`

### Requirement: 启发式升档规则

启发式 MUST 基于四类信号：prompt 长度（中文按字、英文按词，≥500 触发 `prompt-length`）、prompt 含复杂度关键词（正则 `/refactor|重构|architect|架构|design|设计|audit|审计|analyze|分析/i` 触发 `complex-keyword`）、最近 5 轮工具调用链深度 ≥8（触发 `deep-tool-chain`）、当前 LLM 重试次数 ≥2（触发 `retry`）。命中 1 条返回 `'high'`，命中 ≥2 条返回 `'max'`，0 条返回 `null`。

#### Scenario: 单条件命中升 high

- **WHEN** prompt 700 字且不含复杂度关键词，toolChainDepth=0，retryCount=0
- **THEN** `heuristicsTier` MUST 返回 `{ tier: 'high', reasons: ['prompt-length'] }`

#### Scenario: 多条件组合升 max

- **WHEN** prompt 600 字且含 "重构"，toolChainDepth=3，retryCount=0
- **THEN** `heuristicsTier` MUST 返回 `{ tier: 'max', reasons: ['prompt-length', 'complex-keyword'] }`

#### Scenario: 工具链深度触发

- **WHEN** prompt 短（`"继续"`），toolChainDepth=10
- **THEN** `heuristicsTier` MUST 返回 `{ tier: 'high', reasons: ['deep-tool-chain'] }`

#### Scenario: 启发式可关

- **WHEN** `globalSettings.reasoningHeuristicsEnabled === false`，prompt 600 字
- **THEN** `resolveEffectiveTier` MUST NOT 调用启发式，决策回退到 thread 继承或默认档

### Requirement: Thread 内档位继承

当 `globalSettings.reasoningThreadInherit === true` 且本轮无手动、无关键词、无启发式命中时，系统 MUST 使用上一轮该 thread 的 `lastEffectiveTier` 作为本轮档位；`source.kind` MUST 等于 `'threadInherit'`。继承 MUST 仅沿用一轮（即 `previousThreadTier` 来自紧邻上一轮），MUST NOT 跨 thread 传递。

#### Scenario: 同 thread 内沿用

- **WHEN** thread A 第 1 轮 tier=`max`（关键词触发），第 2 轮 prompt `"好"`（无关键词无启发式）
- **THEN** 第 2 轮 `tier` MUST 等于 `'max'`，`source.kind` MUST 等于 `'threadInherit'`

#### Scenario: 跨 thread 不传递

- **WHEN** thread A 第 1 轮 tier=`max`，新建 thread B 第 1 轮 prompt `"hi"`
- **THEN** thread B 第 1 轮 MUST 等于默认档，MUST NOT 继承 thread A 的 max

#### Scenario: 继承开关关闭

- **WHEN** `globalSettings.reasoningThreadInherit === false`，thread A 第 1 轮 tier=`max`，第 2 轮 prompt `"好"`
- **THEN** 第 2 轮 `tier` MUST 等于默认档

### Requirement: UI 角标显示档位来源

侧边栏 `ReasoningOptionSlider` 旁 MUST 在 `globalSettings.reasoningAutoEnabled === true` 时显示一个自动角标；悬浮 MUST 展示当前 thread 最近一轮的 `tier`、`source` 描述、以及实际发送的 budget/effort 值。

#### Scenario: 关键词触发后角标显示来源

- **WHEN** 用户发送 `"think hard, refactor"`，LLM 响应开始
- **THEN** 角标 tooltip MUST 包含中文文本"本轮档位：高（max）"与"来源：关键词 'think hard'"

#### Scenario: 手动覆盖角标改样式

- **WHEN** 用户拖动 slider 到自定义值
- **THEN** 角标 MUST 切换为"手动"样式，tooltip MUST 显示"用户手动设定"

#### Scenario: 自适应关闭不显示角标

- **WHEN** `globalSettings.reasoningAutoEnabled === false`
- **THEN** 角标 MUST NOT 渲染

### Requirement: 设置页提供五项控制

`Void's Settings` 的 `General` 分区 MUST 新增"推理策略"子区，提供：`reasoningAutoEnabled`（Switch）、`reasoningDefaultTier`（Dropdown：default / high / max）、`reasoningKeywordTriggersEnabled`（Switch）、`reasoningHeuristicsEnabled`（Switch）、`reasoningThreadInherit`（Switch）。当主开关关闭时其余四项 MUST 处于 `disabled` 状态但保留当前值。

#### Scenario: 主开关级联禁用

- **WHEN** 用户在设置页将 `reasoningAutoEnabled` 从 true 切到 false
- **THEN** 下方四个控件 MUST 变为 `disabled`，显示值 MUST 保留；写入持久化的字段值 MUST NOT 被清空

#### Scenario: 默认档位下拉生效

- **WHEN** 用户将 `reasoningDefaultTier` 从 `default` 改为 `high`，关闭 `reasoningAutoEnabled`，发送短 prompt
- **THEN** 实际档位 MUST 等于 `'high'`，`source.kind` MUST 等于 `'defaultTier'`

### Requirement: 旧用户平滑升级

升级到含本 change 的版本后，缺失的五个新字段 MUST 自动填充为推荐默认值（`reasoningAutoEnabled=true`、`reasoningKeywordTriggersEnabled=true`、`reasoningHeuristicsEnabled=true`、`reasoningDefaultTier='default'`、`reasoningThreadInherit=true`），MUST NOT 影响现有手动 slider 值。

#### Scenario: 旧持久化无新字段

- **WHEN** 旧用户持久化的 `globalSettings` 不含五个新字段中任何一个
- **THEN** 首次启动加载后 `globalSettings` MUST 包含全部五个字段且值等于推荐默认

#### Scenario: 用户已有手动 slider 值不受影响

- **WHEN** 旧用户曾手动设置 `modelSelectionOptions.reasoningBudget = 6144` 并持久化
- **THEN** 升级后首次发送消息 MUST 使用 6144，MUST NOT 被自动机制覆盖，`source.kind` MUST 等于 `'manual'`
