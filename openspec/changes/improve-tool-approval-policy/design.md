# 设计：工具审批策略分层信任模型（improve-tool-approval-policy）

## 一、背景与约束

- 当前审批判定链路集中于 `chatThreadService.ts:642-652`，判定结果是 `awaitingUserApproval: true / false` 一个布尔。
- `approvalTypeOfBuiltinToolName`（`toolsServiceTypes.ts:21`）将 builtin 工具按"类"映射：`edits` / `terminal` / `MCP tools`；只读工具未列入映射表，天然免审批。
- `GlobalSettings.autoApprove` 为 `{ [type]: boolean }` 的浅层结构，持久化到 `voidSettingsService` 的存储键。
- 约束：不得破坏旧用户数据；新结构 MUST 可从旧结构安全迁移；MUST NOT 引入 breaking 变更给 common 层消费者。

## 二、目标设计

### 1. 类型扩展（common 层）

`voidSettingsTypes.ts`：

```ts
export type TrustLevel = 'conservative' | 'standard' | 'seamless';

export type AutoApproveSettings = {
  // 预留显示位（只读工具本就无审批）
  reads?: boolean;
  // 编辑类
  editsInWorkspace?: boolean;
  editsOutsideWorkspace?: boolean;
  // 终端
  terminalAllowlist?: boolean;
  terminalAllowlistPatterns?: string[];
  terminalAny?: boolean;
  // MCP
  mcpPerServer?: { [serverName: string]: boolean };
  mcpAll?: boolean;
  // 预留给后续 change（本次仅定义类型，不做判定）
  mustAlwaysApprovePatterns?: string[];
};

export const TRUST_LEVEL_PRESETS: Record<TrustLevel, AutoApproveSettings> = {
  conservative: {},
  standard: {
    editsInWorkspace: true,
    terminalAllowlist: true,
    terminalAllowlistPatterns: DEFAULT_TERMINAL_ALLOWLIST,
  },
  seamless: {
    editsInWorkspace: true,
    editsOutsideWorkspace: false,
    terminalAny: true,
    mcpAll: true,
  },
};
```

`GlobalSettings` 字段：
```ts
autoApprove: AutoApproveSettings;   // 取代旧 { [ToolApprovalType]?: boolean }
trustLevel?: TrustLevel;            // 仅作为 UI 选择记录，实际生效的是 autoApprove
```

### 2. 向后兼容迁移

`voidSettingsService` 在读取持久化状态后执行一次性迁移：

```
if (stored.autoApprove has old keys 'edits'/'terminal'/'MCP tools') {
  migrated.editsInWorkspace = stored.edits === true;
  migrated.editsOutsideWorkspace = stored.edits === true;
  migrated.terminalAny = stored.terminal === true;
  migrated.mcpAll = stored['MCP tools'] === true;
  // 旧字段移除
}
```

迁移后立即写回存储。**不显示弹窗**（对大多数用户旧值为空 `{}`，迁移结果等价于 `conservative`）；若任一旧字段为 true，首次启动在设置页顶部显示一条可关闭提示："我们将你的审批偏好迁移到新结构，请在此确认"。

### 3. 判定函数（新增）

放在 `src/vs/workbench/contrib/void/common/helpers/autoApprove.ts`：

```ts
export function resolveAutoApprove(
  toolName: ToolName,
  toolParams: ToolCallParams<ToolName> | undefined,
  autoApprove: AutoApproveSettings,
  ctx: { workspaceFolders: URI[]; mcpServerName?: string; },
): 'auto' | 'manual' {
  // 1. builtin 类型映射
  const approvalType = isABuiltinToolName(toolName)
    ? approvalTypeOfBuiltinToolName[toolName]
    : 'MCP tools';
  if (!approvalType) return 'auto'; // 只读类

  // 2. 编辑类：按 URI 范围
  if (approvalType === 'edits') {
    const uri = (toolParams as any)?.uri as URI | undefined;
    const inWs = uri ? isInWorkspace(uri, ctx.workspaceFolders) : true; // 无 uri 视为 workspace 内（保守向安全）
    return inWs
      ? (autoApprove.editsInWorkspace ? 'auto' : 'manual')
      : (autoApprove.editsOutsideWorkspace ? 'auto' : 'manual');
  }

  // 3. 终端类：allowlist 优先 > any
  if (approvalType === 'terminal') {
    const cmd = (toolParams as any)?.command as string | undefined;
    if (autoApprove.terminalAllowlist && cmd && matchesAllowlist(cmd, autoApprove.terminalAllowlistPatterns ?? [])) {
      return 'auto';
    }
    return autoApprove.terminalAny ? 'auto' : 'manual';
  }

  // 4. MCP：server 粒度 > 全局
  if (approvalType === 'MCP tools') {
    const server = ctx.mcpServerName;
    const perServer = server ? autoApprove.mcpPerServer?.[server] : undefined;
    if (perServer !== undefined) return perServer ? 'auto' : 'manual';
    return autoApprove.mcpAll ? 'auto' : 'manual';
  }

  return 'manual';
}

export function matchesAllowlist(command: string, patterns: string[]): boolean {
  // 匹配策略：patterns 以空格或行尾区分，匹配命令首段前缀
  // 'git status' 匹配 'git status' 与 'git status --short'，但不匹配 'git statusx'
  const normalized = command.trimStart();
  for (const p of patterns) {
    if (!p) continue;
    if (normalized === p.trim()) return true;
    const pWithSep = p.endsWith(' ') ? p : p + ' ';
    if (normalized.startsWith(pWithSep)) return true;
  }
  return false;
}
```

### 4. 判定链路接入

`chatThreadService.ts:642-652` 改为：

```ts
const approvalType = isBuiltInTool ? approvalTypeOfBuiltinToolName[toolName] : 'MCP tools';
if (approvalType) {
  const decision = resolveAutoApprove(toolName, toolParams, autoApprove, {
    workspaceFolders: this._workspaceContextService.getWorkspace().folders.map(f => f.uri),
    mcpServerName: mcpServerName,
  });
  this._addMessageToThread(threadId, {
    role: 'tool', type: 'tool_request',
    content: '(Awaiting user permission...)',
    // ... 其余字段
  });
  if (decision === 'manual') {
    return { awaitingUserApproval: true };
  }
}
```

### 5. Onboarding 交互

新增复用组件 `TrustLevelSelector.tsx`：三个单选卡片（`保守 / 标准 / 无缝`），每个卡片展示：
- 标题 + 一句话描述
- 三条具体行为（例如"仓库内编辑免批"、"git status 等安全命令免批"、"其他终端命令仍需审批"）
- 选中即写入 `trustLevel` 与 `autoApprove = TRUST_LEVEL_PRESETS[level]`

Onboarding 第 2 页末尾嵌入。首启默认**未选**（强制用户点一次）；不点继续按钮保持 disabled。

### 6. Settings 页交互

`Settings.tsx` → `General` 分区新增"AI 信任与审批"小节：
- 顶部同样的 `TrustLevelSelector`，选择后覆盖所有细粒度开关。
- 下方"高级（覆盖预设）"折叠区：展开后显示每个字段的独立开关 + 终端 allowlist 的编辑器（每行一个 pattern）。
- 保存即 `setGlobalSetting('autoApprove', ...)`。

### 7. tool_request 卡片交互

`SidebarChat.tsx` 的 tool_request 卡片新增两个次级按钮（当前仅 Accept / Reject 两个主按钮）：

```
┌─────────────────────────────────────────────┐
│  LLM 想要使用工具：edit_file(src/foo.ts)    │
│  ──────────────────────────────────────     │
│  [查看 diff]                                │
│                                             │
│  主按钮：   [ 拒绝 ] [ 接受 ]               │
│  次按钮：   [ ⋯ 本会话信任此类 ]            │
│            [ ⋯ 永久信任此类 ]               │
└─────────────────────────────────────────────┘
```

实现：
- "本会话信任此类" → 在 `chatThreadService` 内的 per-thread 覆盖 map 写入 `{ [approvalType]: true }`，当前 thread 内 `resolveAutoApprove` 前先查这张 map。
- "永久信任此类" → 直接 `setGlobalSetting('autoApprove', { ...current, [相应字段]: true })` 并 `approveLatestToolRequest`。

## 三、分阶段实施顺序

1. **阶段 A — 类型与迁移**：扩展 `AutoApproveSettings`、`TRUST_LEVEL_PRESETS`；在 `voidSettingsService` 加入迁移逻辑；单测覆盖。
2. **阶段 B — 判定函数**：新增 `helpers/autoApprove.ts` 与单测；`chatThreadService` 接入；保留旧 autoApprove 读取作 fallback（直到确认所有持久化迁移完成）。
3. **阶段 C — Onboarding**：`TrustLevelSelector` 组件 + 集成到 VoidOnboarding 第 2 页。
4. **阶段 D — Settings 页**：General 分区新增 UI 与 allowlist 编辑器。
5. **阶段 E — tool_request 卡片**：两个次级按钮 + 会话 override map。
6. **阶段 F — 文案 + 验证**：补 i18n 键；执行静态 / 单测 / 端到端验证。

## 四、验证策略

### 单元测试

- `resolveAutoApprove` 对 workspace/outside、allowlist 命中/未命中、MCP per-server 回退、未知 approvalType 的完整矩阵。
- `matchesAllowlist` 的边界情况：`'git status'` 应匹配 `'git status --short'` 但不匹配 `'git statusx'`；空字符串、纯空格前缀。
- 迁移逻辑：旧 `{ edits: true }` / `{ terminal: true }` / `{ 'MCP tools': true }` 正确映射。

### 动态

- 干净 `--user-data-dir` 启动，Onboarding 必须选择信任级别；选"标准"完成；设置页显示 `editsInWorkspace=true`、`terminalAllowlist=true`。
- `agent` 模式请 LLM 编辑 `src/foo.ts`（workspace 内）→ 不弹审批；请编辑 `C:\Temp\bar.ts`（workspace 外）→ 弹审批。
- 请 LLM 跑 `git status` → 自动通过；请 LLM 跑 `curl http://x` → 弹审批。
- tool_request 卡片点"本会话信任此类"，后续同类请求直接通过；关闭 Void 再开，恢复需审批。
- 旧用户（持久化中存在 `{ edits: true }`）首次升级：设置页显示 `editsInWorkspace=true && editsOutsideWorkspace=true`；顶部迁移提示条可关闭。

## 五、风险与回滚

- **风险 A — 用户困惑于 `workspace 内 / 外` 的语义**：缓解：UI 文案提供例子（"本仓库文件免批；`C:\Temp` 等系统路径仍需审批"）。
- **风险 B — Onboarding 强制选择增加进入门槛**：缓解：默认高亮"标准（推荐）"，用户一键 Next 即可；非首次用户不重走。
- **风险 C — allowlist 默认列表引发误放**：缓解：首版仅含最保守的只读命令，真正执行"副作用"的（`npm install` / `npm run` / `git push`）**不**默认放行；`git push` 明确不放行。
- **回滚**：如需禁用新结构，切换 `voidSettingsService` 读取到旧字段回退路径；UI 与 Onboarding 部分可用 feature flag 关闭。
