# 提案：对标顶级 AI 编程工具的能力优化（optimize-toward-top-tier-tools）

## 背景

对当前项目架构（见 `architecture/overview.md`、`tool-system.md`、`agent-loop.md`）与 2026 年中主流 AI 编程工具（Cursor v3 / Windsurf Cascade / GitHub Copilot / Claude Code / Zed / Aider）做了系统对标（完整矩阵见 `temp-ai-coding-tools-benchmark.md`）。

结论：YWCode 在**多 Provider 聚合（13+）、默认中文 i18n、工具钩子、Anthropic Prompt 缓存、MCP 聚合市场、LSP 工具集、Turn 级检查点、推理预算自适应**上已达到甚至超过主流覆盖面，护城河成形。但与第一梯队仍有三处**高 ROI 地基差距**，决定"日常手感"与"能放手跑"的上限。

## 目标（按优先级补齐高 ROI 能力）

**P0（决定手感与放手）**
1. **真实语义索引**：把 `codeIndexService` 的占位嵌入（FNV hash / 内存存储）替换为真实嵌入（ONNX `all-MiniLM-L6-v2`/bge-small）+ 持久向量库（SQLite + sqlite-vec），随 Merkle 增量更新。对标 Windsurf 全仓库语义图 / Cursor 上线即索引。
2. **专用编辑预测 / Fast Apply**：Tab 补全与 Apply 接入专用低延迟模型（自研或第三方 morph/relace 类），通用 LLM 降级。对标 Cursor Sonic / Zed Zeta2（LSP 上下文，采纳率 +30%）。
3. **本地后台 Agent**：git worktree 隔离 + 任务队列，先做本机后台再谈云端。对标 Cursor Background Agents。

**P1（提升放手可信度）**
4. **子代理升级为 Agent teams**：现 `subagentService.dispatch` 仅只读≤10；扩展为带角色（reviewer/tester/security）、可写、独立工具权限。对标 Claude Code subagents。
5. **AI 代码审查 `/review`**：已落地基础版（见 `add-ai-code-review`），后续做多视角对抗审查。对标 Cursor BugBot。
6. **符号级关系图**：在真索引（P0-1）之上注入调用图/依赖图作上下文。

**P2（生态/工程）**
7. 可选 git-first 自动提交模式（对标 Aider）；DI 注册自检 + 设置烟雾测试（承接 `fix-settings-pane-mount-resilience` 教训）；i18n 切换局部刷新。

## 非目标

- **明确不做多端扩张**（JetBrains/Web/移动）——作为 VS Code 桌面分支，集中资源于索引质量与编辑手感。
- 不替换现有 Agent 循环 / 工具系统架构，均为增量增强。
- 不在本提案内实现具体模型训练；P0-2 优先接入而非自研。

## 影响范围

- renderer：`codeIndexService`、`editCodeService`、`autocompleteService`、`subagentService`、`convertToLLMMessageService`。
- main：嵌入推理（ONNX）/ 向量库可能需 main 进程或 worker；后台 Agent 的 worktree 管理。
- 复用：现有 Merkle 增量、RRF 混合搜索、`sendLLMMessage` 管线、检查点、工具系统。

## 验收标准

- P0-1：`semantic_search` 在大仓库召回质量明显优于关键词（用一组跨文件查询基线对比）；索引持久化跨重启可用。
- P0-2：Tab/Apply 端到端延迟较通用 LLM 显著下降（量化基线）。
- P0-3：可派发一个后台任务在隔离 worktree 跑完并回写结果，不阻塞前台。
- 每阶段 `npx tsc -p src/tsconfig.json --noEmit` 0 errors。
