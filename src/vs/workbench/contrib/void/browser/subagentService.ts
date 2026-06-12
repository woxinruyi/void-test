/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { ISearchService } from '../../../services/search/common/search.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { URI } from '../../../../base/common/uri.js';
import { ICodeIndexService } from './codeIndexService.js';
import { SubagentTask, SubagentTaskResult, SubagentDispatchResult } from '../common/subagentServiceTypes.js';


export interface ISubagentService {
	readonly _serviceBrand: undefined

	dispatch(tasks: SubagentTask[]): Promise<SubagentDispatchResult>
}

export const ISubagentService = createDecorator<ISubagentService>('subagentService');


class SubagentService extends Disposable implements ISubagentService {
	_serviceBrand: undefined;

	constructor(
		@IFileService private readonly _fileService: IFileService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@ISearchService private readonly _searchService: ISearchService,
		@ICodeIndexService private readonly _codeIndexService: ICodeIndexService,
	) {
		super()
	}

	async dispatch(tasks: SubagentTask[]): Promise<SubagentDispatchResult> {
		const startTime = Date.now()

		// Cap at 10 parallel tasks to avoid resource exhaustion
		const cappedTasks = tasks.slice(0, 10)

		const resultPromises = cappedTasks.map(task => this._executeTask(task))
		const results = await Promise.all(resultPromises)

		const successCount = results.filter(r => r.success).length

		return {
			results,
			totalTasks: cappedTasks.length,
			successCount,
			totalDurationMs: Date.now() - startTime,
		}
	}

	private async _executeTask(task: SubagentTask): Promise<SubagentTaskResult> {
		const startTime = Date.now()
		try {
			const content = await this._runTask(task)
			return {
				id: task.id,
				type: task.type,
				description: task.description,
				success: true,
				content,
				durationMs: Date.now() - startTime,
			}
		} catch (e) {
			return {
				id: task.id,
				type: task.type,
				description: task.description,
				success: false,
				content: '',
				error: e instanceof Error ? e.message : String(e),
				durationMs: Date.now() - startTime,
			}
		}
	}

	private async _runTask(task: SubagentTask): Promise<string> {
		const params = task.params
		switch (params.type) {
			case 'grep':
				return this._runGrep(params.query, params.includePattern, params.searchInFolder)
			case 'read_file':
				return this._runReadFile(params.filePath, params.startLine, params.endLine)
			case 'semantic_search':
				return this._runSemanticSearch(params.query, params.maxResults)
			case 'list_symbols':
				return this._runListSymbols(params.filePath, params.query)
			default:
				throw new Error(`Unknown task type: ${(params as any).type}`)
		}
	}

	private async _runGrep(query: string, includePattern?: string, searchInFolder?: string): Promise<string> {
		const folders = searchInFolder
			? [URI.file(searchInFolder)]
			: this._workspaceContextService.getWorkspace().folders.map(f => f.uri)

		// Use ISearchService for text search
		const { QueryBuilder: _QueryBuilder } = await import('../../../services/search/common/queryBuilder.js')

		// We need to create a QueryBuilder without DI — use a minimal approach
		// Instead, directly use the search service's textSearch
		const searchQuery = {
			type: 2, // QueryType.Text
			contentPattern: {
				pattern: query,
				isRegExp: false,
			},
			folderQueries: folders.map(f => ({ folder: f })),
			includePattern: includePattern ? { [includePattern]: true } : undefined,
			maxResults: 50,
		}

		const data = await this._searchService.textSearch(searchQuery as any, CancellationToken.None)
		if (data.results.length === 0) return 'No matches found.'

		const lines: string[] = []
		for (const result of data.results.slice(0, 20)) {
			const filePath = result.resource.fsPath
			const matches = (result as any).results || []
			if (matches.length > 0) {
				for (const m of matches.slice(0, 3)) {
					const lineNum = m.range?.startLineNumber ?? '?'
					const preview = m.preview?.text?.trim() ?? ''
					lines.push(`${filePath}:${lineNum}: ${preview}`)
				}
			} else {
				lines.push(filePath)
			}
		}

		return `Found ${data.results.length} file(s) matching "${query}":\n${lines.join('\n')}`
	}

	private async _runReadFile(filePath: string, startLine?: number, endLine?: number): Promise<string> {
		const uri = URI.file(filePath)
		const fileContent = await this._fileService.readFile(uri)
		const text = fileContent.value.toString()
		const allLines = text.split('\n')

		const from = Math.max(0, (startLine ?? 1) - 1)
		const to = Math.min(allLines.length, endLine ?? allLines.length)
		const selectedLines = allLines.slice(from, to)

		// Cap output at ~5000 chars
		let output = selectedLines.map((l, i) => `${from + i + 1}\t${l}`).join('\n')
		if (output.length > 5000) {
			output = output.substring(0, 5000) + '\n... (truncated)'
		}

		return `File: ${filePath} (lines ${from + 1}-${to} of ${allLines.length})\n${output}`
	}

	private async _runSemanticSearch(query: string, maxResults?: number): Promise<string> {
		const results = await this._codeIndexService.search(query, maxResults ?? 5)
		if (results.length === 0) return `No semantic results for "${query}".`

		const lines = results.map((r, i) => {
			const meta = r.metadata
			const symInfo = meta.symbolName ? ` [${meta.symbolKind} ${meta.symbolName}]` : ''
			return `--- Result ${i + 1} (score: ${r.score.toFixed(3)})${symInfo} ---\nFile: ${meta.filePath}:${meta.startLine}-${meta.endLine}\n${r.content?.substring(0, 500) ?? '(no content)'}`
		})

		return `Semantic search: "${query}" — ${results.length} result(s)\n\n${lines.join('\n\n')}`
	}

	private async _runListSymbols(filePath?: string, query?: string): Promise<string> {
		// Simplified: use grep-based symbol search for now
		// Full LSP symbol search would require ILanguageFeaturesService which is complex to use here
		if (filePath) {
			const uri = URI.file(filePath)
			const fileContent = await this._fileService.readFile(uri)
			const text = fileContent.value.toString()
			const lines = text.split('\n')

			// Simple heuristic: find function/class/interface/type definitions
			const symbolPatterns = [
				/^\s*(export\s+)?(async\s+)?function\s+(\w+)/,
				/^\s*(export\s+)?(abstract\s+)?class\s+(\w+)/,
				/^\s*(export\s+)?interface\s+(\w+)/,
				/^\s*(export\s+)?type\s+(\w+)/,
				/^\s*(export\s+)?enum\s+(\w+)/,
				/^\s*(export\s+)?const\s+(\w+)\s*=/,
			]

			const symbols: string[] = []
			for (let i = 0; i < lines.length; i++) {
				for (const pattern of symbolPatterns) {
					const match = lines[i].match(pattern)
					if (match) {
						const name = match[match.length - 1]
						if (!query || name.toLowerCase().includes(query.toLowerCase())) {
							symbols.push(`  L${i + 1}: ${lines[i].trim()}`)
						}
						break
					}
				}
			}

			if (symbols.length === 0) return `No symbols found in ${filePath}${query ? ` matching "${query}"` : ''}`
			return `Symbols in ${filePath}${query ? ` matching "${query}"` : ''}:\n${symbols.join('\n')}`
		}

		return 'list_symbols requires a filePath parameter.'
	}
}

registerSingleton(ISubagentService, SubagentService, InstantiationType.Delayed);
