# MCP/Skill 市场聚合（mcp-marketplace-aggregation）

> **状态：已实施完成** ✅（2026-04-28）
> **编译验证：** `gulp compile` 0 errors · React bundle build 成功

## 背景

当前 YWCode 的 MCP 和 Skill 管理存在两个核心问题：

1. **MCP 服务器发现靠手动配置**：用户必须自己找到 MCP 服务器的 command/URL，手动编辑 `mcp.json`。没有浏览、搜索、一键安装的能力。
2. **Skill 技能安装靠静态推荐**：Settings UI 的 Skill Tab 只有 3 个硬编码推荐技能 + 手动输入 URL。无法搜索市场、查看评分/下载量、按分类过滤。

对比主流方案：
- **Windsurf**：内置 MCP 市场浏览，支持 Smithery 注册表搜索和一键安装
- **Cursor**：cursor.directory 社区目录 + MCP 配置集成
- **Claude Desktop**：依赖 Smithery 作为主要 MCP 发现渠道

MCP 生态的主要市场来源：

| 市场 | 规模 | API 状态 | 核心数据字段 |
|------|------|----------|-------------|
| **Smithery.ai** | 最大开放注册表 | ✅ REST API（Bearer token） | useCount, verified, qualityScore, createdAt, score |
| **ModelScope MCP 广场** | 1500+ 中文 MCP | ⚠️ 无公开 REST API（SPA 内部接口） | downloads, categories |
| **mcp.so** | 社区聚合目录 | ❌ 无 API | descriptions, categories |
| **Cursor Directory** | 社区插件目录 | ❌ 无 API | rules + configs |
| **PulseMCP** | 12970+ 每日更新 | ❌ 无 API | categories |

## 目标

- 在 Settings UI 的 **MCP Tab** 和 **Skill Tab** 中集成市场浏览功能
- 支持 **Smithery**（MCP + Skills）和 **ModelScope MCP 广场**（MCP）两个主要市场源
- 显示 **评分/下载量/更新时间**，支持 **排序**（热门/最新/评分）和 **过滤**（代码相关/分类）
- 默认过滤出 **代码开发相关** 的 MCP 服务器和 Skills（code, development, ide, editor 等标签）
- 支持从市场搜索结果 **一键安装** MCP 服务器到 `mcp.json` 或 Skill 到 `installedSkills`

### 核心能力

| 能力 | MCP Tab | Skill Tab |
|------|---------|-----------|
| 市场浏览 | Smithery servers + ModelScope MCP | Smithery skills |
| 搜索 | 全文 + 语义搜索 | 全文 + 语义搜索 |
| 排序 | 热门(useCount) / 最新(createdAt) / 评分(score) | 热门(totalActivations) / 最新 / 质量(qualityScore) |
| 过滤 | 代码相关（默认）/ 全部 / 已验证 | 代码相关（默认）/ 分类筛选 |
| 一键安装 | 生成 mcp.json 配置并追加 | 调用 addSkill() |
| 详情展示 | 评分 · 使用量 · 更新时间 · 命令 | 评分 · 激活量 · 更新时间 · 描述 |

## 范围

### 在范围内

- **MarketplaceService**：统一的市场数据获取、缓存、搜索服务
- **Smithery API 集成**：servers + skills 两个端点
- **ModelScope MCP 内部 API 集成**：通过逆向发现的 REST 端点获取 MCP 列表
- **Settings UI 增强**：MCP Tab 增加市场浏览面板 + Skill Tab 替换静态推荐为动态市场
- **统一数据模型**：MarketplaceItem 类型，聚合不同市场源的数据
- **默认过滤**：预设 "代码开发" 过滤器，过滤出 IDE/编辑器/代码/开发相关内容
- **一键安装流程**：MCP → 自动生成 mcp.json 条目；Skill → 调用 addSkill()
- **本地缓存**：避免频繁 API 调用，缓存市场数据 15 分钟

### 不在范围内

- mcp.so / Cursor Directory / PulseMCP 集成（无稳定 API）
- MCP 服务器的自动 OAuth 配置（仅生成基础 command/args 配置）
- Smithery 托管模式（远程 MCP 服务器代理）
- 市场数据的持久化存储（仅内存 + 短期缓存）
- 用户评分/评论功能

## 成功标准

1. 用户可在 MCP Tab 搜索并一键安装 Smithery/ModelScope 市场的 MCP 服务器
2. 用户可在 Skill Tab 搜索并安装 Smithery 市场的 Skills
3. 市场列表默认显示代码开发相关内容，支持排序和分类切换
4. 每个市场项显示使用量/评分/更新时间等关键指标
5. 安装后的 MCP 服务器自动出现在已配置列表中
