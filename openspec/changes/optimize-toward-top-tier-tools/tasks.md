# 任务：对标顶级工具的能力优化

> 本提案为路线图级，落地时建议每个 P0/P1 项拆为独立 openspec change 实施。

## Phase A — 短期（复用现有零件，快出价值）

- [ ] P1-5 `/review` 多视角对抗审查：对同一 diff 并行 correctness/security/perf 三路 LLM → 合并去重 → 真伪校验（基于 `add-ai-code-review`）
- [ ] P2 工程质量：DI 注册自检 + 设置面板烟雾测试（承接 fix-settings-pane-mount-resilience）
- [ ] P2 i18n 切换局部刷新（消除 `Settings.tsx` 的 `key={locale}` 整树重挂）
- [ ] **编译验证：`npx tsc -p src/tsconfig.json --noEmit` 0 errors**

## Phase B — 中期（补齐索引护城河）

- [ ] P0-1a 嵌入：ONNX `all-MiniLM-L6-v2`/bge-small 替换 FNV hash（embedding provider 抽象 + main/worker 推理）
- [ ] P0-1b 存储：SQLite + sqlite-vec 替换内存向量库，随 Merkle 增量更新
- [ ] P0-1c 验收：跨文件查询召回基线对比，确认优于关键词；跨重启可用
- [ ] P1-6 符号级关系图（调用/依赖）注入上下文
- [ ] P1-4 子代理升级为带角色/可写的 Agent teams（reviewer/tester/security）
- [ ] **编译验证：`npx tsc -p src/tsconfig.json --noEmit` 0 errors**

## Phase C — 长期（拉平第一梯队）

- [ ] P0-2 专用编辑预测 / Fast Apply 模型接入（自研或第三方），通用 LLM 降级
- [ ] P0-3 本地后台 Agent：git worktree 隔离 + 任务队列 + 侧栏 UI
- [ ] **编译验证：`npx tsc -p src/tsconfig.json --noEmit` 0 errors**

## 跨阶段纪律

- [ ] 任何新服务：`registerSingleton` + `void.contribution.ts` import 同步补，避免孤儿注册
- [ ] 每项增强带能力开关/可回滚
- [ ] 明确不做：多端扩张（JetBrains/Web/移动）
