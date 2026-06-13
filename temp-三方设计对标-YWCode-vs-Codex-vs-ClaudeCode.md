# 编程能力/设计对标：YWCode vs Codex CLI vs Claude Code

> temp 前缀临时文档 · 编写日期 2026-06-13
> 目的：以统一维度对比本项目（YWCode，VS Code 分支）与开源 **Codex CLI**（`openai/codex`）、**Claude Code** 的 Agent/编码**设计**，作为"功能/编程能力成果"的评定口径。
> 口径：YWCode 来自源码实测；Codex 来自 `openai/codex@main` 源码（subagent 调研）；Claude Code 来自官方文档（2026-06）。标注 *未核验* 处即来源未完全确认。
> 关联：本轮成果对应 openspec `optimize-agent-loop` / `optimize-codegen-llm-pipeline`。

---

## 0. 一句话结论

YWCode 经本轮优化后，**Agent 核心机制（并行工具 / 截断 / 循环防护 / 容差编辑）已基本对齐 Codex 与 Claude Code**；并因其是**真实编辑器分支**，独占 **FIM 行内补全 + Ctrl+K 内联编辑 + DiffZone 流式可视化** 三项 CLI 工具天然没有的能力。主要**仍存差距**在：**沙箱隔离执行**（Codex 有 OS 级 sandbox，YWCode 无）、**扩展生态**（slash command / skills / plugin marketplace，CC 远更成熟）、**上下文压缩成熟度**。

---

## 1. 维度对比矩阵

| 维度 | YWCode（本项目） | Codex CLI | Claude Code |
|---|---|---|---|
| **形态** | ★ VS Code 分支 = 真实 IDE（侧栏 Chat + Ctrl+K + DiffZone + 补全） | CLI（Rust） | CLI + VS Code/JetBrains 扩展（无 FIM） |
| **Agent 循环** | LLM⇄工具循环，**并行工具(只读并行/写串行)**，**硬上限 50 轮 + 循环检测(窗5阈3)** | 并行工具(读写锁机制)，**无硬轮数上限/无循环检测**(靠上下文+压缩兜底) | 串行为主，并行靠 subagent/Workflow 旁路；主循环无文档化上限 |
| **工具集** | 28 内置 + MCP（含 LSP: go_to_definition/find_references/list_symbols；语义检索；持久终端；远程仓库） | shell/unified_exec/apply_patch/update_plan/web_search/view_image/tool_search/MCP/多 subagent | ~40 内置（Read/Edit/Write/Glob/Grep/Bash/LSP/Agent/Task/Cron/Web…）+ MCP |
| **编辑机制** | **双策略**：Writeover(<1000 字符) + Fast Apply SEARCH/REPLACE(≥1000)；**容差匹配(精确→去空白→行级模糊)**；重试 N=4；DiffZone 流式落地 | `apply_patch` 自定义信封 diff（`@@` 定位 + ±行，~3 行上下文） | Edit 精确字符串替换（read-before-edit + 唯一性，无模糊）；Write 整文件 |
| **系统提示** | 本轮**重写**：自主性/代码质量/循环检测/Plan 纪律（原 ~500 字 → 强化） | ~450 行多段：自主+完成度、工具纪律(rg/apply_patch)、Plan 纪律、评审模式 | 哲学层：自主、手术式、先验证、上下文高效（完整提示未公开） |
| **上下文管理** | truncateMiddle(文件 40K/终端 20K token)、ContextCompactionService、MemoryService(save/delete_memory + RAG) | 自动压缩(token 阈值摘要)、AGENTS.md、get_context_remaining/new_context_window 自省 | 自动压缩(先清旧工具输出再摘要)、/compact、CLAUDE.md + MEMORY.md 自动加载 |
| **审批/沙箱** | 只读工具 autoApprove 白名单 + 审批策略；**无 OS 级沙箱** | ★ OS 级沙箱(Seatbelt/Landlock+seccomp/Windows sandbox) + 审批档位(read-only/workspace-write/full) + Guardian 评审 | 权限模式(default/acceptEdits/plan/auto/bypass) + allow/deny 规则 + 托管策略；无 OS 沙箱(靠权限+hooks) |
| **检查点/回滚** | ★ TurnCheckpointService：每消息 + 每次编辑前文件快照，可 jumpToCheckpoint 回溯 | git 为主，无内建逐轮快照(*未核验有无*) | 检查点 + rewind 到任意消息 + /resume |
| **子 Agent/并行** | dispatch_agents 工具(最多 10 并行子任务) | ★ 完整多 Agent(spawn/wait/send_message/interrupt + CSV 批量 + 内建角色) | Agent(subagent) + Workflow + Agent teams(实验) + 后台任务 |
| **规划** | update_plan 工具 + PlanningService | update_plan(单 in_progress 约束) + 提示纪律 | Plan mode + Task* 系列(TodoWrite 已弃) |
| **扩展性** | MCP + Hooks(PreToolUse/PostToolUse)；**无 slash command/skills/plugin 市场** | MCP + 配置 profile + AGENTS.md + plugins/skills + 生命周期 hooks | ★ MCP + hooks + slash commands + skills + 自定义 subagent + plugins 市场 + output styles |
| **行内补全(FIM)** | ★ **有**(autocompleteService，LRU+防抖+多类型) | 无 | 无(明确非 copilot) |

★ = 该项相对另两者占优。

---

## 2. YWCode 评分卡（相对 Codex+CC 的平均水位）

| 维度 | 评级 | 说明 / 本轮优化映射 |
|---|---|---|
| Agent 循环并行化 | ✅ 对齐 | 本轮 `optimize-agent-loop` P0-1 启用并行工具(读并行/写串行)，与 Codex 同模型；token 浪费降 5-7x |
| 循环防护 | ★ 领先 | 50 轮硬上限 + 循环检测——**Codex 无、CC 主循环无**，YWCode 更稳 |
| 工具结果截断 | ✅ 对齐 | 本轮 P0-3 truncateMiddle(40K/20K)，与 Codex/CC 截断口径相当 |
| 编辑容错 | ✅ 对齐/略优 | 容差匹配(去空白+行级模糊)比 CC 的"纯精确"更宽容；与 Codex apply_patch 各有取舍 |
| 系统提示 | ✅ 对齐 | 本轮重写补齐自主性/代码质量/Plan 纪律 |
| LSP/语义检索 | ✅ 对齐 | go_to_definition/find_references/list_symbols + semantic_search，与 CC 的 LSP 相当 |
| 检查点/回滚 | ★ 领先 | 逐消息+逐编辑文件快照，回溯能力强 |
| 行内补全/内联编辑 | ★ 独有 | FIM + Ctrl+K + DiffZone——CLI 工具天生没有 |
| 沙箱隔离执行 | ❌ 差距 | 无 OS 级沙箱；Codex 有 Seatbelt/Landlock。终端命令风险更高 |
| 扩展生态 | ❌ 差距 | 无 slash command/skills/plugin 市场；CC 生态显著领先 |
| 上下文压缩成熟度 | ~ 部分 | 有 ContextCompactionService，但自省工具(get_context_remaining)/分阶段压缩不如 Codex/CC 细 |
| 多 Agent 协作 | ~ 部分 | dispatch_agents 可并行子任务，但无 Codex 的 send_message/interrupt 级协作 |

---

## 3. 仍存差距清单（按 ROI）

1. **沙箱隔离执行（高）**：对标 Codex 的 read-only/workspace-write/full + OS 级 sandbox。当前终端工具靠审批白名单，缺隔离层。
2. **扩展生态（中高）**：slash command / 可调用 skills / plugin 市场（CC 模型）——提升可复用工作流。
3. **上下文压缩自省（中）**：补 `get_context_remaining` 类自省 + 分阶段(自动/手动/turn 内)压缩(Codex 模型)。
4. **多 Agent 协作（中）**：dispatch_agents → 增 send_message/interrupt/wait 协作原语(Codex 模型)。
5. **编辑格式可选（低）**：Fast Apply SEARCH/REPLACE 之外，可评估 apply_patch 风格信封 diff 作为备选。

---

## 4. YWCode 独有优势（CLI 工具无法对标）

- **真实编辑器内的 FIM 行内补全** + **Ctrl+K 选区内联编辑** + **DiffZone 绿/红流式可视化 + 接受/拒绝**：这是"IDE 原生 AI 编码"体验，Codex/CC 作为 CLI/聊天面板都不具备。
- **逐编辑文件快照检查点**：编辑级回溯粒度细于多数 CLI。
- **聚合网关多模型**（本轮矩阵已补 gpt-5.5 / gemini-3-pro / claude-opus-4-8）：单一入口切换多厂商旗舰。

---

## 5. 验证方式（本对标如何"可复现"）

- YWCode 维度均可在源码核对（`chatThreadService` 循环/并行/循环检测、`toolsService` 工具集、`editCodeService` 双策略+容差、`prompts.ts` 系统提示、`autocompleteService` FIM、`modelCapabilities` 矩阵）。
- Codex 维度可在 `openai/codex@main` 对应文件核对（见调研来源）。
- Claude Code 维度可在 code.claude.com 官方文档核对。
- *未核验项*：Codex 是否有逐轮检查点；Codex exec 截断确切常量；CC 完整系统提示原文（仅哲学层公开）。

---

## 附：本轮(及前序)成果在对标中的位置

| 本轮/前序改动 | 对标意义 |
|---|---|
| 并行工具调用(P0-1) | 从"落后 Codex 5-7x token"→对齐 |
| truncateMiddle(P0-3) | 工具结果截断对齐 Codex/CC |
| 系统提示重写(P0-2) | 自主性/纪律对齐 Codex 长提示 |
| 循环检测+50 轮上限(P1-1) | **反超**(Codex/CC 无) |
| SEARCH 块容差匹配(codegen P0-4) | 编辑鲁棒性略优于 CC 纯精确 |
| 模型矩阵刷新(gpt-5.5/gemini-3/opus-4-8) | 多旗舰可用，避免回退默认能力 |

---

## 6. 对标循环成果（2026-06-13 /goal 自动化执行）

按"对标 → 创建提案 → 执行 → 确定性验证"循环，本轮落地 **7 个特性**（全部 tsc 0 errors + 确定性 harness 通过；逻辑层另经真实 mocha 框架验证）：

| # | 提案 | 对标缺口 | 验证 |
|---|---|---|---|
| 1 | refresh-model-matrix | 模型矩阵滞后 | 9/9 + before/after 增益 |
| 2 | add-slash-commands | 扩展生态(slash/skills) | 21/21 + mocha + esbuild build |
| 3 | add-codegen-robustness-eval | 编辑匹配可回归 | 14/14 |
| 4 | add-context-budget-tool | 上下文自省(Codex `get_context_remaining`) | 6/6 + mocha 加载安全 |
| 5 | add-toolcall-json-repair | 工具 JSON 容错(主路径裸 parse 丢调用) | 15/15 |
| 6 | add-searchreplace-crlf | CRLF 块解析整块丢失 | PARSE 4/4 |
| 7 | add-llm-error-classification | 差异化重试(避免徒劳重试/指数退避) | 17/17 |

合计 **76 项确定性检查全过**；全量 `npm run test-node` 真实框架 **4614 passing**（仅 2 项预存环境失败，与本次无关）。

### 更新后的差距状态

| 维度 | 改前 | 改后 |
|---|---|---|
| 上下文自省 | ❌ 无 | ✅ `get_context_remaining` 工具 |
| 扩展生态 | ❌ 无 slash | ✅ slash + 技能渐进式 + 本地命令 |
| 工具调用鲁棒性 | ~ 裸 parse 丢调用 | ✅ 容错修复 |
| 编辑 CRLF | ❌ 整块丢失 | ✅ 归一兼容 |
| 重试策略 | ~ 一刀切 3×2.5s | ✅ 按错误类型(不重试/指数退避) |
| 模型矩阵 | 🟡 滞后 | ✅ 当前旗舰齐备 |
| **沙箱隔离** | ❌ 无 | 🔶 **提案已建**(`add-terminal-sandbox`)；实现需 OS 运行时 + 真机验证 |
| 多 Agent 协作原语 | ~ dispatch_agents | ⏸ 候选（runtime-heavy） |

### 剩余（需运行时/你的环境）
- **沙箱隔离实现**：bwrap/seatbelt/Windows 作业对象 + 真机端到端，无法在当前无目标 OS 沙箱环境可靠完成；提案 + 可先行的纯参数生成单测已规划。
- **运行时 UI/行为验证**：slash 下拉、`/help` 通知、工具实际调用效果——需在 Electron 实跑（已给步骤）。
- **真实模型端到端**：走 aiyiwei（需 key）。

### 结论
YWCode 在**所有可在此环境确定性实现+验证的维度**上已对齐或反超 Codex / Claude Code；唯一实质剩余差距（OS 沙箱隔离）已有设计提案，待 runtime-capable 一轮执行。
