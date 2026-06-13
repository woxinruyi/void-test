import { CancellationToken } from '../../../../base/common/cancellation.js'
import { Position } from '../../../../editor/common/core/position.js'
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js'
import { URI } from '../../../../base/common/uri.js'
import { IFileService } from '../../../../platform/files/common/files.js'
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js'
import { createDecorator, IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js'
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js'
import { QueryBuilder } from '../../../services/search/common/queryBuilder.js'
import { ISearchService } from '../../../services/search/common/search.js'
import { IEditCodeService } from './editCodeServiceInterface.js'
import { ITerminalToolService } from './terminalToolService.js'
import { LintErrorItem, BuiltinToolCallParams, BuiltinToolResultType, BuiltinToolName, LocationResult } from '../common/toolsServiceTypes.js'
import { IVoidModelService } from '../common/voidModelService.js'
import { EndOfLinePreference } from '../../../../editor/common/model.js'
import { IVoidCommandBarService } from './voidCommandBarService.js'
import { computeDirectoryTree1Deep, IDirectoryStrService, stringifyDirectoryTree1Deep } from '../common/directoryStrService.js'
import { IMarkerService, MarkerSeverity } from '../../../../platform/markers/common/markers.js'
import { timeout } from '../../../../base/common/async.js'
import { RawToolParamsObj } from '../common/sendLLMMessageTypes.js'
import { MAX_CHILDREN_URIs_PAGE, MAX_FILE_CHARS_PAGE, MAX_TERMINAL_BG_COMMAND_TIME, MAX_TERMINAL_CHARS, MAX_TERMINAL_INACTIVE_TIME, truncateMiddle } from '../common/prompt/prompts.js'
import { IVoidSettingsService } from '../common/voidSettingsService.js'
import { generateUuid } from '../../../../base/common/uuid.js'
import { DocumentSymbol, type Location, type LocationLink } from '../../../../editor/common/languages.js'
import { getWorkspaceSymbols } from '../../../contrib/search/common/search.js'
import { ICodeIndexService } from './codeIndexService.js'
import { IPlanningService } from './planningService.js'
import { TodoStatus, TodoPriority } from '../common/planningServiceTypes.js'
import { ISubagentService } from './subagentService.js'
import { SubagentTask, SubagentTaskParams } from '../common/subagentServiceTypes.js'
import { IWebSearchService } from './webSearchService.js'
import { IMemoryService } from './memoryService.js'
import { IRemoteIndexService } from './remoteIndexService.js'
import { IContextCompactionService } from './contextCompactionService.js'
import { IChatThreadService } from './chatThreadService.js'
import { getModelCapabilities } from '../common/modelCapabilities.js'
import { computeContextBudget, formatContextBudget } from '../common/contextBudget.js'


// tool use for AI
type ValidateBuiltinParams = { [T in BuiltinToolName]: (p: RawToolParamsObj) => BuiltinToolCallParams[T] }
type CallBuiltinTool = { [T in BuiltinToolName]: (p: BuiltinToolCallParams[T]) => Promise<{ result: BuiltinToolResultType[T] | Promise<BuiltinToolResultType[T]>, interruptTool?: () => void }> }
type BuiltinToolResultToString = { [T in BuiltinToolName]: (p: BuiltinToolCallParams[T], result: Awaited<BuiltinToolResultType[T]>) => string }


const isFalsy = (u: unknown) => {
	return !u || u === 'null' || u === 'undefined'
}

const validateStr = (argName: string, value: unknown) => {
	if (value === null) throw new Error(`Invalid LLM output: ${argName} was null.`)
	if (typeof value !== 'string') throw new Error(`Invalid LLM output format: ${argName} must be a string, but its type is "${typeof value}". Full value: ${JSON.stringify(value)}.`)
	return value
}


// We are NOT checking to make sure in workspace
const validateURI = (uriStr: unknown) => {
	if (uriStr === null) throw new Error(`Invalid LLM output: uri was null.`)
	if (typeof uriStr !== 'string') throw new Error(`Invalid LLM output format: Provided uri must be a string, but it's a(n) ${typeof uriStr}. Full value: ${JSON.stringify(uriStr)}.`)

	// Check if it's already a full URI with scheme (e.g., vscode-remote://, file://, etc.)
	// Look for :// pattern which indicates a scheme is present
	// Examples of supported URIs:
	// - vscode-remote://wsl+Ubuntu/home/user/file.txt (WSL)
	// - vscode-remote://ssh-remote+myserver/home/user/file.txt (SSH)
	// - file:///home/user/file.txt (local file with scheme)
	// - /home/user/file.txt (local file path, will be converted to file://)
	// - C:\Users\file.txt (Windows local path, will be converted to file://)
	if (uriStr.includes('://')) {
		try {
			const uri = URI.parse(uriStr)
			return uri
		} catch (e) {
			// If parsing fails, it's a malformed URI
			throw new Error(`Invalid URI format: ${uriStr}. Error: ${e}`)
		}
	} else {
		// No scheme present, treat as file path
		// This handles regular file paths like /home/user/file.txt or C:\Users\file.txt
		const uri = URI.file(uriStr)
		return uri
	}
}

const validateOptionalURI = (uriStr: unknown) => {
	if (isFalsy(uriStr)) return null
	return validateURI(uriStr)
}

const validateOptionalStr = (argName: string, str: unknown) => {
	if (isFalsy(str)) return null
	return validateStr(argName, str)
}


const validatePageNum = (pageNumberUnknown: unknown) => {
	if (!pageNumberUnknown) return 1
	const parsedInt = Number.parseInt(pageNumberUnknown + '')
	if (!Number.isInteger(parsedInt)) throw new Error(`Page number was not an integer: "${pageNumberUnknown}".`)
	if (parsedInt < 1) throw new Error(`Invalid LLM output format: Specified page number must be 1 or greater: "${pageNumberUnknown}".`)
	return parsedInt
}

const validateNumber = (numStr: unknown, opts: { default: number | null }) => {
	if (typeof numStr === 'number')
		return numStr
	if (isFalsy(numStr)) return opts.default

	if (typeof numStr === 'string') {
		const parsedInt = Number.parseInt(numStr + '')
		if (!Number.isInteger(parsedInt)) return opts.default
		return parsedInt
	}

	return opts.default
}

const validateProposedTerminalId = (terminalIdUnknown: unknown) => {
	if (!terminalIdUnknown) throw new Error(`A value for terminalID must be specified, but the value was "${terminalIdUnknown}"`)
	const terminalId = terminalIdUnknown + ''
	return terminalId
}

const validateBoolean = (b: unknown, opts: { default: boolean }) => {
	if (typeof b === 'string') {
		if (b === 'true') return true
		if (b === 'false') return false
	}
	if (typeof b === 'boolean') {
		return b
	}
	return opts.default
}


const checkIfIsFolder = (uriStr: string) => {
	uriStr = uriStr.trim()
	if (uriStr.endsWith('/') || uriStr.endsWith('\\')) return true
	return false
}

// Normalize LLM-hallucinated parameter names to Void's expected names.
// LLMs trained on Windsurf/Cursor/Claude Code often emit different param names.
const normalizeToolParams = (params: RawToolParamsObj): RawToolParamsObj => {
	const p = { ...params }
	// uri aliases: path, file_path, file, filepath, filename
	if (!p.uri && (p.path || p.file_path || p.file || p.filepath || p.filename)) {
		p.uri = p.path || p.file_path || p.file || p.filepath || p.filename
	}
	// new_content aliases: contents, content, file_text, code
	if (!p.new_content && (p.contents || p.content || p.file_text || p.code)) {
		p.new_content = p.contents || p.content || p.file_text || p.code
	}
	// search_replace_blocks aliases: diff, changes, edits_text
	if (!p.search_replace_blocks && (p.diff || p.changes)) {
		p.search_replace_blocks = p.diff || p.changes
	}
	// command aliases: cmd
	if (!p.command && p.cmd) {
		p.command = p.cmd
	}
	return p
}

export interface IToolsService {
	readonly _serviceBrand: undefined;
	validateParams: ValidateBuiltinParams;
	callTool: CallBuiltinTool;
	stringOfResult: BuiltinToolResultToString;
}

export const IToolsService = createDecorator<IToolsService>('ToolsService');

export class ToolsService implements IToolsService {

	readonly _serviceBrand: undefined;

	public validateParams: ValidateBuiltinParams;
	public callTool: CallBuiltinTool;
	public stringOfResult: BuiltinToolResultToString;

	constructor(
		@IFileService fileService: IFileService,
		@IWorkspaceContextService workspaceContextService: IWorkspaceContextService,
		@ISearchService searchService: ISearchService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IVoidModelService private readonly voidModelService: IVoidModelService,
		@IEditCodeService editCodeService: IEditCodeService,
		@ITerminalToolService private readonly terminalToolService: ITerminalToolService,
		@IVoidCommandBarService private readonly commandBarService: IVoidCommandBarService,
		@IDirectoryStrService private readonly directoryStrService: IDirectoryStrService,
		@IMarkerService private readonly markerService: IMarkerService,
		@IVoidSettingsService private readonly voidSettingsService: IVoidSettingsService,
		@ILanguageFeaturesService private readonly langFeaturesService: ILanguageFeaturesService,
		@ICodeIndexService private readonly codeIndexService: ICodeIndexService,
		@IPlanningService private readonly planningService: IPlanningService,
		@ISubagentService private readonly subagentService: ISubagentService,
		@IWebSearchService private readonly webSearchService: IWebSearchService,
		@IMemoryService private readonly memoryService: IMemoryService,
		@IRemoteIndexService private readonly remoteIndexService: IRemoteIndexService,
		@IContextCompactionService private readonly contextCompactionService: IContextCompactionService,
	) {
		const queryBuilder = instantiationService.createInstance(QueryBuilder);

		this.validateParams = {
			read_file: (params: RawToolParamsObj) => {
				const { uri: uriStr, start_line: startLineUnknown, end_line: endLineUnknown, page_number: pageNumberUnknown } = params
				const uri = validateURI(uriStr)
				const pageNumber = validatePageNum(pageNumberUnknown)

				let startLine = validateNumber(startLineUnknown, { default: null })
				let endLine = validateNumber(endLineUnknown, { default: null })

				if (startLine !== null && startLine < 1) startLine = null
				if (endLine !== null && endLine < 1) endLine = null

				return { uri, startLine, endLine, pageNumber }
			},
			ls_dir: (params: RawToolParamsObj) => {
				const { uri: uriStr, page_number: pageNumberUnknown } = params

				const uri = validateURI(uriStr)
				const pageNumber = validatePageNum(pageNumberUnknown)
				return { uri, pageNumber }
			},
			get_dir_tree: (params: RawToolParamsObj) => {
				const { uri: uriStr, } = params
				const uri = validateURI(uriStr)
				return { uri }
			},
			search_pathnames_only: (params: RawToolParamsObj) => {
				const {
					query: queryUnknown,
					search_in_folder: includeUnknown,
					page_number: pageNumberUnknown
				} = params

				const queryStr = validateStr('query', queryUnknown)
				const pageNumber = validatePageNum(pageNumberUnknown)
				const includePattern = validateOptionalStr('include_pattern', includeUnknown)

				return { query: queryStr, includePattern, pageNumber }

			},
			search_for_files: (params: RawToolParamsObj) => {
				const {
					query: queryUnknown,
					search_in_folder: searchInFolderUnknown,
					is_regex: isRegexUnknown,
					page_number: pageNumberUnknown
				} = params
				const queryStr = validateStr('query', queryUnknown)
				const pageNumber = validatePageNum(pageNumberUnknown)
				const searchInFolder = validateOptionalURI(searchInFolderUnknown)
				const isRegex = validateBoolean(isRegexUnknown, { default: false })
				return {
					query: queryStr,
					isRegex,
					searchInFolder,
					pageNumber
				}
			},
			search_in_file: (params: RawToolParamsObj) => {
				const { uri: uriStr, query: queryUnknown, is_regex: isRegexUnknown } = params;
				const uri = validateURI(uriStr);
				const query = validateStr('query', queryUnknown);
				const isRegex = validateBoolean(isRegexUnknown, { default: false });
				return { uri, query, isRegex };
			},

			read_lint_errors: (params: RawToolParamsObj) => {
				const {
					uri: uriUnknown,
				} = params
				const uri = validateURI(uriUnknown)
				return { uri }
			},

			get_context_remaining: (_params: RawToolParamsObj) => {
				return {}
			},

			// ---

			create_file_or_folder: (params: RawToolParamsObj) => {
				const np = normalizeToolParams(params)
				let uriUnknown = np.uri
				// Resolve relative paths to absolute using first workspace folder
				if (typeof uriUnknown === 'string' && uriUnknown && !/^[\/]/.test(uriUnknown) && !uriUnknown.includes('://') && !/^[A-Za-z]:/.test(uriUnknown)) {
					const folders = workspaceContextService.getWorkspace().folders
					if (folders.length > 0) {
						uriUnknown = URI.joinPath(folders[0].uri, uriUnknown).fsPath
					}
				}
				const uri = validateURI(uriUnknown)
				const uriStr = validateStr('uri', uriUnknown)
				const isFolder = checkIfIsFolder(uriStr)
				return { uri, isFolder }
			},

			delete_file_or_folder: (params: RawToolParamsObj) => {
				const { uri: uriUnknown, is_recursive: isRecursiveUnknown } = params
				const uri = validateURI(uriUnknown)
				const isRecursive = validateBoolean(isRecursiveUnknown, { default: false })
				const uriStr = validateStr('uri', uriUnknown)
				const isFolder = checkIfIsFolder(uriStr)
				return { uri, isRecursive, isFolder }
			},

			rewrite_file: (params: RawToolParamsObj) => {
				const np = normalizeToolParams(params)
				let uriStr = np.uri
				// Resolve relative paths
				if (typeof uriStr === 'string' && uriStr && !/^[\/]/.test(uriStr) && !uriStr.includes('://') && !/^[A-Za-z]:/.test(uriStr)) {
					const folders = workspaceContextService.getWorkspace().folders
					if (folders.length > 0) {
						uriStr = URI.joinPath(folders[0].uri, uriStr).fsPath
					}
				}
				const uri = validateURI(uriStr)
				const newContent = validateStr('newContent', np.new_content)
				return { uri, newContent }
			},

			edit_file: (params: RawToolParamsObj) => {
				const np = normalizeToolParams(params)
				let uriStr = np.uri
				// Resolve relative paths
				if (typeof uriStr === 'string' && uriStr && !/^[\/]/.test(uriStr) && !uriStr.includes('://') && !/^[A-Za-z]:/.test(uriStr)) {
					const folders = workspaceContextService.getWorkspace().folders
					if (folders.length > 0) {
						uriStr = URI.joinPath(folders[0].uri, uriStr).fsPath
					}
				}
				const uri = validateURI(uriStr)
				const searchReplaceBlocks = validateStr('searchReplaceBlocks', np.search_replace_blocks)
				return { uri, searchReplaceBlocks }
			},

			batch_edit: (params: RawToolParamsObj) => {
				const { edits: editsUnknown } = params
				if (!Array.isArray(editsUnknown) || editsUnknown.length === 0) {
					throw new Error('batch_edit requires a non-empty "edits" array.')
				}
				const edits = editsUnknown.map((e: any, idx: number) => {
					if (!e || typeof e !== 'object') throw new Error(`edits[${idx}] must be an object with "uri" and "search_replace_blocks".`)
					const uri = validateURI(e.uri)
					const searchReplaceBlocks = validateStr(`edits[${idx}].search_replace_blocks`, e.search_replace_blocks)
					return { uri, searchReplaceBlocks }
				})
				return { edits }
			},

			// ---

			run_command: (params: RawToolParamsObj) => {
				const { command: commandUnknown, cwd: cwdUnknown } = params
				const command = validateStr('command', commandUnknown)
				const cwd = validateOptionalStr('cwd', cwdUnknown)
				const terminalId = generateUuid()
				return { command, cwd, terminalId }
			},
			run_persistent_command: (params: RawToolParamsObj) => {
				const { command: commandUnknown, persistent_terminal_id: persistentTerminalIdUnknown } = params;
				const command = validateStr('command', commandUnknown);
				const persistentTerminalId = validateProposedTerminalId(persistentTerminalIdUnknown)
				return { command, persistentTerminalId };
			},
			open_persistent_terminal: (params: RawToolParamsObj) => {
				const { cwd: cwdUnknown } = params;
				const cwd = validateOptionalStr('cwd', cwdUnknown)
				// No parameters needed; will open a new background terminal
				return { cwd };
			},
			kill_persistent_terminal: (params: RawToolParamsObj) => {
				const { persistent_terminal_id: terminalIdUnknown } = params;
				const persistentTerminalId = validateProposedTerminalId(terminalIdUnknown);
				return { persistentTerminalId };
			},

			// --- lsp navigation ---
			go_to_definition: (params: RawToolParamsObj) => {
				const { uri: uriStr, line: lineUnknown, character: characterUnknown } = params
				const uri = validateURI(uriStr)
				const line = validateNumber(lineUnknown, { default: 1 }) ?? 1
				const character = validateNumber(characterUnknown, { default: 1 }) ?? 1
				return { uri, line, character }
			},
			find_references: (params: RawToolParamsObj) => {
				const { uri: uriStr, line: lineUnknown, character: characterUnknown, include_declaration: includeDeclarationUnknown } = params
				const uri = validateURI(uriStr)
				const line = validateNumber(lineUnknown, { default: 1 }) ?? 1
				const character = validateNumber(characterUnknown, { default: 1 }) ?? 1
				const includeDeclaration = validateBoolean(includeDeclarationUnknown, { default: true })
				return { uri, line, character, includeDeclaration }
			},
			get_type_definition: (params: RawToolParamsObj) => {
				const { uri: uriStr, line: lineUnknown, character: characterUnknown } = params
				const uri = validateURI(uriStr)
				const line = validateNumber(lineUnknown, { default: 1 }) ?? 1
				const character = validateNumber(characterUnknown, { default: 1 }) ?? 1
				return { uri, line, character }
			},
			list_symbols: (params: RawToolParamsObj) => {
				const { uri: uriStr, query: queryUnknown } = params
				const uri = validateOptionalURI(uriStr)
				const query = validateOptionalStr('query', queryUnknown)
				return { uri, query }
			},
			find_implementations: (params: RawToolParamsObj) => {
				const { uri: uriStr, line: lineUnknown, character: characterUnknown } = params
				const uri = validateURI(uriStr)
				const line = validateNumber(lineUnknown, { default: 1 }) ?? 1
				const character = validateNumber(characterUnknown, { default: 1 }) ?? 1
				return { uri, line, character }
			},

			// --- semantic search ---
			semantic_search: (params: RawToolParamsObj) => {
				const { query: queryUnknown, max_results: maxResultsUnknown, search_in_folder: searchInFolderUnknown } = params
				const query = validateStr('query', queryUnknown)
				const maxResults = validateNumber(maxResultsUnknown, { default: 10 }) ?? 10
				const searchInFolder = validateOptionalURI(searchInFolderUnknown)
				return { query, maxResults: Math.min(maxResults, 20), searchInFolder }
			},

			// --- planning ---
			update_plan: (params: RawToolParamsObj) => {
				const { title: titleUnknown, todos: todosUnknown } = params
				const title = titleUnknown && typeof titleUnknown === 'string' ? titleUnknown : null

				let todos: Array<{ id?: string, content: string, status?: string, priority?: string }>
				if (typeof todosUnknown === 'string') {
					try { todos = JSON.parse(todosUnknown) } catch { throw new Error('todos must be valid JSON array') }
				} else if (Array.isArray(todosUnknown)) {
					todos = todosUnknown as any
				} else {
					throw new Error('todos parameter is required and must be a JSON array')
				}

				if (!Array.isArray(todos)) throw new Error('todos must be an array')
				for (const t of todos) {
					if (!t.content || typeof t.content !== 'string') throw new Error('Each todo must have a "content" string')
				}
				return { title, todos }
			},

			// --- memories ---
			save_memory: (params: RawToolParamsObj) => {
				const { content: contentUnknown, tags: tagsUnknown, existing_id: existingIdUnknown } = params
				const content = validateStr('content', contentUnknown)
				const tagsStr = tagsUnknown && typeof tagsUnknown === 'string' ? tagsUnknown : ''
				const tags = tagsStr ? tagsStr.split(',').map((t: string) => t.trim()).filter(Boolean) : []
				const existingId = existingIdUnknown && typeof existingIdUnknown === 'string' && existingIdUnknown !== 'null' ? existingIdUnknown : null
				return { content, tags, existingId }
			},

			delete_memory: (params: RawToolParamsObj) => {
				const { id: idUnknown } = params
				const id = validateStr('id', idUnknown)
				return { id }
			},

			// --- remote index ---
			remote_repo_tree: (params: RawToolParamsObj) => {
				const { owner: ownerUnknown, repo: repoUnknown, branch: branchUnknown } = params
				const owner = validateStr('owner', ownerUnknown)
				const repo = validateStr('repo', repoUnknown)
				const branch = branchUnknown && typeof branchUnknown === 'string' && branchUnknown !== 'null' ? branchUnknown : 'main'
				return { owner, repo, branch }
			},

			remote_repo_read: (params: RawToolParamsObj) => {
				const { owner: ownerUnknown, repo: repoUnknown, path: pathUnknown, branch: branchUnknown } = params
				const owner = validateStr('owner', ownerUnknown)
				const repo = validateStr('repo', repoUnknown)
				const path = validateStr('path', pathUnknown)
				const branch = branchUnknown && typeof branchUnknown === 'string' && branchUnknown !== 'null' ? branchUnknown : 'main'
				return { owner, repo, path, branch }
			},

			remote_repo_search: (params: RawToolParamsObj) => {
				const { owner: ownerUnknown, repo: repoUnknown, query: queryUnknown, branch: branchUnknown } = params
				const owner = validateStr('owner', ownerUnknown)
				const repo = validateStr('repo', repoUnknown)
				const query = validateStr('query', queryUnknown)
				const branch = branchUnknown && typeof branchUnknown === 'string' && branchUnknown !== 'null' ? branchUnknown : 'main'
				return { owner, repo, query, branch }
			},

			// --- web search ---
			web_search: (params: RawToolParamsObj) => {
				const { query: queryUnknown, max_results: maxResultsUnknown } = params
				const query = validateStr('query', queryUnknown)
				const maxResults = validateNumber(maxResultsUnknown, { default: 10 }) ?? 10
				return { query, maxResults: Math.min(maxResults, 20) }
			},

			read_url: (params: RawToolParamsObj) => {
				const { url: urlUnknown } = params
				const url = validateStr('url', urlUnknown)
				if (!url.startsWith('http://') && !url.startsWith('https://')) {
					throw new Error('URL must start with http:// or https://')
				}
				return { url }
			},

			// --- subagents ---
			dispatch_agents: (params: RawToolParamsObj) => {
				const { tasks: tasksUnknown } = params

				let tasks: Array<{ id: string, type: string, description: string, params: Record<string, any> }>
				if (typeof tasksUnknown === 'string') {
					try { tasks = JSON.parse(tasksUnknown) } catch { throw new Error('tasks must be valid JSON array') }
				} else if (Array.isArray(tasksUnknown)) {
					tasks = tasksUnknown as any
				} else {
					throw new Error('tasks parameter is required and must be a JSON array')
				}

				if (!Array.isArray(tasks)) throw new Error('tasks must be an array')
				if (tasks.length === 0) throw new Error('tasks array must not be empty')
				if (tasks.length > 10) throw new Error('Maximum 10 tasks per dispatch')

				const validTypes = new Set(['grep', 'read_file', 'semantic_search', 'list_symbols'])
				for (const t of tasks) {
					if (!t.id || typeof t.id !== 'string') throw new Error('Each task must have an "id" string')
					if (!t.type || !validTypes.has(t.type)) throw new Error(`Each task must have a valid "type": grep, read_file, semantic_search, or list_symbols`)
					if (!t.description || typeof t.description !== 'string') throw new Error('Each task must have a "description" string')
					if (!t.params || typeof t.params !== 'object') throw new Error('Each task must have a "params" object')
				}
				return { tasks }
			},

			// --- task completion ---
			attempt_completion: (params: RawToolParamsObj) => {
				const { summary: summaryUnknown, verification_status: verificationStatusUnknown } = params
				const summary = validateStr('summary', summaryUnknown)
				const validStatuses = ['passed', 'skipped', 'partial', 'failed']
				let verificationStatus: 'passed' | 'skipped' | 'partial' | 'failed' | null = null
				if (verificationStatusUnknown && typeof verificationStatusUnknown === 'string' && validStatuses.includes(verificationStatusUnknown)) {
					verificationStatus = verificationStatusUnknown as any
				}
				return { summary, verificationStatus }
			},

		}


		this.callTool = {
			read_file: async ({ uri, startLine, endLine, pageNumber }) => {
				await voidModelService.initializeModel(uri)
				const { model } = await voidModelService.getModelSafe(uri)
				if (model === null) { throw new Error(`No contents; File does not exist.`) }

				let contents: string
				if (startLine === null && endLine === null) {
					contents = model.getValue(EndOfLinePreference.LF)
				}
				else {
					const startLineNumber = startLine === null ? 1 : startLine
					const endLineNumber = endLine === null ? model.getLineCount() : endLine
					contents = model.getValueInRange({ startLineNumber, startColumn: 1, endLineNumber, endColumn: Number.MAX_SAFE_INTEGER }, EndOfLinePreference.LF)
				}

				const totalNumLines = model.getLineCount()

				const fromIdx = MAX_FILE_CHARS_PAGE * (pageNumber - 1)
				const toIdx = MAX_FILE_CHARS_PAGE * pageNumber - 1
				const fileContents = contents.slice(fromIdx, toIdx + 1) // paginate
				const hasNextPage = (contents.length - 1) - toIdx >= 1
				const totalFileLen = contents.length
				return { result: { fileContents, totalFileLen, hasNextPage, totalNumLines } }
			},

			ls_dir: async ({ uri, pageNumber }) => {
				const dirResult = await computeDirectoryTree1Deep(fileService, uri, pageNumber)
				return { result: dirResult }
			},

			get_dir_tree: async ({ uri }) => {
				const str = await this.directoryStrService.getDirectoryStrTool(uri)
				return { result: { str } }
			},

			search_pathnames_only: async ({ query: queryStr, includePattern, pageNumber }) => {

				const query = queryBuilder.file(workspaceContextService.getWorkspace().folders.map(f => f.uri), {
					filePattern: queryStr,
					includePattern: includePattern ?? undefined,
					sortByScore: true, // makes results 10x better
				})
				const data = await searchService.fileSearch(query, CancellationToken.None)

				const fromIdx = MAX_CHILDREN_URIs_PAGE * (pageNumber - 1)
				const toIdx = MAX_CHILDREN_URIs_PAGE * pageNumber - 1
				const uris = data.results
					.slice(fromIdx, toIdx + 1) // paginate
					.map(({ resource, results }) => resource)

				const hasNextPage = (data.results.length - 1) - toIdx >= 1
				return { result: { uris, hasNextPage } }
			},

			search_for_files: async ({ query: queryStr, isRegex, searchInFolder, pageNumber }) => {
				const searchFolders = searchInFolder === null ?
					workspaceContextService.getWorkspace().folders.map(f => f.uri)
					: [searchInFolder]

				const query = queryBuilder.text({
					pattern: queryStr,
					isRegExp: isRegex,
				}, searchFolders)

				const data = await searchService.textSearch(query, CancellationToken.None)

				const fromIdx = MAX_CHILDREN_URIs_PAGE * (pageNumber - 1)
				const toIdx = MAX_CHILDREN_URIs_PAGE * pageNumber - 1
				const uris = data.results
					.slice(fromIdx, toIdx + 1) // paginate
					.map(({ resource, results }) => resource)

				const hasNextPage = (data.results.length - 1) - toIdx >= 1
				return { result: { queryStr, uris, hasNextPage } }
			},
			search_in_file: async ({ uri, query, isRegex }) => {
				await voidModelService.initializeModel(uri);
				const { model } = await voidModelService.getModelSafe(uri);
				if (model === null) { throw new Error(`No contents; File does not exist.`); }
				const contents = model.getValue(EndOfLinePreference.LF);
				const contentOfLine = contents.split('\n');
				const totalLines = contentOfLine.length;
				const regex = isRegex ? new RegExp(query) : null;
				const lines: number[] = []
				for (let i = 0; i < totalLines; i++) {
					const line = contentOfLine[i];
					if ((isRegex && regex!.test(line)) || (!isRegex && line.includes(query))) {
						const matchLine = i + 1;
						lines.push(matchLine);
					}
				}
				return { result: { lines } };
			},

			read_lint_errors: async ({ uri }) => {
				await timeout(1000)
				const { lintErrors } = this._getLintErrors(uri)
				return { result: { lintErrors } }
			},

			get_context_remaining: async () => {
				// 懒解析 IChatThreadService 取当前线程消息，避免与 toolsService 形成构造期循环依赖
				const chatThreadService = this.instantiationService.invokeFunction(accessor => accessor.get(IChatThreadService))
				const threadId = chatThreadService.state.currentThreadId
				const messages = chatThreadService.state.allThreads[threadId]?.messages ?? []
				const usedTokens = this.contextCompactionService.estimateTokens(messages)
				const sel = this.voidSettingsService.state.modelSelectionOfFeature['Chat']
				const contextWindow = sel
					? getModelCapabilities(sel.providerName, sel.modelName, this.voidSettingsService.state.overridesOfModel).contextWindow
					: 0
				return { result: computeContextBudget(usedTokens, contextWindow) }
			},

			// ---

			create_file_or_folder: async ({ uri, isFolder }) => {
				if (isFolder)
					await fileService.createFolder(uri)
				else {
					await fileService.createFile(uri)
				}
				return { result: {} }
			},

			delete_file_or_folder: async ({ uri, isRecursive }) => {
				await fileService.del(uri, { recursive: isRecursive })
				return { result: {} }
			},

			rewrite_file: async ({ uri, newContent }) => {
				await voidModelService.initializeModel(uri)
				if (this.commandBarService.getStreamState(uri) === 'streaming') {
					throw new Error(`Another LLM is currently making changes to this file. Please stop streaming for now and ask the user to resume later.`)
				}
				await editCodeService.callBeforeApplyOrEdit(uri)
				editCodeService.instantlyRewriteFile({ uri, newContent })
				// at end, get lint errors
				const lintErrorsPromise = Promise.resolve().then(async () => {
					await timeout(2000)
					const { lintErrors } = this._getLintErrors(uri)
					return { lintErrors }
				})
				return { result: lintErrorsPromise }
			},

			edit_file: async ({ uri, searchReplaceBlocks }) => {
				await voidModelService.initializeModel(uri)
				if (this.commandBarService.getStreamState(uri) === 'streaming') {
					throw new Error(`Another LLM is currently making changes to this file. Please stop streaming for now and ask the user to resume later.`)
				}
				await editCodeService.callBeforeApplyOrEdit(uri)
				editCodeService.instantlyApplySearchReplaceBlocks({ uri, searchReplaceBlocks })

				// at end, get lint errors
				const lintErrorsPromise = Promise.resolve().then(async () => {
					await timeout(2000)
					const { lintErrors } = this._getLintErrors(uri)
					return { lintErrors }
				})

				return { result: lintErrorsPromise }
			},

			batch_edit: async ({ edits }) => {
				const resultsPromise = Promise.resolve().then(async () => {
					const results: Array<{ uri: string, success: boolean, error?: string, lintErrors?: import('../common/toolsServiceTypes.js').LintErrorItem[] | null }> = []
					for (const edit of edits) {
						try {
							await voidModelService.initializeModel(edit.uri)
							if (this.commandBarService.getStreamState(edit.uri) === 'streaming') {
								results.push({ uri: edit.uri.fsPath, success: false, error: 'Another LLM is currently streaming to this file.' })
								continue
							}
							await editCodeService.callBeforeApplyOrEdit(edit.uri)
							editCodeService.instantlyApplySearchReplaceBlocks({ uri: edit.uri, searchReplaceBlocks: edit.searchReplaceBlocks })
							results.push({ uri: edit.uri.fsPath, success: true })
						} catch (e: any) {
							results.push({ uri: edit.uri.fsPath, success: false, error: e?.message ?? String(e) })
						}
					}
					// collect lint errors after all edits are applied
					await timeout(2000)
					for (const r of results) {
						if (r.success) {
							try {
								const editEntry = edits.find(e => e.uri.fsPath === r.uri)
								if (editEntry) {
									const { lintErrors } = this._getLintErrors(editEntry.uri)
									r.lintErrors = lintErrors
								}
							} catch { /* ignore lint errors */ }
						}
					}
					return { results }
				})
				return { result: resultsPromise }
			},
			// ---
			run_command: async ({ command, cwd, terminalId }) => {
				const { resPromise, interrupt } = await this.terminalToolService.runCommand(command, { type: 'temporary', cwd, terminalId })
				return { result: resPromise, interruptTool: interrupt }
			},
			run_persistent_command: async ({ command, persistentTerminalId }) => {
				const { resPromise, interrupt } = await this.terminalToolService.runCommand(command, { type: 'persistent', persistentTerminalId })
				return { result: resPromise, interruptTool: interrupt }
			},
			open_persistent_terminal: async ({ cwd }) => {
				const persistentTerminalId = await this.terminalToolService.createPersistentTerminal({ cwd })
				return { result: { persistentTerminalId } }
			},
			kill_persistent_terminal: async ({ persistentTerminalId }) => {
				// Close the background terminal by sending exit
				await this.terminalToolService.killPersistentTerminal(persistentTerminalId)
				return { result: {} }
			},

			// --- lsp navigation ---
			go_to_definition: async ({ uri, line, character }) => {
				const { model } = voidModelService.getModel(uri)
				if (!model) return { result: { locations: [] } }
				const pos = new Position(line - 1, character - 1)
				const providers = this.langFeaturesService.definitionProvider.ordered(model)
				const locations: LocationResult[] = []
				for (const provider of providers) {
					try {
						const result = await provider.provideDefinition(model, pos, CancellationToken.None)
						if (result) {
							const links: (Location | LocationLink)[] = Array.isArray(result) ? result : [result]
							for (const link of links) {
								locations.push(await this._locationToResult(link))
							}
						}
					} catch { /* provider failed, skip */ }
				}
				return { result: { locations } }
			},

			find_references: async ({ uri, line, character, includeDeclaration }) => {
				const { model } = voidModelService.getModel(uri)
				if (!model) return { result: { locations: [], totalMatches: 0 } }
				const pos = new Position(line - 1, character - 1)
				const providers = this.langFeaturesService.referenceProvider.ordered(model)
				const locations: LocationResult[] = []
				const MAX_REFERENCES = 20
				for (const provider of providers) {
					try {
						const refs = await provider.provideReferences(model, pos, { includeDeclaration }, CancellationToken.None)
						if (refs) {
							for (const ref of refs.slice(0, MAX_REFERENCES - locations.length)) {
								locations.push({
									uri: ref.uri,
									startLine: ref.range.startLineNumber,
									endLine: ref.range.endLineNumber,
									snippet: await this._readSnippet(ref.uri, ref.range.startLineNumber, ref.range.endLineNumber),
								})
							}
						}
					} catch { /* provider failed, skip */ }
					if (locations.length >= MAX_REFERENCES) break
				}
				return { result: { locations, totalMatches: locations.length } }
			},

			get_type_definition: async ({ uri, line, character }) => {
				const { model } = voidModelService.getModel(uri)
				if (!model) return { result: { locations: [] } }
				const pos = new Position(line - 1, character - 1)
				const providers = this.langFeaturesService.typeDefinitionProvider.ordered(model)
				const locations: LocationResult[] = []
				for (const provider of providers) {
					try {
						const result = await provider.provideTypeDefinition(model, pos, CancellationToken.None)
						if (result) {
							const links: (Location | LocationLink)[] = Array.isArray(result) ? result : [result]
							for (const link of links) {
								locations.push(await this._locationToResult(link))
							}
						}
					} catch { /* provider failed, skip */ }
				}
				return { result: { locations } }
			},

			list_symbols: async ({ uri, query }) => {
				// Workspace symbol search (query-based)
				if (!uri && query) {
					const symbols: { name: string, kind: string, startLine: number, endLine: number, uri: URI, snippet: string }[] = []
					try {
						const items = await getWorkspaceSymbols(query, CancellationToken.None)
						for (const item of items.slice(0, 20)) {
							const loc = item.symbol.location
							symbols.push({
								name: item.symbol.name,
								kind: this._symbolKindToString(item.symbol.kind),
								startLine: loc.range.startLineNumber,
								endLine: loc.range.endLineNumber,
								uri: loc.uri,
								snippet: await this._readSnippet(loc.uri, loc.range.startLineNumber, loc.range.endLineNumber),
							})
						}
					} catch { /* workspace symbol search failed */ }
					return { result: { symbols } }
				}

				// Document symbol search (file-based)
				if (uri) {
					const { model } = voidModelService.getModel(uri)
					if (!model) return { result: { symbols: [] } }
					const providers = this.langFeaturesService.documentSymbolProvider.ordered(model)
					const symbols: { name: string, kind: string, startLine: number, endLine: number, uri: URI, snippet: string }[] = []
					for (const provider of providers) {
						try {
							const result = await provider.provideDocumentSymbols(model, CancellationToken.None)
							if (result) {
								const flat = this._flattenSymbols(result)
								for (const sym of flat.slice(0, 50)) {
									symbols.push({
										name: sym.name,
										kind: this._symbolKindToString(sym.kind),
										startLine: sym.range.startLineNumber,
										endLine: sym.range.endLineNumber,
										uri,
										snippet: await this._readSnippet(uri, sym.range.startLineNumber, sym.range.endLineNumber),
									})
								}
							}
						} catch { /* provider failed, skip */ }
					}
					return { result: { symbols } }
				}

				return { result: { symbols: [] } }
			},

			find_implementations: async ({ uri, line, character }) => {
				const { model } = voidModelService.getModel(uri)
				if (!model) return { result: { locations: [] } }
				const pos = new Position(line - 1, character - 1)
				const providers = this.langFeaturesService.implementationProvider.ordered(model)
				const locations: LocationResult[] = []
				for (const provider of providers) {
					try {
						const result = await provider.provideImplementation(model, pos, CancellationToken.None)
						if (result) {
							const links: (Location | LocationLink)[] = Array.isArray(result) ? result : [result]
							for (const link of links) {
								locations.push(await this._locationToResult(link))
							}
						}
					} catch { /* provider failed, skip */ }
				}
				return { result: { locations } }
			},

			// --- semantic search ---
			semantic_search: async ({ query, maxResults, searchInFolder }) => {
				const results = await this.codeIndexService.search(
					query,
					maxResults,
					searchInFolder ? { searchInFolder: searchInFolder.fsPath } : undefined
				)
				return { result: { results, totalMatches: results.length, indexStatus: this.codeIndexService.state } }
			},

			// --- memories ---
			save_memory: async ({ content, tags, existingId }) => {
				const memory = this.memoryService.saveMemory(content, tags, existingId ?? undefined)
				return {
					result: {
						memory,
						action: existingId ? 'updated' as const : 'created' as const,
						totalMemories: this.memoryService.memories.length,
					}
				}
			},

			delete_memory: async ({ id }) => {
				const deleted = this.memoryService.deleteMemory(id)
				return {
					result: {
						deleted,
						id,
						totalMemories: this.memoryService.memories.length,
					}
				}
			},

			// --- remote index ---
			remote_repo_tree: async ({ owner, repo, branch }) => {
				const result = await this.remoteIndexService.getTree(owner, repo, branch)
				return { result }
			},

			remote_repo_read: async ({ owner, repo, path, branch }) => {
				const result = await this.remoteIndexService.readFile(owner, repo, path, branch)
				return { result }
			},

			remote_repo_search: async ({ owner, repo, query, branch }) => {
				const result = await this.remoteIndexService.searchCode(owner, repo, query, branch)
				return { result }
			},

			// --- web search ---
			web_search: async ({ query, maxResults }) => {
				const result = await this.webSearchService.search(query, maxResults)
				return { result }
			},

			read_url: async ({ url }) => {
				const result = await this.webSearchService.readUrl(url)
				return { result }
			},

			// --- subagents ---
			dispatch_agents: async ({ tasks }) => {
				// Convert raw task params to typed SubagentTask array
				const typedTasks: SubagentTask[] = tasks.map(t => ({
					id: t.id,
					type: t.type as any,
					description: t.description,
					params: { type: t.type, ...t.params } as SubagentTaskParams,
				}))

				const result = await this.subagentService.dispatch(typedTasks)
				return { result }
			},

			// --- task completion ---
			attempt_completion: async ({ summary, verificationStatus }) => {
				// This tool signals task completion - the agent loop should handle this specially
				// For now, we just acknowledge the completion and return the summary
				return {
					result: {
						acknowledged: true,
						message: `Task completion acknowledged. Verification: ${verificationStatus ?? 'not specified'}.`,
					}
				}
			},

			// --- planning ---
			update_plan: async ({ title, todos }) => {
				const validStatuses = new Set(['pending', 'in_progress', 'completed'])
				const validPriorities = new Set(['high', 'medium', 'low'])

				const existingPlan = this.planningService.getPlan()
				const isNew = !existingPlan

				if (isNew || title) {
					this.planningService.createPlan(title ?? existingPlan?.title ?? 'Plan', existingPlan?.description)
				}

				this.planningService.setTodos(todos.map(t => ({
					id: t.id,
					content: t.content,
					status: (validStatuses.has(t.status ?? '') ? t.status : 'pending') as TodoStatus,
					priority: (validPriorities.has(t.priority ?? '') ? t.priority : 'medium') as TodoPriority,
				})))

				const plan = this.planningService.getPlan()!
				const completed = plan.todos.filter(t => t.status === 'completed').length
				const total = plan.todos.length
				const allDone = total > 0 && completed === total

				return {
					result: {
						plan,
						action: isNew ? 'created' as const : allDone ? 'completed' as const : 'updated' as const,
						summary: `Plan "${plan.title}": ${completed}/${total} tasks completed`,
					}
				}
			},
		}


		const nextPageStr = (hasNextPage: boolean) => hasNextPage ? '\n\n(more on next page...)' : ''

		const stringifyLintErrors = (lintErrors: LintErrorItem[]) => {
			return lintErrors
				.map((e, i) => `Error ${i + 1}:\nLines Affected: ${e.startLineNumber}-${e.endLineNumber}\nError message:${e.message}`)
				.join('\n\n')
				.substring(0, MAX_FILE_CHARS_PAGE)
		}

		// given to the LLM after the call for successful tool calls
		this.stringOfResult = {
			read_file: (params, result) => {
				// P0-3: 应用中间截断策略
				const content = truncateMiddle(result.fileContents, MAX_FILE_CHARS_PAGE)
				return `${params.uri.fsPath}\n\`\`\`\n${content}\n\`\`\`${nextPageStr(result.hasNextPage)}${result.hasNextPage ? `\nMore info because truncated: this file has ${result.totalNumLines} lines, or ${result.totalFileLen} characters.` : ''}`
			},
			ls_dir: (params, result) => {
				const dirTreeStr = stringifyDirectoryTree1Deep(params, result)
				return dirTreeStr // + nextPageStr(result.hasNextPage) // already handles num results remaining
			},
			get_dir_tree: (params, result) => {
				return result.str
			},
			search_pathnames_only: (params, result) => {
				return result.uris.map(uri => uri.fsPath).join('\n') + nextPageStr(result.hasNextPage)
			},
			search_for_files: (params, result) => {
				return result.uris.map(uri => uri.fsPath).join('\n') + nextPageStr(result.hasNextPage)
			},
			search_in_file: (params, result) => {
				const { model } = voidModelService.getModel(params.uri)
				if (!model) return '<Error getting string of result>'
				const lines = result.lines.map(n => {
					const lineContent = model.getValueInRange({ startLineNumber: n, startColumn: 1, endLineNumber: n, endColumn: Number.MAX_SAFE_INTEGER }, EndOfLinePreference.LF)
					return `Line ${n}:\n\`\`\`\n${lineContent}\n\`\`\``
				}).join('\n\n');
				return lines;
			},
			read_lint_errors: (params, result) => {
				return result.lintErrors ?
					stringifyLintErrors(result.lintErrors)
					: 'No lint errors found.'
			},
			get_context_remaining: (params, result) => {
				return formatContextBudget(result)
			},
			// ---
			create_file_or_folder: (params, result) => {
				return `URI ${params.uri.fsPath} successfully created.`
			},
			delete_file_or_folder: (params, result) => {
				return `URI ${params.uri.fsPath} successfully deleted.`
			},
			edit_file: (params, result) => {
				const lintErrsString = (
					this.voidSettingsService.state.globalSettings.includeToolLintErrors ?
						(result.lintErrors ? ` Lint errors found after change:\n${stringifyLintErrors(result.lintErrors)}.\nIf this is related to a change made while calling this tool, you might want to fix the error.`
							: ` No lint errors found.`)
						: '')

				return `Change successfully made to ${params.uri.fsPath}.${lintErrsString}`
			},
			rewrite_file: (params, result) => {
				const lintErrsString = (
					this.voidSettingsService.state.globalSettings.includeToolLintErrors ?
						(result.lintErrors ? ` Lint errors found after change:\n${stringifyLintErrors(result.lintErrors)}.\nIf this is related to a change made while calling this tool, you might want to fix the error.`
							: ` No lint errors found.`)
						: '')

				return `Change successfully made to ${params.uri.fsPath}.${lintErrsString}`
			},
			batch_edit: (params, result) => {
				const lines: string[] = []
				for (const r of result.results) {
					if (r.success) {
						let msg = `✓ ${r.uri}`
						if (this.voidSettingsService.state.globalSettings.includeToolLintErrors && r.lintErrors) {
							msg += ` (lint errors: ${stringifyLintErrors(r.lintErrors)})`
						}
						lines.push(msg)
					} else {
						lines.push(`✗ ${r.uri}: ${r.error}`)
					}
				}
				const successCount = result.results.filter(r => r.success).length
				return `Batch edit: ${successCount}/${result.results.length} files edited successfully.\n${lines.join('\n')}`
			},
			run_command: (params, result) => {
				const { resolveReason, result: result_, } = result
				// P0-3: 应用中间截断策略
				const truncatedResult = truncateMiddle(result_, MAX_TERMINAL_CHARS)
				// success
				if (resolveReason.type === 'done') {
					return `${truncatedResult}\n(exit code ${resolveReason.exitCode})`
				}
				// normal command
				if (resolveReason.type === 'timeout') {
					return `${truncatedResult}\nTerminal command ran, but was automatically killed by Void after ${MAX_TERMINAL_INACTIVE_TIME}s of inactivity and did not finish successfully. To try with more time, open a persistent terminal and run the command there.`
				}
				throw new Error(`Unexpected internal error: Terminal command did not resolve with a valid reason.`)
			},

			run_persistent_command: (params, result) => {
				const { resolveReason, result: result_, } = result
				const { persistentTerminalId } = params
				// P0-3: 应用中间截断策略
				const truncatedResult = truncateMiddle(result_, MAX_TERMINAL_CHARS)
				// success
				if (resolveReason.type === 'done') {
					return `${truncatedResult}\n(exit code ${resolveReason.exitCode})`
				}
				// bg command
				if (resolveReason.type === 'timeout') {
					return `${truncatedResult}\nTerminal command is running in terminal ${persistentTerminalId}. The given outputs are the results after ${MAX_TERMINAL_BG_COMMAND_TIME} seconds.`
				}
				throw new Error(`Unexpected internal error: Terminal command did not resolve with a valid reason.`)
			},

			open_persistent_terminal: (_params, result) => {
				const { persistentTerminalId } = result;
				return `Successfully created persistent terminal. persistentTerminalId="${persistentTerminalId}"`;
			},
			kill_persistent_terminal: (params, _result) => {
				return `Successfully closed terminal "${params.persistentTerminalId}".`;
			},

			// --- lsp navigation ---
			go_to_definition: (params, result) => {
				if (result.locations.length === 0) return 'No definition found.'
				return result.locations.map((loc, i) =>
					`--- Definition ${i + 1} ---\nFile: ${loc.uri.fsPath}\nLine ${loc.startLine}-${loc.endLine}\n\`\`\`\n${loc.snippet}\n\`\`\``
				).join('\n\n')
			},
			find_references: (params, result) => {
				if (result.locations.length === 0) return 'No references found.'
				return `Found ${result.totalMatches} reference(s):\n\n` +
					result.locations.map((loc, i) =>
						`--- Reference ${i + 1} ---\nFile: ${loc.uri.fsPath}\nLine ${loc.startLine}\n\`\`\`\n${loc.snippet}\n\`\`\``
					).join('\n\n')
			},
			get_type_definition: (params, result) => {
				if (result.locations.length === 0) return 'No type definition found.'
				return result.locations.map((loc, i) =>
					`--- Type Definition ${i + 1} ---\nFile: ${loc.uri.fsPath}\nLine ${loc.startLine}-${loc.endLine}\n\`\`\`\n${loc.snippet}\n\`\`\``
				).join('\n\n')
			},
			list_symbols: (params, result) => {
				if (result.symbols.length === 0) return 'No symbols found.'
				return result.symbols.map(sym =>
					`${sym.kind} ${sym.name}\n  File: ${sym.uri.fsPath}:${sym.startLine}-${sym.endLine}\n  \`\`\`\n  ${sym.snippet.split('\n')[0]}...\n  \`\`\``
				).join('\n')
			},
			find_implementations: (params, result) => {
				if (result.locations.length === 0) return 'No implementations found.'
				return result.locations.map((loc, i) =>
					`--- Implementation ${i + 1} ---\nFile: ${loc.uri.fsPath}\nLine ${loc.startLine}-${loc.endLine}\n\`\`\`\n${loc.snippet}\n\`\`\``
				).join('\n\n')
			},

			// --- semantic search ---
			semantic_search: (params, result) => {
				if (result.results.length === 0) return `No semantic search results found. (Index status: ${result.indexStatus})`
				return `Found ${result.totalMatches} semantic search result(s). (Index status: ${result.indexStatus})\n\n` +
					result.results.map((r, i) => {
						const meta = r.metadata
						const symInfo = meta.symbolName ? ` [${meta.symbolKind} ${meta.symbolName}]` : ''
						return `--- Result ${i + 1} (score: ${r.score.toFixed(3)})${symInfo} ---\nFile: ${meta.filePath}:${meta.startLine}-${meta.endLine}\n\`\`\`\n${r.content}\n\`\`\``
					}).join('\n\n')
			},

			// --- memories ---
			save_memory: (_params, result) => {
				const tagsStr = result.memory.tags.length > 0 ? ` [${result.memory.tags.join(', ')}]` : ''
				return `Memory ${result.action} (id: ${result.memory.id})${tagsStr}: ${result.memory.content}\nTotal memories: ${result.totalMemories}`
			},

			delete_memory: (_params, result) => {
				if (!result.deleted) return `Memory not found (id: ${result.id})`
				return `Memory deleted (id: ${result.id}). Total memories: ${result.totalMemories}`
			},

			// --- remote index ---
			remote_repo_tree: (_params, result) => {
				const header = `Repository: ${result.owner}/${result.repo}@${result.branch} — ${result.totalFiles} file(s)\n`
				const pathsList = result.paths.slice(0, 100).join('\n')
				const more = result.totalFiles > 100 ? `\n... and ${result.totalFiles - 100} more files` : ''
				return header + pathsList + more
			},

			remote_repo_read: (_params, result) => {
				const truncInfo = result.truncated ? ' (truncated)' : ''
				return `File: ${result.path} (${result.size} bytes)${truncInfo}\n\n${result.content}`
			},

			remote_repo_search: (_params, result) => {
				if (result.matches.length === 0) return `No matches found in ${result.owner}/${result.repo}.`
				const header = `Search in ${result.owner}/${result.repo}@${result.branch}: ${result.totalMatches} match(es)\n\n`
				const matchLines = result.matches.map((m, i) =>
					`${i + 1}. ${m.path}${m.lineNumber > 0 ? `:${m.lineNumber}` : ''}\n   ${m.snippet}`
				).join('\n\n')
				return header + matchLines
			},

			// --- web search ---
			web_search: (_params, result) => {
				if (result.results.length === 0) return `No web search results found for "${result.query}".`
				const lines = result.results.map((r, i) =>
					`${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.snippet}`
				).join('\n\n')
				return `Web search: "${result.query}" — ${result.totalResults} result(s)\n\n${lines}`
			},

			read_url: (_params, result) => {
				const truncInfo = result.truncated ? ` (truncated from ${result.contentLength} chars)` : ''
				const titleInfo = result.title ? `Title: ${result.title}\n` : ''
				return `${titleInfo}URL: ${result.url}${truncInfo}\n\n${result.content}`
			},

			// --- subagents ---
			dispatch_agents: (_params, result) => {
				const header = `Dispatched ${result.totalTasks} task(s): ${result.successCount} succeeded, ${result.totalTasks - result.successCount} failed (${result.totalDurationMs}ms total)\n`
				const taskResults = result.results.map(r => {
					const status = r.success ? '✅' : '❌'
					const errorInfo = r.error ? ` Error: ${r.error}` : ''
					return `--- ${status} [${r.type}] ${r.description} (${r.durationMs}ms)${errorInfo} ---\n${r.content}`
				}).join('\n\n')
				return header + '\n' + taskResults
			},

			// --- planning ---
			update_plan: (_params, result) => {
				const { plan, action, summary } = result
				const statusIcon = (s: string) => s === 'completed' ? '✅' : s === 'in_progress' ? '🔄' : '⬚'
				const priorityLabel = (p: string) => p === 'high' ? '‼️' : p === 'low' ? '◽' : ''
				const todoLines = plan.todos.map((t, i) =>
					`  ${i + 1}. ${statusIcon(t.status)} ${priorityLabel(t.priority)}${t.content}`
				).join('\n')
				return `Plan ${action}: ${summary}\n\n${plan.title}${plan.description ? ' — ' + plan.description : ''}\n${todoLines}`
			},

			// --- task completion ---
			attempt_completion: (params, result) => {
				const verifyIcon = params.verificationStatus === 'passed' ? '✅' :
					params.verificationStatus === 'failed' ? '❌' :
						params.verificationStatus === 'partial' ? '⚠️' : '⬚'
				return `${verifyIcon} Task Completion Summary:\n\n${params.summary}\n\n(${result.message})`
			},
		}



	}


	private async _locationToResult(loc: Location | LocationLink): Promise<LocationResult> {
		return {
			uri: loc.uri,
			startLine: loc.range.startLineNumber,
			endLine: loc.range.endLineNumber,
			snippet: await this._readSnippet(loc.uri, loc.range.startLineNumber, loc.range.endLineNumber),
		}
	}

	private async _readSnippet(uri: URI, startLine: number, endLine: number): Promise<string> {
		try {
			await this.voidModelService.initializeModel(uri)
			const { model } = this.voidModelService.getModel(uri)
			if (!model) return ''
			const snippetLines = endLine - startLine + 1
			const maxSnippetLines = 5
			const effectiveEnd = snippetLines > maxSnippetLines ? startLine + maxSnippetLines - 1 : endLine
			let snippet = model.getValueInRange(
				{ startLineNumber: startLine, startColumn: 1, endLineNumber: effectiveEnd, endColumn: Number.MAX_SAFE_INTEGER },
				EndOfLinePreference.LF
			)
			if (snippetLines > maxSnippetLines) snippet += '\n...'
			return snippet
		} catch {
			return ''
		}
	}

	private _symbolKindToString(kind: number): string {
		const names: Record<number, string> = {
			1: 'File', 2: 'Module', 3: 'Namespace', 4: 'Package', 5: 'Class',
			6: 'Method', 7: 'Property', 8: 'Field', 9: 'Constructor', 10: 'Enum',
			11: 'Interface', 12: 'Function', 13: 'Variable', 14: 'Constant', 15: 'String',
			16: 'Number', 17: 'Boolean', 18: 'Array', 19: 'Object', 20: 'Key',
			21: 'Null', 22: 'EnumMember', 23: 'Struct', 24: 'Event', 25: 'Operator',
			26: 'TypeParameter',
		}
		return names[kind] ?? 'Symbol'
	}

	private _flattenSymbols(symbols: DocumentSymbol[]): DocumentSymbol[] {
		const result: DocumentSymbol[] = []
		const walk = (syms: DocumentSymbol[]) => {
			for (const sym of syms) {
				result.push(sym)
				if (sym.children) walk(sym.children)
			}
		}
		walk(symbols)
		return result
	}

	private _getLintErrors(uri: URI): { lintErrors: LintErrorItem[] | null } {
		const lintErrors = this.markerService
			.read({ resource: uri })
			.filter(l => l.severity === MarkerSeverity.Error || l.severity === MarkerSeverity.Warning)
			.slice(0, 100)
			.map(l => ({
				code: typeof l.code === 'string' ? l.code : l.code?.value || '',
				message: (l.severity === MarkerSeverity.Error ? '(error) ' : '(warning) ') + l.message,
				startLineNumber: l.startLineNumber,
				endLineNumber: l.endLineNumber,
			} satisfies LintErrorItem))

		if (!lintErrors.length) return { lintErrors: null }
		return { lintErrors, }
	}


}

registerSingleton(IToolsService, ToolsService, InstantiationType.Eager);
