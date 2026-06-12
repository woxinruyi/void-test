# 实施任务：推理预算自适应（add-reasoning-budget-auto）

## 1. 阶段 A — 类型与纯函数

- [x] 1.1 在 `src/vs/workbench/contrib/void/common/helpers/reasoningAuto.ts` 新增文件：定义 `ReasoningTier` / `TierSource` / `EffectiveTier` 类型
- [x] 1.2 实现 `detectKeywordTier(prompt)`：内置中英双语关键词映射，返回 `{ tier, keyword } | null`
- [x] 1.3 实现 `heuristicsTier(prompt, ctx)`：长度 / 复杂度关键词 / 工具链深度 / 重试四项规则，返回 `{ tier, reasons } | null`
- [x] 1.4 实现 `resolveEffectiveTier(args)`：按优先级（手动 > 关键词 > 启发式 > thread 继承 > 默认档 > 模型默认）决策
- [x] 1.5 在 `modelCapabilities.ts` 新增 `tierToSendableReasoning(tier, providerName, modelName, overridesOfModel)`：把 `ReasoningTier` 映射到 `SendableReasoningInfo`，支持 `budget_slider` 与 `effort_slider` 两种类型
- [ ] 1.6 为 1.2–1.5 所有纯函数添加单元测试矩阵（本轮补齐）

## 2. 阶段 B — 全局设置扩展

- [x] 2.1 在 `voidSettingsTypes.ts` 的 `GlobalSettings` 增加五字段：`reasoningAutoEnabled` / `reasoningKeywordTriggersEnabled` / `reasoningHeuristicsEnabled` / `reasoningDefaultTier` / `reasoningThreadInherit`
- [x] 2.2 在 `defaultGlobalSettings` 赋默认值（前四项为 `true`，`reasoningDefaultTier = 'default'`）
- [x] 2.3 `voidSettingsService` 读取持久化状态时对缺失字段填充默认值，保证旧用户升级行为等价于"自动开启"
- [x] 2.4 新增 `getLastEffectiveTier(threadId)` / `setLastEffectiveTier(threadId, effective)` 方法（落在 `chatThreadService` 状态中，不持久化到磁盘）

## 3. 阶段 C — Chat 主循环接入

- [x] 3.1 在 `chatThreadService.ts` 中添加 `extractLastUserPrompt(thread)` 辅助：取 `messages` 数组中最后一条 `role === 'user'` 的文本内容
- [x] 3.2 添加 `countRecentToolCalls(thread, window)`：计算过去 N 轮消息中 tool 类消息的个数
- [x] 3.3 在 `_runChatAgent` 的 `while (shouldRetryLLM)` 循环外首部（每轮 LLM 调用前）调用 `resolveEffectiveTier`
- [x] 3.4 用 `tierToSendableReasoning` 把结果映射为 `reasoningBudget / reasoningEffort`，覆写当前轮次的 `modelSelectionOptions`（做一次浅拷贝，不污染用户原始设置）
- [x] 3.5 每轮 `llmDone` 后 `setLastEffectiveTier` 记录本轮档位
- [ ] 3.6 在每次 LLM 请求日志 `loggingExtras`（延后：当前通过 getLastEffectiveTier 查询）` 新增 `effectiveTier` 与 `tierSource` 字段

## 4. 阶段 D — 侧边栏 UI 角标

- [ ] 4.1 在 `SidebarChat.tsx` 的 `ReasoningOptionSlider` 组件右侧（延后：nice-to-have）新增一个角标元素（如"auto"或小齿轮图标），仅当 `globalSettings.reasoningAutoEnabled === true` 且当前 thread 有 `lastEffectiveTier` 时显示
- [ ] 4.2 角标 `data-tooltip-content`（延后）` 显示："本轮档位：{tier} / 来源：{source 描述} / 实际 {budget 或 effort}"
- [ ] 4.3 若 `source.kind === 'manual'`（延后），角标切换为"手动"样式，tooltip 显示"用户手动设定"
- [ ] 4.4 新增 `chat.reasoning.auto.*` i18n 键位（延后）：`badge`、`tierLabel.{default,high,max}`、`source.{manual,keyword,heuristic,threadInherit,defaultTier,modelDefault}`、`hintBill`

## 5. 阶段 E — 设置页"推理策略"子区

- [x] 5.1 在 `Settings.tsx` 的 `Tools` 分区新增"推理策略"子区
- [x] 5.2 `reasoningAutoEnabled` 主开关：关闭后下方四项控件 `disabled`
- [x] 5.3 `reasoningDefaultTier` 下拉选择：`default` / `high` / `max` 三选一
- [x] 5.4 其余三项 Switch 控件
- [x] 5.5 新增 `settings.reasoning.*` i18n 键位

## 6. 阶段 F — 文案、验证与发布

- [x] 6.1 审阅所有新增 i18n 键位，确保 `en` / `zh-cn` 双侧零缺失
- [x] 6.2 运行 `npm run buildreact`，无 TS 错误
- [ ] 6.3 单元测试通过（本轮补齐）
- [x] 6.4 运行 `npm run gulp vscode-win32-x64`（26 min, exit 0） 重建免安装目录
- [ ] 6.5 动态验收（待用户实测）：按 spec 中 Scenario 逐项目测，截图或日志归档至 `文档/归档/`

## 7. 归档与交付

- [ ] 7.1 `openspec validate add-reasoning-budget-auto` 通过
- [ ] 7.2 提交变更并在 PR 描述中链接 `proposal.md` / `design.md` / `specs/reasoning-budget-auto/spec.md`
- [ ] 7.3 按 `/opsx-archive` 流程归档本 change，在 `openspec/specs/` 下落盘 `reasoning-budget-auto` 能力
