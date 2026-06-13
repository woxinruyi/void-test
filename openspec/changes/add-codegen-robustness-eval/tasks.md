# 任务：Codegen 鲁棒性确定性评测

## Phase 1 — 可测性抽取

- [x] 将纯匹配逻辑从 `editCodeService.ts` 移到 `common/helpers/findTextInCode.ts` 并导出（`findTextInCode` + `removeWhitespaceExceptNewlines` / `normalizeLine` / `lineSimilarity` / `fuzzyFindLines`）
- [x] `editCodeService.ts` 改为 import 复用；删除本地定义；确认 3 处调用点不变、无孤立引用（`numLinesOfStr` 仅随匹配逻辑迁出）

## Phase 2 — Harness 与用例

- [x] `test/eval/codegenRobustnessEval.ts`：RECALL_TOLERANT(4) / RECALL_FUZZY(1) / SAFETY(3) / PARSE(3) / TRUNCATE(2)，分组报告 + 阈值 + 退出码
- [x] `test/common/codegenRobustness.test.ts`：同套用例 mocha 固化，纳入 `npm run test-node`

## Phase 3 — 验证

- [x] 运行 harness：13/13 通过，五组硬指标均 100%，退出码 0
- [x] 编译验证：`npx tsc -p src/tsconfig.json --noEmit` 0 errors（已确认）
- [ ] （可选）`npm run test-node` 跑 mocha 套件回归

## 跨阶段纪律

- [x] 匹配函数为原样搬运，不改变行为；保留"精确优先 + 唯一性校验"
- [x] 仅新增测试 + 一处可测性抽取，不触碰运行时调用语义
