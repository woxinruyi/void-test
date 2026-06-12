# 简化设置面板：聚焦聚合 AI 与 ModelScope MCP（simplify-settings-aggregated-ai）

## 背景
- 当前设置面板包含多个模型提供商、功能开关、索引、MCP 等复杂入口，初次使用者需要在大量配置中寻找真正可用的聚合 AI（aiyiwei）服务。
- 历次客户反馈希望“开箱即用”：通过聚合服务即可访问国内外模型，同时保留自定义 OpenAI-Compatible 端点以便复用已有兼容接口。
- 最新需求明确指出：**设置页面暂时只保留聚合 AI 配置、OpenAI-Compatible 入口以及 MCP 服务器（新增国内魔搭 ModelScope 的预设）**，其余模型/提供商/复杂选项应隐藏，避免干扰。

## 目标
1. 设置页面默认仅展示：
   - 聚合 AI（Void Aggregated / aiyiwei）的官方说明与 API Key 配置。
   - OpenAI-Compatible 端点（Base URL + API Key）。
   - MCP 服务器区块，内置 ModelScope 官方 MCP 服务器的一键配置指引。
2. 保证被隐藏的其它 provider / 功能配置仍保留在现有状态存储中（不删除历史数据），以便后续恢复时无需迁移。
3. 在设置 UI 中向用户明确指引如何启用 ModelScope MCP（命令/环境变量示例）。
4. 维持现有聚合 AI 功能、OpenAI 兼容调用、MCP 客户端功能的正常工作。

## 非目标
- 不改动模型推理/调用逻辑，只调整设置面板展现与默认模板。
- 不删除其它 provider 在 `voidSettingsService` 中的默认配置与存储结构。
- 不引入新的支付/账号接入逻辑，只提供文档级指引。
- 不在本次变更中恢复/替换其它高级设置；一切隐藏面板将在后续需求中按需恢复。

## 成功衡量
- 打开设置页时仅看到聚合 AI、OpenAI-Compatible 配置与 MCP 区域，且文案聚焦聚合入口。
- `mcp.json` 示例或 UI 提示包含可直接粘贴的 ModelScope MCP 配置。
- 本地运行 `npm run compile` 以及设置界面手动验证通过。
- OpenSpec 变更档案（proposal/design/tasks）完整可读，便于后续增量迭代。
