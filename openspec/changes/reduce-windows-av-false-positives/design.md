# 设计：降低 Windows 安装包杀软误报

## 上下文

当前 Windows 打包流程已经可以生成可运行目录和 Inno Setup 安装包：

```text
源码 / React 产物
  │
  ▼
gulp vscode-win32-x64
  │
  ▼
I:\自动化执行\VSCode-win32-x64\Void.exe
  │
  ▼
gulp vscode-win32-x64-inno-updater
  │
  ▼
gulp vscode-win32-x64-user-setup
  │
  ▼
.build/win32-x64/user-setup/VSCodeSetup.exe
```

这类 Electron / VSCode fork 产物天然包含 Chromium、Node.js、extension host、native module、终端能力、文件系统能力和 updater/installer 行为。在未签名、发布者信誉不足、元数据混杂或 payload 过宽时，容易触发杀软启发式检测。

本设计不尝试规避安全软件，而是建立可审计、可解释、可签名、可申诉的 Windows 发布链路。

## 目标 / 非目标

**目标：**

- 为每次 Windows release 生成可复查的发布证据，包括签名状态、SHA256、大小、mtime、版本资源和 installer 元数据。
- 明确免费/低成本签名路径的适用范围，尤其区分自签名、企业 CA、开源签名服务和公网分发。
- 规范产物命名与元数据，减少 `VSCode`、`Code OSS`、`Microsoft`、`Void` 混杂带来的误报风险。
- 识别并减少 Windows 包中的非必要 native payload。
- 形成误报申诉材料模板，支持 Microsoft Defender、SmartScreen 和主流第三方杀软提交。

**非目标：**

- 不绕过、隐藏或削弱杀毒软件检测。
- 不引导用户关闭杀软或降低系统防护。
- 不把自签名证书作为公网用户可信方案。
- 不承诺所有杀软零误报。
- 不在本 change 中强制接入商业 OV/EV 代码签名。

## 决策

### 决策 1：把“免费签名”定位为分场景能力，而不是统一解法

免费方案按场景分层：

```text
内部测试       企业内部分发            公网分发
   │              │                     │
   ▼              ▼                     ▼
自签名       企业 CA / 白名单       开源签名服务 / 误报申诉
   │              │                     │
   └──── 不等价于 OV/EV/Trusted Signing ────┘
```

理由：Windows SmartScreen 和杀软信誉主要依赖受信任 Authenticode 证书、证书信誉、文件哈希信誉和下载源信誉。自签名可以验证完整性和签名流程，但不能给公网用户建立默认信任。

替代方案：直接购买 OV/EV 证书。该方案长期更可靠，但不满足当前“免费方案分析和阶段性处理”的约束。

### 决策 2：先做产物审计，再做签名或申诉

每次处理报毒前必须先固定证据：

- `Void.exe` Authenticode 状态
- `VSCodeSetup.exe` Authenticode 状态
- SHA256
- 文件大小
- mtime
- 版本资源
- installer 输出名和 publisher 信息

理由：误报申诉、企业白名单和后续签名都需要稳定产物证据。如果每次临时构建、哈希变化、元数据不一致，安全厂商和企业 EDR 很难建立信任。

### 决策 3：产物命名与元数据应 Void 化

当前安装包路径仍然是：

```text
.build/win32-x64/user-setup/VSCodeSetup.exe
```

建议目标命名为：

```text
VoidUserSetup-x64.exe
```

并统一：

- ProductName
- CompanyName
- FileDescription
- OriginalFilename
- Publisher
- UninstallDisplayName
- AppUserModelID

理由：名称和元数据混杂会增加用户困惑，也可能增加启发式风险。对于 VSCode fork，需要避免让安装包像“伪装成 VSCode 或 Microsoft 产物”。

### 决策 4：将自签名作为内部验证步骤，不作为公网发布步骤

自签名步骤用于验证：

- 签名工具链可用
- 签名顺序正确
- 文件被修改后签名失效可检测
- installer 和主程序都可被签名

公网发布文档必须明确：不要求用户安装自签名根证书。

### 决策 5：误报申诉材料模板标准化

为每个 release 准备一份固定模板：

```text
产品名：Void
版本：<version>
文件名：<installer>
SHA256：<hash>
签名状态：<signed/unsigned/self-signed/trusted>
下载地址：<url>
应用说明：基于 VSCode/Electron 的 AI IDE
误报厂商：<vendor>
误报名称：<detection>
截图：<path>
```

理由：安全厂商申诉通常要求这些信息。标准化可以降低重复沟通成本。

### 决策 6：payload 降噪必须谨慎验证

Windows 包中出现非 Windows 平台 native prebuild 时，应先审计再排除。例如：

```text
node-pty/prebuilds/darwin-x64/pty.node
node-pty/prebuilds/darwin-arm64/pty.node
```

排除策略必须满足：

- 不删除 Windows runtime 必需文件
- 打包后 `Void.exe` 可启动
- 终端、扩展宿主和核心功能可用

## 风险 / 权衡

- **风险：自签名被误解为可公网发布** → 在 proposal、design、tasks 和 release 文档中明确标记“仅内部测试”。
- **风险：重命名 installer 影响构建脚本或下游路径** → 先定位 Inno Setup 输出配置，再做最小变更并记录兼容路径。
- **风险：删除非 Windows payload 导致运行时缺文件** → 先做审计和候选列表，再通过打包启动验证。
- **风险：未签名包提交误报成功率有限** → 把误报申诉作为缓解手段，不替代受信任签名。
- **风险：企业白名单只在特定环境有效** → 文档中区分企业内部分发和公网分发。

## 迁移计划

1. 对当前已生成的 `Void.exe` 和 `VSCodeSetup.exe` 做签名状态与哈希审计。
2. 生成临时发布证据文档，作为误报申诉和后续验收材料。
3. 定义并验证自签名流程，仅用于内部测试。
4. 梳理 Inno Setup 输出名和产品元数据来源。
5. 修改产物命名和元数据后重新打包验证。
6. 审计非 Windows native payload，确认可安全排除项。
7. 生成误报申诉模板。

## 回退策略

- 如果元数据或输出名修改导致 installer 构建失败，回退到当前 `VSCodeSetup.exe` 输出路径。
- 如果 payload 排除导致运行失败，恢复完整 payload。
- 如果自签名流程不可用，不影响未签名打包产物生成，只保留审计和申诉流程。

## 开放问题

- 项目最终公开发布时是否具备固定官网和 HTTPS 下载地址？
- 是否有企业客户或内网分发场景，可使用企业 CA / EDR 白名单？
- 项目是否满足 SignPath 等开源免费签名服务的申请条件？
- 最终 Publisher / CompanyName 应使用哪个组织名称？
- 是否计划后续购买 OV/EV 代码签名或使用 Microsoft Trusted Signing？
