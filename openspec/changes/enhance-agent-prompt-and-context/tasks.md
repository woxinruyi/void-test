# 任务清单：增强 Agent 提示词与上下文工程

## Phase 1：System Prompt 分段重构

- [x] 1.1 在 `prompts.ts` 中新增 `toolStrategyRules` 段落（Tool Usage Strategy）
- [x] 1.2 在 `prompts.ts` 中新增 `errorRecoveryRules` 段落（Error Recovery）
- [x] 1.3 在 `prompts.ts` 中新增 `codeModBestPractices` 段落（Code Modification Best Practices）
- [x] 1.4 将新增段落插入 `ansStrs` 数组（在 `autonomyRules` 之后、`toolDefinitions` 之前）
- [x] 1.5 编译验证 0 errors

## Phase 2：自动上下文注入

- [x] 2.1 在 `convertToLLMMessageService.ts` 中新增 git status 收集，通过 `IVoidSCMService.gitStat()` 获取变更文件列表
- [x] 2.2 新增 project stack 收集，读取 workspace 根 `package.json` 提取 name/scripts/deps
- [x] 2.3 在 `TerminalToolService` 中新增 `getRecentErrorOutput()`，缓存上次失败命令 tail（10 行/800 字符）
- [x] 2.4 在 `_generateChatMessagesSystemMessage()` 中调用上述方法并通过 `chat_systemMessage` 注入到 system prompt
- [x] 2.5 为每项新增上下文设置字符/行数上限和超时保护（git 500ms、stack 解析异常 catch、errors tail 截断）
- [x] 2.6 编译验证 0 errors

## Phase 3：工具 Schema 增强

- [x] 3.1 在 `InternalToolInfo` 接口中新增 `examples?: string[]` 字段
- [x] 3.2 为 `edit_file` 工具添加使用示例和常见错误提示
- [x] 3.3 为 `rewrite_file` 工具添加使用示例
- [x] 3.4 为 `run_command` 工具添加使用示例
- [x] 3.5 为 `search_for_files` 工具添加使用示例
- [x] 3.6 修改 `toolCallDefinitionsXMLString()` 输出示例信息（Tips: 行）
- [x] 3.7 编译验证 0 errors

## Phase 4：轻量验证提示

- [x] 4.1 ~~在工具执行后动态追加验证建议~~ → 改为在 system prompt 中固定注入 `verificationPrompt` 段落（更轻量、不污染工具结果字符串）
- [x] 4.2 `verificationPrompt` 引导 Agent 在编辑后主动运行 `npm run lint` / `tsc --noEmit` / build 命令
- [x] 4.3 通过 `projectStackInfo` 注入的 scripts 列表辅助 Agent 选择正确命令
- [x] 4.4 编译验证 0 errors

> 说明：原设计是"工具结果末尾追加提示"，实际实现采用更简洁的"system prompt 固定段落" + "项目脚本列表辅助"组合方案，效果等同且无副作用。

## Phase 5：测试验证

- [x] 5.1 完整编译通过（`gulp compile-client` 0 errors，耗时 7.93 min）
- [x] 5.2 TypeScript 类型检查通过（`npx tsc -p src/tsconfig.json --noEmit` 0 errors）
- [x] 5.3 创建单元测试文件 `src/vs/workbench/contrib/void/test/common/enhanceAgentPromptContext.test.ts`（21 个用例）
- [x] 5.4 创建测试方案文档 `docs/testing/enhance-agent-prompt-test-plan.md`
- [x] 5.5 补充 `openspec/architecture/build-pipeline.md`「运行单元测试」章节 + 编译命令速查表
- [x] 5.6 运行单元测试，**全部 21 例 PASS**（EAP-1.1 → EAP-4.2）
- [ ] 5.7 端到端运行时验证：在 Electron 启动后用标准测试提示词对比修改前后 LLM 行为（需打包后手工验证）
- [ ] 5.8 记录对比结果（待 5.7 完成后补充）

### 单元测试执行记录

- 命令：`npm run test-node -- --grep "enhance-agent-prompt-and-context"`
- 运行时间：~35s（mocha 启动 + 全部 4566 条用例，本 change 的 21 条均 PASS）
- 其他 2 条 failing 为项目预存问题（`kerberos.node` 未编译、`McpRegistryInputStorage` undefined），**与本 change 无关**
- 详细用例设计见 `docs/testing/enhance-agent-prompt-test-plan.md` 三、四节
