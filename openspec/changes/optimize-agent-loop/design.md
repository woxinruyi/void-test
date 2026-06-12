# 技术设计：Agent 循环效率提升

## 1. 架构概述

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Chat Thread Service                           │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                    _runChatAgent Loop                          │  │
│  │                                                                 │  │
│  │  ┌─────────────┐   ┌─────────────┐   ┌─────────────────────┐  │  │
│  │  │  系统提示词  │ → │ LLM 调用    │ → │ 工具调用（并行/串行）│  │  │
│  │  │  (重写)     │   │ (多 tool)   │   │ (循环检测)          │  │  │
│  │  └─────────────┘   └─────────────┘   └─────────────────────┘  │  │
│  │          ↑               ↑                    ↓                │  │
│  │          │               │                    │                │  │
│  │  ┌───────┴───────────────┴────────────────────┴─────────────┐ │  │
│  │  │              上下文管理 (截断 + 压缩)                     │ │  │
│  │  └──────────────────────────────────────────────────────────┘ │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

## 2. P0-1：并行工具调用

### 2.1 数据结构变更

**文件**：`sendLLMMessageTypes.ts`

```typescript
// 当前
export type OnFinalMessageParams = {
    fullText: string;
    fullReasoning: string;
    toolCall?: RawToolCallObj;  // 单个
    anthropicReasoning: AnthropicReasoning[] | null;
};

// 修改为
export type OnFinalMessageParams = {
    fullText: string;
    fullReasoning: string;
    toolCall?: RawToolCallObj;           // 保留兼容
    toolCalls?: RawToolCallObj[];        // 新增：多个工具调用
    anthropicReasoning: AnthropicReasoning[] | null;
};
```

### 2.2 LLM 消息解析修改

**文件**：`sendLLMMessage.impl.ts:379-430`

```typescript
// 当前：只跟踪一个工具
let toolName = ''
let toolId = ''
let toolParamsStr = ''

// 修改为：跟踪多个工具
interface ToolCallAccumulator {
    name: string;
    id: string;
    paramsStr: string;
}
const toolCallAccumulators: ToolCallAccumulator[] = []

for await (const chunk of response) {
    // ... 文本处理 ...
    
    for (const tool of chunk.choices[0]?.delta?.tool_calls ?? []) {
        const index = tool.index
        // 扩展数组
        while (toolCallAccumulators.length <= index) {
            toolCallAccumulators.push({ name: '', id: '', paramsStr: '' })
        }
        toolCallAccumulators[index].name += tool.function?.name ?? ''
        toolCallAccumulators[index].paramsStr += tool.function?.arguments ?? ''
        toolCallAccumulators[index].id += tool.id ?? ''
    }
}

// 最终消息
const toolCalls = toolCallAccumulators
    .filter(tc => tc.name)  // 过滤空的
    .map(tc => rawToolCallObjOfParamsStr(tc.name, tc.paramsStr, tc.id))
    .filter((tc): tc is RawToolCallObj => tc !== null)

onFinalMessage({
    fullText: fullTextSoFar,
    fullReasoning: fullReasoningSoFar,
    toolCall: toolCalls[0],              // 兼容旧代码
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    anthropicReasoning: null,
})
```

### 2.3 Agent Loop 并行执行

**文件**：`chatThreadService.ts:1116-1135`

```typescript
// 只读工具集合
const READ_ONLY_TOOLS = new Set([
    'read_file', 'ls_dir', 'get_dir_tree',
    'search_pathnames_only', 'search_for_files', 'search_in_file',
    'read_lint_errors', 'go_to_definition', 'find_references',
    'get_type_definition', 'list_symbols', 'find_implementations',
    'semantic_search', 'web_search', 'read_url',
    'remote_repo_tree', 'remote_repo_read', 'remote_repo_search'
])

// 在 llmRes success 后处理 toolCalls
const toolCalls = llmRes.toolCalls ?? (llmRes.toolCall ? [llmRes.toolCall] : [])

if (toolCalls.length > 0) {
    const resolvedCalls = toolCalls.map(tc => ({
        ...tc,
        resolvedName: resolveToolName(tc.name)
    }))
    
    const allReadOnly = resolvedCalls.every(tc => READ_ONLY_TOOLS.has(tc.resolvedName))
    
    if (allReadOnly && resolvedCalls.length > 1) {
        // 并行执行所有只读工具
        const results = await Promise.all(
            resolvedCalls.map(tc => 
                this._runToolCall(threadId, tc.resolvedName, tc.id, 
                    this._computeMCPServerOfToolName(tc.resolvedName),
                    { preapproved: false, unvalidatedToolParams: tc.rawParams })
            )
        )
        
        if (results.some(r => r.interrupted)) {
            this._setStreamState(threadId, undefined)
            return
        }
        if (results.some(r => r.awaitingUserApproval)) {
            isRunningWhenEnd = 'awaiting_user'
        } else {
            shouldSendAnotherMessage = true
        }
    } else {
        // 串行执行（有写操作或只有一个工具）
        for (const tc of resolvedCalls) {
            const { awaitingUserApproval, interrupted } = await this._runToolCall(
                threadId, tc.resolvedName, tc.id,
                this._computeMCPServerOfToolName(tc.resolvedName),
                { preapproved: false, unvalidatedToolParams: tc.rawParams }
            )
            if (interrupted) {
                this._setStreamState(threadId, undefined)
                return
            }
            if (awaitingUserApproval) {
                isRunningWhenEnd = 'awaiting_user'
                break
            }
        }
        if (!isRunningWhenEnd) shouldSendAnotherMessage = true
    }
}
```

### 2.4 提示词修改

**文件**：`prompts.ts:630-636`

```typescript
// 删除
// details.push('Only use ONE tool call at a time.')

// 新增
if (mode === 'agent') {
    details.push('When multiple independent tool calls can be parallelized (e.g., reading multiple files, multiple searches), issue them together in a single response.')
    details.push('Workflow for exploration: (a) Think first - decide ALL files/resources you need (b) Issue one parallel batch (c) Analyze results (d) Repeat if new reads arise')
    details.push('Only make sequential tool calls if you truly cannot know the next file without seeing the result of the previous call.')
}
if (mode === 'gather') {
    details.push('Only use ONE tool call at a time.')  // gather 保持单工具
}
```

## 3. P0-2：系统提示词重写

### 3.1 新增段落

**文件**：`prompts.ts:590-738`

```typescript
// ========== 新增：Autonomy 段落 ==========
const autonomyRules = mode === 'agent' ? `
## Autonomy and Persistence
- You are an autonomous senior engineer. Once the user gives a direction, proactively gather context, plan, implement, test, and refine without waiting for additional prompts.
- Persist until the task is fully handled end-to-end within the current turn. Do not stop at analysis or partial fixes.
- Bias to action: default to implementing with reasonable assumptions. Do not end your turn asking for clarification unless truly blocked.
- Avoid excessive looping: if you find yourself re-reading or re-editing the same files without clear progress, STOP and end the turn with a concise summary and targeted questions.
` : null

// ========== 新增：Code Quality 段落 ==========
const codeQualityRules = mode === 'agent' ? `
## Code Implementation Standards
- Conform to the codebase conventions: follow existing patterns, helpers, naming, formatting.
- Tight error handling: No broad try/catch blocks or silent defaults. Propagate or surface errors explicitly.
- Keep type safety: changes should pass build and type-check. Avoid unnecessary type casts.
- DRY: search for existing helpers before adding new ones. Reuse or extract shared helpers.
- Efficient edits: read enough context before changing a file. Batch logical edits together instead of many tiny patches.
- Comprehensiveness: investigate and ensure you cover all relevant surfaces so behavior stays consistent.
` : null

// ========== 新增：Plan 纪律 ==========
const planDiscipline = mode === 'agent' ? `
## Planning Discipline
- Skip planning for straightforward tasks (roughly the easiest 25%).
- Do not make single-step plans.
- Unless explicitly asked for a plan, never end the interaction with only a plan. Plans guide your edits; the deliverable is working code.
- Before finishing, reconcile every plan item: mark as Done, Blocked (with reason), or Cancelled. Do not end with in_progress items.
` : null

// ========== 新增：Exploration 规则 ==========
const explorationRules = (mode === 'agent' || mode === 'gather') ? `
## File Exploration
- Think first: before any tool call, decide ALL files you will need.
- Batch reads: if you need multiple files, read them together in parallel tool calls.
- Only make sequential calls if you truly cannot know the next file without seeing a result first.
- Prefer search tools (\`search_for_files\`, \`search_pathnames_only\`) over reading files one by one to locate relevant code.
` : null
```

### 3.2 组装顺序

```typescript
const ansStrs: string[] = []
ansStrs.push(header)
ansStrs.push(sysInfo)
if (autonomyRules) ansStrs.push(autonomyRules)          // 新增
if (codeQualityRules) ansStrs.push(codeQualityRules)    // 新增
if (explorationRules) ansStrs.push(explorationRules)    // 新增
if (planDiscipline) ansStrs.push(planDiscipline)        // 新增
if (activeContextInfo) ansStrs.push(activeContextInfo)
if (ideActivityInfo) ansStrs.push(ideActivityInfo)
if (memoriesInfo) ansStrs.push(memoriesInfo)
if (skillsInfo) ansStrs.push(skillsInfo)
if (planInfo) ansStrs.push(planInfo)
if (toolDefinitions) ansStrs.push(toolDefinitions)
ansStrs.push(importantDetails)
ansStrs.push(fsInfo)                                    // 移到最后
```

## 4. P0-3：工具结果截断

### 4.1 常量修改

**文件**：`prompts.ts:25-31`

```typescript
// 修改前
export const MAX_FILE_CHARS_PAGE = 500_000
export const MAX_TERMINAL_CHARS = 100_000

// 修改后
export const MAX_FILE_CHARS_PAGE = 40_000    // ~10K token
export const MAX_TERMINAL_CHARS = 20_000     // ~5K token
```

### 4.2 新增截断函数

**文件**：`prompts.ts`（新增）

```typescript
/**
 * 中间截断：保留首尾，中间用省略号代替
 * 参考 Codex CLI 的截断策略
 */
export function truncateMiddle(text: string, maxChars: number): string {
    if (text.length <= maxChars) return text;
    
    const half = Math.floor(maxChars / 2);
    const truncatedCount = text.length - maxChars;
    
    return text.slice(0, half)
        + `\n\n... (${truncatedCount} characters truncated) ...\n\n`
        + text.slice(-half);
}
```

### 4.3 应用截断

**文件**：`toolsService.ts` 的 `stringOfResult`

```typescript
// 在返回工具结果字符串之前应用截断
stringOfResult: {
    read_file: (params, result) => {
        // ... existing logic ...
        return truncateMiddle(resultStr, MAX_FILE_CHARS_PAGE);
    },
    run_command: (params, result) => {
        // ... existing logic ...
        return truncateMiddle(result.result, MAX_TERMINAL_CHARS);
    },
    run_persistent_command: (params, result) => {
        return truncateMiddle(result.result, MAX_TERMINAL_CHARS);
    },
    // ... 其他工具类似
}
```

## 5. P1-1：循环检测

### 5.1 数据结构

**文件**：`chatThreadService.ts`

```typescript
// 在 class 中新增
private _recentToolCalls: Map<string, Array<{ name: string, paramsHash: string, timestamp: number }>> = new Map()

// 循环检测配置
private readonly LOOP_DETECTION_WINDOW = 5  // 检查最近 5 次
private readonly LOOP_THRESHOLD = 3          // 同一调用出现 3 次
private readonly MAX_AGENT_ROUNDS = 50       // 硬上限
```

### 5.2 检测逻辑

```typescript
private _checkForLoop(threadId: string, toolName: string, params: any): boolean {
    const paramsHash = JSON.stringify(params).substring(0, 200)
    const recent = this._recentToolCalls.get(threadId) ?? []
    
    // 添加当前调用
    recent.push({ name: toolName, paramsHash, timestamp: Date.now() })
    
    // 只保留最近 LOOP_DETECTION_WINDOW 条
    while (recent.length > this.LOOP_DETECTION_WINDOW) {
        recent.shift()
    }
    this._recentToolCalls.set(threadId, recent)
    
    // 检查是否有重复
    const signature = `${toolName}:${paramsHash}`
    const duplicates = recent.filter(r => `${r.name}:${r.paramsHash}` === signature)
    
    return duplicates.length >= this.LOOP_THRESHOLD
}
```

### 5.3 应用检测

在 `_runChatAgent` 中：

```typescript
// 在调用 _runToolCall 之前
if (this._checkForLoop(threadId, resolvedName, toolCall.rawParams)) {
    // 添加警告消息
    this._addMessageToThread(threadId, {
        role: 'tool',
        type: 'tool_error',
        name: 'system',
        content: 'WARNING: Loop detected - you are repeating the same tool call. Please stop and try a different approach or summarize your progress.',
        result: null,
        params: {},
        id: 'loop_warning',
        rawParams: {},
        mcpServerName: undefined
    })
}

// 硬上限检查
if (nMessagesSent > this.MAX_AGENT_ROUNDS) {
    shouldSendAnotherMessage = false
    this._addMessageToThread(threadId, {
        role: 'tool',
        type: 'tool_error', 
        name: 'system',
        content: `Agent reached maximum ${this.MAX_AGENT_ROUNDS} rounds. Stopping to prevent infinite loop. Please review progress and continue manually if needed.`,
        // ...
    })
}
```

## 6. 测试验证

### 6.1 新增埋点

```typescript
// chatThreadService.ts
this._metricsService.capture('Parallel Tool Calls', {
    toolCount: toolCalls.length,
    toolNames: toolCalls.map(t => t.name).join(','),
    threadId
})

this._metricsService.capture('Loop Detected', {
    toolName,
    repeatCount: duplicates.length,
    threadId
})

this._metricsService.capture('Tool Result Truncated', {
    toolName,
    originalLength: original.length,
    truncatedLength: truncated.length,
    threadId
})
```

### 6.2 测试日志

```typescript
// 在 _runChatAgent 结尾添加
const testMetrics = {
    threadId,
    nMessagesSent,
    parallelCallCount: this._parallelCallCount,
    loopWarnings: this._loopWarningCount,
    truncations: this._truncationCount,
    elapsedMs: Date.now() - startTime
}
console.log('[VOID-AGENT-METRICS]', JSON.stringify(testMetrics))
```

## 7. 回滚策略

| 优化 | 回滚方式 |
|------|----------|
| P0-1 并行调用 | 恢复 `'Only use ONE tool call'` 提示词 |
| P0-2 提示词 | git revert 相关 commit |
| P0-3 截断 | 恢复原始 MAX 常量值 |
| P1-1 循环检测 | 注释 `_checkForLoop` 调用 |

每个优化独立实现，可单独回滚。
