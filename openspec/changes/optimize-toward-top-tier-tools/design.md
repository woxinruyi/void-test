# 设计：对标顶级工具的能力优化

## 对标矩阵（摘要）

完整 6 工具 × 18 能力矩阵见 `temp-ai-coding-tools-benchmark.md`。关键差距：

| 能力 | YWCode | 第一梯队 |
|---|---|---|
| 全仓库语义索引 | ⚠️ 占位（hash 嵌入/内存） | Windsurf 语义关系图 / Cursor 上线即索引 |
| 预测 Tab / Fast Apply | ⚠️ 通用 LLM | Cursor Sonic / Zed Zeta2 专用模型 |
| 后台/云端 Agent | ❌ 规划中 | Cursor Background/Cloud Agents |
| 子代理 / Agent teams | ⚠️ 只读≤10 | Claude Code 全能子代理 |
| AI 代码审查 | ⚠️ 基础版已落地 | Cursor BugBot |

## 各优化项的现有架构复用点

- **P0-1 真索引**：复用 `codeIndexService` 已有的 tree-sitter AST 分块、Merkle 增量、RRF 混合搜索、ripgrep 降级；仅替换 embedding provider（FNV→ONNX）与 store（内存→SQLite+sqlite-vec）。进程：嵌入推理建议放 main/worker 避免阻塞 renderer（参考 LLM 调用走 IPC 的约束）。
- **P0-2 编辑预测/Apply**：`autocompleteService`（FIM 已支持）+ `editCodeService`（Apply/Fast Apply Diff Zone 已具备）。接入专用模型作为新 Provider 能力位（`modelCapabilities` 增能力维度），通用 LLM 保留为降级路径。
- **P0-3 后台 Agent**：复用 `subagentService` 调度骨架 + `turnCheckpointService` 隔离思路；新增 git worktree 管理 + 任务队列服务。先本机后台，UI 复用 Terminal Threads 式侧栏（参考 Zed）。
- **P1-4 Agent teams**：扩展 `subagentService` 任务模型，加角色/工具权限/可写；审批沿用 `toolsService` 审批流。
- **P1-5 `/review` 多视角**：在 `add-ai-code-review` 基础上，对同一 diff 并行 correctness/security/perf 三路 LLM → 合并去重 → 真伪校验。复用现有 `sendLLMMessage` + IMarkerService 诊断渲染。
- **P1-6 关系图**：在 P0-1 索引之上构建符号调用/依赖图，经 `convertToLLMMessageService` 注入。

## 技术风险与回滚

- P0-1 嵌入推理体积/启动成本：ONNX 模型随包体增大；可做按需下载 + 索引后台构建 + 未就绪降级 ripgrep（现已有降级）。
- P0-2 专用模型供应：依赖第三方端点可用性；通用 LLM 降级保证不退化。
- 每项均为**增量增强**，独立服务/能力位，可单独回滚（移除 contribution import 或能力开关）。
- 注册纪律：任何新服务务必 `registerSingleton` + `void.contribution.ts` import 同步补（承接 `fix-settings-pane-mount-resilience` 的孤儿注册教训）。

## 路线图

- 短期：P1-5 `/review` 多视角（复用零件，快出价值）+ P2 工程质量（DI 自检/烟雾测试/i18n 局部刷新）。
- 中期：P0-1 真索引（ONNX+SQLite）→ P1-6 关系图 → P1-4 Agent teams。
- 长期：P0-2 专用编辑/Apply 模型 → P0-3 后台 Agent。

## 取舍

放弃多端扩张（P2 多端），资源压在"索引质量（P0-1）+ 编辑手感（P0-2）"——这是第一梯队拉开差距的根，也是中文+多 Provider 护城河之外最该补的地基。
