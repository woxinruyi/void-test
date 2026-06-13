# 任务：斜杠命令 + 技能渐进式调用

## Phase 1 — 服务与注册表  ✅ 已执行（2026-06-13）

- [x] 纯逻辑 `common/slashCommands/slashCommandHelpers.ts`（parse/aggregate/expand/front-matter，零依赖可测）
- [x] `common/slashCommands/builtinSlashCommands.ts`：`/plan` `/review` `/compact-context` `/help`（4 个，≥3）
- [x] `browser/slashCommandService.ts`：`ISlashCommandService`（`listCommands()` / `resolveInput()`）聚合 builtin/skill/local
- [x] skill 源：从 `state.installedSkills` 映射 enabled；`_loadSkillBody` 按需加载（`body` 缓存 / `bodyUrl` 经 IRequestService 拉取 / 失败降级 description）
- [x] `SkillInfo` 扩展可选 `body?` / `bodyUrl?`（不动既有字段语义）
- [x] local 源：扫描 `.void/commands/*.md`（front-matter description + 正文，`$ARGS` 占位）
- [x] `registerSingleton(ISlashCommandService, …, Delayed)` + `void.contribution.ts` import 同步
- [x] 确定性评测 `test/eval/slashCommandsEval.ts`：**21/21 通过**；mocha 回归 `test/common/slashCommands.test.ts`

## Phase 2 — 输入层接入  🔶 功能核心已执行（2026-06-13）

- [x] React accessor 注册 `ISlashCommandService`（`util/services.tsx`：import + reactAccessor 映射）
- [x] 提交时 `resolveInput()`：命中 inject → 用展开指令替换发送内容 → `addUserMessageAndStreamResponse`
- [x] builtin 纯本地命令（`/help`）→ INotificationService 展示，不发 LLM
- [x] 未命中 / `_forceSubmit` / 普通消息：零回归走原路径
- [x] 行首 `/` 弹候选下拉（name+description+来源标签，前缀过滤，点击补全）：`onChangeText` 检测 + 懒加载缓存 + VoidChatArea 内渲染 —— **编译级已验证；可视/交互效果待 Electron 运行时确认**
- [x] React bundle 构建通过（`node build.js`）；`tsc` 0 errors

## Phase 3 — 渐进式披露 + 验证

- [ ] 常驻系统提示仅保留技能 description（现状不变）；正文仅本轮注入
- [ ] 确定性单测：注册表聚合（三源合并/冲突优先级）、`expand()` 输出、`/help` 纯本地
- [ ] 注入断言：未调起时请求体不含技能正文；调起时包含（渐进式生效）
- [ ] **编译验证：`npx tsc -p src/tsconfig.json --noEmit` 0 errors**
- [ ] React bundle：`node build.js`（react 目录）
- [ ] CDP 运行时：`/` 候选可见、`/skill` 调起影响输出、`.void/commands/foo.md` 的 `/foo` 可用

## 跨阶段纪律

- [ ] 手术式：仅加"消息组装前展开"一层，不改 Agent 循环/工具/编辑
- [ ] 每能力带开关、可回滚；正文拉取失败降级不阻断对话
- [ ] 不动 `mcp-marketplace-aggregation` 的安装链路，仅消费 `InstalledSkills`
