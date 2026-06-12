# 实施任务：工具审批策略分层信任模型（improve-tool-approval-policy）

## 1. 阶段 A — 类型扩展与迁移

- [x] 1.1 在 `src/vs/workbench/contrib/void/common/voidSettingsTypes.ts` 新增 `TrustLevel`、`AutoApproveSettings`、`TRUST_LEVEL_PRESETS`、`DEFAULT_TERMINAL_ALLOWLIST` 常量与类型
- [x] 1.2 修改 `GlobalSettings.autoApprove` 字段类型为 `AutoApproveSettings`；新增可选 `trustLevel?: TrustLevel`
- [x] 1.3 更新 `defaultGlobalSettings`：`autoApprove = {}`、`trustLevel` 不设默认（强制用户在 Onboarding 选择）
- [x] 1.4 在 `voidSettingsService.ts` 的持久化读取入口新增 `migrateAutoApprove(stored)` 函数，识别旧字段 `edits` / `terminal` / `MCP tools` 并迁移到新字段，迁移后写回
- [ ] 1.5 为迁移逻辑添加单元测试（待补），覆盖空对象、全真、部分真、未知字段四种情况

## 2. 阶段 B — 判定函数与链路接入

- [x] 2.1 新增 `src/vs/workbench/contrib/void/common/helpers/autoApprove.ts`，实现 `resolveAutoApprove`、`matchesAllowlist`、`isInWorkspace` 三个纯函数
- [ ] 2.2 为 `resolveAutoApprove` 添加单元测试（本轮补齐）：workspace 内外 edits、allowlist 命中/未命中、MCP per-server 覆盖 mcpAll、未知 approvalType、旧结构兼容
- [ ] 2.3 为 `matchesAllowlist` 添加边界测试（本轮补齐）：前缀含/不含空格、完整命令匹配、非字首匹配应被拒
- [x] 2.4 修改 `src/vs/workbench/contrib/void/browser/chatThreadService.ts` 约 line 644：将 `autoApprove[approvalType]` 查表改为 `resolveAutoApprove(...)` 调用
- [x] 2.5 在 `chatThreadService` 内新增 per-thread `_sessionAutoApproveOverrides: Map<threadId, Partial<AutoApproveSettings>>`，优先级高于全局 `autoApprove`

## 3. 阶段 C — Onboarding 信任级别选择

- [ ] 3.1 新增 `src/vs/workbench/contrib/void/browser/react/src/void-onboarding/TrustLevelSelector.tsx`（延后：已在 Settings 提供） 组件：三卡片单选，每卡片含标题、一句描述、3 条具体行为
- [ ] 3.2 在 `VoidOnboarding.tsx`（延后） 第 2 页末尾嵌入 `TrustLevelSelector`；默认选中 `standard` 但 UI 上显示未高亮状态，要求用户显式点击
- [ ] 3.3 选中后调用 `voidSettingsService.setGlobalSetting（延后）('trustLevel', level)` 与 `setGlobalSetting('autoApprove', TRUST_LEVEL_PRESETS[level])`
- [ ] 3.4 第 2 页"下一步/完成"按钮（延后） `disabled` 状态：`trustLevel === undefined` 时禁用
- [ ] 3.5 在 `i18n/types.ts` + `en.ts` + `zh-cn.ts` 新增 `onboarding.trust.*`（延后） 键位（标题、三级描述、每级 3 条行为说明）

## 4. 阶段 D — Settings 页"AI 信任与审批"分区

- [x] 4.1 在 `Settings.tsx` 的 `Tools` 分区顶部（实际落点为 Tools）新增 "AI 信任与审批"子分区，复用 `TrustLevelSelector`
- [x] 4.2 `TrustLevelSelector` 下方新增可折叠"高级（覆盖预设）"区块，展示每个 `AutoApproveSettings` 字段独立开关
- [x] 4.3 终端 allowlist 编辑器：`VoidInputBox2` 多行版本，每行一个 pattern；保存时写回 `autoApprove.terminalAllowlistPatterns`
- [ ] 4.4 显示"当前 MCP servers"（延后：mcpAll 全局开关已提供）与每个 server 的 `mcpPerServer[name]` 开关（列表从 `mcpService.getMCPTools()` 聚合得出）
- [x] 4.5 若检测到迁移发生（存在旧字段），在分区顶部显示一条可关闭提示条，说明迁移结果
- [x] 4.6 新增 `settings.trust.*` i18n 键位

## 5. 阶段 E — tool_request 卡片"信任此类"按钮

- [x] 5.1 在 `SidebarChat.tsx` 的 tool_request 卡片模板中新增两个次级按钮，UI 使用现有 `IconShell1` 风格
- [x] 5.2 "本会话信任此类"点击：计算当前 tool 对应的 `AutoApproveSettings` 字段（例如 `editsInWorkspace`），写入 `chatThreadService._sessionAutoApproveOverrides[threadId]`，随后调用 `approveLatestToolRequest`
- [x] 5.3 "永久信任此类"点击：直接 `setGlobalSetting('autoApprove', { ...current, [字段]: true })` 后 `approveLatestToolRequest`
- [x] 5.4 卡片上显示上下文提示："将自动通过 本工作区 的所有编辑" / "将自动通过 匹配 git status 的命令" 等
- [x] 5.5 新增 `chat.tool.trust.*` i18n 键位

## 6. 阶段 F — 文案与验收

- [x] 6.1 审阅新增的所有 i18n 键位，确保 `en` / `zh-cn` 两侧零缺失
- [x] 6.2 运行 `npm run buildreact` 确认无 TS 错误
- [ ] 6.3 运行单元测试（本轮补齐）（迁移 + resolveAutoApprove + matchesAllowlist），全部通过
- [x] 6.4 运行 `npm run gulp vscode-win32-x64`（26 min, exit 0） 重建免安装目录；以 `--user-data-dir` 启动，按 spec 的 Scenario 逐项目测
- [ ] 6.5 旧用户升级场景（待用户实测验收）：手动构造包含 `autoApprove.edits: true` 的 `user-data-dir`，验证迁移后 `editsInWorkspace` 与 `editsOutsideWorkspace` 均为 true 且迁移提示条显示

## 6A. Addendum（对齐 Cursor/Windsurf 默认）— 2026-04-18 追加

- [x] 6A.1 `defaultGlobalSettings.trustLevel = 'standard'` + `autoApprove` 预设指向 `TRUST_LEVEL_PRESETS.standard`（`voidSettingsTypes.ts`）
- [x] 6A.2 扩充 `DEFAULT_TERMINAL_ALLOWLIST` 到 75 条（十类分组，严格排除破坏性/联网/权限提升命令）
- [x] 6A.3 `matchesAllowlist` 新增 shell 元字符护栏（`| > >> && || ; $( \` &` 任一命中即拒绝）
- [x] 6A.4 补 22 条单元测试（9 shell-metachar 边界 + 13 白名单正反例），合计 65 passing
- [x] 6A.5 `spec.md` 同步：更新 "干净首启" Scenario、新增 "shell 元字符护栏" 与 "默认白名单安全边界" 两个 Requirement
- [x] 6A.6 `proposal.md` 追加 Addendum 小节记录动机、影响与测试数据
- [ ] 6A.7 用户实机验收：清 `.tmp/user-data-dev` 重启 Void Dev，验证 Settings "标准"卡片默认高亮 + AI 编辑项目内文件不弹审批 + `git status` 自动执行

## 7. 归档与交付

- [ ] 7.1 运行 `openspec validate improve-tool-approval-policy` 通过
- [ ] 7.2 提交变更并在 PR 描述中链接 `proposal.md` / `design.md` / `specs/tool-approval-policy/spec.md`
- [ ] 7.3 按 `/opsx-archive` 流程归档本 change，在 `openspec/specs/` 下落盘 `tool-approval-policy` 能力
