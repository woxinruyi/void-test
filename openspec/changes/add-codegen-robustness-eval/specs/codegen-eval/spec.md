# Codegen 鲁棒性评测（codegen-eval）

## ADDED Requirements

### 需求：提供 codegen 链路的确定性鲁棒性评测

系统 SHALL 提供一个不依赖 LLM 的确定性评测 Harness，对 codegen 链路的纯函数（容差匹配、SEARCH/REPLACE 解析、工具结果截断）按固定用例打分，用于回归检测与改动前后对比。

#### Scenario: 一条命令输出分组指标报告
- **WHEN** 运行 `npx tsx test/eval/codegenRobustnessEval.ts`
- **THEN** 输出 RECALL_TOLERANT / RECALL_FUZZY / SAFETY / PARSE / TRUNCATE 五组的通过率与总体得分，并以退出码表达硬指标是否全部达标（达标 0 / 否则 1）

#### Scenario: 容差匹配召回
- **WHEN** SEARCH 块与文件仅存在尾随空格 / 缩进(Tab↔空格) / CRLF↔LF 差异
- **THEN** `findTextInCode` 仍命中正确的 1-indexed 行区间

#### Scenario: 误匹配安全性
- **WHEN** SEARCH 块在文件中不存在，或在严格模式（不允许去空白回退）下仅有空白差异，或去空白后出现多处
- **THEN** 分别返回 `Not found` / `Not found` / `Not unique`，不得给出错误的命中位置

#### Scenario: 改动前后可对比
- **WHEN** 修改了匹配阈值、截断常量或块解析逻辑后重跑 Harness
- **THEN** 分组通过率的变化即为该改动是否引入回归的客观依据

### 需求：评测为旁路、不改变运行时行为

系统 SHALL 确保为可测性所做的抽取保持原匹配行为不变。

#### Scenario: 匹配逻辑原样搬运
- **WHEN** 将匹配纯函数从 `editCodeService.ts` 抽到 `common/helpers/findTextInCode.ts`
- **THEN** 函数实现逐字保持一致，`editCodeService` 经 import 复用，Apply / Fast Apply 的定位行为与抽取前一致
