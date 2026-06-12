# 提案：优化"调用模型生成代码"全链路（optimize-codegen-llm-pipeline）

## 背景

对"调用模型生成/修改代码"的完整链路做了细粒度梳理（机制与 file:line 证据见 `analysis.md`）：Prompt 组装（`prompts.ts` 的 SEARCH/REPLACE 模板）→ 消息组装与修剪（`convertToLLMMessageService.ts`）→ LLM 调用（`sendLLMMessageService` + `electron-main/llmMessage/`）→ Apply/Fast Apply 落地（`editCodeService.ts`）→ 输出解析（`extractCodeFromResult.ts`）→ FIM 补全（`autocompleteService.ts`）→ 重试/错误恢复。

链路功能完整，但有若干**直接影响生成成功率、延迟与成本**的细节弱点，集中在三类：①编辑块匹配脆弱（空格/缩进/EOL 差异即失败）②无专用低延迟生成模型（Apply/FIM 复用通用大模型）③重试与上下文管理粗糙（重试消息累积爆炸、修剪权重固定、缓存断点单一）。

## 目标（按 ROI 排序）

**P0 — 直接提升生成成功率与手感**
1. **SEARCH 块模糊匹配**：`editCodeService` Fast Apply 与 `edit_file` 工具的块定位，从"精确匹配"升级为"空白/缩进/EOL 容差匹配"（保留唯一性校验）。这是当前第一失败源。
2. **Fast Apply 重试降级 + 增量纠错**：N_RETRIES=4 失败后**降级到 Writeover 全文重写**而非抛异常；重试只回灌"未匹配的块"而非全量消息累积，避免上下文爆炸。
3. **专用低延迟生成模型位**：为 `Apply` / `Ctrl+K` / `Autocomplete` 增"快速生成模型"能力位（如 haiku/morph 类），通用大模型作降级。对标 Cursor Sonic / Zed Zeta2。

**P1 — 成本与上下文质量**
4. **Prompt 缓存扩展**：缓存断点从"仅工具+System、仅 Anthropic"扩展到稳定用户上下文段；评估其它 provider 的缓存能力位。
5. **消息修剪语义化**：替换固定权重（assistant×10 / system×0.01）为"保护当前任务相关 + 最近 N 轮 + 被引用文件"的策略，减少误删关键上下文。
6. **FIM 补全增强**：AST/缩进感知的 prefix/suffix 选择 + suffix-aware 缓存键 + 防抖 + 括号平衡后处理。

**P2 — 健壮性与性能**
7. **Reasoning 档位对 Apply 可配**：Apply/Ctrl+K 允许选择推理档（当前默认关闭且无 UI）。
8. **错误分类与差异化重试**：区分网络/限流/模型格式/编辑不匹配错误，分别采取重试/降级/提示。
9. **DiffZone 流式渲染合批**：大文件流式 apply 合并 diff、延迟渲染，降卡顿。

## 非目标

- 不更换 Provider 适配架构或 IPC 机制，均为增量增强。
- 不在本提案内自研生成模型（P0-3 优先"接入能力位"，模型来源另议）。
- 不改 Agent 主循环的工具协议；仅优化生成/编辑相关环节。

## 影响范围

- renderer：`editCodeService.ts`（Apply/Fast Apply/重试）、`convertToLLMMessageService.ts`（修剪/缓存）、`autocompleteService.ts`（FIM）、`common/helpers/extractCodeFromResult.ts`（块解析）、`common/prompt/prompts.ts`（模板）、`common/modelCapabilities.ts`（能力位）。
- main：`electron-main/llmMessage/`（缓存断点、provider 能力）。

## 验收标准

- P0-1：构造一组"空格/缩进/CRLF 差异"的编辑用例，块匹配成功率显著上升（基线对比）。
- P0-2：故意让模型产出不匹配块，确认**降级到 Writeover 成功落地**而非报错；重试消息不再全量累积。
- P0-3：Apply 配置快速模型后端到端延迟显著下降（量化）。
- 每阶段 `npx tsc -p src/tsconfig.json --noEmit` 0 errors；不回归现有 Apply/补全。
