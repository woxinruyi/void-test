# 工具系统架构

## 概述

Void 的工具系统支持两类工具：
1. **内建工具（Builtin Tools）** — 在 `prompts.ts` 中定义，由 `toolsService.ts` 执行
2. **MCP 工具（外部工具）** — 通过 MCP 协议连接外部服务器，由 `mcpService.ts` 管理

## 内建工具清单

### 上下文收集（只读）
| 工具名 | 功能 |
|--------|------|
| `read_file` | 读取文件内容（支持分页） |
| `ls_dir` | 列出目录内容 |
| `get_dir_tree` | 获取目录树 |
| `search_pathnames_only` | 文件名搜索 |
| `search_for_files` | 文件内容搜索（grep） |
| `search_in_file` | 单文件内搜索 |
| `read_lint_errors` | 读取 lint 错误 |

### 代码修改（需审批：edits）
| 工具名 | 功能 |
|--------|------|
| `edit_file` | SEARCH/REPLACE 块编辑 |
| `batch_edit` | 多文件批量编辑 |
| `rewrite_file` | 全文重写 |
| `create_file_or_folder` | 创建文件/目录 |
| `delete_file_or_folder` | 删除文件/目录 |

### 终端（需审批：terminal）
| 工具名 | 功能 |
|--------|------|
| `run_command` | 运行命令并等待结果 |
| `run_persistent_command` | 在持久终端运行命令 |
| `open_persistent_terminal` | 打开持久终端（如 dev server） |
| `kill_persistent_terminal` | 关闭持久终端 |

### LSP 导航（只读）
| 工具名 | 功能 |
|--------|------|
| `go_to_definition` | 跳转定义 |
| `find_references` | 查找引用 |
| `get_type_definition` | 类型定义 |
| `list_symbols` | 列出符号 |
| `find_implementations` | 查找实现 |

### 高级功能
| 工具名 | 功能 |
|--------|------|
| `semantic_search` | 语义代码搜索 |
| `update_plan` | 更新计划/Todo |
| `dispatch_agents` | 并行子任务分发 |
| `web_search` | 网页搜索 |
| `read_url` | 读取 URL 内容 |
| `save_memory` / `delete_memory` | 记忆管理 |
| `remote_repo_tree/read/search` | 远程仓库操作 |

## 审批流

```
toolsService 接收工具调用
  ├── 检查 approvalTypeOfBuiltinToolName
  │   ├── 'edits' → 需要用户确认文件修改
  │   ├── 'terminal' → 需要用户确认命令执行
  │   ├── 'MCP tools' → 需要用户确认外部工具
  │   └── undefined → 自动执行（只读工具）
  └── 用户审批后执行 / 拒绝则返回错误
```

## 工具名别名映射

LLM 有时会使用其他编辑器的工具名，通过 `toolNameAliases` 自动映射：

| 别名 | 映射到 |
|------|--------|
| `write_to_file` / `write_file` | `rewrite_file` |
| `create_file` | `create_file_or_folder` |
| `str_replace_editor` | `edit_file` |
| `bash` / `execute_command` | `run_command` |
| `list_files` | `ls_dir` |
| `search_files` | `search_for_files` |

## 循环检测

`toolsService` 内建循环检测机制，防止 Agent 重复执行相同工具调用（如反复编辑同一文件失败）。

## MCP 工具

- 通过 `mcpService.ts` 管理连接的 MCP 服务器
- 工具列表从 MCP 服务器动态获取
- 所有 MCP 工具调用需要用户审批
- IPC 通道：renderer (`mcpService`) → main (`mcpChannel`) → MCP Server

---

## 更新日志

| 日期 | 内容 | 关联变更 |
|------|------|----------|
| 2026-05-26 | 初始创建：工具清单、审批流、别名、循环检测 | enhance-agent-prompt-and-context |
