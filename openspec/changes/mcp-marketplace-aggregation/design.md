# 设计说明（mcp-marketplace-aggregation）

## 一、方案总览

```
┌──────────────────────────────────────────────────────────────────────────┐
│                  MCP/Skill 市场聚合系统架构                                │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────┐      │
│  │              MarketplaceService（聚合层）                       │      │
│  │                                                                │      │
│  │  ├─ 统一搜索接口 search(query, filters, sort)                  │      │
│  │  ├─ 多市场源并行查询 + 结果合并                                 │      │
│  │  ├─ 内存缓存（15 分钟 TTL）                                    │      │
│  │  └─ 标准化 MarketplaceItem 输出                                │      │
│  └────────────────────────────────────────────────────────────────┘      │
│         │                    │                                            │
│         ↓                    ↓                                            │
│  ┌──────────────┐    ┌──────────────┐                                    │
│  │ SmitheryAPI   │    │ModelScopeAPI │                                    │
│  │              │    │              │                                     │
│  │ /servers     │    │ /api/v1/mcp  │                                     │
│  │ /skills      │    │ (内部接口)   │                                     │
│  │ Bearer token │    │ 无需认证     │                                     │
│  └──────────────┘    └──────────────┘                                    │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────┐      │
│  │              Settings UI 增强                                   │      │
│  │                                                                │      │
│  │  MCP Tab:                                                      │      │
│  │    ├─ [市场浏览] 搜索框 + 排序下拉 + 分类过滤 + 结果卡片列表    │      │
│  │    ├─ [一键安装] 卡片 → 自动写入 mcp.json                      │      │
│  │    └─ [已安装列表] 现有 MCPServersList                          │      │
│  │                                                                │      │
│  │  Skill Tab:                                                    │      │
│  │    ├─ [市场浏览] 替换静态推荐 → 动态 Smithery Skills 搜索       │      │
│  │    ├─ [一键安装] 卡片 → addSkill()                             │      │
│  │    └─ [已安装列表] 现有 InstalledSkills 列表                    │      │
│  └────────────────────────────────────────────────────────────────┘      │
│                                                                          │
│  数据流:                                                                  │
│    用户搜索/浏览 → MarketplaceService.search()                           │
│      → SmitheryAPI + ModelScopeAPI 并行请求                              │
│      → 标准化为 MarketplaceItem[]                                        │
│      → UI 渲染卡片列表                                                    │
│      → 用户点击安装 → MCPService / VoidSettingsService                   │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

## 二、关键决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 市场源优先级 | Smithery > ModelScope | Smithery 有稳定公开 API；ModelScope SPA 内部 API 可能变更 |
| API 调用位置 | 渲染进程（browser） | Settings UI 需直接使用，且 fetch 在浏览器环境可用 |
| 缓存策略 | 内存 Map + 15 分钟 TTL | 避免频繁网络请求，重启清空无副作用 |
| 默认过滤 | 预设 "code" 类目关键词 | 用户是开发者，首次打开即看到相关内容 |
| MCP 安装方式 | 写入 mcp.json 文件 | 复用现有 MCPService 的配置文件监听和刷新机制 |
| Skill 安装方式 | 调用 addSkill() | 复用现有 VoidSettingsService 的持久化机制 |
| Smithery API Key | 用户在设置中配置 | Smithery 需要 Bearer token，作为 globalSettings 存储 |
| ModelScope API | 尝试无认证公开端点 | MCP 广场列表可能有公开接口，降低配置门槛 |
| 错误处理 | 静默降级 + 状态提示 | 单个市场源失败不影响其他源，UI 显示降级提示 |

## 三、统一数据模型

### MarketplaceItem

```typescript
// 统一的市场项数据结构
interface MarketplaceItem {
  // 标识
  id: string;                    // 全局唯一 ID: "smithery:server:xxx" | "modelscope:mcp:xxx"
  source: 'smithery' | 'modelscope';
  type: 'mcp-server' | 'skill';

  // 基本信息
  name: string;                  // 显示名称
  qualifiedName: string;         // 完整限定名，如 "smithery/hello-world"
  description: string;
  iconUrl?: string;
  homepage?: string;

  // 指标（归一化）
  useCount: number;              // 使用/下载量
  score: number;                 // 评分 0-1（归一化）
  verified: boolean;             // 是否验证
  createdAt: string;             // ISO 时间戳
  updatedAt?: string;

  // 分类
  categories: string[];          // 标签/分类
  isCodeRelated: boolean;        // 是否代码开发相关（预计算）

  // 安装信息
  installConfig?: MCPInstallConfig;   // MCP 安装配置
  skillPrompt?: string;               // Skill 的 prompt 内容
}

// MCP 服务器安装配置
interface MCPInstallConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  requiresApiKey?: boolean;
  apiKeyEnvName?: string;
}

// 搜索参数
interface MarketplaceSearchParams {
  query?: string;
  type: 'mcp-server' | 'skill' | 'all';
  sources?: ('smithery' | 'modelscope')[];
  sort: 'popular' | 'newest' | 'score';
  filter: 'code' | 'all' | string;     // 分类过滤
  verifiedOnly?: boolean;
  page: number;
  pageSize: number;
}

// 搜索结果
interface MarketplaceSearchResult {
  items: MarketplaceItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  sources: { source: string; count: number; error?: string }[];
}
```

### 代码相关分类关键词

```typescript
const CODE_RELATED_KEYWORDS = [
  'code', 'coding', 'programming', 'development', 'developer',
  'ide', 'editor', 'git', 'github', 'gitlab',
  'debug', 'test', 'lint', 'format', 'refactor',
  'typescript', 'javascript', 'python', 'rust', 'go', 'java',
  'api', 'database', 'sql', 'docker', 'kubernetes',
  'ci', 'cd', 'devops', 'deploy', 'build',
  'documentation', 'markdown', 'readme',
  'file', 'filesystem', 'terminal', 'shell', 'cli',
];

function isCodeRelated(item: { categories: string[]; name: string; description: string }): boolean {
  const text = [...item.categories, item.name, item.description].join(' ').toLowerCase();
  return CODE_RELATED_KEYWORDS.some(kw => text.includes(kw));
}
```

## 四、Smithery API 集成

### 端点

| 端点 | 用途 | 认证 |
|------|------|------|
| `GET https://api.smithery.ai/servers` | 搜索 MCP 服务器 | Bearer token |
| `GET https://api.smithery.ai/skills` | 搜索 Skills | Bearer token |

### 服务器搜索参数

```
GET /servers?q=code&page=1&pageSize=20&verified=1
```

响应字段映射：

| Smithery 字段 | → MarketplaceItem 字段 |
|--------------|----------------------|
| qualifiedName | qualifiedName |
| displayName | name |
| description | description |
| iconUrl | iconUrl |
| useCount | useCount |
| score | score |
| verified | verified |
| createdAt | createdAt |
| homepage | homepage |

### Skills 搜索参数

```
GET /skills?q=code&page=1&pageSize=20&category=code
```

响应字段映射：

| Smithery 字段 | → MarketplaceItem 字段 |
|--------------|----------------------|
| id | qualifiedName |
| displayName | name |
| description | description |
| qualityScore / 100 | score (归一化到 0-1) |
| totalActivations | useCount |
| verified | verified |
| createdAt | createdAt |
| prompt | skillPrompt |
| categories | categories |

## 五、ModelScope MCP 集成

### 策略

ModelScope MCP 广场是 SPA，无公开 REST API 文档。采用两阶段策略：

1. **Phase 1（当前）**：通过浏览器 DevTools 逆向发现的内部 API 端点
   - 预期端点模式: `https://www.modelscope.cn/api/v1/mcp/servers?page=1&pageSize=20`
   - 如端点不可用或变更，静默降级为不显示 ModelScope 源
2. **Phase 2（未来）**：通过 `modelscope-mcp-server` 的 `search_mcp_servers` tool 获取

### 降级策略

```
ModelScope API 调用
  → 成功: 返回结果 + 标准化
  → 超时(5s): 返回空结果 + 降级提示
  → 403/404: 标记源不可用 + 30分钟内不重试
  → 其他错误: 返回空结果 + 错误日志
```

## 六、MarketplaceService 设计

### 注册与依赖

```typescript
// 新增服务接口
export interface IMarketplaceService {
  readonly _serviceBrand: undefined;

  // 搜索市场
  search(params: MarketplaceSearchParams): Promise<MarketplaceSearchResult>;

  // 安装 MCP 服务器（写入 mcp.json）
  installMCPServer(item: MarketplaceItem): Promise<void>;

  // 安装 Skill（调用 addSkill）
  installSkill(item: MarketplaceItem): Promise<void>;

  // 获取 Smithery API key 配置状态
  hasSmitheryApiKey(): boolean;
}

export const IMarketplaceService = createDecorator<IMarketplaceService>('marketplaceService');
```

### 缓存机制

```typescript
class MarketplaceCache {
  private cache = new Map<string, { data: MarketplaceSearchResult; timestamp: number }>();
  private TTL = 15 * 60 * 1000; // 15 分钟

  getCacheKey(params: MarketplaceSearchParams): string {
    return JSON.stringify(params);
  }

  get(key: string): MarketplaceSearchResult | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.timestamp > this.TTL) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.data;
  }

  set(key: string, data: MarketplaceSearchResult): void {
    this.cache.set(key, { data, timestamp: Date.now() });
    // 限制缓存大小
    if (this.cache.size > 100) {
      const oldest = this.cache.keys().next().value;
      if (oldest) this.cache.delete(oldest);
    }
  }
}
```

## 七、Settings UI 增强

### MCP Tab 新增市场浏览面板

```
┌─ MCP Tab ──────────────────────────────────────────────┐
│                                                         │
│  📦 MCP 市场浏览                                        │
│  ┌─────────────────────────────────┐  [排序 ▼] [过滤 ▼]│
│  │ 🔍 搜索 MCP 服务器...           │                    │
│  └─────────────────────────────────┘                    │
│                                                         │
│  ┌──────────────────────────────────────────────┐       │
│  │ 📦 filesystem-mcp            ✓ verified       │       │
│  │ Access local filesystem...                    │       │
│  │ ⬇ 12.5K uses · ⭐ 0.92 · 📅 2026-03-15      │       │
│  │                              [安装] [详情]     │       │
│  └──────────────────────────────────────────────┘       │
│  ┌──────────────────────────────────────────────┐       │
│  │ 📦 github-mcp                ✓ verified       │       │
│  │ GitHub API integration...                     │       │
│  │ ⬇ 8.3K uses · ⭐ 0.88 · 📅 2026-02-20       │       │
│  │                              [安装] [详情]     │       │
│  └──────────────────────────────────────────────┘       │
│  [加载更多...]                                           │
│                                                         │
│  ─────────────────────────────────────────────────      │
│                                                         │
│  ⚙️ 已安装的 MCP 服务器                                 │
│  （现有 MCPServersList 组件）                            │
│                                                         │
│  📝 打开 MCP 配置文件                                    │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Skill Tab 市场浏览改造

```
┌─ Skill Tab ────────────────────────────────────────────┐
│                                                         │
│  🧠 Skills 市场                                         │
│  ┌─────────────────────────────────┐  [排序 ▼] [分类 ▼]│
│  │ 🔍 搜索 Skills...               │                    │
│  └─────────────────────────────────┘                    │
│                                                         │
│  ┌──────────────────────────────────────────────┐       │
│  │ 🧩 code-reviewer               ✓ verified    │       │
│  │ Automated code review and...                  │       │
│  │ 🔥 2.1K activations · ⭐ 85 · 📅 2026-04-01  │       │
│  │                              [安装] [预览]     │       │
│  └──────────────────────────────────────────────┘       │
│  [加载更多...]                                           │
│                                                         │
│  ─────────────────────────────────────────────────      │
│                                                         │
│  ✅ 已安装技能                                           │
│  （现有 InstalledSkills 列表）                            │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### React 组件结构

```
MarketplaceBrowser (公共组件)
  ├─ SearchBar (搜索框 + 排序 + 过滤)
  ├─ MarketplaceItemCard (单个市场项卡片)
  │   ├─ 名称 + 图标 + verified 徽章
  │   ├─ 描述文本
  │   ├─ 指标行: useCount · score · createdAt
  │   ├─ 来源标签: [Smithery] [ModelScope]
  │   └─ 操作按钮: [安装] [详情/预览]
  └─ LoadMore (分页加载)
```

## 八、Smithery API Key 配置

在 `globalSettings` 中新增：

```typescript
// voidSettingsTypes.ts
interface GlobalSettings {
  // ... existing fields
  smitheryApiKey: string;  // Smithery API key
}
```

UI 位置：MCP Tab 或 General Tab 增加 Smithery API Key 输入框。

获取方式提示：访问 https://smithery.ai/account/api-keys 创建 API Key。

## 九、MCP 一键安装流程

```
用户点击 [安装] → MarketplaceService.installMCPServer(item)
  → 读取当前 mcp.json
  → 追加新服务器配置:
    {
      "mcpServers": {
        ...existing,
        "[item.qualifiedName]": {
          "command": item.installConfig.command,
          "args": item.installConfig.args,
          "env": { "API_KEY": "your-key-here" }  // 如需
        }
      }
    }
  → 写入 mcp.json
  → MCPService 自动检测文件变更 → 刷新服务器列表
  → 如需 API Key → 弹出提示引导用户配置
```

## 十、涉及文件清单

| 文件 | 改动说明 | 状态 |
|------|---------|------|
| `marketplaceService.ts` (新建) | MarketplaceService 接口 + 实现 | 待实现 |
| `marketplaceTypes.ts` (新建) | MarketplaceItem, SearchParams 等类型定义 | 待实现 |
| `smitheryApiClient.ts` (新建) | Smithery REST API 封装 | 待实现 |
| `modelscopeApiClient.ts` (新建) | ModelScope MCP API 封装 | 待实现 |
| `voidSettingsTypes.ts` | globalSettings 新增 smitheryApiKey | 待实现 |
| `Settings.tsx` | MCP Tab + Skill Tab UI 增强，新增 MarketplaceBrowser 组件 | 待实现 |
| `i18n/types.ts` | 新增市场浏览相关 i18n key | 待实现 |
| `i18n/locales/en.ts` | 英文翻译 | 待实现 |
| `i18n/locales/zh-cn.ts` | 中文翻译 | 待实现 |
