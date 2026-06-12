# 任务清单（introduce-openspec-zh）

## 1. 环境与安装

- [x] 1.1 校验 Node / npm 版本（当前 Node v20.18.2、npm 10.8.2；OpenSpec 建议 ≥ 20.19.0，暂以 EBADENGINE 警告放行）。
- [x] 1.2 执行 `npm install -g @fission-ai/openspec@latest`，确认全局 bin 目录 `C:\Users\Administrator\Desktop\n8n\libs\node-v18.19.0-win-x64\node_global` 下出现 `openspec` 可执行文件。
- [x] 1.3 通过 `openspec --version` 验证版本为 1.3.0。

## 2. 仓库初始化

- [x] 2.1 在仓库根执行 `openspec init --tools windsurf --force`，生成 `openspec/` 与 `.windsurf/` 相关文件。
- [x] 2.2 确认生成结构：`openspec/config.yaml`、`openspec/changes/`、`openspec/specs/`、`.windsurf/workflows/opsx-*.md`。
- [x] 2.3 确认生成的 4 条 Windsurf 斜杠命令（`/opsx-propose`、`/opsx-apply`、`/opsx-archive`、`/opsx-explore`）可用。

## 3. 中文化配置

- [x] 3.1 编辑 `openspec/config.yaml`，在 `context` 中写入“语言：简体中文（zh-CN）”以及术语处理、项目背景说明。
- [x] 3.2 在 `rules` 中为 proposal / tasks / design / spec 分别追加中文化约束。
- [x] 3.3 明确命名约定：change-id 与 capability 目录名使用 kebab-case ASCII；文档内部全部使用简体中文。

## 4. 样板与验证

- [x] 4.1 使用 `openspec new change introduce-openspec-zh --description "引入OpenSpec并配置默认中文产出物"` 创建示例 change 目录。
- [x] 4.2 在该目录下编写中文 `proposal.md`、`tasks.md`、`design.md` 作为后续 change 的参考样板。
- [ ] 4.3 执行 `openspec list` 与 `openspec validate introduce-openspec-zh`，确认无错误。
- [ ] 4.4 在 Windsurf 中重启后验证 `/opsx-propose` 等斜杠命令可触发，且生成产出物使用简体中文。

## 5. 文档与回归

- [ ] 5.1 在 `文档/` 下新增 `temp-引入OpenSpec与中文化配置记录.md`，记录引入过程、配置点、命名约定与排障经验。
- [ ] 5.2 在团队协作文档中补充“何时使用 OpenSpec”的建议（大型特性/重构优先走 proposal）。
