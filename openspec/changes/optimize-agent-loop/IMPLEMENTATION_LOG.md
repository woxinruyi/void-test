# 实施记录：Agent 循环效率提升

> 实施日期：2026-05-25
> 实施状态：阶段 A-C 已完成，验证中

---

## 已完成的修改

### 阶段 A — P0-2 系统提示词重写 ✅

**文件**: `src/vs/workbench/contrib/void/common/prompt/prompts.ts`

| 修改 | 行号 | 说明 |
|------|------|------|
| 删除单工具限制 | L633-640 | Agent 模式删除 "Only use ONE tool call"，替换为并行调用指导 |
| 添加循环检测提示 | L656-657 | Agent 模式添加 "Avoid excessive looping" 提示 |
| 新增 autonomyRules | L729-734 | 自主性与持续性规则 |
| 新增 codeQualityRules | L736-743 | 代码实现标准（类型安全、DRY、错误处理） |
| 新增 planDiscipline | L745-750 | 计划纪律 |
| 新增 explorationRules | L752-757 | 文件探索规则 |
| 调整组装顺序 | L759-775 | 新段落插入到系统信息之后、工具定义之前 |

**关键内容摘要**:
```
## Autonomy and Persistence
- You are an autonomous senior engineer...
- Persist until the task is fully handled end-to-end...
- Bias to action: default to implementing with reasonable assumptions...

## Code Implementation Standards
- Conform to the codebase conventions...
- Tight error handling: No broad try/catch blocks...
- Keep type safety...
- DRY: search for existing helpers before adding new ones...

## Planning Discipline
- Skip planning for straightforward tasks...
- Unless explicitly asked for a plan, never end the interaction with only a plan...

## File Exploration
- Think first: before any tool call, decide ALL files you will need...
- Batch reads: if you need multiple files, read them together in parallel...
```

---

### 阶段 B — P0-3 工具结果截断 ✅

**文件 1**: `src/vs/workbench/contrib/void/common/prompt/prompts.ts`

| 修改 | 行号 | 说明 |
|------|------|------|
| 降低 MAX_FILE_CHARS_PAGE | L24-25 | 500,000 → 40,000（~10K token） |
| 降低 MAX_TERMINAL_CHARS | L28-29 | 100,000 → 20,000（~5K token） |
| 新增 truncateMiddle() | L42-55 | 中间截断函数 |

**文件 2**: `src/vs/workbench/contrib/void/browser/toolsService.ts`

| 修改 | 行号 | 说明 |
|------|------|------|
| 导入 truncateMiddle | L21 | 添加导入 |
| read_file 截断 | L992-995 | 应用 truncateMiddle |
| run_command 截断 | L1065-1068 | 应用 truncateMiddle |
| run_persistent_command 截断 | L1080-1084 | 应用 truncateMiddle |

**截断策略**:
```typescript
function truncateMiddle(text: string, maxChars: number): string {
    if (text.length <= maxChars) return text;
    const half = Math.floor(maxChars / 2);
    const truncatedCount = text.length - maxChars;
    return text.slice(0, half)
        + `\n\n... (${truncatedCount} characters truncated) ...\n\n`
        + text.slice(-half);
}
```

---

### 阶段 C — P1-1 循环检测 ✅

**文件**: `src/vs/workbench/contrib/void/browser/chatThreadService.ts`

| 修改 | 行号 | 说明 |
|------|------|------|
| 新增循环检测字段 | L336-343 | `_recentToolCalls`, `LOOP_DETECTION_WINDOW=5`, `LOOP_THRESHOLD=3`, `MAX_AGENT_ROUNDS=50` |
| 新增 _checkForLoop() | L630-661 | 检测循环的方法 |
| 新增 _clearLoopDetection() | L663-666 | 清理循环记录 |
| 硬上限检查 | L976-991 | 50 轮自动停止 |
| 循环警告 | L1188-1202 | 重复工具调用警告 |

**循环检测逻辑**:
- 记录最近 5 次工具调用（name + params hash）
- 同一签名出现 3 次以上触发警告
- 50 轮 LLM 调用硬上限自动停止

**埋点**:
- `Loop Detected` — 循环检测触发时记录
- `Agent Max Rounds Reached` — 达到硬上限时记录

---

## 编译验证

```
npm run buildreact
Exit code: 0
ESM ⚡️ Build success in 29688ms
✅ Build complete!
```

---

## 预期效果

| 指标 | 优化前 | 优化后预期 |
|------|--------|-----------|
| Token 消耗 | 500K-2M+ | 50K-200K |
| 任务完成率 | ~30% | ~70%+ |
| LLM 轮数 | 30-50+ | 10-20 |
| 死循环 | 常见 | 50 轮内必停 |
| 上下文溢出 | 常见 | 大幅减少 |

---

## 待实施

- **阶段 D — P0-1 并行工具调用**（2-3天）：最大收益但工作量大
- **阶段 E — P1-2 编辑容错**（1天）：SEARCH/REPLACE 容错匹配
- **阶段 F — P1-3 自动审批**（0.5天）：只读工具自动批准

---

## 测试验证待执行

1. [ ] 测试 1（Easy）：创建文件 + 测试 → LLM 轮数 ≤ 5
2. [ ] 测试 2（Medium）：修 Bug + 测试 → 编辑成功
3. [ ] 测试 3（Hard）：从零创建 Express 项目 → npm build 通过
4. [ ] 循环检测验证：故意重复同一操作，确认警告和 50 轮停止
5. [ ] 截断验证：读取大文件，确认 Agent 正常继续
