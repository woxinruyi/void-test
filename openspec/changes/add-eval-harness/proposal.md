# 新增：Agent 质量评测 Harness（add-eval-harness）

## 背景

YWCode 已具备世界级的功能面（并行工具、语义索引、子 Agent、Hooks、检查点等），但**没有任何可量化的 Agent 质量基准**。每次修改 System Prompt、工具定义、Agent 循环逻辑后，只能凭"感觉"判断是否变好，无法证明没有回退。

对标主流：Cursor / Claude Code / Codex 的持续领先，靠的不是某个功能，而是**评测闭环**——每次改动都有数字证明。这是从"功能对标"跃迁到"质量对标"的关键，也最契合"确保最顶级编程工具"的诉求。

## 目标

- 建立可重复运行的 Agent 评测 Harness：固定任务集 → 跑 Agent → 度量结果。
- 核心指标：任务通过率（按可程序化校验的成功标准）、平均轮次、token 消耗、工具调用次数。
- 支持按 change 隔离运行（对比改动前后），输出可比对的报告。

## 非目标

- 不追求 SWE-bench 级别的大规模数据集；首版用 10-20 个项目内代表性任务即可。
- 不引入外部评测服务/网络依赖；本地可跑。
- 不改动 Agent 运行时逻辑（Harness 是旁路消费者）。

## 方案概述

复用现有 mocha 测试基建（`test/` + `npm run test-node`，见 build-pipeline.md）。新增评测套件：每个 case = { 初始工作区快照, prompt, 成功校验函数 }。Harness 驱动 `chatThreadService` 跑完一轮 Agent 循环，用校验函数判定成功，采集 metrics。

## 影响范围

- 新增 `test/eval/`（fixtures + runner + 报告）。
- 可能复用 `metricsService` 采集 token/轮次。
- 不改动 `browser/` 运行时服务。

## 验收标准

1. 提供 ≥10 个评测 case（覆盖：单文件编辑、跨文件重构、修 bug、读懂代码库回答）。
2. 一条命令跑完全部 case 并输出报告（通过率 / 平均轮次 / token）。
3. 同一套 case 两次运行结果稳定可比（容许 LLM 抖动的阈值说明）。
4. 报告可用于对比某个 prompt/工具改动前后的质量变化。
