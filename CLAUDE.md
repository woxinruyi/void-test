# CLAUDE.md — AI 编码行为指南

> 本文件供所有 AI 编码助手（Cascade / Claude / Cursor 等）在本仓库工作时遵守。
> 基于 [Karpathy Guidelines](https://github.com/forrestchang/andrej-karpathy-skills/blob/main/skills/karpathy-guidelines/SKILL.md)，结合本项目特定约束。

**权衡原则**：这些指南偏向谨慎而非速度。对于明确的小改动可酌情简化流程。

---

## 1. 编码前三思（Think Before Coding）

**不要妄下定论。不要掩饰困惑。主动暴露权衡。**

- 明确陈述你的假设。如果不确定，先问。
- 如果存在多种理解方式，列出来——不要默默选一个。
- 如果有更简单的方案，说出来。必要时反驳用户的方案。
- 如果什么地方不清楚，停下来。指出哪里让你困惑，然后问。
- **禁止猜参数**：不确定函数签名、API 端点、文件路径时，先用工具查证。

## 2. 简洁优先（Simplicity First）

**只写解决问题所需的最少代码。不做投机性设计。**

- 不加未被要求的功能。
- 一次性代码不做抽象。
- 不加未被要求的"灵活性"或"可配置性"。
- 不为不可能的场景写错误处理。
- 如果写了 200 行能用 50 行解决，重写。
- 自问："高级工程师会说这过度复杂了吗？" 如果是，简化。

## 3. 精确手术式变更（Surgical Changes）

**只动你必须动的。只清理你自己造成的废弃物。**

编辑现有代码时：
- **不要"顺手改进"** 相邻的代码、注释或格式。
- 不要重构没坏的东西。
- 匹配现有代码风格，即使你个人会用不同方式写。
- 如果发现无关的死代码，提一句——但不要删除。

当你的变更导致孤立代码时：
- 删除**你的变更导致的**未使用的 import / 变量 / 函数。
- 不要删除变更前就已存在的死代码（除非用户要求）。

**检验标准**：每一行改动都应直接追溯到用户的请求。

## 4. 目标驱动执行（Goal-Driven Execution）

**定义成功标准。循环验证直到确认。**

将任务转化为可验证的目标：
- "添加验证" → "为无效输入写测试，然后让测试通过"
- "修复 bug" → "写一个复现它的测试，然后让测试通过"
- "重构 X" → "确保重构前后测试都通过"

多步骤任务必须先列出简要计划：
```
1. [步骤] → 验证: [检查方式]
2. [步骤] → 验证: [检查方式]
3. [步骤] → 验证: [检查方式]
```

强有力的成功标准让你可以独立循环。含糊的标准（"让它能用"）会导致不断返工。

---

## 5. 本项目特定规则

### 语言与术语

- **用户面文案**：简体中文（zh-CN）。品牌文字使用"YWCode"替代"Void"。
- **代码标识符**（变量名、函数名、类名）：英文，不翻译。
- **技术术语**（API、TypeScript、Electron、Gulp 等）：保持英文。
- **代码注释**：可用中文，但标识符保持英文。
- **文件路径与命令行**：保持英文原样。

### 技术栈

- **框架**：基于 VS Code 源码的 Electron 桌面应用（Void 编辑器定制分支）
- **语言**：TypeScript（严格模式）
- **构建**：Gulp + esbuild（React 组件）
- **包管理**：npm
- **打包**：Inno Setup（Windows）
- **UI**：React（设置页面等 webview 组件）

### 编译验证

任何代码变更后必须执行：
1. `node build.js`（在 `src/vs/workbench/contrib/void/browser/react` 目录）— React bundle
2. `npx gulp compile` 或 `npx tsc -p src/tsconfig.json --noEmit` — TypeScript 全量检查
3. 确认 **0 errors** 后才可提交

### 关键目录结构

```
src/vs/workbench/contrib/void/
├── browser/           # Renderer 进程代码（UI、React 组件）
│   ├── react/         # React 组件源码 + esbuild 配置
│   └── marketplaceClients/  # 市场 API 客户端
├── common/            # 跨进程共享类型和服务接口
└── electron-main/     # Main 进程代码（LLM 调用、IPC channel）
```

### Electron 进程模型

- **Renderer 进程**不能直接 `fetch` 跨域外部 API（受 Chromium CORS 限制）。
- 需要跨域 HTTP 请求时，使用 VS Code 内置 `IRequestService`（通过 IPC 代理到 main process）。
- LLM 请求通过 `IChannel` / `IServerChannel` IPC 机制在 main process 执行。

### 依赖注入（DI）

- 服务通过 `createDecorator<T>('serviceName')` 定义接口。
- 实现通过 `registerSingleton(IService, ServiceImpl, InstantiationType.Delayed)` 注册。
- 构造函数参数用 `@IService` 装饰器注入。
- 新增服务时必须在 `void.contribution.ts` 中 `import './yourService.js'` 确保注册。

### 代码风格

- 使用 Tab 缩进（VS Code 源码风格）。
- React 组件使用函数式组件 + hooks。
- 类型优先：先定义接口/类型，再写实现。
- import 路径使用 `.js` 后缀（ESM）。

---

## 效果检验

这些指南生效的信号：
- diff 中更少的无关改动
- 更少因过度复杂而导致的重写
- 澄清问题发生在编码**之前**而非犯错**之后**
- 每次变更都有明确的验证步骤
