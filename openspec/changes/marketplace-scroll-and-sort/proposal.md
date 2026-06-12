# 市场浏览体验优化（marketplace-scroll-and-sort）

## 背景

MCP 市场和技能（Skill）市场的浏览列表当前没有固定高度容器，数据加载后整个设置页面会被撑长，导致用户需要在整个页面范围内滚动才能浏览列表和操作其他设置项。同时，现有排序选项（`popular` / `newest` / `score`）语义不够直观，缺少"更新时间"维度，且没有"默认排序"兜底选项。

## 目标

1. **固定高度滚动容器**：MCP 市场和 Skill 市场列表区域各自拥有固定高度的可滚动容器，避免整个设置页面被撑长滚动。
2. **排序选项补全**：提供四种排序维度——下载数量、评分、更新时间、默认排序，替换当前的 `popular` / `newest` / `score`。

## 非目标 / Non-goals

- 不涉及数据获取链路修改（API 请求、CORS、WAF 等）。
- 不涉及 Smithery 数据源的排序逻辑。
- 不涉及分页策略变更（仍保留"加载更多"按钮）。
- 不涉及市场卡片样式重设计。

## 变更内容

- **固定高度滚动容器**：`MarketplaceBrowser` 组件的结果列表区域包裹在一个固定高度（如 `max-h-[480px]`）的 `overflow-y-auto` 容器中，搜索栏和加载更多按钮保持在容器外部。
- **排序选项调整**：将 `MarketplaceSortBy` 类型从 `'popular' | 'newest' | 'score'` 改为 `'default' | 'downloads' | 'score' | 'updated'`，对应"默认排序""下载数量""评分""更新时间"四个选项。
- **排序逻辑更新**：`marketplaceService.ts` 中的 `sortItems` 函数适配新的排序类型。
- **i18n 文案更新**：`en.ts` 和 `zh-cn.ts` 中更新排序选项的翻译文案。

## 能力（Capabilities）

### 新增能力
- `marketplace-fixed-scroll`：市场浏览列表固定高度滚动容器能力
- `marketplace-sort-options`：市场排序选项扩展能力（四种排序维度）

### 修改能力
（无已有 spec 需要修改）

## 影响

- **`Settings.tsx`**：`MarketplaceBrowser` 组件结构调整（添加滚动容器、更新排序下拉）
- **`marketplaceTypes.ts`**：`MarketplaceSortBy` 类型定义变更
- **`marketplaceService.ts`**：`sortItems` 排序函数逻辑更新
- **`en.ts` / `zh-cn.ts`**：排序选项 i18n key 增删
- **无 API 变更**、无新增依赖
