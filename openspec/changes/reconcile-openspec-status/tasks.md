# 任务：OpenSpec 状态对账与归档

## Phase 1 — 核定真实状态

- [ ] 对 18 个 change 逐一"代码 vs tasks.md"核对，产出状态对照表
- [ ] 更新已完成 change 的 tasks.md 复选框（add-lsp-tools / add-tool-hooks / enhance-checkpoints / add-reasoning-budget-auto / optimize-agent-loop）
- [ ] 更新部分完成 change 的复选框至真实进度（improve-tool-approval-policy / simplify-settings-aggregated-ai / localize-void-ai-ui / verify-zh-localization / build-latest-win32-exe）

## Phase 2 — 归档已完成项并回填 specs/

- [ ] 将已实质完成的 change 移入 `openspec/changes/archive/`
- [ ] 将各归档 change 的 `specs/*` 合并进 `openspec/specs/<capability>/`（去重、保留最新）
- [ ] 校验 specs/ 下能力规范无冲突、标题为 capability 名

## Phase 3 — 校验

- [ ] `git status` 确认改动仅限 `openspec/` 目录（无 `.ts` 源码改动）
- [ ] 更新 `openspec/architecture/overview.md` 的"更新日志"，记录本次对账
- [ ] 输出"剩余未完成 change 清单"供后续排期
