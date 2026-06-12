## Tasks

### Phase 1：渲染层修复（fix-trimend-typeerror 已实施）

- [x] 1. 修复 `ChatMarkdownRender.tsx` 中 `t.lang`/`t.raw` → `tk.lang`/`tk.raw`（3 处，第 305/306/313 行）
- [x] 2. 验证 `agent` 模式下 `edit_file`/`create_file_or_folder`/`rewrite_file` 工具已注册（`availableTools` 函数逻辑正确）
- [x] 3. 验证 `autoApprove.editsInWorkspace: true` 默认配置（工作区内编辑自动审批）
- [x] 4. 确认 `normal`/`gather` 模式按设计不支持编辑（`approvalTypeOfBuiltinToolName` 过滤逻辑正确）

### Phase 2：工具调用链路修复（2026-04-20 ~ 2026-04-21）

- [x] 5. 修复 `specialToolFormat` 配置错误：aiyiwei provider 走 `extensiveModelOptionsFallback` 返回 `anthropic-style`，导致原生工具和 XML 工具双路径丢失。修复：为 aiyiwei 添加显式模型配置 + `_forceOAIStyleTools` 辅助函数（`modelCapabilities.ts`）
- [x] 6. 运行时防护：`_sendOpenAICompatibleChat` 强制 `specialToolFormat = 'openai-style'`（`sendLLMMessage.impl.ts`）
- [x] 7. 修复 `toOpenAICompatibleTool` JSON Schema 合规性：`properties` 中每个参数添加 `type: 'string'` + 生成 `required` 数组（`sendLLMMessage.impl.ts`）
- [x] 8. 工具名别名映射：`write_to_file`→`rewrite_file`、`create_file`→`create_file_or_folder` 等 8 条映射（`chatThreadService.ts`）
- [x] 9. 参数名 fallback：`normalizeToolParams` 辅助函数，`path`→`uri`、`contents`→`new_content`、`diff`→`search_replace_blocks` 等（`toolsService.ts`）
- [x] 10. 相对路径自动补全为绝对路径：在 `create_file_or_folder`、`rewrite_file`、`edit_file` 的 `validateParams` 中添加路径解析（`toolsService.ts`）
- [x] 11. 系统提示词强化：Agent 模式系统消息中强调只使用定义的工具名 + 必须使用绝对路径（`prompts.ts`）
- [x] 12. TV-11 集成测试：验证所有 OAI 兼容 provider 不返回 `anthropic-style`（136/136 通过）

### Phase 3：验收

- [x] 13. 构建部署 + 实测：agent 模式下创建文件成功（用户 2026-04-22 确认）
