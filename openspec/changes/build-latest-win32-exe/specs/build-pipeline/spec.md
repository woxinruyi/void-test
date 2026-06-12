# 构建流水线能力（build-pipeline）

## ADDED Requirements

### Requirement: vscode-win32-x64-user-setup 必须能够完成 Inno Setup 打包

在当前仓库环境下（Windows x64、Node 20.18.2、仓库路径 `I:\自动化执行\void-main`），执行 `node ./node_modules/gulp/bin/gulp.js vscode-win32-x64-user-setup` 时，系统 MUST 能够通过 `cp.spawn` 正常启动 `ISCC.exe` 并完成 Inno Setup 打包；当出现 `spawn UNKNOWN` 时，构建脚本 SHALL 提供可定位的错误信息或回退路径，确保“最新代码 → 可运行 EXE”的链路不被阻断。

#### Scenario: 正常路径下生成 setup EXE

- **WHEN** 开发者依次执行 `npm run compile-build`、`npm run minify-vscode`、`node ./node_modules/gulp/bin/gulp.js vscode-win32-x64-user-setup`
- **THEN** 构建在 `.build/win32-x64/user-setup/` 下生成 `VSCodeSetup.exe`
- **AND** 构建日志中不出现 `spawn UNKNOWN`
- **AND** 构建退出码为 0

#### Scenario: 遇到 spawn UNKNOWN 时的根因定位

- **WHEN** `packageInnoSetup` 报 `Error: spawn UNKNOWN`
- **THEN** 开发者 MUST 使用诊断脚本按 A/B/C/D 四组矩阵（inherit vs pipe、shell 与否、cwd 设置）复现或排除问题
- **AND** 根据矩阵结果锁定根因（stdio / 参数解析 / 中文路径 / cwd 缺失）
- **AND** 将诊断过程记录到 `文档/temp-inno-setup-spawn-unknown-诊断.log`

#### Scenario: 回退到免安装目录产物

- **WHEN** Inno Setup 打包在时间盒（建议 60 分钟）内无法稳定通过
- **THEN** 构建 SHALL 转向执行 `vscode-win32-x64-min`，产出 `VSCode-win32-x64/` 目录作为免安装交付物
- **AND** 目录内 `Void.exe` 可直接双击运行
- **AND** 开发者 MUST 记录该回退原因与产物路径，便于后续继续修复 setup 打包

### Requirement: 构建产出物必须可被记录与核对

构建成功后，开发者 MUST 记录产出物的路径、大小、SHA256、构建时长，便于后续干净用户目录中文化验收直接引用。

#### Scenario: 产出物元信息归档

- **WHEN** 构建成功产出 `VSCodeSetup.exe` 或 `VSCode-win32-x64/` 目录
- **THEN** 系统 SHALL 在 `文档/temp-最新EXE构建诊断与产出记录.md` 中写入：产物绝对路径、文件/目录大小（MB）、（如为单文件）SHA256、构建开始/结束时间戳
- **AND** 该记录 MUST 链接对应 OpenSpec change（build-latest-win32-exe）
