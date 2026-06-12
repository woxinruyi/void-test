# LSP 代码导航工具规格（lsp-tools）

## 能力描述

Void 编辑器内置工具体系中新增 5 个 LSP 级别的代码导航工具，使 LLM 能精确跳转定义、查找引用、获取类型信息、列出符号和查找实现。

## 场景

### 场景 1：跳转到函数定义

- 前置条件：用户在 Agent 模式下询问"这个函数做了什么"
- LLM 调用 `go_to_definition`，传入函数调用位置的 `uri`/`line`/`character`
- 工具返回定义位置的 URI、行范围和附近代码片段
- LLM 基于返回的代码片段回答用户问题，无需再调用 `read_file`

### 场景 2：查找符号的所有引用

- 前置条件：用户请求"找出所有调用 `handleClick` 的地方"
- LLM 先通过 `search_in_file` 或 `list_symbols` 定位 `handleClick` 的位置
- LLM 调用 `find_references`，传入符号位置
- 工具返回所有引用位置（最多 20 个），每个包含 URI、行号和代码片段
- LLM 汇总引用列表回答用户

### 场景 3：获取类型定义

- 前置条件：LLM 需要理解某个变量的类型接口
- LLM 调用 `get_type_definition`，传入变量位置
- 工具返回类型定义位置的 URI、行范围和代码片段
- LLM 基于类型定义理解变量的结构和方法

### 场景 4：浏览文件结构

- 前置条件：LLM 需要快速了解一个文件的结构
- LLM 调用 `list_symbols`，传入文件 URI
- 工具返回文件中所有符号（函数、类、变量等）的名称、类型和位置
- LLM 基于符号列表决定需要读取哪些具体代码段

### 场景 5：查找接口实现

- 前置条件：LLM 需要找到某个接口的所有实现类
- LLM 调用 `find_implementations`，传入接口定义位置
- 工具返回所有实现类的位置和代码片段
- LLM 基于实现列表分析代码架构

### 场景 6：工作区符号搜索

- 前置条件：LLM 需要在整个代码库中查找名为 `UserService` 的符号
- LLM 调用 `list_symbols`，`uri` 为空，`query` 为 `"UserService"`
- 工具返回工作区中匹配的符号列表
- LLM 基于结果定位目标文件

### 场景 7：LSP Provider 不可用的降级

- 前置条件：LLM 在纯文本文件或无 LSP 支持的文件类型上调用 LSP 工具
- 工具返回空结果 + 提示信息（如 `"No definition provider available for this file type"`）
- LLM 降级使用 `search_for_files` / `read_file` 等工具继续探索
- Agent 循环不中断

### 场景 8：find_references 结果数量限制

- 前置条件：符号在大型代码库中有大量引用（超过 20 个）
- 工具返回前 20 个引用位置 + `totalMatches` 总数
- LLM 可根据 `totalMatches` 判断是否需要进一步筛选
