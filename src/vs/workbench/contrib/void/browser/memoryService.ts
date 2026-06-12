/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { URI } from '../../../../base/common/uri.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { MemoryItem } from '../common/memoryServiceTypes.js';


export interface IMemoryService {
	readonly _serviceBrand: undefined

	readonly memories: readonly MemoryItem[]

	onDidChangeMemories: Event<readonly MemoryItem[]>

	// CRUD
	saveMemory(content: string, tags?: string[], existingId?: string): MemoryItem
	deleteMemory(id: string): boolean
	getMemory(id: string): MemoryItem | null
	getAllMemories(): readonly MemoryItem[]

	// Hierarchical .voidrules
	getHierarchicalRules(filePath?: string): string

	// Persistence
	persistMemories(): Promise<void>
	loadMemories(): Promise<void>
}

export const IMemoryService = createDecorator<IMemoryService>('memoryService');


class MemoryService extends Disposable implements IMemoryService {
	_serviceBrand: undefined;

	private _memories: MemoryItem[] = []

	private readonly _onDidChangeMemories = this._register(new Emitter<readonly MemoryItem[]>());
	readonly onDidChangeMemories: Event<readonly MemoryItem[]> = this._onDidChangeMemories.event;

	get memories(): readonly MemoryItem[] { return this._memories }

	constructor(
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IFileService private readonly _fileService: IFileService,
	) {
		super()
		this._autoLoad()
	}

	private _autoLoad(): void {
		this.loadMemories().catch(e => {
			console.error('MemoryService: auto-load failed', e)
		})
	}

	// --- CRUD ---

	saveMemory(content: string, tags: string[] = [], existingId?: string): MemoryItem {
		const now = Date.now()

		if (existingId) {
			const existing = this._memories.find(m => m.id === existingId)
			if (existing) {
				existing.content = content
				existing.tags = tags
				this._fireChanged()
				return existing
			}
		}

		const memory: MemoryItem = {
			id: generateUuid(),
			content,
			tags,
			createdAt: now,
		}
		this._memories.push(memory)
		this._fireChanged()
		return memory
	}

	deleteMemory(id: string): boolean {
		const idx = this._memories.findIndex(m => m.id === id)
		if (idx === -1) return false
		this._memories.splice(idx, 1)
		this._fireChanged()
		return true
	}

	getMemory(id: string): MemoryItem | null {
		return this._memories.find(m => m.id === id) ?? null
	}

	getAllMemories(): readonly MemoryItem[] {
		return this._memories
	}

	// --- Hierarchical .voidrules ---

	getHierarchicalRules(filePath?: string): string {
		const workspace = this._workspaceContextService.getWorkspace()
		const rules: string[] = []

		for (const folder of workspace.folders) {
			const rootPath = folder.uri.fsPath

			if (!filePath || filePath.startsWith(rootPath)) {
				// Collect .voidrules from root down to the file's directory
				const pathSegments = this._getPathSegmentsToFile(rootPath, filePath)
				for (const dirPath of pathSegments) {
					const ruleContent = this._tryReadVoidRulesSync(dirPath)
					if (ruleContent) {
						rules.push(`# Rules from: ${dirPath}/.voidrules\n${ruleContent}`)
					}
				}
			}
		}

		return rules.join('\n\n')
	}

	private _getPathSegmentsToFile(rootPath: string, filePath?: string): string[] {
		const segments: string[] = [rootPath]
		if (!filePath) return segments

		// Normalize separators
		const normalizedRoot = rootPath.replace(/\\/g, '/')
		const normalizedFile = filePath.replace(/\\/g, '/')

		if (!normalizedFile.startsWith(normalizedRoot)) return segments

		const relativePath = normalizedFile.substring(normalizedRoot.length + 1)
		const parts = relativePath.split('/')

		// Build directory paths from root to file's parent directory (not the file itself)
		let current = rootPath
		for (let i = 0; i < parts.length - 1; i++) {
			current = current + '/' + parts[i]
			segments.push(current)
		}

		return segments
	}

	private _tryReadVoidRulesSync(dirPath: string): string | null {
		// Note: This is a best-effort synchronous read via IFileService
		// In practice, the .voidrules files should be pre-loaded by the workbench contribution
		try {
			// We'll use the cached approach - this will be populated by convertToLLMMessageWorkbenchContrib
			return null // Subdirectory rules will be async-loaded on demand
		} catch {
			return null
		}
	}

	// --- Persistence ---

	async persistMemories(): Promise<void> {
		const memoriesPath = this._getMemoriesFilePath()
		if (!memoriesPath) return

		try {
			const parentDir = URI.joinPath(memoriesPath, '..')
			await this._fileService.createFolder(parentDir)
			const data = JSON.stringify(this._memories, null, 2)
			await this._fileService.writeFile(memoriesPath, VSBuffer.fromString(data))
		} catch (e) {
			console.error('MemoryService: persist failed', e)
		}
	}

	async loadMemories(): Promise<void> {
		const memoriesPath = this._getMemoriesFilePath()
		if (!memoriesPath) return

		try {
			const content = await this._fileService.readFile(memoriesPath)
			const memories = JSON.parse(content.value.toString()) as MemoryItem[]
			this._memories = memories
			this._onDidChangeMemories.fire(this._memories)
		} catch {
			// No saved memories or parse error
		}
	}

	// --- Helpers ---

	private _fireChanged(): void {
		this._onDidChangeMemories.fire(this._memories)
		this.persistMemories().catch(() => { /* ignore */ })
	}

	private _getMemoriesFilePath(): URI | null {
		const workspace = this._workspaceContextService.getWorkspace()
		const root = workspace.folders[0]?.uri
		if (!root) return null
		return URI.joinPath(root, '.void', 'memories.json')
	}
}

registerSingleton(IMemoryService, MemoryService, InstantiationType.Delayed);
