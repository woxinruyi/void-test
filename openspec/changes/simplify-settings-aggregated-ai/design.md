# 设计说明（simplify-settings-aggregated-ai）

## 1. 整体页面结构

导航仅保留 `models`、`mcp` 两项。其余 Tab（localProviders、providers、featureOptions、codeIndex、general）**不渲染**，但对应存储数据不删除。

```
侧边导航 (1/4)        主内容区 (3/4)
     
[] 模型              标题: Void 设置 / 分隔线
[ ] MCP 服务器        (根据选中 Tab 切换)
```

---

## 2. Tab: 模型（Models）

### 2.1 布局

```
h2: 模型概览
p(灰色): 介绍文案

 section 1: 聚合 AI（Void 聚合）
  h3 + ChatMarkdownRender 说明
  卡片: SettingsForProvider aiyiwei
        showProviderTitle=false, showProviderSuggestions=false
         API Key 输入框 / 模型列表（刷新+勾选）

 section 2: OpenAI-Compatible
  h3 + ChatMarkdownRender 说明
  卡片: SettingsForProvider openAICompatible
        showProviderTitle=false, showProviderSuggestions=false
         Base URL / API Key / 模型列表

 section 3: 本地服务商（Local Providers）
  h3 + p(灰色) 说明
  卡片 x3（各自独立）:
    SettingsForProvider ollama    showProviderTitle=true
    SettingsForProvider vLLM      showProviderTitle=true
    SettingsForProvider lmStudio  showProviderTitle=true
```

### 2.2 隐藏的 providers（不渲染）

`anthropic` / `openAI` / `deepseek` / `openRouter` / `gemini` / `groq` / `xAI` / `mistral` / `googleVertex` / `microsoftAzure` / `awsBedrock` / `liteLLM`

---

## 3. Tab: MCP 服务器

```
h2: MCP  +  p(灰色) 介绍文案

卡片: 魔搭 ModelScope 预设
  h3 + ChatMarkdownRender 说明（uvx + MODELSCOPE_API_TOKEN）
  ChatMarkdownRender JSON 示例代码块:
    { "mcpServers": { "modelscope-mcp-server": {
        "command": "uvx", "args": ["modelscope-mcp-server"],
        "env": { "MODELSCOPE_API_TOKEN": "your-token" }
    }}}

[添加 MCP 服务器]  mcpService.revealMCPConfigFile()

MCPServersList: 名称 + 状态(运行/停止/错误) + 启动命令
```

---

## 4. 交互行为

| 行为 | 响应 |
|---|---|
| 点击侧边 Tab | 切换主内容，`window.scrollTo(top)` |
| 各 provider 卡片 | 独立滚动，不联动整页 |
| "添加 MCP 服务器" 按钮 | 打开 `mcp.json` |
| 其他云服务商 | 不渲染，存储数据不变 |

---

## 5. 国际化键（已实现）

| 键 | 用途 |
|---|---|
| `settings.models.title/intro` | 模型页标题与介绍 |
| `settings.models.aggregated.title/desc` | 聚合AI section |
| `settings.models.openAI.title/desc` | OpenAI-C section |
| `settings.localProviders.title/desc` | 本地服务商 section |
| `settings.mcp.modelscope.title/desc/sample` | ModelScope 预设卡片 |

---

## 6. 验证标准

1. `npm run compile` 0 错误通过。
2. 启动应用，打开设置面板：
   - 左侧仅显示「模型」「MCP 服务器」两个导航项。
   - 模型区依次展示：聚合AI  OpenAI-Compatible  本地服务商（Ollama / vLLM / LM Studio）。
   - 其他云服务商不出现在界面上。
   - MCP 区包含 ModelScope 示例 JSON，点击按钮能打开 `mcp.json`。
3. 本地已有 provider 配置数据不丢失（存储层不动）。
