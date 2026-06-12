# 修复：默认编程模式下无法创建/编辑代码文件（fix-default-mode-file-ops）

## 背景

Void 编辑器默认 Chat 模式为 `agent`，该模式下 `edit_file`、`create_file_or_folder`、`rewrite_file` 等工具已注册可用，但用户反馈"默认情况下无法执行创建代码文件和编辑代码文件"。经排查，根因是 `ChatMarkdownRender.tsx` 的 `RenderToken` 组件中 `t.raw.trimEnd()` 抛出 TypeError，导致代码块渲染崩溃，Apply 按钮无法显示/工作，间接阻断了文件创建和编辑功能。

此外，`normal` 和 `gather` 模式按设计不提供编辑工具，但用户可能未意识到模式差异，误以为"默认模式"不支持文件操作。

## 方案

### Phase 1：修复 trimEnd TypeError（已在 fix-trimend-typeerror 中实施）
- `ChatMarkdownRender.tsx` 第 305/306/313 行：`t.lang`/`t.raw` → `tk.lang`/`tk.raw`
- 根因：i18n 翻译函数 `t`（第 18 行导入）与 token 变量 `tk`（第 275 行定义）命名冲突
- 影响：代码块渲染恢复，Apply 按钮可用，`edit_file`/`rewrite_file` 工具结果可正常展示

### Phase 2：工具调用链路修复（2026-04-20 ~ 2026-04-21 实施）

Phase 1 修复后发现 Agent 模式仍无法正确创建/修改文件，排查发现存在**多层级**的工具调用链路问题：

#### 2a. `specialToolFormat` 配置错误（根因）
- `aiyiwei` provider 使用 `extensiveModelOptionsFallback` 推断 claude 模型能力，返回 `specialToolFormat: 'anthropic-style'`
- 在 `_sendOpenAICompatibleChat` 中，`anthropic-style` 既不等于 `'openai-style'`（不触发原生工具），也不等于 `undefined`（不触发 XML 解析）
- **结果**：工具在两条传输路径上都被丢弃，LLM 完全不知道有工具可用
- **修复**：`modelCapabilities.ts` 中为 aiyiwei 添加 4 个核心模型显式配置 + `_forceOAIStyleTools` 辅助函数应用于所有 OAI 兼容 provider
- **防护**：`sendLLMMessage.impl.ts` 中 `_sendOpenAICompatibleChat` 添加运行时防护，强制 `openai-style`

#### 2b. JSON Schema 不合规（加剧因素）
- `toOpenAICompatibleTool` 生成的 `properties` 中每个参数缺少 `type` 字段，不符合 JSON Schema 规范
- 导致 LLM 对参数名和类型理解模糊，更容易幻觉出错误的工具调用格式
- **修复**：为每个参数添加 `type: 'string'`，并根据参数描述生成 `required` 数组

#### 2c. LLM 工具名/参数名幻觉（容错层）
- 即使工具定义正确发送，LLM 仍会幻觉出 Windsurf/Cursor 风格的工具名（`write_to_file`、`create_file`）和参数名（`path`、`contents`）
- **修复**：
  - 工具名别名映射：8 条映射规则（`chatThreadService.ts`）
  - 参数名 fallback：`normalizeToolParams` 辅助函数，覆盖 `path`→`uri`、`contents`→`new_content` 等常见幻觉（`toolsService.ts`）
  - 相对路径自动补全：在 `validateParams` 中将相对路径解析为工作区绝对路径（`toolsService.ts`）
  - 系统提示词强化：Agent 模式系统消息中明确指示只使用定义的工具名和绝对路径（`prompts.ts`）

#### 2d. 集成测试
- TV-11 测试套件验证所有 OAI 兼容 provider 不返回 `anthropic-style`，136/136 通过

### 验收结论

用户于 2026-04-22 确认 Agent 模式下文件创建功能正常工作。

## 能力

### New Capabilities

（无新增能力）

### Modified Capabilities

（无既有能力的需求变更——此为 bug 修复，恢复 `agent` 模式下文件操作功能）

## 影响

- **受影响文件**：
  - `ChatMarkdownRender.tsx` — Phase 1 trimEnd 修复
  - `modelCapabilities.ts` — Phase 2a aiyiwei 显式模型配置 + `_forceOAIStyleTools`
  - `sendLLMMessage.impl.ts` — Phase 2a 运行时防护 + Phase 2b JSON Schema 修复
  - `chatThreadService.ts` — Phase 2c 工具名别名映射
  - `toolsService.ts` — Phase 2c 参数名 fallback + 路径解析
  - `prompts.ts` — Phase 2c 系统提示词强化
  - `toolValidation.test.ts` — Phase 2d TV-11 集成测试
- **受影响功能**：代码块渲染、工具调用传输、工具名/参数解析、文件路径处理
- **无破坏性变更**

## Non-goals / 非目标

- 不修改 Chat 模式定义或工具可用性逻辑
- 不修改 `normal`/`gather` 模式（它们按设计不支持编辑）
- 不修改 `autoApprove` 默认配置
