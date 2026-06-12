/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { URI } from '../../../../base/common/uri.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { hashAsync } from '../../../../base/common/hash.js';
import { TurnManifest, TurnSummary, RevertResult } from '../common/turnCheckpointTypes.js';


export interface ITurnCheckpointService {
	readonly _serviceBrand: undefined

	beginTurn(threadId: string, turnId: string, userMessage: string): Promise<void>
	commitTurn(turnId: string): Promise<void>
	abortTurn(turnId: string): Promise<void>

	recordEdit(turnId: string, uri: URI, beforeContent: string): Promise<void>
	recordCreate(turnId: string, uri: URI): Promise<void>
	recordDelete(turnId: string, uri: URI, beforeContent: string): Promise<void>
	recordCommand(turnId: string, command: string, cwd: string): Promise<void>

	revertTo(turnId: string): Promise<RevertResult>

	listTurns(threadId: string): Promise<TurnSummary[]>
	getTurn(turnId: string): Promise<TurnManifest | null>

	gcOldTurns(threadId: string, keepLatest?: number): Promise<void>
}

export const ITurnCheckpointService = createDecorator<ITurnCheckpointService>('turnCheckpointService');


// In-memory manifest cache (keyed by turnId)
const manifestCache = new Map<string, TurnManifest>();


class TurnCheckpointService extends Disposable implements ITurnCheckpointService {
	_serviceBrand: undefined;

	constructor(
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IFileService private readonly _fileService: IFileService,
	) {
		super()
	}

	private _getCheckpointsRoot(): URI {
		const workspace = this._workspaceContextService.getWorkspace()
		const root = workspace.folders[0]?.uri ?? URI.parse('')
		return URI.joinPath(root, '.void', 'checkpoints')
	}

	private _getTurnDir(turnId: string, threadId: string): URI {
		return URI.joinPath(this._getCheckpointsRoot(), threadId, turnId)
	}

	private _getFilesDir(turnId: string, threadId: string): URI {
		return URI.joinPath(this._getTurnDir(turnId, threadId), 'files')
	}

	private _getManifestUri(turnId: string, threadId: string): URI {
		return URI.joinPath(this._getTurnDir(turnId, threadId), 'manifest.json')
	}

	private async _writeManifest(manifest: TurnManifest): Promise<void> {
		manifestCache.set(manifest.turnId, manifest)
		const uri = this._getManifestUri(manifest.turnId, manifest.threadId)
		const content = VSBuffer.fromString(JSON.stringify(manifest, null, 2))
		await this._fileService.writeFile(uri, content)
	}

	private async _readManifest(turnId: string, threadId: string): Promise<TurnManifest | null> {
		const cached = manifestCache.get(turnId)
		if (cached) return cached

		try {
			const uri = this._getManifestUri(turnId, threadId)
			const content = await this._fileService.readFile(uri)
			const manifest = JSON.parse(content.value.toString()) as TurnManifest
			manifestCache.set(turnId, manifest)
			return manifest
		} catch {
			return null
		}
	}

	private async _hashContent(content: string): Promise<string> {
		return hashAsync(content)
	}

	private async _writeSnapshotFile(threadId: string, turnId: string, hash: string, content: string): Promise<void> {
		const filesDir = this._getFilesDir(turnId, threadId)
		const snapshotUri = URI.joinPath(filesDir, `${hash}.snapshot`)
		try {
			// Check if file already exists (dedup)
			await this._fileService.readFile(snapshotUri)
			// File exists, skip write
		} catch {
			// File doesn't exist, write it
			await this._fileService.createFile(snapshotUri, VSBuffer.fromString(content))
		}
	}

	private async _readSnapshotFile(threadId: string, turnId: string, hash: string): Promise<string | null> {
		const filesDir = this._getFilesDir(turnId, threadId)
		const snapshotUri = URI.joinPath(filesDir, `${hash}.snapshot`)
		try {
			const content = await this._fileService.readFile(snapshotUri)
			return content.value.toString()
		} catch {
			return null
		}
	}

	// --- Turn lifecycle ---

	async beginTurn(threadId: string, turnId: string, userMessage: string): Promise<void> {
		const turnDir = this._getTurnDir(turnId, threadId)
		const filesDir = this._getFilesDir(turnId, threadId)

		try {
			await this._fileService.createFolder(turnDir)
			await this._fileService.createFolder(filesDir)
		} catch { /* may already exist */ }

		const manifest: TurnManifest = {
			turnId,
			threadId,
			name: userMessage.split('\n')[0]?.substring(0, 80) ?? '(empty)',
			createdAt: new Date().toISOString(),
			status: 'pending',
			userMessage,
			fileOps: [],
		}
		await this._writeManifest(manifest)
	}

	async commitTurn(turnId: string): Promise<void> {
		const manifest = manifestCache.get(turnId)
		if (!manifest) return

		manifest.status = 'committed'
		manifest.committedAt = new Date().toISOString()
		await this._writeManifest(manifest)
	}

	async abortTurn(turnId: string): Promise<void> {
		const manifest = manifestCache.get(turnId)
		if (!manifest) return

		manifest.status = 'aborted'
		await this._writeManifest(manifest)

		// Clean up the turn directory
		try {
			const turnDir = this._getTurnDir(turnId, manifest.threadId)
			await this._fileService.del(turnDir, { recursive: true })
		} catch { /* ignore cleanup errors */ }

		manifestCache.delete(turnId)
	}

	// --- File operation recording ---

	async recordEdit(turnId: string, uri: URI, beforeContent: string): Promise<void> {
		const manifest = manifestCache.get(turnId)
		if (!manifest) return

		const beforeHash = await this._hashContent(beforeContent)
		await this._writeSnapshotFile(manifest.threadId, turnId, beforeHash, beforeContent)

		manifest.fileOps.push({
			kind: 'edit',
			uri: uri.toString(),
			beforeHash,
		})
		await this._writeManifest(manifest)
	}

	async recordCreate(turnId: string, uri: URI): Promise<void> {
		const manifest = manifestCache.get(turnId)
		if (!manifest) return

		manifest.fileOps.push({
			kind: 'create',
			uri: uri.toString(),
		})
		await this._writeManifest(manifest)
	}

	async recordDelete(turnId: string, uri: URI, beforeContent: string): Promise<void> {
		const manifest = manifestCache.get(turnId)
		if (!manifest) return

		const beforeHash = await this._hashContent(beforeContent)
		await this._writeSnapshotFile(manifest.threadId, turnId, beforeHash, beforeContent)

		manifest.fileOps.push({
			kind: 'delete',
			uri: uri.toString(),
			beforeHash,
		})
		await this._writeManifest(manifest)
	}

	async recordCommand(turnId: string, command: string, cwd: string): Promise<void> {
		const manifest = manifestCache.get(turnId)
		if (!manifest) return

		manifest.fileOps.push({
			kind: 'command',
			command,
			cwd,
			revertable: false,
		})
		await this._writeManifest(manifest)
	}

	// --- Revert ---

	async revertTo(turnId: string): Promise<RevertResult> {
		const targetManifest = manifestCache.get(turnId) ?? await this._findManifestAnywhere(turnId)
		if (!targetManifest) {
			return { revertedTurns: [], filesRestored: 0, filesDeleted: 0, unrevertableCommands: [], conflicts: [] }
		}

		const threadId = targetManifest.threadId

		// Collect all turns from target to latest
		const allTurns = await this.listTurns(threadId)
		const targetIdx = allTurns.findIndex(t => t.turnId === turnId)
		if (targetIdx < 0) {
			return { revertedTurns: [], filesRestored: 0, filesDeleted: 0, unrevertableCommands: [], conflicts: [] }
		}

		const turnsToRevert = allTurns.slice(targetIdx)
		const result: RevertResult = {
			revertedTurns: [],
			filesRestored: 0,
			filesDeleted: 0,
			unrevertableCommands: [],
			conflicts: [],
		}

		// Apply in reverse order (newest first)
		for (let i = turnsToRevert.length - 1; i >= 0; i--) {
			const turnSummary = turnsToRevert[i]
			const manifest = await this._readManifest(turnSummary.turnId, threadId)
			if (!manifest) continue

			// Reverse fileOps in reverse order
			for (let j = manifest.fileOps.length - 1; j >= 0; j--) {
				const op = manifest.fileOps[j]

				try {
					if (op.kind === 'edit' && op.uri && op.beforeHash) {
						const content = await this._readSnapshotFile(threadId, manifest.turnId, op.beforeHash)
						if (content !== null) {
							const fileUri = URI.parse(op.uri)
							await this._fileService.writeFile(fileUri, VSBuffer.fromString(content))
							result.filesRestored++
						}
					} else if (op.kind === 'create' && op.uri) {
						const fileUri = URI.parse(op.uri)
						try {
							await this._fileService.del(fileUri)
							result.filesDeleted++
						} catch { /* file may already be deleted */ }
					} else if (op.kind === 'delete' && op.uri && op.beforeHash) {
						const content = await this._readSnapshotFile(threadId, manifest.turnId, op.beforeHash)
						if (content !== null) {
							const fileUri = URI.parse(op.uri)
							await this._fileService.writeFile(fileUri, VSBuffer.fromString(content))
							result.filesRestored++
						}
					} else if (op.kind === 'command') {
						result.unrevertableCommands.push(op.command ?? '(unknown command)')
					}
				} catch (e) {
					if (op.uri) {
						result.conflicts.push({ uri: op.uri, reason: String(e) })
					}
				}
			}

			result.revertedTurns.push(manifest.turnId)
		}

		return result
	}

	// --- Query ---

	async listTurns(threadId: string): Promise<TurnSummary[]> {
		const turnsDir = URI.joinPath(this._getCheckpointsRoot(), threadId)
		const summaries: TurnSummary[] = []

		try {
			const entries = await this._fileService.resolve(turnsDir)
			for (const child of entries.children ?? []) {
				if (!child.isDirectory) continue
				const turnId = child.name
				const manifest = await this._readManifest(turnId, threadId)
				if (manifest) {
					summaries.push({
						turnId: manifest.turnId,
						threadId: manifest.threadId,
						name: manifest.name,
						createdAt: manifest.createdAt,
						status: manifest.status,
						fileOpCount: manifest.fileOps.length,
						hasUnrevertableOps: manifest.fileOps.some(op => op.kind === 'command'),
					})
				}
			}
		} catch { /* directory doesn't exist */ }

		// Sort by createdAt ascending
		summaries.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
		return summaries
	}

	async getTurn(turnId: string): Promise<TurnManifest | null> {
		const manifest = manifestCache.get(turnId)
		if (manifest) return manifest

		return this._findManifestAnywhere(turnId)
	}

	// --- GC ---

	async gcOldTurns(threadId: string, keepLatest = 30): Promise<void> {
		const turns = await this.listTurns(threadId)
		if (turns.length <= keepLatest) return

		const toDelete = turns.slice(0, turns.length - keepLatest)
		for (const turn of toDelete) {
			try {
				const turnDir = this._getTurnDir(turn.turnId, threadId)
				await this._fileService.del(turnDir, { recursive: true })
				manifestCache.delete(turn.turnId)
			} catch { /* ignore cleanup errors */ }
		}
	}

	// --- Private helpers ---

	private async _findManifestAnywhere(turnId: string): Promise<TurnManifest | null> {
		// Search across all thread directories
		try {
			const root = this._getCheckpointsRoot()
			const entries = await this._fileService.resolve(root)
			for (const child of entries.children ?? []) {
				if (!child.isDirectory) continue
				const threadId = child.name
				const manifest = await this._readManifest(turnId, threadId)
				if (manifest) return manifest
			}
		} catch { /* root doesn't exist */ }
		return null
	}
}

registerSingleton(ITurnCheckpointService, TurnCheckpointService, InstantiationType.Delayed);
