# 任务清单：市场浏览体验优化

## 1. 类型定义与排序逻辑

- [x] 1.1 修改 `marketplaceTypes.ts` 中 `MarketplaceSortBy` 类型：从 `'popular' | 'newest' | 'score'` 改为 `'default' | 'downloads' | 'score' | 'updated'`
- [x] 1.2 修改 `marketplaceService.ts` 中 `sortItems` 函数，适配新的排序类型（`default` 不排序、`downloads` 按 `useCount`、`score` 按 `score`、`updated` 按 `updatedAt`）

## 2. i18n 文案更新

- [x] 2.1 修改 `en.ts`：删除旧排序 key（`sortPopular`、`sortNewest`），新增 `sortDefault`、`sortDownloads`、`sortScore`、`sortUpdated`
- [x] 2.2 修改 `zh-cn.ts`：对应新增中文翻译（默认排序、下载数量、评分、更新时间）

## 3. UI 组件更新

- [x] 3.1 修改 `Settings.tsx` 中 `MarketplaceBrowser` 的排序下拉选项，替换为四个新排序值和对应 i18n key
- [x] 3.2 修改 `MarketplaceBrowser` 的 `sort` 初始状态从 `'popular'` 改为 `'default'`
- [x] 3.3 在 `MarketplaceBrowser` 的结果列表区域外层添加固定高度滚动容器（`max-h-[480px] overflow-y-auto`），搜索栏和"加载更多"按钮保持在容器外部

## 4. 编译验证

- [x] 4.1 确认 `watch-client` + `buildreact` 编译通过（0 errors）
