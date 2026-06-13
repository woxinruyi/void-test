# 优化：上下文修剪改为中间截断（保留首尾）（trim-middle-truncation）

## 背景

`convertToLLMMessageService.prepareOpenAIOrAnthropicMessages` 在上下文超窗时按权重选最大消息**头部截断**（`content.substring(0, TRIM_TO_LEN) + '...'` / `slice(0, len-remaining)`）。问题：纯头部截断**丢失消息尾部**——而尾部往往是关键信息（终端命令的错误输出、函数/文件的结尾、回答的结论）。

对标 Codex / Claude Code：工具结果/长消息用**中间截断**（保留首+尾，省略中间）。本项目已有经测试的 `truncateMiddle`（codegen TRUNCATE 组），但修剪循环未使用它。

## 目标

- 修剪循环改用 `truncateMiddle`，保留被截断消息的首尾，提升保留信息质量。

## 非目标

- 不改权重/选择逻辑（user×1/system×0.01/assistant×10、首尾保护）。
- 不改触发阈值或 char/token 估算。

## 方案

`prepareOpenAIOrAnthropicMessages` 修剪循环内两处头部截断改为 `truncateMiddle(m.content, 目标长度)`：
- 部分截断分支：`truncateMiddle(m.content, m.content.length - remainingCharsToTrim)`。
- 整条截断分支：`truncateMiddle(m.content, TRIM_TO_LEN)`。

## 影响范围

- `browser/convertToLLMMessageService.ts`（2 行 + import）。
- 复用既有 `truncateMiddle`（已测）。

## 验收标准

1. 修剪后被截断消息含首尾（`truncateMiddle` 行为，已由 codegenRobustness TRUNCATE 组验证：保首 100 + 保尾 100 + 截断标记）。
2. `npx tsc -p src/tsconfig.json --noEmit` 0 errors。

## 状态

- **已执行（2026-06-13）**：2 行截断改 truncateMiddle + import。截断行为复用既有测试；修剪集成由 tsc 保证（该内部函数未导出，不另做单测）。
