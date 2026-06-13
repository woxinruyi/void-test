import { URI } from '../../../../base/common/uri.js'
import { RawMCPToolCall } from './mcpServiceTypes.js';
import type { SearchResult } from './codeIndexTypes.js';
import type { PlanningToolResult } from './planningServiceTypes.js';
import type { SubagentDispatchResult } from './subagentServiceTypes.js';
import type { WebSearchResponse, ReadUrlResult } from './webSearchServiceTypes.js';
import type { SaveMemoryResult, DeleteMemoryResult } from './memoryServiceTypes.js';
import type { RemoteTreeResult, RemoteFileResult, RemoteSearchResult } from './remoteIndexTypes.js';
import { builtinTools } from './prompt/prompts.js';
import { RawToolParamsObj } from './sendLLMMessageTypes.js';
import type { ContextBudget } from './contextBudget.js';



export type TerminalResolveReason = { type: 'timeout' } | { type: 'done', exitCode: number }

export type LintErrorItem = { code: string, message: string, startLineNumber: number, endLineNumber: number }

export type LocationResult = {
	uri: URI
	startLine: number
	endLine: number
	snippet: string
	symbolName?: string
}

// Partial of IFileStat
export type ShallowDirectoryItem = {
	uri: URI;
	name: string;
	isDirectory: boolean;
	isSymbolicLink: boolean;
}


export const approvalTypeOfBuiltinToolName: Partial<{ [T in BuiltinToolName]?: 'edits' | 'terminal' | 'MCP tools' }> = {
	'create_file_or_folder': 'edits',
	'delete_file_or_folder': 'edits',
	'rewrite_file': 'edits',
	'edit_file': 'edits',
	'batch_edit': 'edits',
	'run_command': 'terminal',
	'run_persistent_command': 'terminal',
	'open_persistent_terminal': 'terminal',
	'kill_persistent_terminal': 'terminal',
	// --- lsp navigation (all read-only, no approval needed) ---
}


export type ToolApprovalType = NonNullable<(typeof approvalTypeOfBuiltinToolName)[keyof typeof approvalTypeOfBuiltinToolName]>;


export const toolApprovalTypes = new Set<ToolApprovalType>([
	...Object.values(approvalTypeOfBuiltinToolName),
	'MCP tools',
])




// PARAMS OF TOOL CALL
export type BuiltinToolCallParams = {
	'read_file': { uri: URI, startLine: number | null, endLine: number | null, pageNumber: number },
	'ls_dir': { uri: URI, pageNumber: number },
	'get_dir_tree': { uri: URI },
	'search_pathnames_only': { query: string, includePattern: string | null, pageNumber: number },
	'search_for_files': { query: string, isRegex: boolean, searchInFolder: URI | null, pageNumber: number },
	'search_in_file': { uri: URI, query: string, isRegex: boolean },
	'read_lint_errors': { uri: URI },
	'get_context_remaining': {},
	// ---
	'rewrite_file': { uri: URI, newContent: string },
	'edit_file': { uri: URI, searchReplaceBlocks: string },
	'batch_edit': { edits: Array<{ uri: URI, searchReplaceBlocks: string }> },
	'create_file_or_folder': { uri: URI, isFolder: boolean },
	'delete_file_or_folder': { uri: URI, isRecursive: boolean, isFolder: boolean },
	// ---
	'run_command': { command: string; cwd: string | null, terminalId: string },
	'open_persistent_terminal': { cwd: string | null },
	'run_persistent_command': { command: string; persistentTerminalId: string },
	'kill_persistent_terminal': { persistentTerminalId: string },
	// --- lsp navigation ---
	'go_to_definition': { uri: URI, line: number, character: number },
	'find_references': { uri: URI, line: number, character: number, includeDeclaration: boolean },
	'get_type_definition': { uri: URI, line: number, character: number },
	'list_symbols': { uri: URI | null, query: string | null },
	'find_implementations': { uri: URI, line: number, character: number },
	// --- semantic search ---
	'semantic_search': { query: string, maxResults: number, searchInFolder: URI | null },
	// --- planning ---
	'update_plan': { title: string | null, todos: Array<{ id?: string, content: string, status?: string, priority?: string }> },
	// --- subagents ---
	'dispatch_agents': { tasks: Array<{ id: string, type: string, description: string, params: Record<string, any> }> },
	// --- task completion ---
	'attempt_completion': { summary: string, verificationStatus: 'passed' | 'skipped' | 'partial' | 'failed' | null },
	// --- web search ---
	'web_search': { query: string, maxResults: number },
	'read_url': { url: string },
	// --- memories ---
	'save_memory': { content: string, tags: string[], existingId: string | null },
	'delete_memory': { id: string },
	// --- remote index ---
	'remote_repo_tree': { owner: string, repo: string, branch: string },
	'remote_repo_read': { owner: string, repo: string, path: string, branch: string },
	'remote_repo_search': { owner: string, repo: string, query: string, branch: string },
}

// RESULT OF TOOL CALL
export type BuiltinToolResultType = {
	'read_file': { fileContents: string, totalFileLen: number, totalNumLines: number, hasNextPage: boolean },
	'ls_dir': { children: ShallowDirectoryItem[] | null, hasNextPage: boolean, hasPrevPage: boolean, itemsRemaining: number },
	'get_dir_tree': { str: string, },
	'search_pathnames_only': { uris: URI[], hasNextPage: boolean },
	'search_for_files': { uris: URI[], hasNextPage: boolean },
	'search_in_file': { lines: number[]; },
	'read_lint_errors': { lintErrors: LintErrorItem[] | null },
	'get_context_remaining': ContextBudget,
	// ---
	'rewrite_file': Promise<{ lintErrors: LintErrorItem[] | null }>,
	'edit_file': Promise<{ lintErrors: LintErrorItem[] | null }>,
	'batch_edit': Promise<{ results: Array<{ uri: string, success: boolean, error?: string, lintErrors?: LintErrorItem[] | null }> }>,
	'create_file_or_folder': {},
	'delete_file_or_folder': {},
	// ---
	'run_command': { result: string; resolveReason: TerminalResolveReason; },
	'run_persistent_command': { result: string; resolveReason: TerminalResolveReason; },
	'open_persistent_terminal': { persistentTerminalId: string },
	'kill_persistent_terminal': {},
	// --- lsp navigation ---
	'go_to_definition': { locations: LocationResult[] },
	'find_references': { locations: LocationResult[], totalMatches: number },
	'get_type_definition': { locations: LocationResult[] },
	'list_symbols': { symbols: { name: string, kind: string, startLine: number, endLine: number, uri: URI, snippet: string }[] },
	'find_implementations': { locations: LocationResult[] },
	// --- semantic search ---
	'semantic_search': { results: SearchResult[], totalMatches: number, indexStatus: string },
	// --- planning ---
	'update_plan': PlanningToolResult,
	// --- subagents ---
	'dispatch_agents': SubagentDispatchResult,
	// --- task completion ---
	'attempt_completion': { acknowledged: boolean, message: string },
	// --- web search ---
	'web_search': WebSearchResponse,
	'read_url': ReadUrlResult,
	// --- memories ---
	'save_memory': SaveMemoryResult,
	'delete_memory': DeleteMemoryResult,
	// --- remote index ---
	'remote_repo_tree': RemoteTreeResult,
	'remote_repo_read': RemoteFileResult,
	'remote_repo_search': RemoteSearchResult,
}


export type ToolCallParams<T extends BuiltinToolName | (string & {})> = T extends BuiltinToolName ? BuiltinToolCallParams[T] : RawToolParamsObj
export type ToolResult<T extends BuiltinToolName | (string & {})> = T extends BuiltinToolName ? BuiltinToolResultType[T] : RawMCPToolCall

export type BuiltinToolName = keyof BuiltinToolResultType

type BuiltinToolParamNameOfTool<T extends BuiltinToolName> = keyof (typeof builtinTools)[T]['params']
export type BuiltinToolParamName = { [T in BuiltinToolName]: BuiltinToolParamNameOfTool<T> }[BuiltinToolName]


export type ToolName = BuiltinToolName | (string & {})
export type ToolParamName<T extends ToolName> = T extends BuiltinToolName ? BuiltinToolParamNameOfTool<T> : string

// Alias mapping: LLMs sometimes hallucinate tool names from other editors (Windsurf, Cursor, Claude Code).
// Map them to Void's actual built-in tool names so the call still succeeds.
export const toolNameAliases: Record<string, BuiltinToolName> = {
	'write_to_file': 'rewrite_file',
	'write_file': 'rewrite_file',
	'create_file': 'create_file_or_folder',
	'str_replace_editor': 'edit_file',
	'bash': 'run_command',
	'execute_command': 'run_command',
	'list_files': 'ls_dir',
	'search_files': 'search_for_files',
}

// Resolve a possibly-aliased tool name to a built-in name (or return as-is for MCP tools)
export const resolveToolName = (name: string): ToolName => {
	return toolNameAliases[name] ?? name
}

