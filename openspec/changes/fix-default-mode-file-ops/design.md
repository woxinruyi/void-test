## Context

Void 编辑器提供三种 Chat 模式（`ChatMode`），定义在 `voidSettingsTypes.ts`：

| 模式 | 工具范围 | 文件编辑 |
|---|---|---|
| `normal` | 无工具 | ❌ 纯对话 |
| `gather` | 只读工具（`read_file`、`ls_dir`、`search_*` 等） | ❌ 按设计不支持 |
| `agent`（默认） | 全部工具（含 `edit_file`、`create_file_or_folder`、`rewrite_file`） | ✅ 应可用 |

默认 `chatMode: 'agent'`，`autoApprove.editsInWorkspace: true`，理论上 agent 模式下文件编辑应正常工作。

**问题**：用户反馈默认模式下无法创建/编辑代码文件。排查发现根因不是工具注册或审批逻辑问题，而是 `ChatMarkdownRender.tsx` 的 `RenderToken` 组件中 `t.raw.trimEnd()` TypeError，导致代码块渲染崩溃，Apply 按钮无法显示/工作。

`availableTools` 函数（`prompts.ts:361`）逻辑：
- `agent` → 返回全部 `builtinTools`（含编辑工具）
- `gather` → 过滤掉 `approvalTypeOfBuiltinToolName` 中的工具（即编辑和终端工具）
- `normal` → 返回 `undefined`（无工具）

`approvalTypeOfBuiltinToolName`（`toolsServiceTypes.ts:21`）：
- `create_file_or_folder`: `'edits'`
- `delete_file_or_folder`: `'edits'`
- `rewrite_file`: `'edits'`
- `edit_file`: `'edits'`
- `run_command`: `'terminal'`

## Goals / Non-Goals

**Goals:**
- 记录默认模式下文件操作失败的根因和修复方案
- 确认 trimEnd TypeError 修复后 agent 模式文件操作恢复正常

**Non-Goals:**
- 不修改 Chat 模式定义
- 不修改 normal/gather 模式使其支持编辑
- 不修改 autoApprove 默认配置

## Decisions

**决策 1：此问题归类为 trimEnd TypeError 的下游影响，不单独实施代码修改**
- 理由：trimEnd TypeError 修复后（`t.` → `tk.`），代码块渲染恢复，Apply 按钮可用，agent 模式下文件操作链路完整
- 验证：日志零 TypeError，代码块正常渲染

**决策 2：记录 normal/gather 模式不支持编辑的设计决策**
- 理由：用户可能误用 normal/gather 模式并期望文件编辑功能，需在文档中明确三种模式的差异

## 前端交互设计

### 交互链路总览

Agent 模式下文件操作的完整交互链路如下：

```
用户输入 → LLM 返回 tool_call → 审批/自动通过 → 工具执行 → 结果渲染 → Apply/Reject
```

### 1. 模式选择器（ChatModeDropdown）

**位置**：`SidebarChat.tsx:264`，Chat 输入框上方

**交互行为**：
- 下拉框显示当前模式名称 + 说明文字
- `normal`："Normal chat" — 纯对话，无工具
- `gather`："Reads files, but can't edit" — 只读工具
- `agent`："Edits files and uses tools" — 全部工具（默认）
- 切换模式后立即生效（`voidSettingsService.setGlobalSetting('chatMode', newVal)`），无需刷新

**设计要点**：
- 默认 `agent` 模式，确保新用户首次使用即可创建/编辑文件
- 模式说明文字已明确告知用户各模式的能力边界

### 2. 工具审批流程（ToolRequestAcceptRejectButtons）

**位置**：`SidebarChat.tsx:1570`

**交互行为**：
- LLM 返回 `edit_file`/`create_file_or_folder`/`rewrite_file` tool call 时，系统先检查 `autoApprove` 配置
- **自动通过条件**（默认满足）：`autoApprove.editsInWorkspace === true` 且文件在工作区内
- **需人工审批时**：显示三组按钮
  - **Approve**：批准本次操作
  - **Cancel**：拒绝本次操作
  - **Trust Session**：本次会话内同类操作自动通过
  - **Trust Permanent**：永久自动通过同类操作（写入 globalSettings.autoApprove）

**审批类型映射**（`approvalTypeOfBuiltinToolName`）：
- `create_file_or_folder` / `delete_file_or_folder` / `edit_file` / `rewrite_file` → `'edits'`
- `run_command` → `'terminal'`
- MCP 工具 → `'MCP tools'`

### 3. 编辑工具结果展示（EditTool 组件）

**位置**：`SidebarChat.tsx:907`

**交互行为**：
- 工具执行中（`running_now`）或等待审批（`tool_request`）：显示折叠卡片，内含代码预览
- 工具执行成功（`success`）：显示卡片 + Apply/Reject 按钮 + lint 错误列表
- 工具执行失败（`tool_error`）：显示卡片 + 错误信息
- 工具被拒绝（`rejected`）：显示划线标题 + 已取消图标

**卡片结构**：
- **标题行**：工具图标 + 工具名称（如"Edited File"）+ 文件名（可点击跳转）+ 操作按钮
- **内容区**：代码差异预览（`EditToolChildren`，区分 `diff` 和 `rewrite` 两种类型）
- **底部**：lint 错误列表或错误信息

### 4. Apply/Reject 按钮（EditToolAcceptRejectButtonsHTML）

**位置**：`ApplyBlockHoverButtons.tsx:447`

**交互行为**：
- **`idle-no-changes`**：不显示按钮（无待应用变更）
- **`idle-has-changes`**：显示 ✗（Remove）和 ✓（Keep）按钮
  - **Keep**：调用 `editCodeService.acceptOrRejectAllDiffAreas({ uri, behavior: 'accept' })`，接受所有差异
  - **Remove**：调用 `editCodeService.acceptOrRejectAllDiffAreas({ uri, behavior: 'reject' })`，拒绝所有差异
- **LLM 仍在运行时**：隐藏按钮（`isRunning === 'LLM' || isRunning === 'tool'` 时返回 null）
- **Feature 被禁用时**：隐藏按钮

**关键依赖**：`useEditToolStreamState` 监听 `voidCommandBarService` 的流状态变更，实时更新按钮可见性

### 5. 代码块 Apply 按钮（BlockCodeApplyWrapper）

**位置**：`ApplyBlockHoverButtons.tsx:507`

**交互行为**：
- 代码块头部显示文件名（可点击跳转）+ 状态指示灯 + 操作按钮
- **状态指示灯**：绿色=有变更待处理，橙色=正在流式写入，灰色=无变更
- **操作按钮**：JumpToFile + Copy + Apply/Reject（根据语言类型区分编辑和终端）
- Shell 语言代码块显示"Run in Terminal"按钮而非 Apply

### 6. trimEnd TypeError 对交互的影响

**崩溃点**：`ChatMarkdownRender.tsx:RenderToken` 组件在渲染 `code` 类型 token 时，`t.raw.trimEnd()` 抛出 TypeError

**影响范围**：
1. **代码块渲染**：`RenderToken` 崩溃 → 代码块内容无法显示 → `BlockCodeApplyWrapper` 无内容可渲染
2. **Apply 按钮**：代码块不渲染 → `ApplyButtonsHTML` 不挂载 → 用户无法 Apply
3. **EditTool 结果**：`EditToolChildren` 依赖 `content`（来自 Markdown 渲染），渲染崩溃 → `content` 为空或错误 → 工具结果卡片内容缺失
4. **连锁效应**：LLM 返回的 `edit_file`/`rewrite_file` 结果无法展示 → 用户无法 Apply → 文件编辑功能实质不可用

**修复后恢复**：
- `tk.raw.trimEnd()` 正确引用 token 变量 → 代码块正常渲染 → Apply 按钮正常挂载 → 文件编辑功能恢复

### 7. 交互状态机

```
                    ┌─────────────┐
                    │  用户输入    │
                    └──────┬──────┘
                           ▼
                    ┌─────────────┐
                    │ LLM 生成     │
                    │ tool_call    │
                    └──────┬──────┘
                           ▼
                 ┌─────────────────────┐
                 │ autoApprove 检查     │
                 └────┬──────────┬─────┘
                      │          │
               自动通过          需审批
                      │          │
                      ▼          ▼
               ┌──────────┐ ┌──────────────────┐
               │ 直接执行  │ │ 显示 Approve/    │
               │          │ │ Cancel/Trust 按钮 │
               └────┬─────┘ └────┬─────────────┘
                    │            │
                    ▼            ▼
               ┌──────────────────────────┐
               │ 工具执行（callTool）      │
               └──────────┬───────────────┘
                          ▼
               ┌──────────────────────────┐
               │ 结果渲染                  │
               │ - EditTool 卡片          │
               │ - 代码块（RenderToken）  │ ← trimEnd 修复点
               │ - lint 错误列表          │
               └──────────┬───────────────┘
                          ▼
               ┌──────────────────────────┐
               │ Apply/Reject 按钮        │
               │ - idle-has-changes 时显示 │
               │ - Keep → accept          │
               │ - Remove → reject        │
               └──────────────────────────┘
```

## Risks / Trade-offs

- **[风险] 用户误用 normal/gather 模式** → 缓解：SidebarChat 的 ChatModeDropdown 已显示模式说明（`gather: "Reads files, but can't edit"`，`agent: "Edits files and uses tools"`）
- **[风险] 未来再次引入同类渲染崩溃** → 缓解：ErrorBoundary 已包裹 RenderToken，但仅防止白屏，不恢复功能
- **[风险] Apply 按钮在 LLM 运行期间隐藏** → 设计决策：避免用户在 LLM 仍在修改文件时 Apply 导致冲突
