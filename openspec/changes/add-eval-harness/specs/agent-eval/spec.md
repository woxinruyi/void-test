# Agent 评测（agent-eval）

## ADDED Requirements

### 需求：提供可重复的 Agent 评测 Harness

系统 SHALL 提供一个旁路评测 Harness，对固定任务集驱动 Agent 循环并采集质量指标，用于回归检测与改动前后对比。

#### Scenario: 运行评测套件输出报告
- **WHEN** 执行评测命令且已配置可用的测试 LLM
- **THEN** Harness 对每个 case 跑完一轮 agent 循环，并输出包含通过率、平均轮次、token 消耗的报告

#### Scenario: 单个用例的成功判定
- **WHEN** 一个 case 的 agent 循环结束
- **THEN** 调用该 case 的 `check(workspace)` 函数，依其返回的 `pass` 布尔值判定成功，而非依赖文本匹配

#### Scenario: 工作区隔离
- **WHEN** 连续运行多个 case
- **THEN** 每个 case 在独立临时工作区执行，运行后清理，互不污染

#### Scenario: 缺少 API Key 时优雅跳过
- **WHEN** 运行评测但未配置测试 LLM 凭据
- **THEN** Harness 跳过需真实调用的 case 并明确提示，而非报告为失败

### 需求：评测不影响运行时

系统 SHALL 确保评测 Harness 为旁路组件，不修改 Agent 运行时服务。

#### Scenario: 仅新增测试目录
- **WHEN** 引入评测 Harness
- **THEN** 改动仅限 `test/eval/`（及必要的测试配置），不修改 `browser/` 或 `electron-main/` 下的运行时服务
