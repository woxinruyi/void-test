# Autocomplete 上下文注入规格（autocomplete-context）

## 能力描述

Void 编辑器的 FIM 自动补全在发起 LLM 请求时，自动从 `ContextGatheringService` 读取光标附近的相关代码片段（函数定义、父级上下文、符号引用等），以注释形式注入 FIM prefix，从而提升补全的准确性和上下文一致性。

## 场景

### 场景 1：函数调用补全参考定义

- 前置条件：用户在 TypeScript 文件中调用已定义的 `handleSubmit(` 函数
- `ContextGatheringService` 已缓存 `handleSubmit` 的定义片段
- AutocompleteService 读取缓存，将定义以 `// Relevant context:` 注释形式注入 prefix
- LLM 返回的补全参数类型与函数签名匹配

### 场景 2：多语言注释前缀正确

- 前置条件：用户分别在 TypeScript、Python、SQL 文件中触发补全
- TypeScript 中上下文前缀为 `//`
- Python 中为 `#`
- SQL 中为 `--`
- 每种语言的 FIM 请求 prefix 格式正确

### 场景 3：上下文 Token 预算控制

- 前置条件：当前缓存包含多个较大片段
- AutocompleteService 累计 Token 数，达到 512 Token 后停止追加
- prefix + suffix + 上下文合计 ≤ 模型 FIM 窗口的 75%
- FIM 请求不超出模型限制

### 场景 4：缓存为空时降级

- 前置条件：`ContextGatheringService` 刚初始化，尚未收集到上下文
- `getCachedSnippets()` 返回空数组
- AutocompleteService 以空字符串作为 `extraContext`
- FIM 请求照常发送（等价于未启用上下文注入）

### 场景 5：片段数量限制

- 前置条件：缓存中有 10 个上下文片段
- AutocompleteService 仅取前 3 个（按 `ContextGatheringService` 的相关性排序）
- 其余片段在本次 FIM 请求中被忽略

### 场景 6：不影响 Agent 模式

- 前置条件：用户在 Agent 模式下聊天
- `ContextGatheringService` 仍持续缓存，但 Agent 模式不读取该缓存
- Agent 模式的系统提示和工具调用流程保持不变

### 场景 7：光标快速移动时的容忍

- 前置条件：用户快速上下移动光标
- 缓存可能滞后于最新光标位置
- 当前补全使用当前缓存内容，即使不是最新位置的上下文
- 后续补全使用更新后的缓存，逐步收敛
