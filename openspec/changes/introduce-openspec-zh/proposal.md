# 引入 OpenSpec 并配置默认中文产出物（introduce-openspec-zh）

## 背景

当前仓库是基于 VSCode 源码的 Void 编辑器定制分支，正在推进“三段式中文方案”（Dev 模式二次开发 → 本地 built/package 验证 → 最终中文交付包）。随着需求增多，缺少一种**在写代码之前先对齐“要做什么”**的轻量化规格机制。

[Fission-AI/OpenSpec](https://github.com/Fission-AI/OpenSpec) 提供了面向 AI 编码助手的规格驱动开发（SDD）流程，可以把每一次变更拆分为 proposal、specs、design、tasks 四个产出物，并支持通过 `openspec/config.yaml` 注入多语言指令。

## 目标

- 在本仓库引入 OpenSpec，建立 `openspec/` 规格目录与 `.windsurf/` 下的 skills / commands 集成。
- 通过 `openspec/config.yaml` 的 `context` 与 `rules` 字段，要求 AI 生成的所有 OpenSpec 产出物默认使用**简体中文**撰写。
- 明确 change 目录与 capability 目录的命名约定，绕过 CLI 对目录名只能使用 kebab-case ASCII 的硬校验，同时保证文档正文完全中文化。
- 提供一份可复用的中文 proposal / tasks / design 模板（即本 change 目录），作为后续变更的参考样板。

## 非目标（Non-goals）

- 不修改 OpenSpec CLI 源码，不尝试让 change-id 支持中文（CLI 层强校验，绕行成本过高）。
- 不改变现有“三段式中文方案”的落地路径，也不替代仓库内已有的 `文档/temp-*.md` 临时记录文档。
- 不将 OpenSpec 作为硬性提交门槛，小型 bug 修复仍可直接提交，不必强制走 proposal 流程。

## 方案

1. **安装**：通过 `npm install -g @fission-ai/openspec@latest` 全局安装 CLI（当前仓库 Node 20.18.2 会产生 EBADENGINE 警告但不影响使用）。
2. **初始化**：在仓库根执行 `openspec init --tools windsurf --force`，自动生成：
   - `openspec/config.yaml`、`openspec/changes/`、`openspec/specs/`
   - `.windsurf/workflows/opsx-*.md`、`.windsurf/rules/opsx-*.md` 等 Windsurf 集成文件
3. **中文化配置**：编辑 `openspec/config.yaml`，在 `context` 中写明“语言：简体中文（zh-CN）”“所有产出物必须使用简体中文撰写”，并在 `rules` 中对 proposal / tasks / design / spec 分别追加中文化约束。
4. **命名约定**：
   - change-id、capability 目录名保留 kebab-case ASCII（CLI 强约束）。
   - 文档内部标题、正文、任务条目、场景描述全部使用简体中文。
   - 每个 change 目录通过 `README.md` 首行中文标题提供中文入口（CLI 的 `--description` 会自动写入中文描述）。
5. **样板**：以本 change 目录作为中文样板，供后续 `/opsx:propose`、`openspec new change` 调用参考。

## 影响

- 新增目录：`openspec/`、`.windsurf/workflows/opsx-*.md`、`.windsurf/rules/opsx-*.md`。
- 新增依赖：全局 npm 包 `@fission-ai/openspec`（不影响仓库 `package.json`）。
- 工作流影响：后续新增较大功能/重构时，推荐先通过 `/opsx:propose` 生成中文 proposal，再进入实现阶段。
- 风险：Node 版本 20.18.2 低于 OpenSpec 要求的 20.19.0，目前仅为 EBADENGINE 警告；若后续升级 CLI 出现硬性失败，需同步升级 Node。
