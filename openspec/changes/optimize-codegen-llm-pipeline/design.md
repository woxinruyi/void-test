# 设计：codegen 调用链优化

## 进程归属

- renderer：编辑落地（`editCodeService`）、消息组装/修剪（`convertToLLMMessageService`）、FIM（`autocompleteService`）、解析（`extractCodeFromResult`）、模板（`prompts.ts`）、能力位（`modelCapabilities`）。
- main：`electron-main/llmMessage/`（缓存断点、provider 能力）。

## P0-1 SEARCH 块模糊匹配

- 现状：`findTextInCode(block.orig, originalFileCode, exact)` 精确匹配（editCodeService ~1957）。
- 设计：新增"容差匹配"层，按优先级回退：
  1. 精确匹配（保持现状，最快）。
  2. 行级 trim 匹配（忽略每行首尾空白）。
  3. EOL 归一（`\r\n`/`\r`→`\n`）后匹配。
  4. 缩进无关匹配（去公共缩进后比较）。
  命中后**仍校验唯一性**（多处匹配则判为歧义，回退报错让模型澄清）。
- 复用：`common/helpers/` 现有字符串工具；在 `extractSearchReplaceBlocks` 下游加匹配适配器，不改块协议。

## P0-2 Fast Apply 重试降级 + 增量纠错

- 现状：重试 push `{assistant: 全量fullText}`+`{user: 错误}`，4 次抛异常（~1890-2010）。
- 设计：
  - 增量：重试只携带"未匹配的块清单 + 该块在文件中的近似上下文"，要求模型仅重出这些块；不再累积整段历史。
  - 降级：达 N_RETRIES 仍有未匹配块 → 对"剩余未应用部分"自动切 `_initializeWriteoverStream`（全文重写）兜底；全失败才提示用户。
  - 部分成功可视化：已匹配块照常应用，仅未匹配块进入降级。

## P0-3 专用低延迟生成模型位

- 现状：Apply/Ctrl+K/Autocomplete 用 `modelSelectionOfFeature[feature]`，无"快速模型"区分。
- 设计：`modelCapabilities` 增能力维度 `isFastApplyCapable`/`isEditPredictionCapable`；设置增"快速生成模型"可选项（默认回退到该 feature 的通用模型）。Apply 优先快速模型，失败/不可用降级通用模型。
- 对标：Cursor Sonic / Zed Zeta2。模型来源（自研/第三方 morph·relace）另议，本项只做"能力位 + 选择 + 降级"。

## P1-4 缓存扩展

- 现状：仅最后一个工具 + system 加 `ephemeral`（仅 Anthropic）。
- 设计：把"稳定用户上下文段（目录树/规则/已打开文件清单）"也设为缓存断点；为 provider 适配层抽象"缓存能力位"，能力具备者复用同一断点策略。

## P1-5 修剪语义化

- 现状：固定权重 user×1/system×0.01/assistant×10，首1末3×0.05（~303-379）。
- 设计：保护集 = {当前任务消息、最近 N 轮、被本轮工具/编辑引用的文件块}；保护集外再按权重修剪；`TRIM_TO_LEN` 对代码块改为"保结构截断"（保留花括号/签名行）。

## P1-6 FIM 增强

- 缓存键纳入 suffix；增 debounce（输入停顿后再请求）；prefix/suffix 选择按缩进层级/AST 边界扩展而非纯字符窗；输出后做括号/引号平衡校验（不平衡则截断到平衡点）。

## P2

- 7 Reasoning：Apply/Ctrl+K 暴露推理档位选择（沿用 `getIsReasoningEnabledState` + UI 开关）。
- 8 错误分类：`onError` 增错误类型（网络/限流/格式/编辑不匹配）→ 网络限流自动退避重试、格式/不匹配走 P0-2 降级、其它提示。
- 9 DiffZone：流式 apply 合并相邻行变更、节流渲染（rAF/批量），大文件阈值上启用。

## 风险与回滚

- 每项独立、带能力/设置开关，可单独回滚；模糊匹配保留"精确优先 + 唯一性校验"避免误改。
- 实施纪律：任何新服务/能力位 `registerSingleton` + `void.contribution.ts` import 同步补（承接 fix-settings-pane-mount-resilience）。
- 验证优先复用 CDP 运行时验证（构造编辑用例端到端跑）。
