# Windows 包信任治理能力（windows-package-trust）

## ADDED Requirements

### Requirement: 产物信任审计
系统 SHALL 为每次 Windows release 产物生成信任审计记录，至少覆盖主程序、安装包、签名状态、SHA256、文件大小、mtime、版本资源和 installer 元数据。

#### Scenario: 生成当前 release 审计记录
- **WHEN** 已生成 `I:\自动化执行\VSCode-win32-x64\Void.exe` 和 `.build/win32-x64/user-setup/VSCodeSetup.exe`
- **THEN** 系统 SHALL 生成包含 Authenticode 状态、SHA256、大小、mtime 和版本资源的审计记录

#### Scenario: 发现未签名产物
- **WHEN** `Void.exe` 或 installer 的 Authenticode 状态为未签名
- **THEN** 审计记录 SHALL 明确标记该文件为未签名，并说明该状态可能增加 SmartScreen 或杀软误报风险

### Requirement: 免费签名路线分级
系统 SHALL 区分免费/低成本签名路线的适用场景，并明确自签名、企业 CA、开源签名服务、企业白名单和误报申诉的边界。

#### Scenario: 内部测试使用自签名
- **WHEN** 使用自签名证书签署 `Void.exe` 或 installer
- **THEN** 文档 SHALL 标记该签名仅适合内部测试或受控企业环境

#### Scenario: 公网分发评估自签名
- **WHEN** 目标用户为公网下载用户
- **THEN** 文档 SHALL 明确禁止把自签名证书描述为公网可信签名方案

#### Scenario: 企业内部分发
- **WHEN** 目标用户为受管企业设备
- **THEN** 文档 SHALL 提供企业 CA、证书级白名单或 EDR allow indicator 的推荐路径

### Requirement: Windows 产物元数据规范
系统 SHALL 规范 Windows 安装包和主程序的 Void 品牌元数据，避免 `VSCode`、`Code OSS`、`Microsoft`、`Void` 混杂导致用户困惑或信誉风险。

#### Scenario: 检查 installer 输出名
- **WHEN** installer 输出文件名仍为 `VSCodeSetup.exe`
- **THEN** 审计记录 SHALL 标记该名称与 Void 品牌不一致，并提出 Void 化命名建议

#### Scenario: 检查版本资源
- **WHEN** 主程序或安装包版本资源包含不一致的 ProductName、CompanyName、FileDescription、OriginalFilename 或 Publisher
- **THEN** 审计记录 SHALL 列出不一致字段及推荐目标值

### Requirement: 安装包 payload 降噪
系统 SHALL 审计 Windows 安装包中的 native payload，并识别可安全排除的非 Windows 平台预构建文件。

#### Scenario: 发现非 Windows native prebuild
- **WHEN** Windows 包中包含 `darwin-*` 或 `linux-*` native prebuild 文件
- **THEN** 审计记录 SHALL 将其列为候选降噪项，而不是直接删除

#### Scenario: 应用 payload 降噪
- **WHEN** 实施 payload 排除策略
- **THEN** 系统 SHALL 重新打包并验证 `Void.exe` 可启动，且终端、扩展宿主和核心功能未因缺文件失败

### Requirement: 误报申诉材料
系统 SHALL 为每个准备分发的 Windows release 生成杀软误报申诉材料模板。

#### Scenario: 生成 Microsoft 误报申诉材料
- **WHEN** 准备向 Microsoft Defender 或 SmartScreen 提交误报
- **THEN** 申诉材料 SHALL 包含产品名、版本、文件名、SHA256、签名状态、下载地址、应用说明、误报名称和截图位置

#### Scenario: 生成第三方杀软申诉材料
- **WHEN** 准备向第三方安全厂商提交误报
- **THEN** 申诉材料 SHALL 复用 release 证据，并允许补充厂商名称、检测名称、提交入口和处理状态

### Requirement: 发布证据稳定性
系统 SHALL 在提交误报申诉或企业白名单前固定 release 产物，避免申诉期间频繁改变文件哈希。

#### Scenario: release 产物被重新打包
- **WHEN** installer 或 `Void.exe` 被重新打包导致 SHA256 改变
- **THEN** 系统 SHALL 要求重新生成审计记录和误报申诉材料

#### Scenario: 产物证据用于企业白名单
- **WHEN** 企业客户需要白名单材料
- **THEN** 系统 SHALL 提供 SHA256、签名状态、版本号、文件名和推荐证书级或哈希级白名单方式
