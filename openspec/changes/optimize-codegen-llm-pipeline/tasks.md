# 任务：优化 codegen 调用链

## Phase 0 — 基线与用例

- [ ] 构造编辑用例集：空格差异 / 缩进差异 / CRLF / 大文件 / 多块 / 故意不匹配块，记录当前成功率与延迟基线
- [ ] 记录 Fast Apply 重试触发率与失败抛错率（作为 P0-2 对照）

## Phase 1 — P0 生成成功率与手感

- [ ] P0-1 SEARCH 块容差匹配：精确→trim→EOL 归一→缩进无关 回退链 + 唯一性校验（`editCodeService` 块定位 + `extractCodeFromResult` 下游适配器）
- [ ] P0-2 Fast Apply：重试只回灌未匹配块（去全量累积）；N_RETRIES 后对剩余部分降级 Writeover；已匹配块照常应用
- [ ] P0-3 快速生成模型位：`modelCapabilities` 增能力维度 + 设置"快速生成模型"选项 + Apply 优先/降级逻辑
- [ ] **编译验证：`npx tsc -p src/tsconfig.json --noEmit` 0 errors**
- [ ] CDP 运行时验证：用 Phase 0 用例确认匹配成功率上升、降级生效

## Phase 2 — P1 成本与上下文质量

- [ ] P1-4 缓存断点扩展（稳定用户上下文段）+ provider 缓存能力位抽象
- [ ] P1-5 修剪语义化（保护集 + 保结构截断）
- [ ] P1-6 FIM：suffix-aware 缓存键 + 防抖 + AST/缩进感知窗 + 括号平衡后处理
- [ ] **编译验证：`npx tsc -p src/tsconfig.json --noEmit` 0 errors**

## Phase 3 — P2 健壮性与性能

- [ ] P2-7 Apply/Ctrl+K 推理档位可配（UI + getIsReasoningEnabledState）
- [ ] P2-8 错误分类与差异化重试（网络退避 / 格式·不匹配降级 / 其它提示）
- [ ] P2-9 DiffZone 流式渲染合批 + 节流（大文件阈值启用）
- [ ] **编译验证：`npx tsc -p src/tsconfig.json --noEmit` 0 errors**

## 跨阶段纪律

- [ ] 每项带能力/设置开关、可回滚；模糊匹配保留精确优先 + 唯一性校验
- [ ] 新服务/能力位：registerSingleton + contribution import 同步补
- [ ] 不回归现有 Apply / 补全（用例回归）
