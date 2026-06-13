# 新增：终端工具执行沙箱隔离（add-terminal-sandbox）

> 设计提案。实现需 OS 级运行时工作 + 真机验证，单列一轮执行（见"状态"）。

## 背景

三方对标（`temp-三方设计对标-YWCode-vs-Codex-vs-ClaudeCode.md`）中 YWCode 唯一明显落后 Codex 的维度是 **OS 级沙箱隔离**：

- **Codex**：终端/文件执行运行在 OS 沙箱中——macOS Seatbelt、Linux bwrap+seccomp(+Landlock)、Windows 原生 sandbox；配合审批档位（read-only / workspace-write / danger-full-access）。沙箱在内核层限制写范围与网络，越权时升级审批再重试。
- **YWCode 现状**：`run_command` 等经 `terminalToolService` 直接在用户 shell 执行，无隔离层；安全靠 `autoApprove` 的 allowlist + shell-metachar 防御（`matchesAllowlist`：含 `|`/`>`/`&&`/`;` 的命令不自动过）+ dangerous 清单。这是**审批层**防御，非**隔离层**——一旦命令获批（或用户开"无缝"档），其能力 = 用户全权限。

## 目标

- 为终端工具执行引入**可选隔离层**，对标 Codex 的 read-only / workspace-write / full 三档：
  - **read-only**：命令只读，写文件/网络需升级审批；
  - **workspace-write**（默认）：可读、可写**工作区内**、可执行；写工作区外 + 网络需审批；
  - **full**：无沙箱（现状行为，显式选择）。
- 越权（沙箱拒绝）时浮出升级审批并可重试，而非静默失败。

## 非目标

- 不替换现有审批层（allowlist/metachar 防御保留，作为沙箱之上的第二道）。
- 不在本提案实现全部三平台后端；首版可先落一个平台 + 接口抽象。

## 方案概述（设计）

1. **设置维度**：`terminalSandboxMode: 'read-only' | 'workspace-write' | 'full'`（默认 `workspace-write`），并入 onboarding 信任档与设置页。
2. **执行抽象**：`terminalToolService` 增 `ISandboxRunner` 抽象（`run(cmd, cwd, mode)`），按平台实现：
   - Linux：bubblewrap (`bwrap`) + seccomp，bind 工作区可写、其余只读、网络按 mode 禁用；
   - macOS：`sandbox-exec` (Seatbelt) profile（工作区可写、deny network/默认）；
   - Windows：受限作业对象 / AppContainer（或退化为审批增强，因 Windows 沙箱化最复杂）。
3. **越权处理**：沙箱拒绝 → 返回结构化 `sandbox_denied{reason}` → Agent 循环浮出"升级到 full 执行？"审批 → 批准后以更高档重试（对齐 Codex 的 escalate-on-denial）。
4. **能力位**：模型矩阵无关；`get_dir_tree`/读类工具不受影响。

## 影响范围（实现时）

- `common/voidSettingsTypes.ts`：新增 `terminalSandboxMode`。
- `browser/terminalToolService.ts` / `electron-main`：`ISandboxRunner` 抽象 + 平台后端（命令拼装在 main process）。
- `chatThreadService`：`sandbox_denied` → 升级审批流。
- 可测纯逻辑：sandbox profile/参数生成（如 bwrap 参数、seatbelt profile 文本）可做纯函数 + 单测。

## 验收标准（实现时）

1. `workspace-write` 下：写工作区内成功；写工作区外 / 出网被拒并浮出升级审批。
2. `read-only` 下：任何写/网络被拒。
3. `full` 下：行为同现状（回归）。
4. profile/参数生成纯函数有确定性单测；端到端在目标 OS 真机验证。

## 状态

- **提案（设计）已创建**。
- **纯生成层 + 命令包装层已执行（2026-06-13）**：`common/helpers/sandboxArgs.ts` ——
  - `buildBwrapArgs`（Linux）/ `buildSeatbeltProfile`（macOS）/ 能力位，三档语义；
  - `wrapCommandForSandbox(command, {mode, platform, workspaceDir})` —— 把一次性命令包装为 `bwrap … -- /bin/bash -c '<cmd>'`（Linux）/ `sandbox-exec -p '<profile>' /bin/bash -c '<cmd>'`（macOS），`full`/win32 优雅原样返回；含 POSIX 单引号安全转义 `shellSingleQuote`。
  - `sandboxArgsEval.ts`（20/20）+ `sandboxArgs.test.ts`。**这是 sendText 接线将直接调用的构件，已逐字测试。**
- **仅剩运行时部分（环境门槛）**：
  - `terminalToolService.runCommand` 在 `mode!=='full'` 且一次性命令时改用 `wrapCommandForSandbox(...)` 后再 `sendText`（一行接线，但**需目标 OS + 已安装 bwrap 才能验证隔离真实生效**，故不在无运行时环境提交未验证接线）；
  - `terminalSandboxMode` 设置项 + onboarding 信任档；
  - `sandbox_denied` → 升级审批流；Windows 后端（作业对象/AppContainer）；真机端到端隔离验证。
- 在运行时沙箱落地前，现有 allowlist + shell-metachar 防御 + dangerous 清单为既有缓解。
