# System Prompt 架构

## 核心文件

- **定义：** `src/vs/workbench/contrib/void/common/prompt/prompts.ts`
- **组装：** `src/vs/workbench/contrib/void/browser/convertToLLMMessageService.ts`

## Prompt 组装流程

```
convertToLLMMessageService._generateChatMessagesSystemMessage()
  ├── 收集工作区信息（folders, openedURIs, activeURI）
  ├── 收集目录树（directoryStrService）
  ├── 收集终端 ID（terminalToolService）
  ├── 收集最近修改文件（ideActivityService）
  ├── 收集当前计划摘要（planningService）
  ├── 收集记忆摘要（memoryService）
  ├── 收集 IDE 活动摘要（ideActivityService）
  ├── 收集已安装 Skills
  ├── 【Phase 2 新增】收集 Git 状态（voidSCMService.gitStat）
  ├── 【Phase 2 新增】收集项目技术栈（package.json 解析）
  └── 调用 chat_systemMessage() 组装最终 Prompt
```

## System Prompt 段落结构

`chat_systemMessage()` 按以下顺序组装 `ansStrs` 数组：

| 序号 | 段落 | 条件 | 说明 |
|------|------|------|------|
| 1 | `header` | 始终 | 角色定义（agent/gather/normal） |
| 2 | `corePrompt` | 始终 | 代码引用格式、工具调用规范 |
| 3 | `systemToolsPrompt` | agent/gather | XML 工具定义列表 |
| 4 | `voidRulesInfo` | 有 .voidrules | 用户自定义规则 |
| 5 | `skillsInfo` | 有 Skills | 已安装 Skill 说明 |
| 6 | `gitStatusInfo` | agent/gather + 有 git | 【Phase 2】未提交变更摘要 |
| 7 | `projectStackInfo` | agent/gather + 有 package.json | 【Phase 2】项目依赖栈 |
| 8 | `planInfo` | agent + 有计划 | 当前计划/Todo |
| 9 | `memoriesInfo` | agent + 有记忆 | 相关记忆 |
| 10 | `ideActivityInfo` | agent + 有活动 | 最近 IDE 活动 |
| 11 | `workspaceInfo` | 始终 | 工作区路径 + 打开文件 + 目录树 |
| 12 | `autonomyRules` | agent | 自主决策规则 |
| 13 | `codeQualityRules` | agent | 代码质量规则 |
| 14 | `planDiscipline` | agent | 计划纪律 |
| 15 | `explorationRules` | agent | 探索式编码规则 |
| 16 | `toolStrategyRules` | agent | 【Phase 1】工具使用策略 |
| 17 | `errorRecoveryRules` | agent | 【Phase 1】错误恢复规则 |
| 18 | `codeModBestPractices` | agent | 【Phase 1】代码修改最佳实践 |
| 19 | `activeContextInfo` | 有活跃文件 | 当前活跃文件信息 |

## 工具定义格式

内建工具在 `builtinTools` 对象中定义，类型 `InternalToolInfo`：

```typescript
type InternalToolInfo = {
  name: string,
  description: string,
  params: { [paramName: string]: { description: string } },
  mcpServerName?: string,  // MCP 工具专用
  examples?: string[],     // 【Phase 3】使用提示
}
```

工具通过 `toolCallDefinitionsXMLString()` 转为 XML 格式注入 Prompt，带 Tips 行。

## ChatMode 与工具可用性

| ChatMode | 可用工具 |
|----------|----------|
| `normal` | 无（纯对话） |
| `gather` | 只读工具（排除需要审批的） |
| `agent` | 全部内建工具 + MCP 工具 |

## Token 预算估算

- 基础 Prompt（无上下文）：~2000 tokens
- Agent 模式全量规则：~3500 tokens
- Phase 1 新增段落：~500 tokens
- Phase 2 上下文注入：~200-500 tokens（动态）
- Phase 3 工具 Tips：~100 tokens
- 目录树（上限）：20,000 chars ≈ 5000 tokens

---

## 更新日志

| 日期 | 内容 | 关联变更 |
|------|------|----------|
| 2026-05-26 | 初始创建：Prompt 结构、段落顺序、token 预算 | enhance-agent-prompt-and-context |
