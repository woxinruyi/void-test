# 已归档：标题栏拖动可靠性（fix-titlebar-drag-reliability）

- **状态**：⏭️ 已被 `fix-onboarding-drag` 完全覆盖，未单独实施
- **归档日期**：2026-04-22
- **原因**：`fix-onboarding-drag` 已实现本 change 提案中的全部核心修复：
  - 删除 `_createDragOverlay` 方法及 IPC handlers
  - 删除主进程 `startWindowDrag`/`stopWindowDrag` 轮询逻辑
  - 修复 Onboarding overlay 不覆盖标题栏
  - 用户验证拖动功能正常
- **剩余未实施项**：详细的 T1-T6 回归测试用例（可作为后续质量保障参考）
