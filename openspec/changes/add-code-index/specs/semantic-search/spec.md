# 语义搜索工具规格（semantic-search）

## 能力描述

Void 编辑器新增本地代码语义索引系统和 `semantic_search` 内置工具，使 LLM 能通过自然语言查询搜索代码库，而非仅依赖关键字/正则匹配。

## 场景

### 场景 1：概念性代码搜索

- 前置条件：索引状态为 `ready`
- LLM 调用 `semantic_search`，参数 `query` 为 `"user authentication flow"`
- 工具返回与认证流程相关的代码块（即使文件中不包含 "authentication" 字面量）
- LLM 基于语义搜索结果理解认证架构

### 场景 2：精确字符串搜索的补充

- 前置条件：LLM 需要查找错误处理相关代码
- LLM 先调用 `semantic_search`（语义搜索）获取概念相关代码
- LLM 再调用 `search_for_files`（正则搜索）查找 `catch`/`try` 关键字
- 两种搜索结果互补，覆盖更全面

### 场景 3：限定目录范围搜索

- 前置条件：LLM 知道数据库相关代码在 `src/db/` 目录下
- LLM 调用 `semantic_search`，参数 `query` 为 `"connection pool"`，`search_in_folder` 为 `src/db/`
- 工具仅在该目录下搜索，减少噪音

### 场景 4：索引未就绪时的降级

- 前置条件：索引状态为 `indexing` 或 `error`
- LLM 调用 `semantic_search`
- 工具返回空结果 + `indexStatus` 提示（如 `"Index is still being built. Please use search_for_files instead."`）
- LLM 降级使用 `search_for_files` / `search_in_file`

### 场景 5：首次索引自动启动

- 前置条件：用户打开工作区，`.void/index/` 不存在
- `CodeIndexService` 自动启动首次索引
- 索引期间 `semantic_search` 不可用，其他工具正常
- 索引完成后 `semantic_search` 自动可用

### 场景 6：增量更新

- 前置条件：索引已就绪，用户修改了 `src/utils/helpers.ts`
- 5 分钟后定时同步触发
- Merkle Tree 检测到 `helpers.ts` 哈希变化
- 仅重新分块和嵌入 `helpers.ts`，其他文件不受影响

### 场景 7：.voidignore 排除生效

- 前置条件：项目根目录有 `.voidignore` 文件，排除了 `node_modules/` 和 `dist/`
- 索引时跳过这些目录
- `semantic_search` 搜索结果不包含这些目录下的代码

### 场景 8：搜索结果包含代码片段

- 前置条件：LLM 调用 `semantic_search` 搜索 `"React component lifecycle"`
- 工具返回结果中每个匹配项包含 `snippet`（代码块文本）
- LLM 无需再调用 `read_file` 即可理解代码内容
- 结果还包含 `symbolName` 和 `symbolKind`，帮助 LLM 快速定位
