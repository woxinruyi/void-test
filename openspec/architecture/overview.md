# Void 项目架构总览

## 项目定位

Void 是基于 VS Code 源码的 AI 编辑器定制分支，目标是发布**默认中文的 Windows 桌面 AI 编辑器**。

## 技术栈

| 层次 | 技术 |
|------|------|
| 核心 | TypeScript + Electron 33 + VS Code 架构（DI 服务注入） |
| 构建 | Gulp + esbuild + webpack |
| 打包 | Inno Setup（Windows 安装程序） |
| AI 通信 | 多 Provider（OpenAI / Anthropic / Gemini / Ollama）+ SSE 流式 |
| 工具系统 | 内建工具 + MCP 外部工具 |
| 通信 | Electron IPC（main↔renderer） |

## 进程模型

```
┌──────────────────────────────────────────────────────┐
│  Main Process (electron-main/)                       │
│  ┌──────────────────┐  ┌──────────────────────────┐  │
│  │ sendLLMMessage    │  │ voidSCMMainService       │  │
│  │ (调用 LLM API)   │  │ (git 操作)               │  │
│  ├──────────────────┤  ├──────────────────────────┤  │
│  │ mcpChannel        │  │ voidUpdateMainService    │  │
│  │ (MCP 服务代理)   │  │ (自动更新)               │  │
│  └──────────────────┘  └──────────────────────────┘  │
│                    ↕ IPC                              │
├──────────────────────────────────────────────────────┤
│  Renderer Process (browser/)                         │
│  ┌──────────────────┐  ┌──────────────────────────┐  │
│  │ chatThreadService │  │ toolsService             │  │
│  │ (Agent 状态机)    │  │ (工具执行+审批)          │  │
│  ├──────────────────┤  ├──────────────────────────┤  │
│  │ convertToLLMMsg   │  │ terminalToolService      │  │
│  │ (Prompt 组装)     │  │ (终端命令执行)           │  │
│  ├──────────────────┤  ├──────────────────────────┤  │
│  │ editCodeService   │  │ planningService          │  │
│  │ (Apply/Fast Apply)│  │ (Todo/计划管理)          │  │
│  └──────────────────┘  └──────────────────────────┘  │
├──────────────────────────────────────────────────────┤
│  Common (common/)                                    │
│  类型定义 / Prompt 模板 / 设置服务 / 工具类型       │
│  （main 和 renderer 均可引用）                       │
└──────────────────────────────────────────────────────┘
```

**关键约束：**
- renderer 中**不能**直接 fetch 跨域 API，需通过 IPC 到 main 进程
- 工具执行在 renderer 进程（browser/），LLM 调用在 main 进程（electron-main/）
- 服务注册使用 `registerSingleton` + `createDecorator` 模式

## 目录结构

```
src/vs/workbench/contrib/void/
├── common/                    # 共享类型和服务接口
│   ├── prompt/prompts.ts      # System Prompt + 工具定义（核心文件）
│   ├── toolsServiceTypes.ts   # 工具参数/结果类型 + 工具别名
│   ├── voidSettingsService.ts # 全局设置（Provider、模型、API Key）
│   ├── voidSettingsTypes.ts   # 设置类型定义
│   ├── modelCapabilities.ts   # 模型能力矩阵（token 限制、工具支持等）
│   ├── sendLLMMessageService.ts # LLM 消息发送服务接口
│   ├── mcpService.ts          # MCP 服务（外部工具协议）
│   ├── chatThreadServiceTypes.ts # 对话线程类型
│   └── helpers/               # 工具函数
├── browser/                   # 渲染进程服务
│   ├── chatThreadService.ts   # Agent 循环状态机（84KB，核心）
│   ├── toolsService.ts        # 工具执行引擎（54KB）
│   ├── editCodeService.ts     # Apply/Fast Apply（94KB）
│   ├── convertToLLMMessageService.ts # Prompt 组装 + 上下文注入
│   ├── void.contribution.ts   # 模块注册中心
│   ├── subagentService.ts     # 并行子任务分发
│   ├── planningService.ts     # 计划/Todo 管理
│   ├── memoryService.ts       # 记忆存储
│   ├── webSearchService.ts    # 网页搜索
│   ├── codeIndexService.ts    # 语义索引
│   └── react/                 # React UI 组件
├── electron-main/             # 主进程服务
│   ├── llmMessage/            # LLM 调用实现（provider 适配）
│   ├── sendLLMMessageChannel.ts # IPC 通道（renderer↔main）
│   ├── mcpChannel.ts          # MCP IPC 通道
│   ├── voidSCMMainService.ts  # Git 操作
│   └── voidUpdateMainService.ts # 自动更新
└── test/                      # 测试
```

## 核心数据流

```
用户输入 → chatThreadService (状态机)
         → convertToLLMMessageService (组装 System Prompt + 历史)
         → sendLLMMessageService (IPC → main 进程)
         → LLM Provider API (流式 SSE)
         → 解析响应 (文本 / 工具调用)
         → toolsService (执行工具，需用户审批)
         → 结果反馈 → chatThreadService (下一轮循环或结束)
```

---

## 更新日志

| 日期 | 内容 | 关联变更 |
|------|------|----------|
| 2026-05-26 | 初始创建：项目结构、进程模型、核心数据流 | enhance-agent-prompt-and-context |
