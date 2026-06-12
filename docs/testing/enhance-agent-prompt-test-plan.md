# enhance-agent-prompt-and-context 测试方案

> **创建时间**: 2026-05-28
> **关联 change**: `openspec/changes/enhance-agent-prompt-and-context/`
> **测试类型**: 静态单元测试（mocha/node）+ 端到端运行时手动验收

---

## 一、测试目标

| # | 测试领域 | 覆盖 Phase | 测试方法 |
|---|----------|-----------|----------|
| 1 | **System Prompt 段落注入** | Phase 1 | 对 `chat_systemMessage()` 输出做字符串断言 |
| 2 | **自动上下文注入** | Phase 2 | 模拟传入 git/stack/errors 摘要，验证标签与模式隔离 |
| 3 | **工具 examples 字段** | Phase 3 | 直接读取 `builtinTools` 与 XML 渲染输出 |
| 4 | **运行时效果对比** | All | 在 Electron 中用标准提示词手动对比修改前后 |

---

## 二、测试文件清单

```
src/vs/workbench/contrib/void/test/common/
├── enhanceAgentPromptContext.test.ts   ← 新增（本 change）
├── autoApprove.test.ts                 ← 已有
├── codeIndex.test.ts                   ← 已有
├── memoryAndRag.test.ts                ← 已有
├── reasoningAuto.test.ts               ← 已有
└── toolValidation.test.ts              ← 已有
```

---

## 三、单元测试用例（共 22 例）

### 3.1 Phase 1：System Prompt 段落注入

| 用例 ID | 用例名称 | 验证点 |
|---------|---------|--------|
| EAP-1.1 | agent 包含 Tool Usage Strategy | `msg.includes('## Tool Usage Strategy')` |
| EAP-1.2 | agent 包含 Error Recovery | `msg.includes('## Error Recovery')` |
| EAP-1.3 | agent 包含 Code Modification Best Practices | 段落注入 |
| EAP-1.4 | agent 包含 Verification After Changes | 段落注入 |
| EAP-1.5 | normal 模式不注入上述任一段落 | 模式隔离 |
| EAP-1.6 | gather 模式不注入上述任一段落 | 模式隔离 |

### 3.2 Phase 2：自动上下文注入

| 用例 ID | 用例名称 | 验证点 |
|---------|---------|--------|
| EAP-2.1 | `<git_status>` 标签 + 内容注入 | 传入 `gitStatusSummary` |
| EAP-2.2 | `<project_stack>` 标签 + 内容注入 | 传入 `projectStackSummary` |
| EAP-2.3 | agent 模式注入 `<recent_errors>` | 传入 `recentErrorsSummary` |
| EAP-2.4 | normal 模式不注入 `<recent_errors>`（隔离） | 模式隔离 |
| EAP-2.5 | gather 模式不注入 `<recent_errors>` | 模式隔离 |
| EAP-2.6 | 不传参时不注入 Phase 2 标签 | 防误注入 |
| EAP-2.7 | undefined 参数不触发注入 | null 守卫 |

### 3.3 Phase 3：工具 examples

| 用例 ID | 用例名称 | 验证点 |
|---------|---------|--------|
| EAP-3.1 | `edit_file` 有非空 examples | 字段存在 |
| EAP-3.2 | `rewrite_file` 有非空 examples | 字段存在 |
| EAP-3.3 | `run_command` 有非空 examples | 字段存在 |
| EAP-3.4 | `search_for_files` 有非空 examples | 字段存在 |
| EAP-3.5 | XML 工具定义包含 `Tips:` 行 | `includeXMLToolDefinitions=true` |
| EAP-3.6 | examples 含具体可操作指引（关键词） | 质量检查 |

### 3.4 综合用例

| 用例 ID | 用例名称 | 验证点 |
|---------|---------|--------|
| EAP-4.1 | agent 模式同时注入所有 Phase 1+2 段落 | 不互斥 |
| EAP-4.2 | 整体长度 < 50KB | 防止 token 失控 |

---

## 四、执行方式

> ⚠️ **前置条件**：mocha runner 从 `out/` 加载 `.test.js`。运行前必须先编译 `src/ → out/`。
> 详见 `@openspec/architecture/build-pipeline.md` 的「运行单元测试」章节。

### 4.0 前置：确保 out/ 已编译

```powershell
# 方案 A（推荐）：长开 watch-client 增量编译
npm run watch-client     # 首次 1-2 min，后续每次改动 1-3s

# 方案 B：单次全量编译（5-7 min）
node ./node_modules/gulp/bin/gulp.js compile-client

# 检查是否已编译
Test-Path "out/vs/workbench/contrib/void/test/common/enhanceAgentPromptContext.test.js"
```

### 4.1 仅运行本 change 的单元测试

```powershell
npm run test-node -- --grep "enhance-agent-prompt-and-context"
```

### 4.2 运行全部 Void 单元测试

```powershell
npm run test-node -- --grep "Void"
```

### 4.3 TypeScript 类型检查（不依赖编译产物）

```powershell
npx tsc -p src/tsconfig.json --noEmit
```

⚠️ **常见误区**：`npm run compile` 只编译 extensions，**不会**让 mocha 找到 `.test.js`。必须用 `gulp compile-client` 或 `watch-client`。

---

## 五、通过标准

- ✅ 全部 22 例 PASS
- ✅ 无 disposable 泄露（`ensureNoDisposablesAreLeakedInTestSuite`）
- ✅ 无超时（默认 5000ms / 用例）
- ✅ TypeScript 编译 0 errors

---

## 六、端到端运行时验收（手动）

单元测试只能验证 **prompt 字符串结构**，无法验证 **LLM 实际行为提升**。需在打包后的 Electron 中进行对比：

### 6.1 对比场景 A：失败恢复

1. 在 Agent 模式下执行：`run_command("npm run nonexistent")`
2. 等待返回错误后，在新一轮提问：`修复刚才的错误`
3. **预期**：Agent 直接引用错误内容（npm error / Missing script），无需再次运行原命令
4. **回归对照**：禁用 Phase 2.3（注释掉 `getRecentErrorOutput` 调用）后重测

### 6.2 对比场景 B：多文件原子重构

1. 提示词：`请把 foo/bar/baz 三个文件中的 OldName 全部改名为 NewName`
2. **预期**：Agent 先 `search_for_files OldName` 一次，再 **并行** `read_file` 三个文件，最后 `batch_edit` 一次完成（共 3 轮）
3. **回归对照**：旧 Prompt 通常会先 `ls_dir` → 多次 `read_file` → 多次 `edit_file`（5+ 轮）

### 6.3 对比场景 C：编辑后主动验证

1. 提示词：`新增一个工具函数 sumArray 到 src/utils.ts 并导出`
2. **预期**：Agent 完成编辑后主动建议 `npm run lint` 或 `tsc --noEmit`（来自 `verificationPrompt` 段落 + `projectStackInfo` 中暴露的 scripts）
3. **回归对照**：旧 Prompt 通常直接报告完成不验证

### 6.4 评分卡

| 维度 | 修改前 | 修改后 | 提升 |
|------|-------|-------|------|
| 场景 A 修复一次成功率 | %  | %  |  |
| 场景 B 工具调用轮数 |  轮 |  轮 |  |
| 场景 C 主动验证比例 | %  | %  |  |

---

## 七、风险与边界

- **mocha 测试不依赖 DOM**：只 import `prompts.ts` 纯函数，不触发 VS Code workbench
- **`TerminalToolService._recordIfError` 私有方法不单测**：依赖真实 terminal capability，留给 E2E 场景 A 间接验证
- **`IVoidSCMService.gitStat` 不单测**：需 SCMService 实例，留给 E2E 间接验证
- **prompt 长度上限 50KB**：保守阈值，远低于主流模型 128K context

---

## 八、维护

后续若 `chat_systemMessage` 增加新段落或修改现有段落标题，需同步更新对应字符串断言。
