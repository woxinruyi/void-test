# Agent 循环架构

## 核心文件

- **状态机：** `src/vs/workbench/contrib/void/browser/chatThreadService.ts`（84KB）
- **Prompt 组装：** `src/vs/workbench/contrib/void/browser/convertToLLMMessageService.ts`
- **工具执行：** `src/vs/workbench/contrib/void/browser/toolsService.ts`

## Agent 循环流程

```
用户发送消息
  │
  ▼
chatThreadService.sendMessage()
  │
  ├── convertToLLMMessageService.prepareLLMChatMessages()
  │     ├── 组装 System Prompt（chat_systemMessage）
  │     ├── 转换历史消息为 LLM 格式（OpenAI / Anthropic / Gemini）
  │     └── 返回 [systemMessage, ...chatMessages]
  │
  ├── sendLLMMessageService.sendLLMMessage()  ← IPC → main 进程
  │     └── 流式 SSE 返回 token / 工具调用
  │
  ├── 解析响应
  │     ├── 文本 token → 追加到当前消息
  │     └── 工具调用 → toolsService.executeTool()
  │           ├── 只读工具 → 自动执行
  │           └── 写入工具 → 用户审批 → 执行
  │
  ├── 工具结果反馈到消息历史
  │
  └── 循环判断
        ├── 有工具调用 → 继续下一轮（自动）
        ├── 纯文本响应 → 结束
        ├── 达到最大轮次（50 轮）→ 注入总结 Prompt 后最终轮
        └── 用户手动停止 → 结束
```

## 并行工具调用

Agent 支持单轮内多个工具并行调用：
- LLM 可在一次响应中输出多个工具调用
- `toolsService` 并行执行这些工具
- 结果按顺序收集后一次性反馈

**消息格式处理（按 Provider）：**
- **OpenAI：** assistant message 的 `tool_calls` 数组 + 多个 tool role 消息
- **Anthropic：** assistant content 中多个 `tool_use` 块 + user content 中多个 `tool_result` 块
- **Gemini：** model parts 中多个 `functionCall` + user parts 中多个 `functionResponse`

## 最大轮次与总结

- 默认最大轮次：**50 轮**
- 达到上限时注入总结提示，要求 Agent 总结当前进展和剩余工作
- 总结轮不执行工具，只输出文本

## 错误恢复

- 工具执行失败 → 错误信息作为工具结果反馈给 LLM
- LLM 网络错误 → 重试机制（指数退避）
- 用户拒绝审批 → 将拒绝原因反馈给 LLM，LLM 可选择替代方案

## 上下文窗口管理

- `contextCompactionService` 负责在上下文超出模型窗口时压缩历史
- 压缩策略：保留 System Prompt + 最近 N 轮 + 早期轮次的摘要

## 检查点与回滚

- `turnCheckpointService` 在每个工具执行轮后创建检查点
- 用户可通过 `turnCheckpointActions` 回滚到任意检查点
- 检查点包含文件快照，可恢复文件状态

---

## 更新日志

| 日期 | 内容 | 关联变更 |
|------|------|----------|
| 2026-05-26 | 初始创建：Agent 循环、并行工具、错误恢复 | enhance-agent-prompt-and-context |
