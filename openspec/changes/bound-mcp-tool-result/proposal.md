# 优化：限界 MCP 工具结果文本，避免撑爆上下文（bound-mcp-tool-result）

## 背景（深度审计发现）

所有**内置工具**的结果在回给 LLM 前都按上限截断：`read_file` 用 `truncateMiddle(.., MAX_FILE_CHARS_PAGE=40_000)`、终端用 `truncateMiddle(.., MAX_TERMINAL_CHARS=20_000)`、引用/符号有 `MAX_REFERENCES`/`slice` 上限。

但 **MCP 工具结果**走 `mcpService.stringifyResult`（`common/mcpService.ts:312-313`）时 `toolResultStr = result.text` **完全无上限**。一个冗长/异常的外部 MCP 服务（数据库导出、网页抓取、日志查询）可返回任意大文本，直接灌入 LLM 上下文 → 撑爆窗口、抬高成本、挤掉真正重要的上下文。这是内置工具与 MCP 工具之间的健壮性不一致。

对标 Claude Code / Codex：外部工具输出统一限界（典型 ~25-30K 字符）。

## 目标

- 让 MCP 文本结果与内置工具一致地限界（`truncateMiddle`，保留头尾、中段省略）。

## 非目标

- 不改 image/audio/resource 分支（已是短占位串）。
- 不改 MCP 调用/错误语义。

## 方案

`stringifyResult` 的 `text` 分支：`truncateMiddle(result.text, MAX_TERMINAL_CHARS)`（复用终端输出上限 20_000 ≈ 5K token，外部工具输出的最贴切类比）。`mcpService` 已 import `./prompt/prompts.js`，仅扩展 import。

## 影响范围

- `common/mcpService.ts`（import + `stringifyResult` text 分支，1 行逻辑）。

## 验收标准

1. 超长 MCP 文本被 `truncateMiddle` 截断（头尾保留、中段省略标记），短文本不变。
2. `npx tsc -p src/tsconfig.json --noEmit` 0 errors。
3. mocha 全量无回归。

## 状态

- **已执行（2026-06-14）**：stringifyResult text 分支限界。tsc 0 errors。
