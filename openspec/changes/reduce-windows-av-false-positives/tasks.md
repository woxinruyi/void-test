# 任务清单：降低 Windows 安装包杀软误报

## 1. 现状审计

- [x] 1.1 校验 `I:\自动化执行\VSCode-win32-x64\Void.exe` 是否存在，并记录路径、大小、mtime。
- [x] 1.2 校验 `.build/win32-x64/user-setup/VSCodeSetup.exe` 是否存在，并记录路径、大小、mtime。
- [x] 1.3 使用 `Get-AuthenticodeSignature` 记录 `Void.exe` 的签名状态。
- [x] 1.4 使用 `Get-AuthenticodeSignature` 记录 `VSCodeSetup.exe` 的签名状态。
- [x] 1.5 使用 `Get-FileHash -Algorithm SHA256` 记录主程序和安装包哈希。
- [x] 1.6 读取主程序和安装包版本资源，记录 ProductName、CompanyName、FileDescription、OriginalFilename、ProductVersion。
- [x] 1.7 将审计结果写入 `文档/temp-windows-package-trust-audit.md`。

## 2. 免费签名路线验证

- [x] 2.1 编写自签名证书生成命令，用于内部测试签名流程。
- [x] 2.2 编写 `Void.exe`、updater、installer 的本地自签名示例命令。
- [x] 2.3 编写签名验证命令，覆盖 `signtool verify` 和 `Get-AuthenticodeSignature`。
- [x] 2.4 在文档中明确自签名仅适合内部测试或企业受控环境。
- [x] 2.5 补充企业 CA、GPO、Intune、Defender for Endpoint allow indicator 的推荐路径。
- [x] 2.6 调研开源免费签名服务的准入条件，并记录是否适合当前项目。

## 3. Windows 元数据与命名治理

- [x] 3.1 定位 Inno Setup 输出 `VSCodeSetup.exe` 的配置来源。
- [x] 3.2 设计 Void 品牌 installer 输出名，例如 `VoidUserSetup-x64.exe`。
- [x] 3.3 定位主程序版本资源中 ProductName、CompanyName、FileDescription、OriginalFilename 的来源。
- [x] 3.4 定位 installer AppName、AppPublisher、UninstallDisplayName、AppId 的来源。
- [x] 3.5 制定元数据目标值表，并记录到审计文档。
- [x] 3.6 应用最小元数据变更后重新打包验证。

## 4. Payload 降噪

- [x] 4.1 枚举 Windows 包中的 native prebuild 目录。
- [x] 4.2 标记 `darwin-*`、`linux-*` 等非 Windows native prebuild 候选项。
- [x] 4.3 判断候选项是否可由构建脚本排除，而不是手工删除产物。
- [x] 4.4 应用候选排除策略后重新生成 Windows 应用目录。
- [x] 4.5 启动 `Void.exe` 验证应用、终端、扩展宿主和核心功能未因缺文件失败。
- [x] 4.6 记录 payload 降噪前后的包大小和候选文件数量变化。

## 5. 误报申诉材料

- [x] 5.1 新增 Microsoft Defender / SmartScreen 误报申诉模板。
- [x] 5.2 新增第三方杀软误报申诉模板，包含厂商、检测名、提交入口和处理状态。
- [x] 5.3 为当前 release 填充产品名、版本、SHA256、签名状态、下载地址和应用说明。
- [x] 5.4 记录误报截图和报毒名称的保存位置。
- [x] 5.5 说明重新打包后 SHA256 改变时必须重新生成申诉材料。

## 6. 构建与验收

- [x] 6.1 重新执行 React 产物构建。
- [x] 6.2 执行 `npm run compile` 并确认 0 errors。
- [x] 6.3 执行 `vscode-win32-x64` 生成 Windows 应用目录。
- [x] 6.4 执行 `vscode-win32-x64-inno-updater`。
- [x] 6.5 执行 `vscode-win32-x64-user-setup` 生成 installer。
- [x] 6.6 验证最终 `Void.exe` 和 installer 的签名状态、SHA256、版本资源和文件名。
- [x] 6.7 启动打包后的 `Void.exe`，确认应用可正常打开。
- [x] 6.8 执行 `openspec validate reduce-windows-av-false-positives --strict` 并确认通过。

## 7. 决策与后续

- [x] 7.1 根据审计结果决定是否保留自签名作为内部测试流程。
- [x] 7.2 根据分发场景决定是否采用企业 CA / 企业白名单路径。
- [x] 7.3 根据项目开源与发布条件决定是否申请开源免费签名服务。
- [x] 7.4 如果公网分发仍频繁报毒，形成 OV/EV 或 Microsoft Trusted Signing 的后续采购建议。
