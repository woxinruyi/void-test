# 新增：斜杠命令 + 技能渐进式调用（add-slash-commands）

## 背景

三方设计对标（见 `temp-三方设计对标-YWCode-vs-Codex-vs-ClaudeCode.md`）显示：YWCode 的 Agent 核心机制已对齐 Codex / Claude Code，**最大差距在"扩展生态"**——Claude Code 的 slash command + skills + plugin 市场让用户把可复用工作流一键调起，YWCode 缺这一层。

现状（已存在的半套机制，本提案在其上扩展，不重造）：

- `common/voidSettingsTypes.ts:746` 已有 `SkillInfo`（id/name/description/url/enabled）+ `InstalledSkills`，来源为魔搭 Skills 市场（见 `mcp-marketplace-aggregation`）。
- `common/prompt/prompts.ts:770` 已把 `installedSkills` 以 `<agent_skills>` 块**被动注入系统提示**（仅 name+description）。

缺口：

1. **无斜杠命令**：聊天输入框不识别 `/<name>`，用户无法显式调起内置命令或某个技能。
2. **无渐进式披露**：技能只把 name+description 常驻提示，**完整指令/正文从不加载**（对比 Claude Code：描述常驻、正文按需加载），导致技能"形同摆设"且白占上下文。
3. **无本地自定义命令**：用户无法把"项目专属工作流"（如 `/review`、`/changelog`、`/test-this`）沉淀为可复用模板。

## 目标

- 在 Chat 输入层引入 **`/<command>` 斜杠命令**：以 `/` 开头时弹出可选命令列表（内置 + 已启用技能 + 本地自定义），选中后将其展开为本轮指令。
- **技能渐进式披露**：`/skill-name` 调起时才把该技能**完整正文**注入本轮上下文；未调起时维持现状（仅 description 常驻）。
- 支持 **本地文件型自定义命令**：工作区 `.void/commands/*.md`（front-matter 描述 + 正文模板），与技能统一进入斜杠命令注册表。
- 提供少量**内置命令**（如 `/plan`、`/review`、`/compact-context`、`/help`）。

## 非目标

- **不**改 Agent 循环 / 工具集 / 编辑机制（仅在"用户消息组装"前加一层命令展开）。
- **不**做插件市场打包分发（沿用现有 `mcp-marketplace-aggregation` / 魔搭技能安装）。
- **不**引入 Claude Code 式 plugin/hook 生态（hooks 由 `add-tool-hooks` 负责）。
- **不**改 `SkillInfo` 既有字段语义（仅新增可选 `body`/`bodyUrl` 用于渐进式正文）。

## 方案要点

1. **SlashCommandService（新服务，common/）**：聚合三类来源 → 统一 `SlashCommand { name, description, source: 'builtin'|'skill'|'local', expand(args): string|Promise<string> }` 注册表。
   - builtin：内置常量表。
   - skill：从 `InstalledSkills` 映射；`expand` 时按需拉取/读取技能正文（渐进式披露）。
   - local：读 `.void/commands/*.md`（front-matter `description` + 正文）。
2. **输入层接入**：React 侧栏输入框检测行首 `/` → 调 `SlashCommandService.list()` 渲染候选；提交时若消息以 `/<name>` 开头，先 `expand()` 再交给 `chatThreadService.addUserMessageAndStreamResponse`。
3. **渐进式注入**：被调起命令的展开正文作为**本轮**附加指令（用户消息前置 system-reminder 段），不进入常驻系统提示，避免污染缓存与上下文。
4. **DI 合规**：`registerSingleton(ISlashCommandService, …)` + `void.contribution.ts` import 同步。

## 影响范围

- 新增 `common/slashCommandService.ts`（接口 + 实现）、`common/builtinSlashCommands.ts`。
- 修改 React 侧栏输入组件（`browser/react/src/sidebar-tsx/SidebarChat.tsx` 一带）：`/` 候选 UI + 提交前展开。
- 修改 `chatThreadService` 调用点（接收展开后的指令；或在 service 内调用展开）。
- 扩展 `SkillInfo`（可选 `body?` / `bodyUrl?`）；`prompts.ts` 维持 description 常驻不变。
- `void.contribution.ts` 注册导入。

## 验收标准

1. 输入 `/` 弹出候选（内置 + 已启用技能 + 本地命令），选中可补全。
2. `/<skill-name>` 调起时，该技能**完整正文**进入本轮上下文并影响输出；未调起时上下文不含正文（渐进式披露生效，可由 token 计数或注入断言验证）。
3. `.void/commands/foo.md` 存在时 `/foo` 可用，正文模板被展开。
4. 至少 3 个内置命令可用（如 `/plan` `/review` `/help`）。
5. 关闭/无命令时聊天行为与改动前一致（普通消息不受影响）。
6. `npx tsc -p src/tsconfig.json --noEmit` 0 errors；新增确定性单测覆盖注册表聚合与 `expand()`。
