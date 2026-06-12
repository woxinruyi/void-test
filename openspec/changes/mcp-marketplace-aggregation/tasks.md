# 任务清单（mcp-marketplace-aggregation）

> 状态：全部完成 ✅（2026-04-28）

## ✅ Task 1: 定义市场聚合类型系统

**文件**: `src/vs/workbench/contrib/void/common/marketplaceTypes.ts` (新建)

**内容**:
1. 定义 `MarketplaceItem` 接口（id, source, type, name, qualifiedName, description, iconUrl, homepage, useCount, score, verified, createdAt, updatedAt, categories, isCodeRelated, installConfig, skillPrompt）
2. 定义 `MCPInstallConfig` 接口（command, args, env, url, requiresApiKey, apiKeyEnvName）
3. 定义 `MarketplaceSearchParams` 接口（query, type, sources, sort, filter, verifiedOnly, page, pageSize）
4. 定义 `MarketplaceSearchResult` 接口（items, totalCount, page, pageSize, sources）
5. 定义 `MarketplaceSource` 类型字面量 `'smithery' | 'modelscope'`
6. 导出 `CODE_RELATED_KEYWORDS` 常量数组和 `isCodeRelated()` 工具函数
7. 定义排序枚举：`popular` | `newest` | `score`
8. 定义过滤枚举：`code` | `all` + 自定义分类字符串

**验证**: TypeScript 编译无错误

---

## ✅ Task 2: globalSettings 新增 smitheryApiKey

**文件**: `src/vs/workbench/contrib/void/common/voidSettingsTypes.ts`

**内容**:
1. 在 `GlobalSettingName` 或相关 globalSettings 定义中新增 `smitheryApiKey` 字段
2. 设置默认值为空字符串
3. 确保序列化/反序列化兼容（旧配置无此字段时不报错）

**验证**: `tsc --noEmit` 无错误

---

## ✅ Task 3: Smithery API 客户端

**文件**: `src/vs/workbench/contrib/void/browser/marketplaceClients/smitheryApiClient.ts` (新建)

**内容**:
1. 实现 `SmitheryApiClient` 类
2. `searchServers(query, page, pageSize, verified?)` → 调用 `GET https://api.smithery.ai/servers`
3. `searchSkills(query, page, pageSize, category?)` → 调用 `GET https://api.smithery.ai/skills`
4. 请求头设置 `Authorization: Bearer <apiKey>`
5. 响应映射：将 Smithery 数据结构转为 `MarketplaceItem[]`
   - servers: `useCount` 直接映射，`score` 直接映射（已是 0-1），`verified` 直接映射
   - skills: `qualityScore / 100` 归一化为 `score`，`totalActivations` 映射为 `useCount`
6. `isCodeRelated` 预计算：基于 categories + name + description 匹配 `CODE_RELATED_KEYWORDS`
7. 错误处理：网络超时 8s，401 返回 API key 无效提示，其他错误静默返回空结果
8. 对 MCP servers 尝试生成 `installConfig`：从 Smithery 服务器详情中提取 command/args 信息

**验证**: TypeScript 编译无错误

---

## ✅ Task 4: ModelScope MCP API 客户端

**文件**: `src/vs/workbench/contrib/void/browser/marketplaceClients/modelscopeApiClient.ts` (新建)

**内容**:
1. 实现 `ModelScopeApiClient` 类
2. 尝试调用 ModelScope MCP 广场的内部 API 端点（需通过浏览器 DevTools 确认实际端点）
   - 候选: `https://www.modelscope.cn/api/v1/mcp/servers` 或类似
   - 备选: 使用已知公开接口 `https://modelscope.cn/api/v1/models` 的 MCP 分类筛选
3. 响应映射为 `MarketplaceItem[]`，source 标记为 `'modelscope'`
4. 降级策略：
   - 超时 5s → 返回空结果
   - 403/404 → 标记不可用，30 分钟内不重试
   - 其他错误 → 返回空结果 + console.warn
5. 无需认证（公开端点）

**注意**: ModelScope 内部 API 可能变更，此客户端需设计为可选组件，其失败不影响整体功能。

**验证**: TypeScript 编译无错误

---

## ✅ Task 5: MarketplaceService 实现

**文件**: `src/vs/workbench/contrib/void/browser/marketplaceService.ts` (新建)

**内容**:
1. 定义 `IMarketplaceService` 接口：
   - `search(params: MarketplaceSearchParams): Promise<MarketplaceSearchResult>`
   - `installMCPServer(item: MarketplaceItem): Promise<void>`
   - `installSkill(item: MarketplaceItem): Promise<void>`
   - `hasSmitheryApiKey(): boolean`
   - `onDidChangeState: Event<void>`
2. 使用 `createDecorator<IMarketplaceService>('marketplaceService')` 注册
3. 实现 `MarketplaceService` 类：
   - 注入 `IVoidSettingsService`（获取 smitheryApiKey）
   - 注入 `IMCPService`（安装 MCP 时需要）
   - 注入 `IFileService`（写入 mcp.json）
   - 注入 `IPathService`（定位 mcp.json 路径）
   - 注入 `IProductService`（获取 appName）
4. `search()` 实现：
   - 先查内存缓存（key = JSON.stringify(params)）
   - 根据 `params.sources` 并行调用 SmitheryApiClient + ModelScopeApiClient
   - 合并结果，按 `params.sort` 排序
   - 如 `params.filter === 'code'` → 过滤出 `isCodeRelated === true` 的项
   - 缓存结果（15 分钟 TTL，上限 100 条缓存）
5. `installMCPServer()` 实现：
   - 读取当前 mcp.json
   - 追加 item.installConfig 到 mcpServers
   - 写入 mcp.json（MCPService 自动检测变更并刷新）
6. `installSkill()` 实现：
   - 构造 SkillInfo 对象
   - 调用 voidSettingsService.addSkill()
7. 使用 `registerSingleton` 注册服务

**验证**: TypeScript 编译无错误

---

## ✅ Task 6: 服务注册到 DI 容器

**文件**: `src/vs/workbench/contrib/void/browser/void.contribution.ts` 或对应的注册文件

**内容**:
1. import MarketplaceService
2. 确认 `registerSingleton(IMarketplaceService, MarketplaceService, InstantiationType.Delayed)` 正确注册
3. 确保服务在 Settings UI React 组件中可通过 `accessor.get('IMarketplaceService')` 获取

**验证**: 编译无错误，服务可正确实例化

---

## ✅ Task 7: i18n 新增市场浏览文案

**文件**:
- `src/vs/workbench/contrib/void/browser/react/src/util/i18n/types.ts`
- `src/vs/workbench/contrib/void/browser/react/src/util/i18n/locales/en.ts`
- `src/vs/workbench/contrib/void/browser/react/src/util/i18n/locales/zh-cn.ts`

**新增 keys**:
```
settings.marketplace.search         搜索 / Search
settings.marketplace.sortPopular    按热门排序 / Sort by popular
settings.marketplace.sortNewest     按最新排序 / Sort by newest
settings.marketplace.sortScore      按评分排序 / Sort by score
settings.marketplace.filterCode     代码相关 / Code related
settings.marketplace.filterAll      全部 / All
settings.marketplace.install        安装 / Install
settings.marketplace.installing     安装中... / Installing...
settings.marketplace.installed      已安装 / Installed
settings.marketplace.details        详情 / Details
settings.marketplace.preview        预览 / Preview
settings.marketplace.loadMore       加载更多 / Load more
settings.marketplace.noResults      未找到结果 / No results found
settings.marketplace.error          加载失败 / Failed to load
settings.marketplace.uses           次使用 / uses
settings.marketplace.score          评分 / score
settings.marketplace.verified       已验证 / Verified
settings.marketplace.sourceSmithery    来源: Smithery / Source: Smithery
settings.marketplace.sourceModelScope  来源: ModelScope / Source: ModelScope
settings.marketplace.apiKeyRequired    需要 API Key / API Key required
settings.marketplace.apiKeyHint        请在 Smithery 获取 API Key / Get API Key from Smithery
settings.mcp.marketplace            MCP 市场 / MCP Marketplace
settings.skill.marketplace.browse   浏览技能市场 / Browse Skill Marketplace
settings.general.smitheryApiKey     Smithery API Key
settings.general.smitheryApiKeyDesc 用于访问 Smithery 市场 / Used to access Smithery marketplace
```

**验证**: i18n 类型检查通过

---

## ✅ Task 8: Settings UI — MarketplaceBrowser 公共组件

**文件**: `src/vs/workbench/contrib/void/browser/react/src/void-settings-tsx/Settings.tsx`

**内容**:
1. 新增 `MarketplaceItemCard` 组件：
   - 显示: icon + name + verified 徽章 + 来源标签
   - 显示: description（截断 2 行）
   - 显示: 指标行 → useCount（格式化为 K/M）+ score（星级或分数）+ createdAt（相对时间）
   - 按钮: [安装] / [已安装] + [详情]（链接到 homepage）
   - 安装点击 → 调用 marketplaceService.installMCPServer() 或 installSkill()
2. 新增 `MarketplaceBrowser` 组件 (`props: { type: 'mcp-server' | 'skill' }`)：
   - 搜索框（debounce 300ms）
   - 排序下拉: 热门 / 最新 / 评分
   - 过滤下拉: 代码相关（默认）/ 全部
   - 结果列表 → MarketplaceItemCard[]
   - 分页加载更多按钮
   - 加载状态 / 空状态 / 错误状态
   - 调用 `marketplaceService.search()` 获取数据
3. 使用 `useAccessor()` 获取 `IMarketplaceService`

**验证**: React bundle 编译成功

---

## ✅ Task 9: MCP Tab 集成市场浏览

**文件**: `src/vs/workbench/contrib/void/browser/react/src/void-settings-tsx/Settings.tsx`

**内容**:
1. 在 MCP Tab 的已有 `MCPServersList` 上方，添加 `<MarketplaceBrowser type="mcp-server" />`
2. 用分隔线和标题区分「市场浏览」和「已安装服务器」
3. 确保布局美观，市场浏览区域可折叠

**验证**: UI 正常渲染，搜索和安装流程可用

---

## ✅ Task 10: Skill Tab 替换静态推荐为动态市场

**文件**: `src/vs/workbench/contrib/void/browser/react/src/void-settings-tsx/Settings.tsx`

**内容**:
1. 替换现有 `SkillTab` 中的硬编码推荐技能（3 个静态卡片）为 `<MarketplaceBrowser type="skill" />`
2. 保留手动添加技能输入框（作为备选方案）
3. 保留已安装技能列表（启禁用/删除）

**验证**: UI 正常渲染，Smithery Skills 搜索和安装可用

---

## ✅ Task 11: Smithery API Key 配置 UI

**文件**: `src/vs/workbench/contrib/void/browser/react/src/void-settings-tsx/Settings.tsx`

**内容**:
1. 在 General Tab 或 MCP Tab 中新增 Smithery API Key 输入框
2. 使用密码类型输入框（隐藏 key 内容）
3. 添加获取链接: "Get API Key from smithery.ai/account/api-keys"
4. 调用 `voidSettingsService.setGlobalSetting('smitheryApiKey', value)` 保存

**验证**: API Key 可正常保存和读取

---

## ✅ Task 12: 编译构建 + 验证

**步骤**:
1. `node build.js` — 编译 React bundle
2. `npx gulp compile` — 编译 TypeScript
3. `scripts/code.bat` — 启动 Electron 开发模式
4. 手动验证:
   - MCP Tab: 市场浏览显示 Smithery MCP servers（默认代码相关过滤）
   - Skill Tab: 市场浏览显示 Smithery Skills
   - 搜索功能正常
   - 排序切换正常
   - 一键安装 MCP → mcp.json 更新 → 服务器列表刷新
   - 一键安装 Skill → 已安装列表更新
   - Smithery API Key 配置正常

---

## ✅ Task 13: 更新设计文档

**文件**: `文档/temp-settings-设计方案与实施状态.md`

**内容**:
1. 新增「MCP/Skill 市场聚合」章节
2. 更新文件清单表格
3. 更新设计决策表格
4. 标记所有 Task 完成状态
