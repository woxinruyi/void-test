# 设计说明（introduce-openspec-zh）

## 一、方案总览

OpenSpec 的多语言机制是**声明式**的：不改 CLI、不改模板，仅在 `openspec/config.yaml` 的 `context` 字段中写明语言要求，AI 在生成 proposal / tasks / design / spec 时会据此输出对应语言。本次在该机制之上补充了项目级约束：命名约定、术语处理、项目背景。

## 二、关键决策

### 决策 1：change-id 与 capability 目录名保留 kebab-case ASCII

OpenSpec CLI（`openspec new change <name>`）对目录名存在硬校验：

```
Change name can only contain lowercase letters, numbers, and hyphens
```

若使用中文目录名会直接报错退出。绕行代价（fork CLI 或打 patch）不合理，且 ASCII 目录名对跨平台、Git 历史、CI 路径更稳健。因此：

- **目录名**：kebab-case ASCII（如 `introduce-openspec-zh`）。
- **目录内中文入口**：`README.md` 首行中文标题 + `--description` 中文描述。
- **文档正文**：全部简体中文。

### 决策 2：全局安装 vs 本地 devDependency

选择**全局安装**（`npm install -g`）：

- OpenSpec 是“工具链”，并非仓库运行时依赖，不应污染 `package.json`。
- 与官方 Quick Start 一致，后续团队成员可按官方文档对齐。
- 避免与仓库内复杂的 gulp/electron 构建依赖产生交叉。

### 决策 3：IDE 集成选择 Windsurf

初始化时通过 `--tools windsurf` 指定，生成 `.windsurf/workflows/opsx-*.md` 与 `.windsurf/rules/opsx-*.md`。若后续引入其它 AI 助手，可追加运行 `openspec init --tools <tool>` 或使用 `openspec update` 同步。

## 三、配置结构

`openspec/config.yaml` 采用两段式：

```yaml
schema: spec-driven
context: |
  语言：简体中文（zh-CN）
  ...（命名约定、术语处理、项目背景）
rules:
  proposal: [...]
  tasks: [...]
  design: [...]
  spec: [...]
```

- `context`：全局指令，对所有产出物生效。
- `rules`：按产出物类型细化约束（例如 proposal 必须包含“非目标”章节，tasks 条目控制在 2 小时粒度）。

## 四、与“三段式中文方案”的协作

本次 change 只负责**流程层**中文化（规格、计划、文档），不触碰以下已有方案：

- `src/vs/base/node/nls.ts` / `windowImpl.ts` 的运行时 NLS 逻辑。
- `build/npm/validate-localization-packaging.mjs` 的构建前置校验。
- `product.json` 的 `defaultLocale` 与 `builtInExtensions`。

这些属于**产品层**中文化，由 `文档/temp-三段式中文方案编码实施与验收记录.md` 追踪。

## 五、验证策略

- **静态验证**：`openspec validate introduce-openspec-zh` 通过。
- **语言验证**：目录下三份 markdown 文件首行为中文标题，正文无英文段落（技术术语除外）。
- **端到端验证**：重启 Windsurf 后触发 `/opsx-propose "新增示例功能"`，观察 AI 生成的 `openspec/changes/<new-id>/proposal.md` 是否默认使用简体中文。

## 六、风险与回滚

- **Node 引擎警告**：20.18.2 < 20.19.0。当前仅为警告；若升级 CLI 后出现硬阻塞，需同步升级仓库 Node（或仅在工具链机器上升级）。
- **AI 生成偏差**：语言约束最终依赖 AI 遵从 `context` 指令。若发现个别产出物回退到英文，可在对应 change 的 `.openspec.yaml` 中追加更强的 per-change 指令覆盖。
- **回滚**：删除 `openspec/` 与 `.windsurf/workflows/opsx-*.md`、`.windsurf/rules/opsx-*.md` 即可完全回滚；不会影响仓库编译与打包。
