/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../base/common/lifecycle.js'


export type HookEvent =
	| 'PreToolUse'
	| 'PostToolUse'
	| 'ToolUseError'
	| 'SessionStart'
	| 'UserPromptSubmit'

export interface HookConfig {
	event: HookEvent
	toolNames?: string[]
	pathPattern?: string
	command?: string           // command hook (external process)
	jsHookId?: string          // JS hook reference (builtin)
	priority?: number          // default 0
	timeoutMs?: number         // default 10000
	description?: string
}

export interface HookPayload {
	event: HookEvent
	toolName?: string
	params?: any
	result?: any
	error?: string
	threadId: string
	workspaceRoot: string
	message?: string
}

export interface HookResult {
	decision: 'allow' | 'deny' | 'modify'
	modifiedParams?: any
	modifiedResult?: any
	message?: string
}

export interface IHookService {
	readonly _serviceBrand: undefined
	trigger(event: HookEvent, payload: HookPayload): Promise<HookResult[]>
	registerBuiltinHook(event: HookEvent, hook: (p: HookPayload) => Promise<HookResult>): IDisposable
	reloadConfig(): Promise<void>
}
