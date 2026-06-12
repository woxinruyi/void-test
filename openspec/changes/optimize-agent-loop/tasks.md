# 实施任务：Agent 循环效率提升（optimize-agent-loop）

## 1. 阶段 A — P0-2 系统提示词重写（优先，风险最低）

- [x] 1.1 在 `prompts.ts` 中新增 `autonomyRules` 段落：自主性与持续性规则
- [x] 1.2 新增 `codeQualityRules` 段落：代码实现标准（类型安全、DRY、错误处理）
- [x] 1.3 新增 `explorationRules` 段落：文件探索规则（先思考再读取）
- [x] 1.4 新增 `planDiscipline` 段落：计划纪律（交付代码而非只做计划）
- [x] 1.5 修改 `chat_systemMessage` 函数，按新顺序组装系统消息
- [x] 1.6 删除 `'Only use ONE tool call at a time.'`（为 agent 模式），gather 模式保留

## 2. 阶段 B — P0-3 工具结果截断

- [x] 2.1 在 `prompts.ts` 中修改常量：
  - `MAX_FILE_CHARS_PAGE`: 500_000 → 40_000
  - `MAX_TERMINAL_CHARS`: 100_000 → 20_000
- [x] 2.2 新增 `truncateMiddle(text, maxChars)` 函数：中间截断策略
- [x] 2.3 在 `toolsService.ts` 的 `stringOfResult.read_file` 中应用截断
- [x] 2.4 在 `stringOfResult.run_command` 和 `run_persistent_command` 中应用截断
- [ ] 2.5 新增埋点 `Tool Result Truncated`，记录截断发生的情况（延后）

## 3. 阶段 C — P1-1 循环检测

- [x] 3.1 在 `chatThreadService.ts` 中新增 `_recentToolCalls` Map 存储最近工具调用
- [x] 3.2 实现 `_checkForLoop(threadId, toolName, params)` 方法
- [x] 3.3 在 `_runChatAgent` 中调用 `_checkForLoop`，触发时添加警告消息
- [x] 3.4 添加 `MAX_AGENT_ROUNDS = 50` 硬上限检查
- [x] 3.5 新增埋点 `Loop Detected`，记录循环检测触发

## 4. 阶段 D — P0-1 并行工具调用（工作量最大）

- [ ] 4.1 修改 `sendLLMMessageTypes.ts`：`OnFinalMessageParams` 新增 `toolCalls?: RawToolCallObj[]`
- [ ] 4.2 修改 `sendLLMMessage.impl.ts`：解析多个 tool_calls（不再限制 index === 0）
- [ ] 4.3 定义 `READ_ONLY_TOOLS` 集合（只读工具白名单）
- [ ] 4.4 修改 `_runChatAgent`：支持 `toolCalls[]` 数组处理
- [ ] 4.5 实现并行执行逻辑：只读工具 `Promise.all`，写操作串行
- [ ] 4.6 新增埋点 `Parallel Tool Calls`，记录并行调用情况
- [ ] 4.7 更新提示词：添加并行工具调用的 Workflow 指导

## 5. 阶段 E — P1-2 编辑容错（可选，视时间）

- [ ] 5.1 在 `toolsService.ts` 中修改 `edit_file` 的 SEARCH 匹配逻辑
- [ ] 5.2 添加容错策略：去除首尾空行重试
- [ ] 5.3 添加容错策略：忽略缩进差异重试（转换 tab/space）
- [ ] 5.4 失败时返回更详细的错误信息（哪一行不匹配）

## 6. 阶段 F — P1-3 只读工具自动审批（可选）

- [ ] 6.1 在 `chatThreadService.ts` 中定义 `AUTO_APPROVE_TOOLS` 白名单
- [ ] 6.2 修改 `_runToolCall` 中审批逻辑，白名单内工具跳过审批
- [ ] 6.3 确保 Agent 模式下只读工具自动批准，其他模式不受影响

## 7. 阶段 G — 验证与测试

- [x] 7.1 运行 `npm run buildreact`，确保 TypeScript 编译通过 ✅ (2026-05-25)
- [ ] 7.2 执行测试 1（Easy）：创建文件 + 测试，验证 LLM 轮数 ≤ 5
- [ ] 7.3 执行测试 2（Medium）：修 Bug + 测试，验证编辑成功
- [ ] 7.4 执行测试 3（Hard）：从零创建 Express 项目，验证 npm build 通过
- [ ] 7.5 验证循环检测：故意触发循环场景，确认 50 轮内停止
- [ ] 7.6 验证截断：读取大文件后确认 Agent 正常继续
- [ ] 7.7 A/B 对比：记录优化前后的 token 消耗和轮数差异

## 8. 阶段 H — 归档与交付

- [ ] 8.1 整理测试结果，记录优化效果数据
- [ ] 8.2 更新 `temp_void_vs_codex_agent_analysis.md` 的"实施状态"
- [ ] 8.3 按 `/opsx-archive` 流程归档本 change
- [ ] 8.4 在 `openspec/specs/` 下创建 `agent-loop-optimization` 能力文档

---

## 实施优先级建议

```
第一天（1.5天工作量，弥合 55% 差距）
├── 阶段 A（P0-2 提示词）  ← 0.5 天，立即可见效果
├── 阶段 B（P0-3 截断）    ← 0.5 天，防止上下文溢出
└── 阶段 C（P1-1 循环检测）← 0.5 天，防止死循环

第二天+（可选，弥合剩余 45%）
├── 阶段 D（P0-1 并行调用）← 2-3 天，最大收益但工作量大
├── 阶段 E（P1-2 编辑容错）← 1 天
└── 阶段 F（P1-3 自动审批）← 0.5 天
```

**建议从阶段 A 开始**，完成后立即测试效果，再决定是否继续。
