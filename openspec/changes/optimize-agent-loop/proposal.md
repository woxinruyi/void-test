# 优化：Agent 循环效率提升（optimize-agent-loop）

## 背景

当前 Void 的编程 Agent 在效率上与 Codex CLI 存在显著差距。使用 GPT-5.5 完成中等复杂度项目时，Void 需要数千万 token 且经常无法成功运行，而 Codex CLI 可以快速完成。

核心问题分析（基于 Codex CLI 开源代码对比）：

1. **一次只能调用一个工具**（`prompts.ts:633`：`'Only use ONE tool call at a time.'`）
   - Codex 支持并行工具调用，读取 5 个文件只需 1 轮 LLM
   - Void 需要 5 轮，每轮重发完整上下文，仅此一项浪费 5-7 倍 token

2. **系统提示词太弱**（~500 字 vs Codex ~3000 字）
   - 缺少自主性规则（"自主高级工程师，持续到完成"）
   - 缺少代码质量规则（类型安全、DRY、错误处理）
   - 缺少循环检测（"重复读同一文件就停止"）
   - 缺少 Plan 纪律（"不要只做计划，交付代码"）

3. **工具结果无截断**
   - `MAX_FILE_CHARS_PAGE = 500_000`（~125K token）
   - Codex 限制在 10K token 并用中间截断策略

4. **无循环检测**
   - Agent 可能无限循环读取同一文件
   - 没有硬上限保护

## 目标

- **P0-1**：启用并行工具调用，预计 token 消耗降低 3-5 倍
- **P0-2**：重写系统提示词，提高任务一次成功率
- **P0-3**：工具结果截断到 ~10K token，避免上下文溢出
- **P1-1**：添加循环检测 + 50 轮硬上限
- **P1-2**：SEARCH/REPLACE 编辑容错
- **P1-3**：只读工具自动审批白名单

综合预期：token 消耗降低 5-10 倍，任务完成率从 ~30% 提升到 ~70%+

## 非目标

- **不**修改 LLM 供应商调用协议
- **不**新增模型或 Provider
- **不**改变 UI 布局
- **不**影响 Autocomplete / CtrlK 功能
- **不**引入新的外部依赖

## 方案要点

### 1. 并行工具调用（P0-1）

**提示词修改**：
```typescript
// 删除
details.push('Only use ONE tool call at a time.')

// 替换为
if (mode === 'agent') {
    details.push('When multiple tool calls can be parallelized, issue them in parallel.')
    details.push('Workflow: plan reads → parallel batch → analyze → repeat')
}
```

**LLM 消息解析**：支持 `toolCalls[]` 数组而非单个 `toolCall`

**Agent Loop**：只读工具并行执行，写操作串行执行

### 2. 系统提示词重写（P0-2）

新增四个段落：
- **Autonomy**：自主性与持续性规则
- **Code Quality**：代码实现标准
- **Plan Discipline**：计划纪律
- **Exploration**：文件探索规则

### 3. 工具结果截断（P0-3）

```typescript
// 修改限制
MAX_FILE_CHARS_PAGE: 500_000 → 40_000   // ~10K token
MAX_TERMINAL_CHARS: 100_000 → 20_000    // ~5K token

// 截断策略：前半 + 省略号 + 后半
function truncateMiddle(text, maxChars) { ... }
```

### 4. 循环检测（P1-1）

- 记录最近 5 次工具调用签名
- 同一签名出现 3 次以上触发警告
- 50 轮硬上限自动停止

### 5. 编辑容错（P1-2）

- SEARCH 块精确匹配失败时尝试容错匹配
- 去除首尾空行重试
- 忽略缩进差异重试

### 6. 自动审批白名单（P1-3）

只读工具自动批准：
- `read_file`, `ls_dir`, `get_dir_tree`
- `search_pathnames_only`, `search_for_files`, `search_in_file`
- `go_to_definition`, `find_references`, `semantic_search`

## 影响范围

### 新增能力

- `agent-loop-optimization`：Agent 循环效率优化能力

### 受影响代码

- `src/vs/workbench/contrib/void/common/prompt/prompts.ts`
  - 修改系统提示词
  - 降低 MAX 常量
  - 新增 `truncateMiddle()` 函数

- `src/vs/workbench/contrib/void/electron-main/llmMessage/sendLLMMessage.impl.ts`
  - 支持多个 toolCalls 解析

- `src/vs/workbench/contrib/void/browser/chatThreadService.ts`
  - `_runChatAgent` 支持并行工具调用
  - 添加循环检测逻辑
  - 添加 50 轮硬上限

- `src/vs/workbench/contrib/void/browser/toolsService.ts`
  - 应用 truncateMiddle 到工具结果

- `src/vs/workbench/contrib/void/common/sendLLMMessageTypes.ts`
  - `OnFinalMessage` 支持 `toolCalls[]`

## 验证

- **测试 1（Easy）**：创建文件 + 测试 → LLM 轮数 ≤ 5
- **测试 2（Medium）**：修 Bug + 测试 → 编辑成功
- **测试 3（Hard）**：从零创建 Express 项目 → npm build 通过
- **测试 4**：无死循环 → Agent 在 50 轮内停止
- **测试 5**：大文件读取后正常继续 → 无上下文溢出

## 风险与回滚

- **风险 A — 并行工具调用顺序问题**
  - 缓解：只有只读工具允许并行，写操作保持串行

- **风险 B — 提示词修改导致行为偏移**
  - 缓解：保留核心规则，仅补充缺失内容

- **风险 C — 截断导致关键信息丢失**
  - 缓解：中间截断策略保留首尾最重要的部分

- **回滚**：每个 P0 优化可独立回滚，通过 git revert 单个 commit
