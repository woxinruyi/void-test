# 设计：Agent 质量评测 Harness

## 背景

需要一个旁路（不改运行时）的评测系统，量化 Agent 在固定任务上的表现，用于回归检测与改动前后对比。复用现有 mocha 基建（`test/unit/node/index.js` 的 `TEST_GLOB = '**/test/**/*.test.js'`，从 `out/` 加载），因此评测代码须随 `gulp compile-client` 编译。

## 方案

### 数据结构

```
EvalCase = {
  id: string,
  setup: 工作区初始状态（最小文件集快照或临时目录）,
  prompt: string,                 // 用户指令
  chatMode: 'agent',
  check: (workspace) => { pass: boolean, detail: string },  // 可程序化校验
  budget?: { maxTurns, maxTokens }
}
```

### 运行流程

```
for each case:
  1. 在临时工作区还原 setup
  2. 以 prompt 驱动 chatThreadService 跑一轮 agent 循环（注入测试用 LLM 配置）
  3. 循环结束后运行 check(workspace) 判定成功
  4. 从 metricsService / 循环状态采集 turns、tokens、toolCalls
  5. 记录 { id, pass, turns, tokens, toolCalls, detail }
聚合 → 输出报告（JSON + 控制台摘要）
```

### 与现有模块的关系

- **复用**：`chatThreadService`（Agent 循环）、`metricsService`（token 采集）、mocha runner。
- **新增**：`test/eval/` 下的 cases、runner、reporter。
- **不改**：任何 `browser/` / `electron-main/` 运行时服务。

## 数据流

evalRunner → chatThreadService.sendMessage（测试配置）→ LLM（真实或录制）→ 工具执行（在临时工作区）→ check → metrics 聚合 → 报告文件。

## 边界情况

- **LLM 抖动**：同一 case 多次结果可能不同。缓解：报告标注为"非确定性"，关键回归判断用多次运行的通过率而非单次；或支持录制/回放（VCR 式）作为后续增强。
- **API Key / 网络**：评测需真实 LLM 调用。缓解：从环境读取测试配置，无 key 时跳过并提示（不让 CI 误判失败）。
- **工作区隔离**：每个 case 用独立临时目录，跑完清理，避免相互污染。
- **耗时**：Agent 循环较慢。缓解：支持 `--grep` 跑单 case；完整套件作为按需任务而非每次提交。

## 回滚策略

纯新增 `test/eval/` 目录，删除即回滚；不影响产品代码与现有测试。

## 风险

| 风险 | 等级 | 缓解 |
|------|:--:|------|
| 评测非确定性导致结论噪声 | 中 | 多次运行取通过率；后续引入回放 |
| 驱动 chatThreadService 需较多测试脚手架 | 中 | 首版聚焦少量 case，逐步扩展 |
| 真实 LLM 调用成本 | 低 | 用低价模型跑评测；按需运行 |
