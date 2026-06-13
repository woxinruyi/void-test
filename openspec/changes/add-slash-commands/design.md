# 设计：斜杠命令 + 技能渐进式调用

## 现状与切入点

- 技能元数据：`SkillInfo`（`voidSettingsTypes.ts:746`），存于 settings（`InstalledSkills`）。
- 常驻注入：`prompts.ts:770` 把启用技能的 name+description 放进 `<agent_skills>`。
- 用户消息入口：`chatThreadService.addUserMessageAndStreamResponse(...)`（renderer）。
- 输入 UI：React 侧栏聊天输入框（`browser/react/src/sidebar-tsx/`）。

斜杠命令是**用户消息组装前的一层展开**，不触碰 Agent 循环/工具，风险可控。

## 数据模型

```ts
type SlashCommandSource = 'builtin' | 'skill' | 'local'
interface SlashCommand {
  name: string            // 不含前导 '/'，唯一（冲突时 builtin > local > skill 或加来源后缀）
  description: string
  source: SlashCommandSource
  // 展开为本轮附加指令文本；skill 来源在此按需加载正文（渐进式披露）
  expand(args: string): string | Promise<string>
}
```

## 三类来源

1. **builtin**：`builtinSlashCommands.ts` 常量表。示例 `/plan`（注入"先产出计划再执行"约束）、`/review`（注入评审 checklist）、`/compact-context`（触发 ContextCompactionService）、`/help`（列出可用命令，纯本地、不发 LLM）。
2. **skill**：由 `InstalledSkills` 过滤 `enabled` 映射；`expand` 时加载正文：
   - 若 `SkillInfo.body` 已缓存 → 直接用；
   - 否则按 `bodyUrl`/`url` 拉取（经 `IRequestService`，main 代理；renderer 不能直 fetch 跨域）→ 缓存到 settings。
3. **local**：扫描工作区 `.void/commands/*.md`，解析 front-matter（`description`）+ 正文；`expand` 用正文模板（支持 `$ARGS` 占位）。

## 渐进式披露（核心价值）

- 常驻系统提示**仅含技能 description**（现状不变，省上下文/保缓存）。
- 用户 `/skill-name` 调起 → 该技能**完整正文**作为**本轮**前置 system-reminder 注入用户消息，仅本轮生效，不进常驻 prefix。
- 验证：未调起时该正文不出现在请求体；调起时出现（注入断言或 token 计数差）。

## 输入层流程

```
用户键入 → 行首为 '/' ? → SlashCommandService.list() 渲染候选(name+description)
提交消息 → 以 '/<name>' 开头 ?
   是 → cmd = lookup(name); expanded = await cmd.expand(restOfLine)
        → builtin 纯本地命令(如 /help) 直接渲染，不发 LLM
        → 否则把 expanded 作为前置指令 + 用户其余文本 → addUserMessageAndStreamResponse
   否 → 原样走现有流程（零回归）
```

## DI / 注册

- `createDecorator<ISlashCommandService>('slashCommandService')`；`registerSingleton(..., InstantiationType.Delayed)`。
- `void.contribution.ts` 增 `import './slashCommandService.js'`（违反则服务不注册——见仓库 DI 可达性约束记录）。

## 边界情况

- 命令名冲突：固定优先级 builtin > local > skill；或候选列表显示来源标签。
- 技能正文拉取失败：降级为仅用 description（提示用户），不阻断对话。
- `.void/commands` 不存在：local 源为空，不报错。
- 普通消息恰好以 `/` 开头但非命令（如粘贴路径 `/usr/...`）：未命中注册表则按普通消息处理（不展开）。

## 回滚

- 纯新增服务 + 输入层一处分支；命令未命中即走原路径。`git revert` 单 commit 即可；关闭入口（输入层不检测 `/`）即完全旁路。

## 风险

| 风险 | 等级 | 缓解 |
|---|---|---|
| 正文拉取跨域/失败 | 中 | 经 IRequestService 代理 + 失败降级 description |
| 渐进式正文未真正"按需"（误入常驻） | 中 | 注入点限定本轮 user 前置；单测断言常驻 prefix 不含正文 |
| 输入层误把普通 `/` 文本当命令 | 低 | 仅在命中注册表时展开 |
| DI 未注册导致服务空 | 低 | contribution import + 注册图可达性检查 |
