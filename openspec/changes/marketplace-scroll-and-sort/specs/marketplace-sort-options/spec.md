# 市场排序选项扩展能力（marketplace-sort-options）

## ADDED Requirements

### Requirement: 提供四种排序维度

市场浏览器必须（SHALL）提供以下四种排序选项，通过下拉菜单切换：

| 排序值 | 中文标签 | 排序逻辑 |
|--------|---------|---------|
| `default` | 默认排序 | 保持 API 返回的原始顺序，不做客户端重排 |
| `downloads` | 下载数量 | 按 `useCount` 字段降序排列 |
| `score` | 评分 | 按 `score` 字段降序排列 |
| `updated` | 更新时间 | 按 `updatedAt` 字段降序排列（最近更新在前） |

#### Scenario: 默认排序保持 API 原始顺序
- **WHEN** 用户选择"默认排序"
- **THEN** 搜索结果按 API 返回的原始顺序展示，不做客户端重排

#### Scenario: 按下载数量排序
- **WHEN** 用户选择"下载数量"
- **THEN** 搜索结果按 `useCount` 降序排列，下载量最多的排在最前

#### Scenario: 按评分排序
- **WHEN** 用户选择"评分"
- **THEN** 搜索结果按 `score` 降序排列，评分最高的排在最前

#### Scenario: 按更新时间排序
- **WHEN** 用户选择"更新时间"
- **THEN** 搜索结果按 `updatedAt` 降序排列，最近更新的排在最前
- **THEN** `updatedAt` 为空的条目排在最后

### Requirement: 默认选中"默认排序"

组件初始化时必须（SHALL）将排序选项设为 `default`。

#### Scenario: 组件首次渲染
- **WHEN** `MarketplaceBrowser` 组件首次挂载
- **THEN** 排序下拉菜单显示"默认排序"为当前选项

### Requirement: 排序选项中英文 i18n 支持

排序选项标签必须（SHALL）支持中英文国际化，通过 i18n key 提供翻译。

#### Scenario: 中文环境下显示中文标签
- **WHEN** 应用语言为简体中文
- **THEN** 排序选项显示为"默认排序""下载数量""评分""更新时间"

#### Scenario: 英文环境下显示英文标签
- **WHEN** 应用语言为英文
- **THEN** 排序选项显示为"Default""Downloads""Score""Updated"
