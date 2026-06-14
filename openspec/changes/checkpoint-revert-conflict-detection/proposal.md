# 完成：检查点回滚的"外部修改"冲突检测（checkpoint-revert-conflict-detection）

> 设计提案。这是一个**已设计但中段未接线**的特性，安全实现需触及实时编辑/回滚路径，需真机 E2E 核验后落地，故不盲改。

## 背景（深度审计发现）

检查点回滚的冲突检测**端到端设计完整，但中间一环缺失**：

1. **Schema 已留字段**：`common/turnCheckpointTypes.ts:12` 的 `FileOp.afterHash?: string`（注释"content hash after (for edit/create)"）—— 但**全仓无任何赋值点**（`grep afterHash` 仅命中声明）。
2. **UI 已留文案**：`browser/turnCheckpointActions.ts:47` 已有 `'Revert completed with {0} conflict(s). Files may have been modified externally.'` —— 期望 `revertTo` 上报"文件被外部修改"类冲突。
3. **检测逻辑缺失**：`turnCheckpointService.revertTo`（`turnCheckpointService.ts:262-290`）仅在**写入异常**时 push `conflicts`，从不比较"当前文件内容 vs 智能体写入后的内容"。

**后果**：用户在某轮后**手动编辑**了文件，再回滚到该轮——`revertTo` 直接用 `beforeHash` 快照覆写，**静默丢失用户的手动改动**，且既有的"externally modified"警告永不触发。这是数据安全风险。

## 目标

- 接通 `afterHash` 捕获 + 回滚前比较，让"文件被外部修改"在覆写前被检测并经既有 UI 警告用户。
- 完全向后兼容：旧 manifest（无 `afterHash`）行为**与现状逐字节一致**（直接 restore，零回归）。

## 非目标

- 不改回滚的核心语义（仍按轮逆序、按 fileOp 逆序 restore）。
- 不引入交互式逐文件确认（首版仅"仍回滚 + 上报冲突警告"，与既有 UX 一致）。

## 方案（待 E2E 核验后执行）

1. **捕获 afterHash**：在 `chatThreadService.ts` 工具执行**完成后**（约 line 867 `toolResult = await result` 之后，针对 edit/rewrite/batch_edit/create 成功分支）新增一次"后置捕获"，读取结果文件内容、computeHash，调用新方法 `recordEditAfter(turnId, uri, afterContent)`，回填该 uri 最近一条 fileOp 的 `afterHash`。
   - 现有 `recordEdit` 在执行**前**捕获 `beforeHash`（已确认 line 793-820 在 line 822 approval-break 与 867 执行之前）。afterHash 是新增的执行后回填。
2. **回滚前比较**：`revertTo` 处理 `edit`/`create` 前，若 `op.afterHash` 存在：读当前文件 → hash → 与 `op.afterHash` 比较。不等 → `result.conflicts.push({ uri, reason: 'modified externally since agent edit' })`，随后**仍执行 restore**（不丢回滚能力，仅追加警告）。`afterHash` 缺失（旧数据）→ 跳过比较，行为同今。
3. **纯函数 + 单测**：抽 `shouldFlagExternalModification(currentHash, afterHash?)`（afterHash 为空→false；相等→false；不等→true）到 `common/helpers/`，eval + mocha 覆盖三分支。

## 风险与为何不盲改

- 后置捕获接错时机（在编辑落盘前读）会记录错误 afterHash → 误报/漏报冲突。正确时机依赖编辑实际落盘语义，**需真机核验** `_voidModelService` 模型值在工具完成后已是最终内容。
- 回滚是**数据破坏性**操作，本环境无 GUI、无法 E2E 跑"编辑→手改→回滚→校验冲突上报且文件正确"全链路。盲改有静默破坏回滚正确性的风险。

## 验收标准（执行时）

1. `shouldFlagExternalModification` 纯函数 eval/mocha 三分支通过。
2. 后置捕获回填 afterHash；`revertTo` 对 afterHash 不匹配的文件上报 conflict 并仍 restore；旧 manifest 零行为变化。
3. **真机 E2E**：编辑文件→轮外手动改→回滚→确认 ① 既有"externally modified"警告弹出 ② 文件被回滚到 beforeHash。
4. `npx tsc -p src/tsconfig.json --noEmit` 0 errors；mocha 全量无回归。

## 状态

- **分析 + 提案已建（2026-06-14）**。**实现待真机 E2E 核验**编辑落盘时机与回滚链路后执行（向后兼容、警告-only，零回归风险面已界定）。
