# 构建当前仓库最新 Windows 本地 EXE（build-latest-win32-exe）

## 背景

本仓库是基于 VSCode 的 Void 编辑器定制分支，正在推进“三段式中文方案”的第二段——**本地 built/package 验证**。该阶段需要在当前仓库最新代码基础上产出 Windows 安装包 EXE，用于在干净用户目录下核对原生 Workbench 中文化。

上一轮构建推进到下列进度：

- `compile-build-with-mangling` 触发 `OVERLAPPING edit`，已切换为 `compile-build-without-mangling`。
- `npm run compile-build`、`npm run minify-vscode` 成功完成，`out-build` 时间戳已刷新。
- `node ./node_modules/gulp/bin/gulp.js vscode-win32-x64-user-setup` 在 `packageInnoSetup` 阶段报 `Error: spawn UNKNOWN`。
- 独立运行 `ISCC.exe /?` 与 Node `child_process.spawnSync(ISCC.exe, ['/?'])` 均可成功返回 help 输出，说明 `ISCC.exe` 本身可执行。

因此根因不是 `ISCC.exe` 被安全策略/Zone 标记阻止，而在 gulp 任务链路的某个环节。本 change 用于系统性定位 `spawn UNKNOWN` 根因，并完成一次可验收的最新 EXE 产出。

## 目标

- 定位 `vscode-win32-x64-user-setup` 报 `Error: spawn UNKNOWN` 的真实根因。
- 完成一次基于当前仓库最新代码的 Windows 安装包构建，产出 `.build/win32-x64/user-setup/VSCodeSetup.exe`（或等价的 system 版 setup EXE）。
- 构建成功后，记录产物路径、大小、SHA256、构建时长，供后续干净用户目录验收引用。
- 若 setup 阶段仍无法在本机环境下稳定通过，给出**等价的最小交付产物**（例如 `VSCode-win32-x64/` 目录 + 单独压缩包），保证“最新代码 → 可运行 EXE”的链路不断。

## 非目标（Non-goals）

- 不修复 `compile-build-with-mangling` 的 `OVERLAPPING edit` 问题（已用 `compile-build-without-mangling` 规避）。
- 不重写 `build/gulpfile.vscode.win32.js` 中 `packageInnoSetup` 的实现（仅在必要时做最小补丁）。
- 不在本 change 中执行干净用户目录下的**最终中文化验收**（属于后续独立 change）。
- 不切换 Inno Setup 版本（除非定位结论明确指向版本问题）。
- 不升级 Node（当前 20.18.2 足以完成构建）。

## 方案

按以下阶段推进：

1. **前置核对**
   - 确认 `VSCode-win32-x64` 目录是否已由更早任务产出；若缺失，先补齐该目录。
   - 再次核对 `ISCC.exe`、`code.iss`、`build/win32/` 下 `inno_updater.exe` 等依赖文件齐备。

2. **根因定位（二分式）**
   - **A. 复现 spawn UNKNOWN**：用 gulp 任务直接重新触发，抓取最近一次错误堆栈。
   - **B. 手动等价调用**：在 Node 里用与 `packageInnoSetup` 完全等价的 `cp.spawn(innoSetupPath, args, { stdio: ['ignore','inherit','inherit'] })` 发起 ISCC，复现或排除问题。
   - **C. 逐一缩减参数**：若 B 复现，先用最小参数（仅 `iss` 路径），逐步加回 `/d` 定义与 `/sesrp=...`，锁定触发 `spawn UNKNOWN` 的参数形态。
   - **D. 环境变量差异**：对比 gulp 子进程与手动调用的 `env`/`cwd`，排除 `ComSpec`、`PATHEXT`、`SystemRoot` 等被清空的问题。

3. **按根因给出补丁 / 规避方案**
   - 若为 `/sesrp=node <path> $f` 参数在 Windows 下被 `spawn` 解析异常：追加 `shell: true` 或改写为数组拼接。
   - 若为 `stdio: 'inherit'` 在某些终端会话（PowerShell 非 TTY）触发 `UNKNOWN`：改为 `stdio: ['ignore','pipe','pipe']` 并把子进程输出透传到父进程。
   - 若为 `innoSetupPath` 路径中含中文（`I:\自动化执行\...`）导致 OS 层 CreateProcess 失败：用 short path / 8.3 name 或把仓库临时 junction 到 ASCII 路径。

4. **重跑打包并核对产物**
   - 成功后记录 `.build/win32-x64/user-setup/VSCodeSetup.exe` 的大小、哈希、构建时间。
   - 保留本轮构建日志到 `文档/` 下备查。

5. **回退预案**
   - 若 setup 阶段仍失败，执行 `vscode-win32-x64` 或 `vscode-win32-x64-min` 任务，产出 `VSCode-win32-x64/` 运行目录 + `Void.exe`，作为最小可验收交付物。

## 影响

- 不修改运行时代码，仅可能对 `build/gulpfile.vscode.win32.js` 中 `packageInnoSetup` 做**最小补丁**（`shell: true` 或 stdio 调整）。
- 构建产物路径与既有一致：`.build/win32-x64/user-setup/VSCodeSetup.exe`。
- 构建耗时依赖 mangling 禁用后的 `compile-build-without-mangling`（较 mangling 快）。
- 为三段式方案的第二段解除最后一个阻塞点。

## 风险

- **中文路径**：仓库位于 `I:\自动化执行\void-main`，含中文目录。Windows `CreateProcessW` 对中文路径通常可工作，但 Inno Setup 内部脚本 include 路径处理不确定，属重点嫌疑。
- **Node 引擎警告**：OpenSpec CLI 提示 Node 低于 20.19.0；**与本 change 构建无关**，仅在调用 OpenSpec 本身时出现。
- **Inno Setup 版本差异**：`node_modules/innosetup/bin/ISCC.exe` 版本相对较老，对 `/sesrp` 等参数兼容性需确认。
