/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { URI } from '../../../../base/common/uri.js';
import type { HookEvent, HookConfig, HookPayload, HookResult } from '../common/hookTypes.js';
import { match as globMatch } from '../../../../base/common/glob.js';
import { ITerminalToolService } from './terminalToolService.js';
import { generateUuid } from '../../../../base/common/uuid.js';

export interface IHookService {
	readonly _serviceBrand: undefined
	trigger(event: HookEvent, payload: HookPayload): Promise<HookResult[]>
	registerBuiltinHook(event: HookEvent, hook: (p: HookPayload) => Promise<HookResult>): IDisposable
	reloadConfig(): Promise<void>
}

export const IHookService = createDecorator<IHookService>('hookService');


type BuiltinHook = {
	event: HookEvent
	handler: (p: HookPayload) => Promise<HookResult>
}

class HookService extends Disposable implements IHookService {
	_serviceBrand: undefined;

	private _configs: HookConfig[] = [];
	private _builtinHooks: BuiltinHook[] = [];
	private _configLoaded = false;

	constructor(
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IFileService private readonly _fileService: IFileService,
		@ITerminalToolService private readonly _terminalToolService: ITerminalToolService,
	) {
		super()
		// Load config on creation
		this._loadConfig()
	}

	registerBuiltinHook(event: HookEvent, hook: (p: HookPayload) => Promise<HookResult>): IDisposable {
		const entry: BuiltinHook = { event, handler: hook }
		this._builtinHooks.push(entry)
		return toDisposable(() => {
			const idx = this._builtinHooks.indexOf(entry)
			if (idx >= 0) this._builtinHooks.splice(idx, 1)
		})
	}

	async trigger(event: HookEvent, payload: HookPayload): Promise<HookResult[]> {
		if (!this._configLoaded) await this._loadConfig()

		const results: HookResult[] = []

		// Collect matching hooks: builtin + config-based
		const builtinMatches = this._builtinHooks.filter(h => h.event === event)
		const configMatches = this._configs.filter(c => this._matchesConfig(c, event, payload))

		// Sort by priority (higher = runs first), builtin before config at same priority
		const allHooks: { type: 'builtin' | 'config', hook?: BuiltinHook, config?: HookConfig, priority: number }[] = [
			...builtinMatches.map(h => ({ type: 'builtin' as const, hook: h, priority: 0 })),
			...configMatches.map(c => ({ type: 'config' as const, config: c, priority: c.priority ?? 0 })),
		]
		allHooks.sort((a, b) => b.priority - a.priority)

		// Execute serially (PreToolUse needs serial for modifiedParams chaining)
		for (const entry of allHooks) {
			try {
				let result: HookResult
				if (entry.type === 'builtin' && entry.hook) {
					result = await entry.hook.handler(payload)
				} else if (entry.type === 'config' && entry.config) {
					result = await this._executeCommandHook(entry.config, payload)
				} else {
					continue
				}

				results.push(result)

				// If denied, stop executing further hooks
				if (result.decision === 'deny') break

				// If modified, update payload.params for next hook in chain
				if (result.decision === 'modify' && result.modifiedParams) {
					payload = { ...payload, params: result.modifiedParams }
				}
			} catch (e) {
				// Hook failed — treat as deny with error message
				results.push({ decision: 'deny', message: `Hook error: ${String(e)}` })
				break
			}
		}

		return results
	}

	async reloadConfig(): Promise<void> {
		await this._loadConfig()
	}

	// --- private ---

	private async _loadConfig(): Promise<void> {
		this._configs = []
		this._configLoaded = true

		const workspace = this._workspaceContextService.getWorkspace()

		// Load workspace-level .void/hooks.json
		const workspaceHooksPath = URI.joinPath(workspace.folders[0]?.uri ?? URI.parse(''), '.void', 'hooks.json')
		const workspaceConfigs = await this._readHookConfig(workspaceHooksPath)

		// Load user-level hooks.json
		// TODO: implement user-level config path resolution (%APPDATA%/Void/hooks.json)
		const userConfigs: HookConfig[] = []

		// Merge: workspace + user, sorted by priority (workspace takes precedence at same priority)
		this._configs = [...workspaceConfigs, ...userConfigs].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
	}

	private async _readHookConfig(uri: URI): Promise<HookConfig[]> {
		try {
			const content = await this._fileService.readFile(uri)
			const text = content.value.toString()
			const parsed = JSON.parse(text)
			if (parsed.hooks && Array.isArray(parsed.hooks)) {
				return parsed.hooks as HookConfig[]
			}
			return []
		} catch {
			// File doesn't exist or parse error — skip silently
			return []
		}
	}

	private _matchesConfig(config: HookConfig, event: HookEvent, payload: HookPayload): boolean {
		if (config.event !== event) return false

		// Filter by toolNames
		if (config.toolNames && config.toolNames.length > 0) {
			if (!payload.toolName || !config.toolNames.includes(payload.toolName)) return false
		}

		// Filter by pathPattern
		if (config.pathPattern && payload.params?.uri) {
			const filePath = URI.isUri(payload.params.uri) ? payload.params.uri.fsPath : String(payload.params.uri)
			if (!globMatch(config.pathPattern, filePath)) return false
		}

		return true
	}

	private async _executeCommandHook(config: HookConfig, payload: HookPayload): Promise<HookResult> {
		if (!config.command) return { decision: 'allow' }

		const timeoutMs = config.timeoutMs ?? 10_000

		// Build env var prefix for the command
		const envPrefix = [
			`VOID_HOOK_EVENT=${payload.event}`,
			payload.toolName ? `VOID_TOOL_NAME=${payload.toolName}` : '',
			payload.params?.uri ? `VOID_FILE_PATH=${URI.isUri(payload.params.uri) ? payload.params.uri.fsPath : String(payload.params.uri)}` : '',
		].filter(Boolean).join(' && ')

		// Wrap command with env prefix and JSON output parsing
		const fullCommand = `${envPrefix} && ${config.command}`

		const terminalId = `hook-${generateUuid()}`

		try {
			// Race between command execution and timeout
			const { interrupt, resPromise } = await this._terminalToolService.runCommand(fullCommand, {
				type: 'temporary',
				cwd: this._workspaceContextService.getWorkspace().folders[0]?.uri?.fsPath ?? null,
				terminalId,
			})

			const { result: output } = await Promise.race([
				resPromise,
				new Promise<never>((_, reject) => {
					setTimeout(() => {
						interrupt()
						reject(new Error(`Hook timed out after ${timeoutMs}ms`))
					}, timeoutMs)
				}),
			])

			// Try to parse the output as JSON
			const trimmed = output.trim()
			if (!trimmed) {
				return { decision: 'allow' }
			}

			try {
				const parsed = JSON.parse(trimmed)
				if (parsed.decision === 'deny' || parsed.decision === 'allow' || parsed.decision === 'modify') {
					return parsed as HookResult
				}
				// If decision field is missing/invalid, treat as allow with message
				return { decision: 'allow', message: parsed.message ?? trimmed }
			} catch {
				// Not JSON — treat stdout as message, allow by default
				return { decision: 'allow', message: trimmed || undefined }
			}
		} catch (e) {
			const errMsg = String(e)
			if (errMsg.includes('timed out')) {
				return { decision: 'deny', message: `Hook command timed out after ${timeoutMs}ms: ${config.command}` }
			}
			// Execution error — deny to be safe
			return { decision: 'deny', message: `Hook command failed: ${errMsg}` }
		}
	}
}

registerSingleton(IHookService, HookService, InstantiationType.Delayed);
