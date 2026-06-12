## 规格说明：Agent 模式下文件操作功能恢复

### 场景 1：Agent 模式创建文件
- **前置**：`chatMode === 'agent'`，`autoApprove.editsInWorkspace === true`
- **操作**：LLM 返回 `create_file_or_folder` tool call
- **预期**：工具自动审批通过，文件创建成功，代码块渲染正常显示

### 场景 2：Agent 模式编辑文件
- **前置**：`chatMode === 'agent'`，`autoApprove.editsInWorkspace === true`
- **操作**：LLM 返回 `edit_file` tool call
- **预期**：工具自动审批通过，搜索替换块正确应用，代码块渲染正常显示，Apply 按钮可用

### 场景 3：Agent 模式重写文件
- **前置**：`chatMode === 'agent'`，`autoApprove.editsInWorkspace === true`
- **操作**：LLM 返回 `rewrite_file` tool call
- **预期**：工具自动审批通过，文件内容完整替换，代码块渲染正常显示

### 场景 4：代码块渲染不崩溃
- **前置**：LLM 返回含代码块的 Markdown（含 ` ```lang ... ``` ` token）
- **操作**：`RenderToken` 组件渲染 `code` 类型 token
- **预期**：`tk.lang` 和 `tk.raw` 正确引用 token 变量，无 TypeError，Apply 按钮正常显示

### 场景 5：Normal/Gather 模式不支持编辑（按设计）
- **前置**：`chatMode === 'normal'` 或 `chatMode === 'gather'`
- **操作**：LLM 无法调用 `edit_file`/`create_file_or_folder`/`rewrite_file`
- **预期**：工具列表不含编辑工具，LLM 仅使用对话或只读工具

### 场景 6：工作区外编辑文件需人工审批
- **前置**：`chatMode === 'agent'`，`autoApprove.editsInWorkspace === true`，`autoApprove.editsOutsideWorkspace !== true`，目标文件在工作区外
- **操作**：LLM 返回 `edit_file` tool call，文件路径在工作区外
- **预期**：显示 Approve/Cancel/Trust Session/Trust Permanent 按钮，用户点击 Approve 后工具执行

### 场景 7：Apply 按钮状态流转
- **前置**：`edit_file` 工具已执行成功，`streamState === 'idle-has-changes'`
- **操作**：用户查看 EditTool 卡片
- **预期**：显示 ✗（Remove）和 ✓（Keep）按钮；点击 Keep 后 `editCodeService.acceptOrRejectAllDiffAreas({ behavior: 'accept' })`，按钮消失（`streamState → 'idle-no-changes'`）

### 场景 8：LLM 运行期间 Apply 按钮隐藏
- **前置**：LLM 正在流式输出，`isRunning === 'LLM'`
- **操作**：用户查看已有变更的 EditTool 卡片
- **预期**：Apply/Reject 按钮不显示，避免用户在 LLM 仍在修改文件时 Apply 导致冲突

### 场景 9：模式切换即时生效
- **前置**：当前 `chatMode === 'gather'`
- **操作**：用户通过 ChatModeDropdown 切换为 `agent`
- **预期**：`voidSettingsService.setGlobalSetting('chatMode', 'agent')` 立即生效，后续 LLM 调用可使用编辑工具

### 场景 10：Trust Permanent 持久化自动审批
- **前置**：编辑工具需人工审批，用户点击 Trust Permanent
- **操作**：`voidSettingsService.setGlobalSetting('autoApprove', { ...cur, editsInWorkspace: true, editsOutsideWorkspace: true })`
- **预期**：后续同类操作自动通过，无需再次审批；设置持久化到 globalSettings
