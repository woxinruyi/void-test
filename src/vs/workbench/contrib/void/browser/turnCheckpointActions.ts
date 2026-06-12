/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { ITurnCheckpointService } from './turnCheckpointService.js';
import { IChatThreadService } from './chatThreadService.js';
import { VOID_CHECKPOINT_REVERT_ACTION_ID, VOID_CHECKPOINT_LIST_TURNS_ACTION_ID } from './actionIDs.js';


registerAction2(class extends Action2 {
	constructor() {
		super({
			id: VOID_CHECKPOINT_REVERT_ACTION_ID,
			f1: true,
			title: localize2('voidCheckpointRevert', 'Void: Revert to Turn Checkpoint'),
		});
	}

	async run(accessor: ServicesAccessor, turnId?: string): Promise<void> {
		const turnCheckpointService = accessor.get(ITurnCheckpointService)
		const notificationService = accessor.get(INotificationService)
		const chatThreadService = accessor.get(IChatThreadService)

		if (!turnId) {
			// Try to find the latest committed turn in the current thread
			const threadId = chatThreadService.state.currentThreadId
			if (!threadId) {
				notificationService.info(localize2('voidCheckpointNoThread', 'No active chat thread.').value)
				return
			}
			const turns = await turnCheckpointService.listTurns(threadId)
			const lastCommitted = turns.filter(t => t.status === 'committed').pop()
			if (!lastCommitted) {
				notificationService.info(localize2('voidCheckpointNoTurns', 'No committed turn checkpoints found.').value)
				return
			}
			turnId = lastCommitted.turnId
		}

		const result = await turnCheckpointService.revertTo(turnId)

		if (result.conflicts.length > 0) {
			notificationService.warn(
				localize2('voidCheckpointConflicts', 'Revert completed with {0} conflict(s). Files may have been modified externally.', result.conflicts.length).value
			)
		}

		if (result.unrevertableCommands.length > 0) {
			notificationService.info(
				localize2('voidCheckpointUnrevertable', 'Revert completed. {0} command(s) cannot be undone: {1}', result.unrevertableCommands.length, result.unrevertableCommands.join(', ')).value
			)
		}

		if (result.conflicts.length === 0 && result.unrevertableCommands.length === 0) {
			notificationService.info(
				localize2('voidCheckpointSuccess', 'Reverted {0} turn(s), restored {1} file(s).', result.revertedTurns.length, result.filesRestored).value
			)
		}
	}
});


registerAction2(class extends Action2 {
	constructor() {
		super({
			id: VOID_CHECKPOINT_LIST_TURNS_ACTION_ID,
			f1: true,
			title: localize2('voidCheckpointListTurns', 'Void: List Turn Checkpoints'),
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const turnCheckpointService = accessor.get(ITurnCheckpointService)
		const notificationService = accessor.get(INotificationService)
		const chatThreadService = accessor.get(IChatThreadService)

		const threadId = chatThreadService.state.currentThreadId
		if (!threadId) {
			notificationService.info(localize2('voidCheckpointNoThread', 'No active chat thread.').value)
			return
		}

		const turns = await turnCheckpointService.listTurns(threadId)
		if (turns.length === 0) {
			notificationService.info(localize2('voidCheckpointNoTurns', 'No turn checkpoints found.').value)
			return
		}

		const summary = turns.map(t =>
			`[${t.status}] ${t.name} (${t.fileOpCount} ops, ${t.createdAt})`
		).join('\n')

		notificationService.info(
			localize2('voidCheckpointListResult', 'Turn checkpoints:\n{0}', summary).value
		)
	}
});
