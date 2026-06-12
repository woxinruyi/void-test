# 已归档：修复 Onboarding 页面标题栏拖动（fix-onboarding-drag）

- **状态**：✅ 已完成并归档
- **归档日期**：2026-04-22
- **摘要**：删除自定义 IPC 拖动覆盖层，恢复 Chromium 原生 `-webkit-app-region: drag` 行为；Onboarding overlay 从 top:30px 开始不覆盖标题栏；完成后 return null 从 DOM 移除
- **替代**：`fix-titlebar-drag-reliability`（该 change 被本 change 完全覆盖）
