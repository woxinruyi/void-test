/*--------------------------------------------------------------------------------------
 *  Void Test Commands - 用于测试 Agent 行为的内置命令
 *--------------------------------------------------------------------------------------*/

import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { localize2 } from '../../../../nls.js';
import { IChatThreadService } from './chatThreadService.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { VOID_VIEW_CONTAINER_ID } from './sidebarPane.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
// 注意：文件输出功能已移至 test/integration/loopDetection.test.js (Headless 测试)
// 此处的命令仅用于 GUI 内手动测试

// ========== 测试命令 1: 循环检测测试 ==========
const VOID_TEST_LOOP_DETECTION_ID = 'void.test.loopDetection'
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: VOID_TEST_LOOP_DETECTION_ID,
			title: localize2('voidTestLoopDetection', 'Void Test: Loop Detection'),
			f1: true,
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const viewsService = accessor.get(IViewsService)
		const chatThreadService = accessor.get(IChatThreadService)
		const notificationService = accessor.get(INotificationService)
		// 打开侧边栏
		viewsService.openViewContainer(VOID_VIEW_CONTAINER_ID)

		// 发送测试消息
		const testMessage = `[Loop Detection Test] 请连续读取 package.json 文件 5 次来测试循环检测。每次都使用 read_file 工具读取完整文件内容。`

		const threadId = chatThreadService.getCurrentThread().id
		await chatThreadService.addUserMessageAndStreamResponse({
			userMessage: testMessage,
			threadId
		})

		notificationService.notify({
			severity: Severity.Info,
			message: 'Loop Detection Test started. Check console for LOOP_SKIP logs.',
		})
	}
})

// ========== 测试命令 2: 并行工具调用测试 ==========
const VOID_TEST_PARALLEL_TOOLS_ID = 'void.test.parallelTools'
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: VOID_TEST_PARALLEL_TOOLS_ID,
			title: localize2('voidTestParallelTools', 'Void Test: Parallel Tool Calls'),
			f1: true,
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const viewsService = accessor.get(IViewsService)
		const chatThreadService = accessor.get(IChatThreadService)
		const notificationService = accessor.get(INotificationService)
		viewsService.openViewContainer(VOID_VIEW_CONTAINER_ID)

		const testMessage = `[Parallel Tools Test] 请同时读取以下 3 个文件的内容：
1. package.json
2. tsconfig.json
3. README.md

请在一次响应中并行调用 read_file 工具读取这 3 个文件。`

		const threadId = chatThreadService.getCurrentThread().id
		await chatThreadService.addUserMessageAndStreamResponse({
			userMessage: testMessage,
			threadId
		})

		notificationService.notify({
			severity: Severity.Info,
			message: 'Parallel Tools Test started.',
		})
	}
})

// ========== 测试命令 3: attempt_completion 工具测试 ==========
const VOID_TEST_COMPLETION_ID = 'void.test.attemptCompletion'
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: VOID_TEST_COMPLETION_ID,
			title: localize2('voidTestCompletion', 'Void Test: Attempt Completion Tool'),
			f1: true,
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const viewsService = accessor.get(IViewsService)
		const chatThreadService = accessor.get(IChatThreadService)
		const notificationService = accessor.get(INotificationService)
		viewsService.openViewContainer(VOID_VIEW_CONTAINER_ID)

		const testMessage = `[Completion Tool Test] 请执行以下简单任务，完成后使用 attempt_completion 工具声明任务完成：

任务：读取 package.json 文件，告诉我项目名称和版本号。

完成后，请使用 attempt_completion 工具，包含：
- summary: 简要说明你完成了什么
- verification_status: "passed"`

		const threadId = chatThreadService.getCurrentThread().id
		await chatThreadService.addUserMessageAndStreamResponse({
			userMessage: testMessage,
			threadId
		})

		notificationService.notify({
			severity: Severity.Info,
			message: 'Attempt Completion Test started.',
		})
	}
})
