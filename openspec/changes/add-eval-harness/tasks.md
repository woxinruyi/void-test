# 任务：Agent 质量评测 Harness

## Phase 1 — 最小骨架（runner + 1 个 case）

- [ ] 新增 `test/eval/` 目录与 `evalTypes.ts`（EvalCase 结构）
- [ ] 实现临时工作区 setup/teardown（独立目录、跑后清理）
- [ ] 实现 runner：以 prompt 驱动 `chatThreadService` 跑完一轮 agent 循环
- [ ] 实现 1 个端到端 case（单文件编辑）+ check 校验函数
- [ ] **编译验证：`npx tsc -p src/tsconfig.json --noEmit` 0 errors**

## Phase 2 — 指标采集与报告

- [ ] 从 `metricsService`/循环状态采集 turns、tokens、toolCalls
- [ ] 实现 reporter：聚合输出 JSON + 控制台摘要（通过率/平均轮次/token）
- [ ] 处理无 API Key 时跳过并提示（不误判 CI 失败）
- [ ] **编译验证：`npx tsc -p src/tsconfig.json --noEmit` 0 errors**

## Phase 3 — 扩充用例集

- [ ] 补齐至 ≥10 个 case：跨文件重构、修 bug（先写复现）、代码库问答、终端命令
- [ ] 文档化运行方式（`npm run test-node -- --grep "eval"` 等）与抖动阈值说明
- [ ] 用本 Harness 跑一次"add-prompt-caching 改动前后"对比，验证可用性
- [ ] **编译验证：`npx tsc -p src/tsconfig.json --noEmit` 0 errors**
