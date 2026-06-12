# Agent 工具调用机制分析与修复报告

> 日期: 2026-04-20
> 范围: 文件创建 (`create_file_or_folder`) / 文件修改 (`edit_file`, `rewrite_file`) 工具在 Agent 模式下的调用链路

---

## 一、当前实现方案

### 1.1 工具定义层

文件: `src/vs/workbench/contrib/void/common/prompt/prompts.ts`

编辑器内置了 31+ 个工具，文件操作相关的核心工具：

| 工具名 | 功能 | 参数 | 审批类型 |
|--------|------|------|----------|
| `create_file_or_folder` | 创建文件或文件夹 | `uri` (路径末尾加 `/` 则创建文件夹) | `edits` |
| `edit_file` | SEARCH/REPLACE 块编辑文件 | `uri`, `search_replace_blocks` | `edits` |
| `rewrite_file` | 全量覆写文件内容 | `uri`, `new_content` | `edits` |
| `batch_edit` | 批量编辑多个文件 | `edits` (JSON 数组) | `edits` |
| `delete_file_or_folder` | 删除文件或文件夹 | `uri`, `is_recursive` | `edits` |

### 1.2 工具暴露给 LLM 的两条路径

Void 使用**双轨制**将工具定义传递给 LLM：

#### 路径 A: Native Function Calling（原生工具调用）

```
getModelCapabilities() → specialToolFormat === 'openai-style'
  → openAITools() → toOpenAICompatibleTool()
  → API 请求体 { tools: [...] }
  → LLM 返回 delta.tool_calls[0].function.name / .arguments
  → rawToolCallObjOfParamsStr() 解析
```

工具以 OpenAI SDK 的 `ChatCompletionTool` 格式附在请求体中：

```json
{
  "tools": [{
    "type": "function",
    "function": {
      "name": "create_file_or_folder",
      "description": "Create a file or folder...",
      "parameters": {
        "type": "object",
        "properties": { "uri": { "description": "..." } }
      }
    }
  }]
}
```

LLM 通过结构化的 `tool_calls` 字段返回调用请求，SDK 自动解析。

#### 路径 B: XML Text Parsing（XML 文本解析）

```
getModelCapabilities() → specialToolFormat === undefined
  → systemToolsXMLPrompt() → XML 工具定义注入 system message
  → LLM 在文本中输出 <tool_name><param>value</param></tool_name>
  → extractXMLToolsWrapper() 从文本流中解析
```

工具以 XML 格式写入系统提示：

```
Available tools:
  1. create_file_or_folder
  Description: Create a file or folder at the given path...
  Format:
  <create_file_or_folder>
  <uri>Full path of the file or folder</uri>
  </create_file_or_folder>
```

LLM 需要在回复文本末尾按此 XML 格式输出工具调用，由 `extractXMLToolsWrapper()` 逐字符流式解析。

### 1.3 路径选择逻辑

```
convertToLLMMessageService._generateChatMessagesSystemMessage()
  → includeXMLToolDefinitions = !specialToolFormat
  → 如果 specialToolFormat 存在: 不注入 XML 工具定义到 system message
  → 如果 specialToolFormat 不存在: 注入 XML 工具定义

sendLLMMessage.impl.ts._sendOpenAICompatibleChat()
  → nativeToolsObj = (specialToolFormat === 'openai-style') ? { tools: [...] } : {}
  → 如果 !specialToolFormat: 启用 extractXMLToolsWrapper 解析
```

**关键判断点**: `specialToolFormat` 的值决定走哪条路径。

### 1.4 工具执行层

文件: `src/vs/workbench/contrib/void/browser/chatThreadService.ts`

```
LLM 返回 toolCall → chatThreadService._runToolCall()
  → toolsService.validateParams[toolName]() 验证参数
  → resolveAutoApprove() 检查是否需要人工审批
  → toolsService.callTool[toolName]() 执行工具
  → toolsService.stringOfResult[toolName]() 格式化结果
  → 结果作为 tool_result 消息加入对话，继续 Agent Loop
```

`create_file_or_folder` 的实际执行 (`toolsService.ts`):

```typescript
create_file_or_folder: async ({ uri, isFolder }) => {
    if (isFolder)
        await fileService.createFolder(uri)
    else {
        await fileService.createFile(uri)
    }
    return { result: {} }
}
```

### 1.5 审批机制

`create_file_or_folder` 的审批类型为 `edits`，对应的自动审批设置:

- `editsInWorkspace: true` (默认) → 工作区内文件操作自动批准
- `editsOutsideWorkspace: false` (默认) → 工作区外文件操作需手动批准

---

## 二、之前的实现错误

### 2.1 问题现象

用户在 Agent 模式下要求创建文件（如需求分析文档），LLM 正常回复了文本内容，但**没有调用 `create_file_or_folder` 工具**，文件未被创建。

### 2.2 根本原因：`specialToolFormat` 配置错误

`aiyiwei` 是项目使用的聚合 AI Provider（OAI 兼容），其 `modelOptionsFallback` 直接委托 `extensiveModelOptionsFallback()`：

```typescript
// 修复前
const aiyiweiSettings: VoidStaticProviderInfo = {
    modelOptionsFallback: (modelName) => extensiveModelOptionsFallback(modelName),
    modelOptions: {},  // 空！没有任何显式模型配置
}
```

`extensiveModelOptionsFallback()` 根据模型名推断能力。对于 `claude-*` 模型名：

```typescript
// extensiveModelOptionsFallback 中的逻辑
if (lower.includes('claude'))
    return toFallback(anthropicModelOptions, 'claude-3-7-sonnet-20250219')
```

这会返回 **`specialToolFormat: 'anthropic-style'`**。

### 2.3 错误传播链

```
用户选择 aiyiwei/claude-sonnet-4-6
  → getModelCapabilities('aiyiwei', 'claude-sonnet-4-6')
  → extensiveModelOptionsFallback() 匹配 'claude'
  → 返回 { specialToolFormat: 'anthropic-style', ... }

_sendOpenAICompatibleChat():
  → specialToolFormat === 'anthropic-style' (≠ 'openai-style')
  → nativeToolsObj = {}  ← 工具未附在请求体中！
  → !specialToolFormat === false
  → extractXMLToolsWrapper 也未启用！

convertToLLMMessageService:
  → includeXMLToolDefinitions = !specialToolFormat = false
  → XML 工具定义也未注入系统提示！

结果：
  → API 请求无 tools 字段
  → System message 无工具定义
  → LLM 完全不知道有任何工具可用
  → LLM 只能输出纯文本回复
```

**本质**: `anthropic-style` 是一个"两边都不靠"的值 —— 不等于 `'openai-style'`（不触发原生工具），也不等于 `undefined`（不触发 XML 解析），导致工具在两条路径上都被丢弃。

### 2.4 影响范围

此 bug 不仅影响 `aiyiwei`，还影响所有使用 `_sendOpenAICompatibleChat` 且通过 `extensiveModelOptionsFallback` 解析 claude 模型名的 provider：

| Provider | 模型名 | 返回的 specialToolFormat | 影响 |
|----------|--------|-------------------------|------|
| aiyiwei | claude-* | `anthropic-style` | ❌ 工具完全丢失 |
| openRouter | claude-3.5-sonnet | `anthropic-style` | ❌ 同上 |
| vLLM | claude-* | `anthropic-style` | ❌ 同上 |
| ollama | claude-* | `anthropic-style` | ❌ 同上 |
| openAICompatible | claude-* | `anthropic-style` | ❌ 同上 |
| liteLLM | claude-* | `anthropic-style` | ❌ 同上 |
| lmStudio | claude-* | `anthropic-style` | ❌ 同上 |

### 2.5 为什么测试没发现

现有单元测试（`toolValidation.test.ts`）覆盖的是：
- 工具名完整性 (builtinToolNames 包含所有工具)
- 审批类型分类正确
- LCS 模糊匹配算法
- 系统提示 XML 标签注入

**缺失的测试层**：没有任何测试验证 `getModelCapabilities(provider, model)` 对特定 provider 返回的 `specialToolFormat` 是否与该 provider 的传输协议兼容。这是一个**配置-集成层**的测试空白。

---

## 三、修复方案

### 3.1 修复 1: 配置层（`modelCapabilities.ts`）

#### a) 为 aiyiwei 添加显式模型配置

```typescript
const aiyiweiModelOptions = {
    'claude-sonnet-4-6': {
        contextWindow: 200_000,
        specialToolFormat: 'openai-style',
        supportsSystemMessage: 'system-role',
        reasoningCapabilities: { supportsReasoning: true, ... },
        ...
    },
    'claude-opus-4-6': { ... },
    'claude-haiku-4-5-20251001': { ... },
    'claude-opus-4-1-20250805-thinking': { ... },
}
```

#### b) 为 aiyiwei 的 fallback 强制覆盖格式

```typescript
modelOptionsFallback: (modelName) => {
    const res = extensiveModelOptionsFallback(modelName)
    if (res) {
        // 强制 openai-style
        if (!res.specialToolFormat || res.specialToolFormat === 'anthropic-style'
            || res.specialToolFormat === 'gemini-style') {
            res.specialToolFormat = 'openai-style'
        }
        return res
    }
    // 未知模型的安全默认值
    return { ..., specialToolFormat: 'openai-style' }
}
```

#### c) 为所有 OAI 兼容聚合 provider 添加统一辅助函数

```typescript
const _forceOAIStyleTools = (res) => {
    if (res && (res.specialToolFormat === 'anthropic-style'
        || res.specialToolFormat === 'gemini-style')) {
        res.specialToolFormat = 'openai-style'
    }
    return res
}
```

应用于: `openRouter`, `vLLM`, `ollama`, `openAICompatible`, `liteLLM`, `lmStudio`

### 3.2 修复 2: 运行时防护（`sendLLMMessage.impl.ts`）

在 `_sendOpenAICompatibleChat` 函数入口添加运行时防护，作为安全网：

```typescript
const {
    specialToolFormat: rawToolFormat,
    ...
} = getModelCapabilities(providerName, modelName_, overridesOfModel)

// Runtime guard: 此函数所有调用者都使用 OpenAI SDK
// 唯一有效的工具格式是 'openai-style'
const specialToolFormat = 'openai-style' as typeof rawToolFormat
```

这确保即使配置层遗漏，工具也不会丢失。

### 3.3 修复 3: 补充集成测试（`toolValidation.test.ts` + `tv11-provider-tool-format.mjs`）

新增 TV-11 测试套件，验证：
1. 所有 OAI 兼容 provider 不返回 `anthropic-style` / `gemini-style`
2. `aiyiwei` 对任意模型名严格返回 `openai-style`
3. aiyiwei 4 个核心模型走显式匹配 (`explicit`)，非 fallback

---

## 四、修复效果验证

### 测试结果: 136/136 通过

```
============================================================
 TV-11: Provider-ToolFormat 集成测试结果
============================================================
总计: 136  通过: 136  失败: 0

✅ ALL PASSED

--- aiyiwei 核心模型专项 ---
  ✅ aiyiwei/claude-sonnet-4-6 => openai-style (explicit) reasoning:true
  ✅ aiyiwei/claude-opus-4-6 => openai-style (explicit) reasoning:true
  ✅ aiyiwei/claude-haiku-4-5-20251001 => openai-style (explicit) no-reasoning
  ✅ aiyiwei/claude-opus-4-1-20250805-thinking => openai-style (explicit) reasoning:true
```

---

## 五、架构对比

### 5.1 Void 的双轨制 vs 竞品

| 特性 | Void | Cursor | Windsurf | Claude Code |
|------|------|--------|----------|-------------|
| 工具传递方式 | 原生 + XML fallback | 原生 function calling | 原生 function calling | 原生 function calling |
| 格式判断 | `specialToolFormat` 三值 | 按 provider 固定 | 按 provider 固定 | 仅 Anthropic SDK |
| 错误风险 | 高（三值任一错误→丢工具） | 低 | 低 | 无 |

### 5.2 Void 双轨制的问题

- `specialToolFormat` 有 4 种可能值: `'openai-style'`, `'anthropic-style'`, `'gemini-style'`, `undefined`
- 每种值在不同上下文有不同含义
- **provider 层**和 **transport 层**的 `specialToolFormat` 可能不一致
- XML fallback 依赖 LLM 严格遵循格式，可靠性低

### 5.3 建议

长期应将 `specialToolFormat` 从**模型属性**提升为 **provider 级别的 transport 属性**，由 transport 函数（`_sendOpenAICompatibleChat` / `sendAnthropicChat` / `sendGeminiChat`）自行决定工具格式，而不是依赖 `modelCapabilities` 中的配置。

---

## 六、修改文件清单

| 文件 | 修改内容 |
|------|----------|
| `common/modelCapabilities.ts` | 新增 `aiyiweiModelOptions` (4个核心模型)<br>新增 `_forceOAIStyleTools` 辅助函数<br>修改 7 个 provider 的 `modelOptionsFallback`<br>注册 `defaultModelsOfProvider.aiyiwei` |
| `electron-main/llmMessage/sendLLMMessage.impl.ts` | `_sendOpenAICompatibleChat` 添加运行时防护 |
| `test/common/toolValidation.test.ts` | 新增 TV-11 测试套件 |
| `test/tv11-provider-tool-format.mjs` | 独立测试脚本 |
