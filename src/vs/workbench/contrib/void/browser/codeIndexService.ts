/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { URI } from '../../../../base/common/uri.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { CodeIndexState, SearchResult, MerkleNode, MerkleDiff, CodeChunk, ChunkMetadata } from '../common/codeIndexTypes.js';
import { hashAsync } from '../../../../base/common/hash.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { ITreeSitterParserService } from '../../../../editor/common/services/treeSitterParserService.js';
import { ISearchService, QueryType, resultIsMatch } from '../../../services/search/common/search.js';
import { hashEmbed, cosineSimilarity } from '../common/helpers/hashEmbed.js';


export interface ICodeIndexService {
	readonly _serviceBrand: undefined

	readonly state: CodeIndexState
	readonly indexedFileCount: number
	readonly indexedChunkCount: number
	readonly totalFileCount: number

	readonly onDidChangeState: Event<CodeIndexState>
	readonly onDidChangeProgress: Event<{ indexedFiles: number, totalFiles: number, indexedChunks: number }>

	startIndexing(workspaceRoot: URI): Promise<void>
	incrementalUpdate(): Promise<void>
	search(query: string, topK: number, filter?: { language?: string, searchInFolder?: string }): Promise<SearchResult[]>
	stop(): void

	getCachePath(): string | undefined
	getCacheSize(): Promise<{ totalBytes: number, fileCount: number }>
	clearCache(): Promise<void>
}

export const ICodeIndexService = createDecorator<ICodeIndexService>('codeIndexService');


// --- MerkleTree ---

const DEFAULT_IGNORE = [
	'node_modules', '.git', '.void', 'dist', 'out', 'build',
	'*.min.js', '*.min.css', '*.map', '*.lock',
	'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
]

// 跳过超大文件：手写源码极少 > 1MB，超过的几乎都是生成物/数据文件，索引它们只会污染检索、拖慢索引
const MAX_INDEX_FILE_BYTES = 1_000_000

function isIgnored(name: string, patterns: string[]): boolean {
	for (const p of patterns) {
		if (p.startsWith('*') && name.endsWith(p.slice(1))) return true
		if (name === p) return true
	}
	return false
}

class MerkleTree {
	static async build(
		workspaceRoot: URI,
		ignorePatterns: string[],
		fileService: IFileService,
	): Promise<MerkleNode> {
		const allIgnore = [...DEFAULT_IGNORE, ...ignorePatterns]
		return MerkleTree._buildNode(workspaceRoot, allIgnore, fileService)
	}

	private static async _buildNode(
		uri: URI,
		ignorePatterns: string[],
		fileService: IFileService,
	): Promise<MerkleNode> {
		try {
			const stat = await fileService.resolve(uri, { resolveMetadata: true })
			if (stat.isFile) {
				const content = await fileService.readFile(uri)
				const text = content.value.toString()
				const hash = await hashAsync(text)
				return { hash, filePath: uri.fsPath, children: [] }
			}

			// Directory
			const children: MerkleNode[] = []
			if (stat.children) {
				for (const child of stat.children) {
					const name = child.name
					if (isIgnored(name, ignorePatterns)) continue
					const childNode = await MerkleTree._buildNode(child.resource, ignorePatterns, fileService)
					children.push(childNode)
				}
			}

			// Hash = hash of concatenated child hashes
			const childHashes = children.map(c => c.hash).join('')
			const hash = childHashes ? await hashAsync(childHashes) : ''
			return { hash, children }
		} catch {
			return { hash: '', children: [] }
		}
	}

	static diff(oldTree: MerkleNode, newTree: MerkleNode): MerkleDiff {
		const added: string[] = []
		const modified: string[] = []
		const deleted: string[] = []

		const oldMap = MerkleTree._flattenChildren(oldTree)
		const newMap = MerkleTree._flattenChildren(newTree)

		for (const [path, hash] of newMap) {
			if (!oldMap.has(path)) added.push(path)
			else if (oldMap.get(path) !== hash) modified.push(path)
		}
		for (const [path] of oldMap) {
			if (!newMap.has(path)) deleted.push(path)
		}

		return { added, modified, deleted }
	}

	private static _flattenChildren(node: MerkleNode): Map<string, string> {
		const map = new Map<string, string>()
		for (const child of node.children ?? []) {
			if (child.filePath && (child.children ?? []).length === 0) {
				// Leaf node (file) — map filePath → hash
				map.set(child.filePath, child.hash)
			}
			const nested = MerkleTree._flattenChildren(child)
			for (const [k, v] of nested) map.set(k, v)
		}
		return map
	}

	static async saveSnapshot(tree: MerkleNode, path: URI, fileService: IFileService): Promise<void> {
		const data = JSON.stringify(tree)
		await fileService.writeFile(path, VSBuffer.fromString(data))
	}

	static async loadSnapshot(path: URI, fileService: IFileService): Promise<MerkleNode | null> {
		try {
			const content = await fileService.readFile(path)
			return JSON.parse(content.value.toString()) as MerkleNode
		} catch {
			return null
		}
	}
}


// --- CodeChunker (AST-aware with naive fallback) ---

// Top-level AST node types that represent semantic units, by language
const AST_CHUNK_TYPES: Record<string, Set<string>> = {
	typescript: new Set([
		'function_declaration', 'class_declaration', 'method_definition',
		'arrow_function', 'export_statement', 'interface_declaration',
		'type_alias_declaration', 'enum_declaration', 'lexical_declaration',
	]),
	javascript: new Set([
		'function_declaration', 'class_declaration', 'method_definition',
		'arrow_function', 'export_statement', 'lexical_declaration',
	]),
	python: new Set([
		'function_definition', 'class_definition', 'decorated_definition',
	]),
	rust: new Set([
		'function_item', 'impl_item', 'struct_item', 'enum_item',
		'trait_item', 'mod_item', 'type_item',
	]),
	go: new Set([
		'function_declaration', 'method_declaration', 'type_declaration',
	]),
	css: new Set([
		'rule_set', 'media_statement', 'keyframes_statement',
	]),
}

class CodeChunker {
	private readonly MAX_CHUNK_CHARS = 2000
	private readonly MIN_CHUNK_LINES = 3

	async chunkFileAST(
		filePath: string,
		content: string,
		language: string,
		treeSitterService: ITreeSitterParserService | null,
	): Promise<CodeChunk[]> {
		// Attempt AST-aware chunking if tree-sitter is available
		if (treeSitterService) {
			try {
				const tree = await treeSitterService.getTree(content, language)
				if (tree) {
					const chunks = this._chunkFromAST(filePath, content, language, tree.rootNode)
					if (chunks.length > 0) return chunks
				}
			} catch {
				// Fall through to naive chunking
			}
		}
		return this._chunkNaive(filePath, content, language)
	}

	private _chunkFromAST(filePath: string, content: string, language: string, rootNode: any): CodeChunk[] {
		const chunks: CodeChunk[] = []
		const lines = content.split('\n')
		const chunkTypes = AST_CHUNK_TYPES[language]
		if (!chunkTypes) return [] // No AST types defined → fallback to naive

		const coveredRanges: { start: number, end: number }[] = []

		// Walk top-level children of root
		const cursor = rootNode.walk()
		if (!cursor.gotoFirstChild()) return []

		do {
			const node = cursor.currentNode
			const nodeType: string = node.type
			const startRow: number = node.startPosition.row + 1 // 1-indexed
			const endRow: number = node.endPosition.row + 1
			const lineCount = endRow - startRow + 1

			if (chunkTypes.has(nodeType) && lineCount >= this.MIN_CHUNK_LINES) {
				const chunkContent = lines.slice(startRow - 1, endRow).join('\n')

				// Split oversized nodes into sub-chunks
				if (chunkContent.length > this.MAX_CHUNK_CHARS * 2) {
					chunks.push(...this._splitLargeChunk(filePath, lines, language, startRow, endRow, nodeType))
				} else {
					chunks.push({
						id: `${filePath}:${startRow}:${endRow}`,
						filePath,
						startLine: startRow,
						endLine: endRow,
						content: chunkContent,
						language,
						symbolName: this._extractSymbolName(node),
						symbolKind: this._nodeTypeToKind(nodeType),
						tokenCount: Math.ceil(chunkContent.length / 4),
					})
				}
				coveredRanges.push({ start: startRow, end: endRow })
			}
		} while (cursor.gotoNextSibling())

		// Collect uncovered gaps as "interstitial" chunks
		coveredRanges.sort((a, b) => a.start - b.start)
		let lastEnd = 0
		for (const range of coveredRanges) {
			if (range.start - lastEnd > this.MIN_CHUNK_LINES) {
				const gapContent = lines.slice(lastEnd, range.start - 1).join('\n').trim()
				if (gapContent.length > 20) {
					chunks.push({
						id: `${filePath}:${lastEnd + 1}:${range.start - 1}`,
						filePath,
						startLine: lastEnd + 1,
						endLine: range.start - 1,
						content: gapContent,
						language,
						tokenCount: Math.ceil(gapContent.length / 4),
					})
				}
			}
			lastEnd = range.end
		}
		// Trailing gap
		if (lastEnd < lines.length) {
			const trailContent = lines.slice(lastEnd).join('\n').trim()
			if (trailContent.length > 20) {
				chunks.push({
					id: `${filePath}:${lastEnd + 1}:${lines.length}`,
					filePath,
					startLine: lastEnd + 1,
					endLine: lines.length,
					content: trailContent,
					language,
					tokenCount: Math.ceil(trailContent.length / 4),
				})
			}
		}

		chunks.sort((a, b) => a.startLine - b.startLine)
		return chunks
	}

	private _splitLargeChunk(
		filePath: string, lines: string[], language: string,
		startRow: number, endRow: number, nodeType: string,
	): CodeChunk[] {
		const subChunks: CodeChunk[] = []
		let curStart = startRow
		let curChars = 0
		for (let i = startRow - 1; i < endRow; i++) {
			curChars += lines[i].length + 1
			if (curChars >= this.MAX_CHUNK_CHARS) {
				const sc = lines.slice(curStart - 1, i + 1).join('\n')
				subChunks.push({
					id: `${filePath}:${curStart}:${i + 1}`,
					filePath,
					startLine: curStart,
					endLine: i + 1,
					content: sc,
					language,
					symbolKind: this._nodeTypeToKind(nodeType),
					tokenCount: Math.ceil(sc.length / 4),
				})
				curStart = i + 2
				curChars = 0
			}
		}
		if (curStart <= endRow) {
			const sc = lines.slice(curStart - 1, endRow).join('\n')
			subChunks.push({
				id: `${filePath}:${curStart}:${endRow}`,
				filePath,
				startLine: curStart,
				endLine: endRow,
				content: sc,
				language,
				symbolKind: this._nodeTypeToKind(nodeType),
				tokenCount: Math.ceil(sc.length / 4),
			})
		}
		return subChunks
	}

	private _extractSymbolName(node: any): string | undefined {
		try {
			const nameChild = node.childForFieldName?.('name')
			return nameChild?.text
		} catch { return undefined }
	}

	private _nodeTypeToKind(nodeType: string): string {
		if (nodeType.includes('function') || nodeType.includes('method') || nodeType.includes('arrow')) return 'function'
		if (nodeType.includes('class') || nodeType.includes('impl')) return 'class'
		if (nodeType.includes('interface')) return 'interface'
		if (nodeType.includes('enum')) return 'enum'
		if (nodeType.includes('type') || nodeType.includes('struct')) return 'type'
		if (nodeType.includes('export')) return 'export'
		if (nodeType.includes('mod') || nodeType.includes('trait')) return 'module'
		return 'other'
	}

	_chunkNaive(filePath: string, content: string, language: string): CodeChunk[] {
		const chunks: CodeChunk[] = []
		const lines = content.split('\n')
		let currentLines: string[] = []
		let startLine = 1

		for (let i = 0; i < lines.length; i++) {
			currentLines.push(lines[i])
			const text = currentLines.join('\n')

			if (text.length >= this.MAX_CHUNK_CHARS || (i < lines.length - 1 && lines[i].trim() === '' && lines[i + 1].trim() === '' && currentLines.length > 3)) {
				if (currentLines.length > 0) {
					const chunkContent = currentLines.join('\n')
					chunks.push({
						id: `${filePath}:${startLine}:${startLine + currentLines.length - 1}`,
						filePath,
						startLine,
						endLine: startLine + currentLines.length - 1,
						content: chunkContent,
						language,
						tokenCount: Math.ceil(chunkContent.length / 4),
					})
					startLine = i + 2
					currentLines = []
				}
			}
		}

		if (currentLines.length > 0) {
			const chunkContent = currentLines.join('\n')
			chunks.push({
				id: `${filePath}:${startLine}:${startLine + currentLines.length - 1}`,
				filePath,
				startLine,
				endLine: startLine + currentLines.length - 1,
				content: chunkContent,
				language,
				tokenCount: Math.ceil(chunkContent.length / 4),
			})
		}

		return chunks
	}
}


// --- EmbeddingService (hash-based, zero external deps) ---
// Uses FNV-1a feature hashing + bigrams to produce dense vectors.
// Functional baseline; swap in ONNX (all-MiniLM-L6-v2) for higher quality.

class EmbeddingService {
	private _ready = false
	private readonly DIMS = 384

	get isReady(): boolean { return this._ready }

	async initialize(): Promise<void> {
		this._ready = true
	}

	async embed(text: string): Promise<Float32Array> {
		return hashEmbed(text, { dims: this.DIMS })
	}

	async embedBatch(texts: string[]): Promise<Float32Array[]> {
		return texts.map(t => hashEmbed(t, { dims: this.DIMS }))
	}
}


// --- VectorStore (stub) ---

class VectorStore {
	private _items: { embedding: Float32Array, metadata: ChunkMetadata }[] = []

	async open(dbPath: string): Promise<void> {
		// In-memory store; SQLite/sqlite-vec integration is future work
	}

	async insert(embedding: Float32Array, metadata: ChunkMetadata): Promise<void> {
		this._items.push({ embedding, metadata })
	}

	async insertBatch(items: { embedding: Float32Array, metadata: ChunkMetadata }[]): Promise<void> {
		this._items.push(...items)
	}

	async search(queryEmbedding: Float32Array, topK: number, filter?: { language?: string, searchInFolder?: string }): Promise<SearchResult[]> {
		if (this._items.length === 0) return []

		const candidates = filter
			? this._items.filter(item => {
				if (filter.language && item.metadata.language !== filter.language) return false
				if (filter.searchInFolder && !item.metadata.filePath.startsWith(filter.searchInFolder)) return false
				return true
			})
			: this._items

		const scored = candidates.map(item => ({
			metadata: item.metadata,
			score: cosineSimilarity(queryEmbedding, item.embedding),
		}))

		scored.sort((a, b) => b.score - a.score)
		return scored.slice(0, topK).map(s => ({ metadata: s.metadata, score: s.score, content: '' }))
	}

	async deleteByFilePath(filePath: string): Promise<void> {
		this._items = this._items.filter(item => item.metadata.filePath !== filePath)
	}

	async getIndexedFiles(): Promise<string[]> {
		const files = new Set(this._items.map(item => item.metadata.filePath))
		return Array.from(files)
	}

	async close(): Promise<void> {
		this._items = []
	}
}


// --- CodeIndexService ---

class CodeIndexService extends Disposable implements ICodeIndexService {
	_serviceBrand: undefined;

	private _state: CodeIndexState = 'idle';
	private _indexedFileCount = 0;
	private _indexedChunkCount = 0;
	private _totalFileCount = 0;
	private _syncInterval: ReturnType<typeof setInterval> | undefined;
	private _cancellationTokenSource: CancellationTokenSource | undefined;
	private _workspaceRoot: URI | undefined;

	private readonly _onDidChangeState = this._register(new Emitter<CodeIndexState>());
	readonly onDidChangeState: Event<CodeIndexState> = this._onDidChangeState.event;

	private readonly _onDidChangeProgress = this._register(new Emitter<{ indexedFiles: number, totalFiles: number, indexedChunks: number }>());
	readonly onDidChangeProgress: Event<{ indexedFiles: number, totalFiles: number, indexedChunks: number }> = this._onDidChangeProgress.event;

	private readonly _chunker = new CodeChunker();
	private readonly _embeddingService = new EmbeddingService();
	private readonly _vectorStore = new VectorStore();

	get state(): CodeIndexState { return this._state }
	get indexedFileCount(): number { return this._indexedFileCount }
	get indexedChunkCount(): number { return this._indexedChunkCount }
	get totalFileCount(): number { return this._totalFileCount }

	private _setState(newState: CodeIndexState): void {
		if (this._state !== newState) {
			this._state = newState
			this._onDidChangeState.fire(newState)
		}
	}

	constructor(
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IFileService private readonly _fileService: IFileService,
		@ITreeSitterParserService private readonly _treeSitterService: ITreeSitterParserService,
		@ISearchService private readonly _searchService: ISearchService,
	) {
		super()

		// Auto-start indexing after a short delay when workspace is available
		const autoStartTimeout = setTimeout(() => {
			this._tryAutoStartIndexing()
		}, 5000)
		this._register({ dispose: () => clearTimeout(autoStartTimeout) })

		// Re-index when workspace folders change
		this._register(this._workspaceContextService.onDidChangeWorkspaceFolders(() => {
			this.stop()
			this._tryAutoStartIndexing()
		}))
	}

	private _tryAutoStartIndexing(): void {
		const workspace = this._workspaceContextService.getWorkspace()
		const workspaceRoot = workspace.folders[0]?.uri
		if (workspaceRoot && this._state === 'idle') {
			this.startIndexing(workspaceRoot).catch(e => {
				console.error('CodeIndexService: auto-start failed', e)
			})
		}
	}

	async startIndexing(workspaceRoot: URI): Promise<void> {
		if (this._state === 'indexing') return

		this._cancellationTokenSource?.cancel()
		this._cancellationTokenSource?.dispose()
		this._cancellationTokenSource = new CancellationTokenSource()
		const token = this._cancellationTokenSource.token // Capture locally to avoid race condition
		this._workspaceRoot = workspaceRoot
		this._indexedFileCount = 0
		this._indexedChunkCount = 0
		this._totalFileCount = 0
		this._setState('indexing')

		try {
			// Initialize embedding service
			await this._embeddingService.initialize()

			// Open vector store
			const indexPath = URI.joinPath(workspaceRoot, '.void', 'index')
			await this._fileService.createFolder(indexPath)
			const dbPath = URI.joinPath(indexPath, 'index.db')
			await this._vectorStore.open(dbPath.fsPath)

			// Read .voidignore and merge with DEFAULT_IGNORE
			const userIgnore = await this._readIgnoreFile(workspaceRoot)
			const ignorePatterns = [...DEFAULT_IGNORE, ...userIgnore]

			// File traversal: count files before indexing so progress total stays stable
			const YIELD_BATCH_SIZE = 10 // Yield to render frame every N files
			let discoveredCount = 0

			for await (const fileUri of this._walkFilesStream(workspaceRoot, ignorePatterns)) {
				if (token.isCancellationRequested) return
				discoveredCount += fileUri ? 1 : 0
				if (discoveredCount % YIELD_BATCH_SIZE === 0) {
					await new Promise<void>(r => setTimeout(r, 16))
				}
			}

			this._totalFileCount = discoveredCount
			this._onDidChangeProgress.fire({
				indexedFiles: this._indexedFileCount,
				totalFiles: this._totalFileCount,
				indexedChunks: this._indexedChunkCount,
			})

			let processedCount = 0

			for await (const fileUri of this._walkFilesStream(workspaceRoot, ignorePatterns)) {
				if (token.isCancellationRequested) return
				processedCount++

				try {
					const content = await this._fileService.readFile(fileUri)
					const text = content.value.toString()
					const language = this._languageFromUri(fileUri)

					// Chunk → embed → store
					const chunks = await this._chunker.chunkFileAST(fileUri.fsPath, text, language, this._treeSitterService)
					const embeddings = await this._embeddingService.embedBatch(chunks.map((c: CodeChunk) => c.content))

					const items = chunks.map((chunk: CodeChunk, i: number) => ({
						embedding: embeddings[i],
						metadata: {
							id: chunk.id,
							filePath: chunk.filePath,
							startLine: chunk.startLine,
							endLine: chunk.endLine,
							language: chunk.language,
							symbolName: chunk.symbolName,
							symbolKind: chunk.symbolKind,
						},
					}))
					await this._vectorStore.insertBatch(items)

					this._indexedFileCount++
					this._indexedChunkCount += chunks.length
				} catch {
					// Skip files that can't be read/chunked
				}

				// Fire progress event for UI updates
				this._onDidChangeProgress.fire({
					indexedFiles: this._indexedFileCount,
					totalFiles: this._totalFileCount,
					indexedChunks: this._indexedChunkCount,
				})

				// Periodically yield to macro task queue so React can render
				if (processedCount % YIELD_BATCH_SIZE === 0) {
					await new Promise<void>(r => setTimeout(r, 16))
				}
			}

			// Build & save Merkle tree snapshot
			const tree = await MerkleTree.build(workspaceRoot, userIgnore, this._fileService)
			const snapshotPath = URI.joinPath(indexPath, 'merkle.json')
			await MerkleTree.saveSnapshot(tree, snapshotPath, this._fileService)

			this._setState(this._embeddingService.isReady ? 'ready' : 'error')

			// Start incremental sync timer (5 minutes)
			if (this._state === 'ready') {
				this._syncInterval = setInterval(() => {
					this.incrementalUpdate()
				}, 5 * 60 * 1000)
			}
		} catch (e) {
			this._setState('error')
			console.error('CodeIndexService: indexing failed', e)
		}
	}

	async incrementalUpdate(): Promise<void> {
		if (this._state !== 'ready') return

		try {
			const workspace = this._workspaceContextService.getWorkspace()
			const workspaceRoot = workspace.folders[0]?.uri
			if (!workspaceRoot) return

			const ignorePatterns = await this._readIgnoreFile(workspaceRoot)

			// Load old tree and build new one
			const indexPath = URI.joinPath(workspaceRoot, '.void', 'index')
			const snapshotPath = URI.joinPath(indexPath, 'merkle.json')
			const oldTree = await MerkleTree.loadSnapshot(snapshotPath, this._fileService)
			const newTree = await MerkleTree.build(workspaceRoot, ignorePatterns, this._fileService)

			if (oldTree) {
				const diff = MerkleTree.diff(oldTree, newTree)

				// Re-index modified and added files
				const changedPaths = [...diff.added, ...diff.modified]
				for (const path of changedPaths) {
					await this._vectorStore.deleteByFilePath(path)
					const fileUri = URI.file(path)
					try {
						const content = await this._fileService.readFile(fileUri)
						const text = content.value.toString()
						const language = this._languageFromUri(fileUri)
						const chunks = await this._chunker.chunkFileAST(path, text, language, this._treeSitterService)
						const embeddings = await this._embeddingService.embedBatch(chunks.map((c: CodeChunk) => c.content))
						const items = chunks.map((chunk: CodeChunk, i: number) => ({
							embedding: embeddings[i],
							metadata: {
								id: chunk.id,
								filePath: chunk.filePath,
								startLine: chunk.startLine,
								endLine: chunk.endLine,
								language: chunk.language,
								symbolName: chunk.symbolName,
								symbolKind: chunk.symbolKind,
							},
						}))
						await this._vectorStore.insertBatch(items)
					} catch {
						// Skip unreadable files
					}
				}

				// Remove deleted files from index
				for (const path of diff.deleted) {
					await this._vectorStore.deleteByFilePath(path)
				}
			}

			// Save updated snapshot
			await MerkleTree.saveSnapshot(newTree, snapshotPath, this._fileService)
		} catch (e) {
			console.error('CodeIndexService: incremental update failed', e)
		}
	}

	async search(query: string, topK: number, filter?: { language?: string, searchInFolder?: string }): Promise<SearchResult[]> {
		// When index is ready, use vector search
		if (this._state === 'ready') {
			const queryEmbedding = await this._embeddingService.embed(query)
			const results = await this._vectorStore.search(queryEmbedding, topK, filter)

			// Populate content from actual files
			for (const result of results) {
				try {
					const fileUri = URI.file(result.metadata.filePath)
					const fileContent = await this._fileService.readFile(fileUri)
					const lines = fileContent.value.toString().split('\n')
					const start = Math.max(0, result.metadata.startLine - 1)
					const end = Math.min(lines.length, result.metadata.endLine)
					result.content = lines.slice(start, end).join('\n')
				} catch {
					result.content = '(file not accessible)'
				}
			}

			return results
		}

		// Fallback: use ripgrep (ISearchService) when index is not ready
		return this._ripgrepFallbackSearch(query, topK, filter)
	}

	private async _ripgrepFallbackSearch(query: string, topK: number, filter?: { language?: string, searchInFolder?: string }): Promise<SearchResult[]> {
		const results: SearchResult[] = []
		try {
			const workspace = this._workspaceContextService.getWorkspace()
			const folderQueries = workspace.folders
				.filter(f => !filter?.searchInFolder || f.uri.fsPath.startsWith(filter.searchInFolder))
				.map(f => ({ folder: f.uri }))

			if (folderQueries.length === 0) return []

			const includePattern = filter?.language
				? { [`**/*.${this._langToExt(filter.language)}`]: true }
				: undefined

			const searchResult = await this._searchService.textSearch(
				{
					type: QueryType.Text,
					contentPattern: { pattern: query, isRegExp: false, isCaseSensitive: false, isWordMatch: false },
					folderQueries,
					includePattern,
					maxResults: topK * 3,
					surroundingContext: 5,
				},
			)

			for (const match of searchResult.results.slice(0, topK)) {
				if (!match.results || match.results.length === 0) continue
				for (const textResult of match.results) {
					if (results.length >= topK) break
					if (!resultIsMatch(textResult)) continue

					const firstRange = textResult.rangeLocations[0]?.source
					const lastRange = textResult.rangeLocations[textResult.rangeLocations.length - 1]?.source
					const startLine = firstRange?.startLineNumber ?? 1
					const endLine = lastRange?.endLineNumber ?? startLine

					// Read surrounding context (5 lines before/after)
					let content = textResult.previewText || ''
					try {
						const fileContent = await this._fileService.readFile(match.resource)
						const lines = fileContent.value.toString().split('\n')
						const ctxStart = Math.max(0, startLine - 6)
						const ctxEnd = Math.min(lines.length, endLine + 5)
						content = lines.slice(ctxStart, ctxEnd).join('\n')
					} catch {
						// Use previewText as fallback
					}

					results.push({
						metadata: {
							id: `${match.resource.fsPath}:${startLine}:${endLine}`,
							filePath: match.resource.fsPath,
							startLine,
							endLine,
							language: this._languageFromUri(match.resource),
						},
						score: 1.0 - (results.length * 0.05),
						content,
					})
				}
			}
		} catch (e) {
			console.error('CodeIndexService: ripgrep fallback search failed', e)
		}
		return results
	}

	private _langToExt(language: string): string {
		const langToExt: Record<string, string> = {
			typescript: '{ts,tsx}', javascript: '{js,jsx}', python: 'py',
			rust: 'rs', go: 'go', java: 'java', c: '{c,h}', cpp: '{cpp,hpp}',
			csharp: 'cs', ruby: 'rb', php: 'php', css: 'css', html: 'html',
		}
		return langToExt[language] ?? '*'
	}

	stop(): void {
		if (this._syncInterval) {
			clearInterval(this._syncInterval)
			this._syncInterval = undefined
		}
		this._cancellationTokenSource?.cancel()
		this._cancellationTokenSource?.dispose()
		this._setState('idle')
		this._vectorStore.close()
	}

	// --- helpers ---

	private async _readIgnoreFile(workspaceRoot: URI): Promise<string[]> {
		try {
			const ignoreUri = URI.joinPath(workspaceRoot, '.voidignore')
			const content = await this._fileService.readFile(ignoreUri)
			return content.value.toString()
				.split('\n')
				.map(l => l.trim())
				.filter(l => l && !l.startsWith('#'))
		} catch {
			return []
		}
	}

	private async *_walkFilesStream(dirUri: URI, ignorePatterns: string[]): AsyncGenerator<URI> {
		try {
			const stat = await this._fileService.resolve(dirUri, { resolveMetadata: true })
			if (!stat.children) return
			for (const child of stat.children) {
				if (isIgnored(child.name, ignorePatterns)) continue
				if (child.isFile) {
					if (child.size > MAX_INDEX_FILE_BYTES) continue // 跳过超大文件（生成物/数据文件）
					yield child.resource
				} else if (child.isDirectory) {
					yield* this._walkFilesStream(child.resource, ignorePatterns)
				}
			}
		} catch {
			// Skip unreadable directories
		}
	}

	private _languageFromUri(uri: URI): string {
		const ext = uri.path.split('.').pop()?.toLowerCase() ?? ''
		const extToLang: Record<string, string> = {
			ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
			py: 'python', rs: 'rust', go: 'go', java: 'java', kt: 'kotlin',
			c: 'c', h: 'c', cpp: 'cpp', hpp: 'cpp', cs: 'csharp',
			rb: 'ruby', php: 'php', swift: 'swift', m: 'objective-c',
			scala: 'scala', sh: 'shell', bash: 'shell', zsh: 'shell',
			sql: 'sql', html: 'html', css: 'css', scss: 'scss', less: 'less',
			json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml',
			md: 'markdown', xml: 'xml', dockerfile: 'dockerfile',
		}
		return extToLang[ext] ?? 'unknown'
	}

	getCachePath(): string | undefined {
		const root = this._workspaceRoot ?? this._workspaceContextService.getWorkspace().folders[0]?.uri
		if (!root) return undefined
		return URI.joinPath(root, '.void', 'index').fsPath
	}

	async getCacheSize(): Promise<{ totalBytes: number, fileCount: number }> {
		const cachePath = this.getCachePath()
		if (!cachePath) return { totalBytes: 0, fileCount: 0 }

		try {
			const cacheUri = URI.file(cachePath)
			return await this._calculateDirSize(cacheUri)
		} catch {
			return { totalBytes: 0, fileCount: 0 }
		}
	}

	async clearCache(): Promise<void> {
		this.stop()
		const cachePath = this.getCachePath()
		if (!cachePath) return

		try {
			const cacheUri = URI.file(cachePath)
			await this._fileService.del(cacheUri, { recursive: true })
		} catch {
			// Cache directory may not exist
		}

		this._indexedFileCount = 0
		this._indexedChunkCount = 0
		this._onDidChangeState.fire(this._state)
	}

	private async _calculateDirSize(dirUri: URI): Promise<{ totalBytes: number, fileCount: number }> {
		let totalBytes = 0
		let fileCount = 0
		try {
			const stat = await this._fileService.resolve(dirUri, { resolveMetadata: true })
			if (stat.isFile) {
				return { totalBytes: stat.size ?? 0, fileCount: 1 }
			}
			if (stat.children) {
				for (const child of stat.children) {
					const sub = await this._calculateDirSize(child.resource)
					totalBytes += sub.totalBytes
					fileCount += sub.fileCount
				}
			}
		} catch {
			// Skip unreadable
		}
		return { totalBytes, fileCount }
	}

	override dispose(): void {
		this.stop()
		super.dispose()
	}
}

registerSingleton(ICodeIndexService, CodeIndexService, InstantiationType.Delayed);
