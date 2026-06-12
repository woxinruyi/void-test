/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *
 *  【业务逻辑说明 - Void 模块注册中心】
 *  本文件是 Void AI 功能的模块注册中心（Contribution Registry），负责：
 *
 *  【核心职责】
 *  1. 注册所有 Void 相关的服务和组件到 VSCode 工作台
 *  2. 按功能模块组织导入，清晰划分职责边界
 *  3. 作为 Void 功能的入口点，被 workbench.ts 加载
 *
 *  【功能模块清单】
 *  ┌─────────────────────────────────────────────────────────┐
 *  │  editCodeService.js       - 代码编辑服务（Apply/Fast Apply）   │
 *  │  sidebarActions.js        - 侧边栏快捷键（Ctrl+L）              │
 *  │  sidebarPane.js           - 侧边栏面板 UI                      │
 *  │  quickEditActions.js      - 快速编辑（Ctrl+K）                 │
 *  │  autocompleteService.js   - AI 自动补全                       │
 *  │  voidSettingsPane.js      - Void 设置面板                     │
 *  │  voidUpdateActions.js     - 自动更新功能                      │
 *  │  toolsService.js          - AI 工具调用（文件操作等）           │
 *  │  terminalToolService.js   - 终端工具集成                       │
 *  │  threadHistoryService.js  - 对话历史管理                       │
 *  └─────────────────────────────────────────────────────────┘
 *
 *  【注册机制】
 *  - 使用 VSCode 的 Contribution Registry 机制
 *  - 每个导入的文件内部调用 registerSingleton() 或 registerWorkbenchContribution()
 *  - 服务通过依赖注入（DI）容器提供给其他组件使用
 *
 *  【依赖关系】
 *  - 依赖于 common/ 层的基础类型和服务
 *  - 依赖于 platform/ 层的基础设施
 *  - 被 workbench.ts 间接加载
 *
 *  【修改历史】2026-04-02: 添加业务逻辑注释
 *--------------------------------------------------------------------------------------*/


// register inline diffs
import './editCodeService.js'

// register Sidebar pane, state, actions (keybinds, menus) (Ctrl+L)
import './sidebarActions.js'
import './sidebarPane.js'

// register quick edit (Ctrl+K)
import './quickEditActions.js'


// register Autocomplete
import './autocompleteService.js'

// register Context services
// import './contextGatheringService.js'
// import './contextUserChangesService.js'

// settings pane
import './voidSettingsPane.js'

// register css
import './media/void.css'

// update (frontend part, also see platform/)
import './voidUpdateActions.js'

import './convertToLLMMessageWorkbenchContrib.js'

// tools
import './toolsService.js'
import './terminalToolService.js'

// register Thread History
import './chatThreadService.js'

// ping
import './metricsPollService.js'

// helper services
import './helperServices/consistentItemService.js'

// register selection helper
import './voidSelectionHelperWidget.js'

// register tooltip service
import './tooltipService.js'

// register onboarding service
import './voidOnboardingService.js'

// register misc service
import './miscWokrbenchContrib.js'

// register file service (for explorer context menu)
import './fileService.js'

// register source control management
import './voidSCMService.js'

// register marketplace service (used by settings pane via getReactAccessor)
import './marketplaceService.js'

// ---------- common (unclear if these actually need to be imported, because they're already imported wherever they're used) ----------

// llmMessage
import '../common/sendLLMMessageService.js'

// voidSettings
import '../common/voidSettingsService.js'

// refreshModel
import '../common/refreshModelService.js'

// metrics
import '../common/metricsService.js'

// updates
import '../common/voidUpdateService.js'

// model service
import '../common/voidModelService.js'
