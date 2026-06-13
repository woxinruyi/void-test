# YWCode 提示词 / 缓存 / 交互细节 深度审计（对标开源最佳实践）

> temp 临时文档 · 2026-06-13 · 对应 /goal 细粒度循环分析
> 范围：`prompt/prompts.ts` 的 `chat_systemMessage` 系统提示逐段 + 缓存结构 + 交互细节，对标 Codex(开源) / Aider(开源) / Claude Code 最佳实践。

---

## 一、系统提示逐段评估（agent 模式）

YWCode 的 agent 系统提示**已相当完整**（8 个结构化段落，细致程度超过多数开源工具）：
Autonomy · Code Quality · Exploration · Tool Strategy · Error Recovery · Code Mod Best Practices · Verification · Plan Discipline。

| 段落 | 评价 | 对标 |
|---|---|---|
| Autonomy and Persistence | ✅ 强：自主高级工程师、持续到完成、bias-to-action、防循环 | 对齐 Codex/CC |
| Code Implementation Standards | ✅ 好：约定一致/紧错误处理/类型安全/DRY/批量编辑 | 对齐 |
| File Exploration | ✅ 并行批读 + 优先搜索工具 | 对齐 Codex |
| Tool Usage Strategy | ✅ 改前先读/多文件先读全/失败分析重试/改后验证 | 对齐 |
| Error Recovery | ✅ 细：edit 失败重读、命令错误分类修复、2 次失败回退 | 优于多数 |
| Code Mod Best Practices | ✅ 50 行上下文/自含编辑/edit_file 优先/不留半成品 | 对齐 |
| Verification After Changes | ✅ lint/build/test/review 四步 | 对齐 CC |
| Plan Discipline | ✅ 跳过简单任务/不单步计划/交付代码非计划/收尾对账 | 对齐 Codex |

---

## 二、发现的差异 / 可提升点（按 ROI）

### 🔴 #1（高 ROI，本轮执行）系统提示缓存结构失效
- **现象**：`sendLLMMessage.impl.ts:554-557` 将**整条系统消息**作为单个块打 `cache_control`。但 `chat_systemMessage` 把**易变内容**（活动文件 activeURI、打开文件、IDE 实时活动、git 状态、目录树 directoryStr、最近修改、今日日期）与**稳定内容**（8 段 agent 规则 + 工具定义 + important notes）**拼成一条字符串**。
- **后果**：易变内容几乎每请求都变 → system 缓存断点**几乎永不命中**（cache_read≈0）；只有 tools 断点（稳定）能缓存。占系统提示大头的"规则+工具定义"本可缓存却被浪费。
- **最佳实践**（Anthropic prompt-caching / Codex frozen-prompt）：**稳定前缀在前并打断点、易变上下文在后不打断点**。前缀匹配下，易变块变化不破坏已缓存的稳定前缀。
- **优化策略**：把系统消息切成 `[稳定块(cache_control) , 易变块(无缓存)]`。稳定块=header+8段规则+工具定义+important notes(去日期)；易变块=system_info/目录/IDE/git/stack/最近/计划/记忆/技能/日期。预期 system 部分 cache_read 从 ≈0 提升到接近全量稳定前缀。

### 🟡 #2 `Today's date` 在缓存块内（prompt-caching 反模式）
- `details` 含 `Today's date is ${new Date()...}`（每日变）→ 拉低缓存。随 #1 一并移入易变块。

### 🟡 #3 `Do NOT write tables`（line 738）
- 过度限制：表格常利于结构化输出（对比/参数）。建议放宽为"在表格更清晰时可用"。低优先。

### 🟢 #4 激进措辞 `CRITICAL: You MUST ONLY...`（711-712）
- Opus 4.6+ 对 "CRITICAL/MUST" 过度敏感、易过触发（见迁移指南）。可适度软化为陈述式。低优先、低风险但需回归观察，本轮不动。

### 🟢 #5 缺"简洁、结论先行"收尾指引
- 现代最佳实践（Opus/Fable 调优）强调结论先行、简洁。可加一条 agent 收尾指引。低风险，后续。

### 🟢 #6 缺"不过度工程"显式约束
- Code Quality 有 DRY/约定，但无显式"只做被要求的改动、不加未要求的抽象/特性"。Opus 4.6+ 易过度工程。可加。后续。

---

## 三、本轮执行
- **提案 `optimize-system-prompt-caching`**：实现 #1（+ #2 日期移位）。稳定/易变切分 + Anthropic 路径双块缓存。
- 验证：切分纯逻辑单测 + 结构断言（稳定块含规则/工具、易变块含 activeURI/目录/日期）+ tsc。缓存命中率真实效果需 Anthropic 真机看 cache_read（运行时）。

后续轮次：#3/#4/#5/#6 提示词微调（带回归断言），以及代码段层面（apply 重试增量化、context 修剪语义化）。
