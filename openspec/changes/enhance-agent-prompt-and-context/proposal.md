# 增强 Agent 提示词与上下文工程（enhance-agent-prompt-and-context）

## 背景

对比 Claude Code / Codex CLI 等开源 Agent 与 Void 使用相同模型时的效果差异，发现根因不在模型能力，
而在于**工具编排策略 + 上下文工程 + System Prompt 深度**的差距：

| 维度 | Claude Code / Codex | Void 当前 |
|------|---------------------|-----------|
| System Prompt | 分段式、含详细工具策略和错误恢复 | 扁平列表，缺乏策略深度 |
| 上下文收集 | 自动注入项目结构、git diff、相关文件 | 仅注入目录树 + 打开文件列表 |
| 工具 Schema | 参数描述详尽，含使用示例和边界说明 | 描述简洁，缺少示例 |
| 验证环节 | 修改后自动 lint/test | 无自动验证 |
| 错误恢复 | 渐进式修复策略 | 简单重试 |

## 目标

采用**路径 C（借鉴核心设计）**方案，在不引入外部依赖的前提下，通过以下改进提升 Agent 模式效果：

1. **System Prompt 分段重构** — 参考 Claude Code 的分段式结构，增加工具使用策略、错误恢复指导、代码修改最佳实践
2. **自动上下文注入** — 注入 git status/diff 摘要、package.json 技术栈信息、最近错误日志
3. **工具 Schema 增强** — 为关键工具（edit_file、rewrite_file、run_command）添加使用示例和常见错误提示
4. **轻量验证环节** — 代码修改后自动提示 Agent 运行 lint/build 验证

## 非目标

- 不集成 Claude Code / Codex CLI 作为子进程（路径 A）
- 不 fork 外部项目代码（路径 B）
- 不修改 LLM 调用链路或 Provider 层
- 不变更现有工具的功能逻辑，仅改进描述和引导

## 方案概述

### Phase 1：System Prompt 分段重构
- 将当前扁平 `details.push()` 列表重构为命名段落
- 新增段落：`## Tool Usage Strategy`、`## Error Recovery`、`## Code Modification Best Practices`

### Phase 2：自动上下文注入
- 在 `_generateChatMessagesSystemMessage` 中增加：
  - `git status --short` 摘要（未跟踪/修改文件列表）
  - `package.json` 关键字段（name、scripts、dependencies 前10个）
  - 最近终端输出中的错误行（最后一次 stderr 摘要）

### Phase 3：工具 Schema 增强
- 在 `builtinTools` 定义中为高频工具增加 `examples` 字段
- 在 XML 工具定义输出中附加示例

### Phase 4：轻量验证提示
- Agent 完成文件编辑后，在下一轮 system 提示中注入"建议运行 lint/build 验证"

## 影响范围

- `src/vs/workbench/contrib/void/common/prompt/prompts.ts` — 主要修改
- `src/vs/workbench/contrib/void/browser/convertToLLMMessageService.ts` — 上下文注入
- `src/vs/workbench/contrib/void/common/toolDefs/` — 工具定义增强

## 验收标准

1. 编译 0 errors
2. 对比测试：相同提示词，修改前后的 Agent 完成质量有感知提升
3. DevTools Console 可看到增强后的 system prompt 结构
