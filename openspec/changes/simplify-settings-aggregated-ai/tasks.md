# 任务清单（simplify-settings-aggregated-ai）

## 1. 需求澄清
- [x] 确认保留：聚合 AI（aiyiwei）、OpenAI-Compatible、本地服务商（ollama/vLLM/lmStudio）。
- [x] 调研 ModelScope 官方 MCP server 接入方式（`uvx modelscope-mcp-server` + `MODELSCOPE_API_TOKEN`）。

## 2. 设计落地
- [x] 调整 `Settings.tsx` 导航，仅保留 `models` / `mcp` 两项。
- [x] models tab：聚合AI section（aiyiwei）+ OpenAI-Compatible section。
- [x] models tab：新增本地服务商 section（ollama / vLLM / lmStudio，各自独立卡片）。
- [x] 隐藏其他云服务商（anthropic/openAI/deepseek 等），数据存储不删除。
- [x] MCP tab：ModelScope 预设卡片 + JSON 示例 + 添加按钮 + MCPServersList。
- [x] 更新 `MCP_CONFIG_SAMPLE` 默认内容，加入 modelscope-mcp-server 预设（key 已对齐）。
- [x] 覆盖相关文案（i18n en.ts / zh-cn.ts / types.ts）。

## 3. 编码与验证
- [x] `npm run compile` 无构建错误（编译通过）。
- [x] 本地启动应用（`Void.exe` dev 模式），设置面板可打开。
- [ ] 手动验证 UI 呈现：模型 Tab 展示三个 section；MCP Tab 展示 ModelScope 卡片。
- [ ] 手动验证 MCP 示例可写入 `mcp.json` 并刷新后显示状态。

## 4. 文档与归档
- [x] OpenSpec `proposal.md` 已创建。
- [x] OpenSpec `design.md` 已更新（含本地服务商布局）。
- [x] OpenSpec `tasks.md` 已更新（当前文件）。
- [ ] 变更完成后归档 change 状态。
