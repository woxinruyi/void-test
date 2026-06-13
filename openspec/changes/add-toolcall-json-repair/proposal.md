# 新增：工具调用 JSON 容错解析（add-toolcall-json-repair）

## 背景

对标 Codex / Claude Code：成熟 Agent 对模型偶发输出的**轻微非法工具参数 JSON** 具有容错能力。YWCode 的 openai-compatible / 聚合(aiyiwei，**项目主路径**)分支用裸 `JSON.parse` 解析工具参数（`electron-main/llmMessage/sendLLMMessage.impl.ts` 的 `rawToolCallObjOfParamsStr`），任意 JSON 瑕疵（尾随逗号、智能引号、输出被截断）都会令该函数返回 `null`，**整次工具调用被静默丢弃** → Agent 该步失败、需重试或卡住。

## 目标

- 主路径工具参数解析增加**保守容错**：精确解析失败时尝试修复并重解析；修复仍失败则返回 `null`（与原行为一致）。
- 不改变 happy-path：合法 JSON 与现状逐字一致；容错**仅在裸 parse 失败时介入**，因此是"纯挽回"，不可能引入回退。

## 非目标

- 不引入第三方 jsonrepair 依赖（自带保守实现，零依赖、可测）。
- 不改 Anthropic 原生路径（其工具参数已是结构化对象，不经字符串解析）。
- 不做激进修复（如猜测缺失键值）；只做高置信、不破坏字符串字面量的修复。

## 方案

`common/helpers/repairToolJson.ts` 纯函数 `tryParseToolJson(raw): object | null`，顺序：
1. 精确 `JSON.parse`（happy path）；
2. 智能引号 `“”‘’` → 直引号；移除 `}`/`]` 前尾随逗号；
3. 截断补齐：在不破坏字符串字面量前提下闭合未结束的字符串与未匹配的 `{`/`[`。

每步结果必须为**非数组对象**才接受，否则继续/返回 null。`impl.ts` 的 `rawToolCallObjOfParamsStr` 改用它。

## 影响范围

- 新增 `common/helpers/repairToolJson.ts`（纯函数）。
- 修改 `electron-main/llmMessage/sendLLMMessage.impl.ts`（`rawToolCallObjOfParamsStr` 一处）。
- 测试：`test/eval/repairToolJsonEval.ts`（15）+ `test/common/repairToolJson.test.ts`。

## 验收标准

1. 合法 JSON 与现状一致；含 `}`/逗号的字符串字面量不被误伤 —— 确定性测试通过。
2. 尾随逗号 / 智能引号 / 截断(对象·数组·字符串内) 可被挽回为正确对象。
3. 数组/垃圾/空串/非字符串/`null` → 返回 `null`（与原 `JSON.parse` 失败行为一致）。
4. `npx tsc -p src/tsconfig.json --noEmit` 0 errors。

## 状态

- **已执行（2026-06-13）**：helper + eval(15/15) + mocha + impl 接入。tsc 待确认；运行时挽回效果在真实模型偶发瑕疵时生效（无法构造确定性触发，但纯函数已覆盖各瑕疵类型）。
