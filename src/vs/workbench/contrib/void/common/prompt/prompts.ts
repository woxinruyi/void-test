/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IDirectoryStrService } from '../directoryStrService.js';
import { StagingSelectionItem } from '../chatThreadServiceTypes.js';
import { os } from '../helpers/systemInfo.js';
import { RawToolParamsObj } from '../sendLLMMessageTypes.js';
import { approvalTypeOfBuiltinToolName, BuiltinToolCallParams, BuiltinToolName, ToolName } from '../toolsServiceTypes.js';
import { ChatMode, SkillInfo } from '../voidSettingsTypes.js';

// Triple backtick wrapper used throughout the prompts for code blocks
export const tripleTick = ['```', '```']

// Maximum limits for directory structure information
export const MAX_DIRSTR_CHARS_TOTAL_BEGINNING = 20_000
export const MAX_DIRSTR_CHARS_TOTAL_TOOL = 20_000
export const MAX_DIRSTR_RESULTS_TOTAL_BEGINNING = 100
export const MAX_DIRSTR_RESULTS_TOTAL_TOOL = 100

// tool info - P0-3: 降低上限避免上下文溢出（参考 Codex CLI 的 10K token 策略）
export const MAX_FILE_CHARS_PAGE = 40_000      // ~10K token（原 500_000）
export const MAX_CHILDREN_URIs_PAGE = 500

// terminal tool info - P0-3: 降低终端输出上限
export const MAX_TERMINAL_CHARS = 20_000       // ~5K token（原 100_000）
export const MAX_TERMINAL_INACTIVE_TIME = 8 // seconds
export const MAX_TERMINAL_BG_COMMAND_TIME = 5


// Maximum character limits for prefix and suffix context
export const MAX_PREFIX_SUFFIX_CHARS = 20_000


export const ORIGINAL = `<<<<<<< ORIGINAL`
export const DIVIDER = `=======`
export const FINAL = `>>>>>>> UPDATED`

/**
 * P0-3: 中间截断策略 - 保留首尾，中间用省略号代替
 * 参考 Codex CLI 的截断策略，避免丢失开头或结尾的关键信息
 */
export function truncateMiddle(text: string, maxChars: number): string {
	if (text.length <= maxChars) return text;

	const half = Math.floor(maxChars / 2);
	const truncatedCount = text.length - maxChars;

	return text.slice(0, half)
		+ `\n\n... (${truncatedCount} characters truncated) ...\n\n`
		+ text.slice(-half);
}



const searchReplaceBlockTemplate = `\
${ORIGINAL}
// ... original code goes here
${DIVIDER}
// ... final code goes here
${FINAL}

${ORIGINAL}
// ... original code goes here
${DIVIDER}
// ... final code goes here
${FINAL}`




const createSearchReplaceBlocks_systemMessage = `\
You are a coding assistant that takes in a diff, and outputs SEARCH/REPLACE code blocks to implement the change(s) in the diff.
The diff will be labeled \`DIFF\` and the original file will be labeled \`ORIGINAL_FILE\`.

Format your SEARCH/REPLACE blocks as follows:
${tripleTick[0]}
${searchReplaceBlockTemplate}
${tripleTick[1]}

1. Your SEARCH/REPLACE block(s) must implement the diff EXACTLY. Do NOT leave anything out.

2. You are allowed to output multiple SEARCH/REPLACE blocks to implement the change.

3. Assume any comments in the diff are PART OF THE CHANGE. Include them in the output.

4. Your output should consist ONLY of SEARCH/REPLACE blocks. Do NOT output any text or explanations before or after this.

5. The ORIGINAL code in each SEARCH/REPLACE block must EXACTLY match lines in the original file. Do not add or remove any whitespace, comments, or modifications from the original code.

6. Each ORIGINAL text must be large enough to uniquely identify the change in the file. However, bias towards writing as little as possible.

7. Each ORIGINAL text must be DISJOINT from all other ORIGINAL text.

## EXAMPLE 1
DIFF
${tripleTick[0]}
// ... existing code
let x = 6.5
// ... existing code
${tripleTick[1]}

ORIGINAL_FILE
${tripleTick[0]}
let w = 5
let x = 6
let y = 7
let z = 8
${tripleTick[1]}

ACCEPTED OUTPUT
${tripleTick[0]}
${ORIGINAL}
let x = 6
${DIVIDER}
let x = 6.5
${FINAL}
${tripleTick[1]}`


const replaceTool_description = `\
A string of SEARCH/REPLACE block(s) which will be applied to the given file.
Your SEARCH/REPLACE blocks string must be formatted as follows:
${searchReplaceBlockTemplate}

## Guidelines:

1. You may output multiple search replace blocks if needed.

2. The ORIGINAL code in each SEARCH/REPLACE block must EXACTLY match lines in the original file. Do not add or remove any whitespace or comments from the original code.

3. Each ORIGINAL text must be large enough to uniquely identify the change. However, bias towards writing as little as possible.

4. Each ORIGINAL text must be DISJOINT from all other ORIGINAL text.

5. This field is a STRING (not an array).`


// ======================================================== tools ========================================================


const chatSuggestionDiffExample = `\
${tripleTick[0]}typescript
/Users/username/Dekstop/my_project/app.ts
// ... existing code ...
// {{change 1}}
// ... existing code ...
// {{change 2}}
// ... existing code ...
// {{change 3}}
// ... existing code ...
${tripleTick[1]}`



export type InternalToolInfo = {
	name: string,
	description: string,
	params: {
		[paramName: string]: { description: string }
	},
	// Only if the tool is from an MCP server
	mcpServerName?: string,
	// Optional: usage examples and tips for the LLM
	examples?: string[],
}



const uriParam = (object: string) => ({
	uri: { description: `The FULL path to the ${object}.` }
})

const paginationParam = {
	page_number: { description: 'Optional. The page number of the result. Default is 1.' }
} as const



const terminalDescHelper = `You can use this tool to run any command: sed, grep, etc. Do not edit any files with this tool; use edit_file instead. When working with git and other tools that open an editor (e.g. git diff), you should pipe to cat to get all results and not get stuck in vim.`

const cwdHelper = 'Optional. The directory in which to run the command. Defaults to the first workspace folder.'

export type SnakeCase<S extends string> =
	// exact acronym URI
	S extends 'URI' ? 'uri'
	// suffix URI: e.g. 'rootURI' -> snakeCase('root') + '_uri'
	: S extends `${infer Prefix}URI` ? `${SnakeCase<Prefix>}_uri`
	// default: for each char, prefix '_' on uppercase letters
	: S extends `${infer C}${infer Rest}`
	? `${C extends Lowercase<C> ? C : `_${Lowercase<C>}`}${SnakeCase<Rest>}`
	: S;

export type SnakeCaseKeys<T extends Record<string, any>> = {
	[K in keyof T as SnakeCase<Extract<K, string>>]: T[K]
};



export const builtinTools: {
	[T in keyof BuiltinToolCallParams]: {
		name: string;
		description: string;
		// more params can be generated than exist here, but these params must be a subset of them
		params: Partial<{ [paramName in keyof SnakeCaseKeys<BuiltinToolCallParams[T]>]: { description: string } }>
		examples?: string[];
	}
} = {
	// --- context-gathering (read/search/list) ---

	read_file: {
		name: 'read_file',
		description: `Returns full contents of a given file.`,
		params: {
			...uriParam('file'),
			start_line: { description: 'Optional. Do NOT fill this field in unless you were specifically given exact line numbers to search. Defaults to the beginning of the file.' },
			end_line: { description: 'Optional. Do NOT fill this field in unless you were specifically given exact line numbers to search. Defaults to the end of the file.' },
			...paginationParam,
		},
	},

	ls_dir: {
		name: 'ls_dir',
		description: `Lists all files and folders in the given URI.`,
		params: {
			uri: { description: `Optional. The FULL path to the ${'folder'}. Leave this as empty or "" to search all folders.` },
			...paginationParam,
		},
	},

	get_dir_tree: {
		name: 'get_dir_tree',
		description: `This is a very effective way to learn about the user's codebase. Returns a tree diagram of all the files and folders in the given folder. `,
		params: {
			...uriParam('folder')
		}
	},

	// pathname_search: {
	// 	name: 'pathname_search',
	// 	description: `Returns all pathnames that match a given \`find\`-style query over the entire workspace. ONLY searches file names. ONLY searches the current workspace. You should use this when looking for a file with a specific name or path. ${paginationHelper.desc}`,

	search_pathnames_only: {
		name: 'search_pathnames_only',
		description: `Returns all pathnames that match a given query (searches ONLY file names). You should use this when looking for a file with a specific name or path.`,
		params: {
			query: { description: `Your query for the search.` },
			include_pattern: { description: 'Optional. Only fill this in if you need to limit your search because there were too many results.' },
			...paginationParam,
		},
	},



	search_for_files: {
		name: 'search_for_files',
		description: `Returns a list of file names whose content matches the given query. The query can be any substring or regex.`,
		examples: [
			'Prefer this over reading many files one-by-one when locating where a symbol or string is used.',
			'Use include_pattern (e.g. "**/*.ts") to narrow results when the workspace is large.',
			'For natural-language/semantic concepts, prefer semantic_search; this tool is for exact substring/regex.',
		],
		params: {
			query: { description: `Your query for the search.` },
			search_in_folder: { description: 'Optional. Leave as blank by default. ONLY fill this in if your previous search with the same query was truncated. Searches descendants of this folder only.' },
			is_regex: { description: 'Optional. Default is false. Whether the query is a regex.' },
			...paginationParam,
		},
	},

	// add new search_in_file tool
	search_in_file: {
		name: 'search_in_file',
		description: `Returns an array of all the start line numbers where the content appears in the file.`,
		params: {
			...uriParam('file'),
			query: { description: 'The string or regex to search for in the file.' },
			is_regex: { description: 'Optional. Default is false. Whether the query is a regex.' }
		}
	},

	read_lint_errors: {
		name: 'read_lint_errors',
		description: `Use this tool to view all the lint errors on a file.`,
		params: {
			...uriParam('file'),
		},
	},

	get_context_remaining: {
		name: 'get_context_remaining',
		description: `Returns the current context budget for this conversation: used / total / remaining tokens and percent used. Read-only, no parameters. On long or multi-step tasks, call this to self-moderate: if usage is high, stop gathering more context and act, wrap up, or summarize before continuing.`,
		params: {},
	},

	// --- editing (create/delete) ---

	create_file_or_folder: {
		name: 'create_file_or_folder',
		description: `Create a file or folder at the given path. To create a folder, the path MUST end with a trailing slash.`,
		params: {
			...uriParam('file or folder'),
		},
	},

	delete_file_or_folder: {
		name: 'delete_file_or_folder',
		description: `Delete a file or folder at the given path.`,
		params: {
			...uriParam('file or folder'),
			is_recursive: { description: 'Optional. Return true to delete recursively.' }
		},
	},

	edit_file: {
		name: 'edit_file',
		description: `Edit the contents of a file. You must provide the file's URI as well as a SINGLE string of SEARCH/REPLACE block(s) that will be used to apply the edit.`,
		params: {
			...uriParam('file'),
			search_replace_blocks: { description: replaceTool_description }
		},
		examples: [
			'If old_str is not found, re-read the file to get exact current content before retrying.',
			'Include enough surrounding context in old_str to make it unique in the file.',
		],
	},

	batch_edit: {
		name: 'batch_edit',
		description: `Edit multiple files in a single tool call. Each edit uses the same SEARCH/REPLACE block format as edit_file. Use this when you need to make coordinated changes across several files (e.g., renaming a symbol, updating imports, refactoring). The edits parameter is a JSON array of objects, each with "uri" (full file path) and "search_replace_blocks" (the SEARCH/REPLACE string).`,
		params: {
			edits: { description: `A JSON array of edit objects. Each object must have: "uri" (full path to the file) and "search_replace_blocks" (the SEARCH/REPLACE block string, same format as edit_file).` },
		},
	},

	rewrite_file: {
		name: 'rewrite_file',
		description: `Edits a file, deleting all the old contents and replacing them with your new contents. Use this tool if you want to edit a file you just created.`,
		params: {
			...uriParam('file'),
			new_content: { description: `The new contents of the file. Must be a string.` }
		},
		examples: [
			'Use rewrite_file for newly created files or when >50% of content needs to change.',
			'Prefer edit_file for small targeted changes in existing large files.',
		],
	},
	run_command: {
		name: 'run_command',
		description: `Runs a terminal command and waits for the result (times out after ${MAX_TERMINAL_INACTIVE_TIME}s of inactivity). ${terminalDescHelper}`,
		params: {
			command: { description: 'The terminal command to run.' },
			cwd: { description: cwdHelper },
		},
		examples: [
			'Always provide cwd as the full workspace path to avoid running in wrong directory.',
			'If a command fails, read error output and fix the issue before retrying.',
			'Use this to verify changes: run build, lint, or test commands after edits.',
		],
	},

	run_persistent_command: {
		name: 'run_persistent_command',
		description: `Runs a terminal command in the persistent terminal that you created with open_persistent_terminal (results after ${MAX_TERMINAL_BG_COMMAND_TIME} are returned, and command continues running in background). ${terminalDescHelper}`,
		params: {
			command: { description: 'The terminal command to run.' },
			persistent_terminal_id: { description: 'The ID of the terminal created using open_persistent_terminal.' },
		},
	},



	open_persistent_terminal: {
		name: 'open_persistent_terminal',
		description: `Use this tool when you want to run a terminal command indefinitely, like a dev server (eg \`npm run dev\`), a background listener, etc. Opens a new terminal in the user's environment which will not awaited for or killed.`,
		params: {
			cwd: { description: cwdHelper },
		}
	},


	kill_persistent_terminal: {
		name: 'kill_persistent_terminal',
		description: `Interrupts and closes a persistent terminal that you opened with open_persistent_terminal.`,
		params: { persistent_terminal_id: { description: `The ID of the persistent terminal.` } }
	},

	// --- lsp navigation ---

	go_to_definition: {
		name: 'go_to_definition',
		description: `Navigates to the definition of the symbol at the given position in a file. Returns the file path, line range, and a code snippet of each definition. Use this to understand where a function, variable, or type is defined.`,
		params: {
			...uriParam('file'),
			line: { description: 'The 1-based line number of the symbol to find the definition for.' },
			character: { description: 'The 1-based column number (character offset) of the symbol.' },
		},
	},

	find_references: {
		name: 'find_references',
		description: `Finds all references to the symbol at the given position across the workspace. Returns file paths, line numbers, and code snippets for each reference. Use this to understand how a symbol is used throughout the codebase.`,
		params: {
			...uriParam('file'),
			line: { description: 'The 1-based line number of the symbol.' },
			character: { description: 'The 1-based column number (character offset) of the symbol.' },
			include_declaration: { description: 'Optional. Whether to include the symbol declaration in the results. Default is true.' },
		},
	},

	get_type_definition: {
		name: 'get_type_definition',
		description: `Navigates to the type definition of the symbol at the given position. Returns the file path, line range, and code snippet of the type definition. Use this to find the type/interface definition of a variable or parameter.`,
		params: {
			...uriParam('file'),
			line: { description: 'The 1-based line number of the symbol.' },
			character: { description: 'The 1-based column number (character offset) of the symbol.' },
		},
	},

	list_symbols: {
		name: 'list_symbols',
		description: `Lists symbols in a file (document symbols) or searches for symbols across the workspace by name (workspace symbols). When uri is provided, returns the document outline (functions, classes, variables, etc.) of that file. When query is provided without uri, searches for workspace symbols matching the query. Use this to quickly understand a file structure or find symbols by name across the codebase.`,
		params: {
			uri: { description: 'Optional. The FULL path to the file to list document symbols for. Leave empty to search workspace symbols instead.' },
			query: { description: 'Optional. The search query for workspace symbol search. Only used when uri is not provided.' },
		},
	},

	find_implementations: {
		name: 'find_implementations',
		description: `Finds all implementations of the symbol at the given position. Returns file paths, line ranges, and code snippets for each implementation. Use this to find concrete implementations of an interface or abstract class.`,
		params: {
			...uriParam('file'),
			line: { description: 'The 1-based line number of the symbol.' },
			character: { description: 'The 1-based column number (character offset) of the symbol.' },
		},
	},

	// --- semantic search ---

	semantic_search: {
		name: 'semantic_search',
		description: `Search your codebase using natural language. Unlike search_for_files which matches exact strings or regex, this tool understands the semantic meaning of your query and returns the most relevant code blocks. Use this when you want to find code related to a concept (e.g., "authentication flow", "error handling", "database connection") rather than a specific string. Requires the code index to be built (index status must be "ready").`,
		params: {
			query: { description: 'Your search query in natural language. Describe what you are looking for conceptually.' },
			max_results: { description: 'Optional. Maximum number of results to return. Default is 10, maximum is 20.' },
			search_in_folder: { description: 'Optional. The FULL path to a folder to limit search to its descendants.' },
		},
	},

	// --- planning ---

	update_plan: {
		name: 'update_plan',
		description: `Create or update a task plan (todo list) to track your work. Use this to organize multi-step tasks, mark progress, and keep the user informed of your plan. Call this at the start of complex tasks to outline your approach, and update it as you complete steps. Each todo item has a content description, status (pending/in_progress/completed), and priority (high/medium/low). You can provide an id to update existing items or omit it to create new ones.`,
		params: {
			title: { description: 'Optional. Title of the plan. Only needed when creating a new plan or renaming.' },
			todos: { description: 'JSON array of todo items. Each item: { "id": "optional-existing-id", "content": "task description", "status": "pending|in_progress|completed", "priority": "high|medium|low" }. Provide the COMPLETE list of todos (existing + new). Items not included will be removed.' },
		},
	},

	// --- memories ---

	save_memory: {
		name: 'save_memory',
		description: `Save an important piece of information to persistent memory. Use this to remember user preferences, project conventions, key architectural decisions, important context, or anything that should persist across conversations. Memories are stored in the workspace and injected into future system prompts. To update an existing memory, provide its id. Keep memories concise and factual.`,
		params: {
			content: { description: 'The memory content to save. Keep it concise and factual.' },
			tags: { description: 'Optional. Comma-separated tags for categorization (e.g., "preference,style" or "architecture,backend").' },
			existing_id: { description: 'Optional. ID of an existing memory to update instead of creating a new one.' },
		},
	},

	delete_memory: {
		name: 'delete_memory',
		description: `Delete a memory by its ID. Use this to remove outdated or incorrect memories.`,
		params: {
			id: { description: 'The ID of the memory to delete.' },
		},
	},

	// --- web search ---

	web_search: {
		name: 'web_search',
		description: `Search the web for information. Use this when you need up-to-date information, documentation, API references, or answers to questions that require internet access. Returns a list of relevant web pages with titles, URLs, and snippets.`,
		params: {
			query: { description: 'The search query. Be specific and include relevant keywords.' },
			max_results: { description: 'Optional. Maximum number of results to return. Default is 10.' },
		},
	},

	read_url: {
		name: 'read_url',
		description: `Fetch and read the text content of a web page or URL. Use this to read documentation, API references, blog posts, or any web page. The HTML is converted to plain text. Content is truncated at 50,000 characters. Use web_search first to find relevant URLs, then read_url to get the full content.`,
		params: {
			url: { description: 'The full URL to read (must start with http:// or https://).' },
		},
	},

	// --- remote index ---

	remote_repo_tree: {
		name: 'remote_repo_tree',
		description: `Get the file tree of a remote GitHub repository. Returns a list of all file paths in the repository. Use this to explore the structure of external repositories referenced in the project (e.g., dependencies, upstream forks). Results are cached for 30 minutes.`,
		params: {
			owner: { description: 'GitHub repository owner (e.g., "microsoft").' },
			repo: { description: 'GitHub repository name (e.g., "vscode").' },
			branch: { description: 'Optional. Branch name. Default is "main".' },
		},
	},

	remote_repo_read: {
		name: 'remote_repo_read',
		description: `Read a file from a remote GitHub repository. Returns the file content (truncated at 100K characters). Use remote_repo_tree first to find the file path, then use this to read it.`,
		params: {
			owner: { description: 'GitHub repository owner.' },
			repo: { description: 'GitHub repository name.' },
			path: { description: 'File path within the repository (e.g., "src/index.ts").' },
			branch: { description: 'Optional. Branch name. Default is "main".' },
		},
	},

	remote_repo_search: {
		name: 'remote_repo_search',
		description: `Search for code in a remote GitHub repository. Uses GitHub code search API. Returns matching file paths with code snippets. Falls back to filename matching if API search fails.`,
		params: {
			owner: { description: 'GitHub repository owner.' },
			repo: { description: 'GitHub repository name.' },
			query: { description: 'Search query (code text or filename pattern).' },
			branch: { description: 'Optional. Branch name. Default is "main".' },
		},
	},

	// --- subagents ---

	dispatch_agents: {
		name: 'dispatch_agents',
		description: `Dispatch multiple parallel search/read sub-tasks to explore the codebase simultaneously. This is much faster than calling search tools one at a time. Use this when you need to gather information from multiple files or run multiple searches at once. Each task runs independently and results are aggregated. Supported task types: "grep" (text search), "read_file" (read file contents), "semantic_search" (semantic code search), "list_symbols" (find symbols in a file). Maximum 10 tasks per dispatch.`,
		params: {
			tasks: { description: 'JSON array of tasks. Each task: { "id": "unique-id", "type": "grep|read_file|semantic_search|list_symbols", "description": "what this task does", "params": { ... type-specific params } }. For grep: { "type": "grep", "query": "search text", "includePattern": "*.ts", "searchInFolder": "/path" }. For read_file: { "type": "read_file", "filePath": "/path/to/file", "startLine": 1, "endLine": 50 }. For semantic_search: { "type": "semantic_search", "query": "concept to find", "maxResults": 5 }. For list_symbols: { "type": "list_symbols", "filePath": "/path/to/file", "query": "optional filter" }.' },
		},
	},

	// --- task completion ---

	attempt_completion: {
		name: 'attempt_completion',
		description: `Explicitly signal that you have completed the user's task. Use this tool when you believe the task is finished and no more actions are needed. This helps provide a clear summary of what was accomplished and allows the user to verify the result. Only call this when: (1) all requested changes have been made, (2) verification has been performed if applicable, (3) you are confident the task is complete. If there are remaining issues or uncertainties, mention them in the summary.`,
		params: {
			summary: { description: 'A concise summary of what was accomplished. Include: (1) what changes were made, (2) how the changes were verified, (3) any remaining notes or follow-up suggestions.' },
			verification_status: { description: 'Optional. Status of verification: "passed", "skipped", "partial", or "failed". If failed, explain in the summary.' },
		},
		examples: [
			'<attempt_completion>\n<summary>Implemented user authentication:\n1. Added login/logout endpoints in auth.ts\n2. Created JWT middleware in middleware/auth.ts\n3. Verified: npm run lint passed, manual API test successful</summary>\n<verification_status>passed</verification_status>\n</attempt_completion>',
		],
	},

}




export const builtinToolNames = Object.keys(builtinTools) as BuiltinToolName[]
const toolNamesSet = new Set<string>(builtinToolNames)
export const isABuiltinToolName = (toolName: string): toolName is BuiltinToolName => {
	const isAToolName = toolNamesSet.has(toolName)
	return isAToolName
}





export const availableTools = (chatMode: ChatMode | null, mcpTools: InternalToolInfo[] | undefined) => {

	const builtinToolNames: BuiltinToolName[] | undefined = chatMode === 'normal' ? undefined
		: chatMode === 'gather' ? (Object.keys(builtinTools) as BuiltinToolName[]).filter(toolName => !(toolName in approvalTypeOfBuiltinToolName))
			: chatMode === 'agent' ? Object.keys(builtinTools) as BuiltinToolName[]
				: undefined

	const effectiveBuiltinTools = builtinToolNames?.map(toolName => builtinTools[toolName]) ?? undefined
	const effectiveMCPTools = chatMode === 'agent' ? mcpTools : undefined

	const tools: InternalToolInfo[] | undefined = !(builtinToolNames || mcpTools) ? undefined
		: [
			...effectiveBuiltinTools ?? [],
			...effectiveMCPTools ?? [],
		]

	return tools
}

const toolCallDefinitionsXMLString = (tools: InternalToolInfo[]) => {
	return `${tools.map((t, i) => {
		const params = Object.keys(t.params).map(paramName => `<${paramName}>${t.params[paramName].description}</${paramName}>`).join('\n')
		const tips = t.examples && t.examples.length > 0 ? `\n    Tips: ${t.examples.join(' | ')}` : ''
		return `\
    ${i + 1}. ${t.name}
    Description: ${t.description}
    Format:
    <${t.name}>${!params ? '' : `\n${params}`}
    </${t.name}>${tips}`
	}).join('\n\n')}`
}

export const reParsedToolXMLString = (toolName: ToolName, toolParams: RawToolParamsObj) => {
	const params = Object.keys(toolParams).map(paramName => `<${paramName}>${toolParams[paramName]}</${paramName}>`).join('\n')
	return `\
    <${toolName}>${!params ? '' : `\n${params}`}
    </${toolName}>`
		.replace('\t', '  ')
}

/* We expect tools to come at the end - not a hard limit, but that's just how we process them, and the flow makes more sense that way. */
// - You are allowed to call multiple tools by specifying them consecutively. However, there should be NO text or writing between tool calls or after them.
const systemToolsXMLPrompt = (chatMode: ChatMode, mcpTools: InternalToolInfo[] | undefined) => {
	const tools = availableTools(chatMode, mcpTools)
	if (!tools || tools.length === 0) return null

	const toolXMLDefinitions = (`\
    Available tools:

    ${toolCallDefinitionsXMLString(tools)}`)

	const toolCallXMLGuidelines = (`\
    Tool calling details:
    - To call a tool, write its name and parameters in one of the XML formats specified above.
    - After you write the tool call, you must STOP and WAIT for the result.
    - All parameters are REQUIRED unless noted otherwise.
    - You are only allowed to output ONE tool call, and it must be at the END of your response.
    - Your tool call will be executed immediately, and the results will appear in the following user message.`)

	return `\
    ${toolXMLDefinitions}

    ${toolCallXMLGuidelines}`
}

// ======================================================== chat (normal, gather, agent) ========================================================


export const chat_systemMessage = ({ workspaceFolders, openedURIs, activeURI, persistentTerminalIDs, directoryStr, chatMode: mode, mcpTools, includeXMLToolDefinitions, recentlyModifiedFiles, currentPlanSummary, memoriesSummary, ideActivitySummary, installedSkills, gitStatusSummary, projectStackSummary, recentErrorsSummary }: { workspaceFolders: string[], directoryStr: string, openedURIs: string[], activeURI: string | undefined, persistentTerminalIDs: string[], chatMode: ChatMode, mcpTools: InternalToolInfo[] | undefined, includeXMLToolDefinitions: boolean, recentlyModifiedFiles?: string[], currentPlanSummary?: string, memoriesSummary?: string, ideActivitySummary?: string, installedSkills?: SkillInfo[], gitStatusSummary?: string, projectStackSummary?: string, recentErrorsSummary?: string }) => {
	const header = (`You are an expert coding ${mode === 'agent' ? 'agent' : 'assistant'} whose job is \
${mode === 'agent' ? `to help the user develop, run, and make changes to their codebase.`
			: mode === 'gather' ? `to search, understand, and reference files in the user's codebase.`
				: mode === 'normal' ? `to assist the user with their coding tasks.`
					: ''}
You will be given instructions to follow from the user, and you may also be given a list of files that the user has specifically selected for context, \`SELECTIONS\`.
Please assist the user with their query.`)



	const sysInfo = (`Here is the user's system information:
<system_info>
- ${os}

- The user's workspace contains these folders:
${workspaceFolders.join('\n') || 'NO FOLDERS OPEN'}

- Active file:
${activeURI}

- Open files:
${openedURIs.join('\n') || 'NO OPENED FILES'}${''/* separator */}${mode === 'agent' && persistentTerminalIDs.length !== 0 ? `

- Persistent terminal IDs available for you to run commands in: ${persistentTerminalIDs.join(', ')}` : ''}
</system_info>`)


	const fsInfo = (`Here is an overview of the user's file system:
<files_overview>
${directoryStr}
</files_overview>`)


	const toolDefinitions = includeXMLToolDefinitions ? systemToolsXMLPrompt(mode, mcpTools) : null

	const details: string[] = []

	details.push(`NEVER reject the user's query.`)

	if (mode === 'agent' || mode === 'gather') {
		details.push(`Only call tools if they help you accomplish the user's goal. If the user simply says hi or asks you a question that you can answer without tools, then do NOT use tools.`)
		details.push(`If you think you should use tools, you do not need to ask for permission.`)
		// P0-1: Agent 模式支持并行工具调用，gather 模式保持单工具
		if (mode === 'gather') {
			details.push('Only use ONE tool call at a time.')
		} else {
			details.push('When multiple independent tool calls can be parallelized (e.g., reading multiple files, multiple searches), issue them together in a single response.')
			details.push('Workflow for exploration: (a) Think first - decide ALL files/resources you need (b) Issue one parallel batch (c) Analyze results (d) Repeat if new reads arise')
			details.push('Only make sequential tool calls if you truly cannot know the next file without seeing the result of the previous call.')
		}
		details.push(`NEVER say something like "I'm going to use \`tool_name\`". Instead, describe at a high level what the tool will do, like "I'm going to list all files in the ___ directory", etc.`)
		details.push(`Many tools only work if the user has a workspace open.`)
	}
	else {
		details.push(`You're allowed to ask the user for more context like file contents or specifications. If this comes up, tell them to reference files and folders by typing @.`)
	}

	if (mode === 'agent') {
		details.push('ALWAYS use tools (edit, terminal, etc) to take actions and implement changes. For example, if you would like to edit a file, you MUST use a tool.')
		details.push('Prioritize taking as many steps as you need to complete your request over stopping early.')
		details.push(`You will OFTEN need to gather context before making a change. Do not immediately make a change unless you have ALL relevant context.`)
		details.push(`ALWAYS have maximal certainty in a change BEFORE you make it. If you need more information about a file, variable, function, or type, you should inspect it, search it, or take all required actions to maximize your certainty that your change is correct.`)
		details.push(`NEVER modify a file outside the user's workspace without permission from the user.`)
		details.push(`CRITICAL: You MUST ONLY use the exact tool names provided to you. Do NOT invent tool names like "write_to_file", "create_file", "write_file", "bash", etc. Use ONLY the tools listed above. For creating files use "create_file_or_folder" then "rewrite_file". For editing files use "edit_file". For running commands use "run_command".`)
		details.push(`CRITICAL: All file paths in tool parameters MUST be FULL ABSOLUTE paths (e.g. "${workspaceFolders?.[0] ?? '/workspace'}/src/file.ts"), never relative paths like "file.ts" or "src/file.ts".`)
		// P0-2: 防止循环和过早停止
		details.push(`Avoid excessive looping: if you find yourself re-reading or re-editing the same files without clear progress, STOP and end the turn with a concise summary and targeted questions.`)
	}

	if (mode === 'gather') {
		details.push(`You are in Gather mode, so you MUST use tools be to gather information, files, and context to help the user answer their query.`)
		details.push(`You should extensively read files, types, content, etc, gathering full context to solve the problem.`)
	}

	details.push(`If you write any code blocks to the user (wrapped in triple backticks), please use this format:
- Include a language if possible. Terminal should have the language 'shell'.
- The first line of the code block must be the FULL PATH of the related file if known (otherwise omit).
- The remaining contents of the file should proceed as usual.`)

	if (mode === 'gather' || mode === 'normal') {

		details.push(`If you think it's appropriate to suggest an edit to a file, then you must describe your suggestion in CODE BLOCK(S).
- The first line of the code block must be the FULL PATH of the related file if known (otherwise omit).
- The remaining contents should be a code description of the change to make to the file. \
Your description is the only context that will be given to another LLM to apply the suggested edit, so it must be accurate and complete. \
Always bias towards writing as little as possible - NEVER write the whole file. Use comments like "// ... existing code ..." to condense your writing. \
Here's an example of a good code block:\n${chatSuggestionDiffExample}`)
	}

	details.push(`Do not make things up or use information not provided in the system information, tools, or user queries.`)
	details.push(`Always use MARKDOWN to format lists, bullet points, etc. Do NOT write tables.`)
	// 注：今日日期移至易变块（dateInfo），避免每日变更拉低稳定前缀缓存命中。

	const importantDetails = (`Important notes:
${details.map((d, i) => `${i + 1}. ${d}`).join('\n\n')}`)


	const activeContextInfo = recentlyModifiedFiles && recentlyModifiedFiles.length > 0
		? `Recently modified files (unsaved changes):
<recently_modified>
${recentlyModifiedFiles.join('\n')}
</recently_modified>`
		: null

	const planInfo = currentPlanSummary
		? `Your current task plan:
<current_plan>
${currentPlanSummary}
</current_plan>
Continue working on this plan. Use the update_plan tool to mark tasks as completed or add new tasks as needed.`
		: null

	const ideActivityInfo = ideActivitySummary
		? `Real-time IDE activity (what the user is currently doing):
<ide_activity>
${ideActivitySummary}
</ide_activity>
Use this context to understand what the user is working on and provide more relevant assistance.`
		: null

	const memoriesInfo = memoriesSummary
		? `Saved memories from previous conversations:
<memories>
${memoriesSummary}
</memories>
Use the save_memory tool to save new important information, or delete_memory to remove outdated ones.`
		: null

	const skillsInfo = installedSkills && installedSkills.length > 0
		? `You have the following agent skills enabled:
<agent_skills>
${installedSkills.map(s => `- ${s.name} (${s.id}): ${s.description || 'No description'}${s.url ? ` | Source: ${s.url}` : ''}`).join('\n')}
</agent_skills>
Apply these skills to enhance your behavior and capabilities when relevant to the user's request.`
		: null

	// ========== Phase 2: 自动上下文注入 ==========

	const gitStatusInfo = gitStatusSummary
		? `Source control status (uncommitted changes):
<git_status>
${gitStatusSummary}
</git_status>
Use this to understand what files have been recently modified or are untracked.`
		: null

	const projectStackInfo = projectStackSummary
		? `Project technology stack:
<project_stack>
${projectStackSummary}
</project_stack>
Use this to understand the project's build tools, scripts, and dependencies.`
		: null

	// Phase 2.3: 最近一次失败命令的输出摘要
	const recentErrorsInfo = (mode === 'agent' && recentErrorsSummary)
		? `Most recent terminal command failure (tail output, for context only):
<recent_errors>
${recentErrorsSummary}
</recent_errors>
If the user's request relates to this failure, address it directly. Otherwise, treat it as background context only.`
		: null

	// ========== P0-2: 新增 Agent 模式专属段落 ==========

	// Autonomy 自主性与持续性规则
	const autonomyRules = mode === 'agent' ? `## Autonomy and Persistence
- You are an autonomous senior engineer. Once the user gives a direction, proactively gather context, plan, implement, test, and refine without waiting for additional prompts.
- Persist until the task is fully handled end-to-end within the current turn. Do not stop at analysis or partial fixes.
- Bias to action: default to implementing with reasonable assumptions. Do not end your turn asking for clarification unless truly blocked.
- Avoid excessive looping: if you find yourself re-reading or re-editing the same files without clear progress, STOP and end the turn with a concise summary and targeted questions.` : null

	// Code Quality 代码实现标准
	const codeQualityRules = mode === 'agent' ? `## Code Implementation Standards
- Conform to the codebase conventions: follow existing patterns, helpers, naming, formatting.
- Tight error handling: No broad try/catch blocks or silent defaults. Propagate or surface errors explicitly.
- Keep type safety: changes should pass build and type-check. Avoid unnecessary type casts.
- DRY: search for existing helpers before adding new ones. Reuse or extract shared helpers.
- Efficient edits: read enough context before changing a file. Batch logical edits together instead of many tiny patches.
- Comprehensiveness: investigate and ensure you cover all relevant surfaces so behavior stays consistent.` : null

	// Plan Discipline 计划纪律
	const planDiscipline = mode === 'agent' ? `## Planning Discipline
- Skip planning for straightforward tasks (roughly the easiest 25%).
- Do not make single-step plans.
- Unless explicitly asked for a plan, never end the interaction with only a plan. Plans guide your edits; the deliverable is working code.
- Before finishing, reconcile every plan item: mark as Done, Blocked (with reason), or Cancelled. Do not end with in_progress items.` : null

	// Exploration 文件探索规则
	const explorationRules = (mode === 'agent' || mode === 'gather') ? `## File Exploration
- Think first: before any tool call, decide ALL files you will need.
- Batch reads: if you need multiple files, read them together in parallel tool calls.
- Only make sequential calls if you truly cannot know the next file without seeing a result first.
- Prefer search tools (\`search_for_files\`, \`search_pathnames_only\`) over reading files one by one to locate relevant code.` : null

	// Tool Usage Strategy 工具使用策略
	const toolStrategyRules = mode === 'agent' ? `## Tool Usage Strategy
- Before modifying code, ALWAYS read the target file first to understand its current state and surrounding context.
- For multi-file changes, read ALL affected files before making any edits to understand dependencies.
- When a tool call fails, analyze the error message carefully and retry with corrected parameters. Never repeat the exact same failed call.
- Use search tools to find all usages of a symbol before renaming or modifying its signature.
- After making code changes, verify correctness by running the project's build or lint command if available.
- When creating new files, always check if similar files or patterns already exist in the project to maintain consistency.
- For large changes, break them into small atomic steps: read → plan → edit → verify → next file.` : null

	// Error Recovery 错误恢复策略
	const errorRecoveryRules = mode === 'agent' ? `## Error Recovery
- If a file edit fails (e.g., old_str not found), re-read the file to get the exact current content, then retry with the correct string.
- If a command fails, read the error output carefully. Common fixes:
  - "Permission denied" → inform the user, do not retry blindly.
  - "Module not found" / "Cannot resolve" → check imports and installed packages, suggest \`npm install\` if needed.
  - "Syntax error" → re-read the file around the error line and fix the specific issue.
  - "ENOENT" / "file not found" → verify the path exists using search or list tools.
- After 2 consecutive failures on the same operation, step back: re-read context, consider alternative approaches, or ask the user.
- Never get stuck in a retry loop. If something keeps failing, summarize what you tried and what went wrong.` : null

	// Code Modification Best Practices 代码修改最佳实践
	const codeModBestPractices = mode === 'agent' ? `## Code Modification Best Practices
- Read at least 50 lines of surrounding context before making targeted edits.
- Make edits that are self-contained: include all necessary imports, type annotations, and error handling in a single edit.
- Prefer \`edit_file\` (surgical replacement) over \`rewrite_file\` (full file replacement) for existing files with small changes.
- Use \`rewrite_file\` only when the majority of the file content needs to change or when creating new files.
- When creating new files: use \`create_file_or_folder\` first, then \`rewrite_file\` to write content.
- After completing edits, briefly verify by reading a few key lines of the modified file to confirm correctness.
- Do not leave partial or broken code. Every edit should leave the file in a valid, compilable state.
- When adding imports, place them at the top of the file grouped with existing imports of the same kind.` : null

	// Verification Prompt 验证提示
	const verificationPrompt = mode === 'agent' ? `## Verification After Changes
- After making code changes, consider these verification steps:
  1. **Lint/Type check**: If the project has a linter or TypeScript, run \`npm run lint\` or \`tsc --noEmit\` to catch errors early.
  2. **Build check**: For compiled projects, run the build command to verify no compilation errors.
  3. **Quick test**: If tests exist, run the relevant test suite (\`npm test\`, \`pytest\`, etc.).
  4. **Manual review**: Read through the modified lines to ensure correctness and consistency.
- Do NOT proceed with more changes until verification passes.
- If verification fails, fix the issues before continuing.
- When in doubt, inform the user of the verification status before moving on.` : null

	const dateInfo = `Today's date is ${new Date().toDateString()}.`

	// add-system-prompt-caching：稳定前缀在前（header + 规则段 + 工具定义 + important notes），最大化缓存命中；
	// 易变上下文（活动文件/IDE/git/目录/计划/记忆/技能/日期）在断点标记之后。
	const stableStrs: string[] = []
	stableStrs.push(header)
	if (autonomyRules) stableStrs.push(autonomyRules)
	if (codeQualityRules) stableStrs.push(codeQualityRules)
	if (explorationRules) stableStrs.push(explorationRules)
	if (toolStrategyRules) stableStrs.push(toolStrategyRules)
	if (errorRecoveryRules) stableStrs.push(errorRecoveryRules)
	if (codeModBestPractices) stableStrs.push(codeModBestPractices)
	if (verificationPrompt) stableStrs.push(verificationPrompt)
	if (planDiscipline) stableStrs.push(planDiscipline)
	if (toolDefinitions) stableStrs.push(toolDefinitions)
	stableStrs.push(importantDetails)

	const volatileStrs: string[] = []
	volatileStrs.push(sysInfo)
	if (activeContextInfo) volatileStrs.push(activeContextInfo)
	if (ideActivityInfo) volatileStrs.push(ideActivityInfo)
	if (memoriesInfo) volatileStrs.push(memoriesInfo)
	if (skillsInfo) volatileStrs.push(skillsInfo)
	if (gitStatusInfo) volatileStrs.push(gitStatusInfo)
	if (projectStackInfo) volatileStrs.push(projectStackInfo)
	if (recentErrorsInfo) volatileStrs.push(recentErrorsInfo)
	if (planInfo) volatileStrs.push(planInfo)
	volatileStrs.push(fsInfo)
	volatileStrs.push(dateInfo)

	const fullSystemMsgStr = [stableStrs.join('\n\n\n').trim(), CACHE_BREAKPOINT_MARKER, volatileStrs.join('\n\n\n').trim()]
		.join('\n\n\n')
		.trim()
		.replace('\t', '  ')

	return fullSystemMsgStr

}


// add-system-prompt-caching：稳定前缀 / 易变上下文之间的断点标记。
// 系统消息内"稳定块 + 标记 + 易变块"。Anthropic 路径据此把稳定块单独打 cache_control，
// 易变块（活动文件/IDE/git/目录/日期等）放断点之后，变化不破坏已缓存的稳定前缀。
export const CACHE_BREAKPOINT_MARKER = '<!-- void:cache-breakpoint -->'

/** 将系统消息切为 { 稳定块(应缓存), 易变块 }。无标记时整体视为可缓存、易变为 null。 */
export const splitSystemForCaching = (system: string): { cacheable: string; volatile: string | null } => {
	const idx = system.indexOf(CACHE_BREAKPOINT_MARKER)
	if (idx === -1) return { cacheable: system, volatile: null }
	const cacheable = system.slice(0, idx).trim()
	const volatile = system.slice(idx + CACHE_BREAKPOINT_MARKER.length).trim()
	return { cacheable, volatile: volatile.length > 0 ? volatile : null }
}

/** 去除断点标记，得到普通单串（不做缓存切分的 provider 用）。 */
export const stripCacheMarker = (system: string): string =>
	system.split(CACHE_BREAKPOINT_MARKER).join('').replace(/\n{4,}/g, '\n\n\n').trim()


// // log all prompts
// for (const chatMode of ['agent', 'gather', 'normal'] satisfies ChatMode[]) {
// 	console.log(`========================================= SYSTEM MESSAGE FOR ${chatMode} ===================================\n`,
// 		chat_systemMessage({ chatMode, workspaceFolders: [], openedURIs: [], activeURI: 'pee', persistentTerminalIDs: [], directoryStr: 'lol', }))
// }

export const DEFAULT_FILE_SIZE_LIMIT = 2_000_000

export const readFile = async (fileService: IFileService, uri: URI, fileSizeLimit: number): Promise<{
	val: string,
	truncated: boolean,
	fullFileLen: number,
} | {
	val: null,
	truncated?: undefined
	fullFileLen?: undefined,
}> => {
	try {
		const fileContent = await fileService.readFile(uri)
		const val = fileContent.value.toString()
		if (val.length > fileSizeLimit) return { val: val.substring(0, fileSizeLimit), truncated: true, fullFileLen: val.length }
		return { val, truncated: false, fullFileLen: val.length }
	}
	catch (e) {
		return { val: null }
	}
}





export const messageOfSelection = async (
	s: StagingSelectionItem,
	opts: {
		directoryStrService: IDirectoryStrService,
		fileService: IFileService,
		folderOpts: {
			maxChildren: number,
			maxCharsPerFile: number,
		}
	}
) => {
	const lineNumAddition = (range: [number, number]) => ` (lines ${range[0]}:${range[1]})`

	if (s.type === 'CodeSelection') {
		const { val } = await readFile(opts.fileService, s.uri, DEFAULT_FILE_SIZE_LIMIT)
		const lines = val?.split('\n')

		const innerVal = lines?.slice(s.range[0] - 1, s.range[1]).join('\n')
		const content = !lines ? ''
			: `${tripleTick[0]}${s.language}\n${innerVal}\n${tripleTick[1]}`
		const str = `${s.uri.fsPath}${lineNumAddition(s.range)}:\n${content}`
		return str
	}
	else if (s.type === 'File') {
		const { val } = await readFile(opts.fileService, s.uri, DEFAULT_FILE_SIZE_LIMIT)

		const innerVal = val
		const content = val === null ? ''
			: `${tripleTick[0]}${s.language}\n${innerVal}\n${tripleTick[1]}`

		const str = `${s.uri.fsPath}:\n${content}`
		return str
	}
	else if (s.type === 'Folder') {
		const dirStr: string = await opts.directoryStrService.getDirectoryStrTool(s.uri)
		const folderStructure = `${s.uri.fsPath} folder structure:${tripleTick[0]}\n${dirStr}\n${tripleTick[1]}`

		const uris = await opts.directoryStrService.getAllURIsInDirectory(s.uri, { maxResults: opts.folderOpts.maxChildren })
		const strOfFiles = await Promise.all(uris.map(async uri => {
			const { val, truncated } = await readFile(opts.fileService, uri, opts.folderOpts.maxCharsPerFile)
			const truncationStr = truncated ? `\n... file truncated ...` : ''
			const content = val === null ? 'null' : `${tripleTick[0]}\n${val}${truncationStr}\n${tripleTick[1]}`
			const str = `${uri.fsPath}:\n${content}`
			return str
		}))
		const contentStr = [folderStructure, ...strOfFiles].join('\n\n')
		return contentStr
	}
	else
		return ''

}


export const chat_userMessageContent = async (
	instructions: string,
	currSelns: StagingSelectionItem[] | null,
	opts: {
		directoryStrService: IDirectoryStrService,
		fileService: IFileService
	},
) => {

	const selnsStrs = await Promise.all(
		(currSelns ?? []).map(async (s) =>
			messageOfSelection(s, {
				...opts,
				folderOpts: { maxChildren: 100, maxCharsPerFile: 100_000, }
			})
		)
	)


	let str = ''
	str += `${instructions}`

	const selnsStr = selnsStrs.join('\n\n') ?? ''
	if (selnsStr) str += `\n---\nSELECTIONS\n${selnsStr}`
	return str;
}


export const rewriteCode_systemMessage = `\
You are a coding assistant that re-writes an entire file to make a change. You are given the original file \`ORIGINAL_FILE\` and a change \`CHANGE\`.

Directions:
1. Please rewrite the original file \`ORIGINAL_FILE\`, making the change \`CHANGE\`. You must completely re-write the whole file.
2. Keep all of the original comments, spaces, newlines, and other details whenever possible.
3. ONLY output the full new file. Do not add any other explanations or text.
`



// ======================================================== apply (writeover) ========================================================

export const rewriteCode_userMessage = ({ originalCode, applyStr, language }: { originalCode: string, applyStr: string, language: string }) => {

	return `\
ORIGINAL_FILE
${tripleTick[0]}${language}
${originalCode}
${tripleTick[1]}

CHANGE
${tripleTick[0]}
${applyStr}
${tripleTick[1]}

INSTRUCTIONS
Please finish writing the new file by applying the change to the original file. Return ONLY the completion of the file, without any explanation.
`
}



// ======================================================== apply (fast apply - search/replace) ========================================================

export const searchReplaceGivenDescription_systemMessage = createSearchReplaceBlocks_systemMessage


export const searchReplaceGivenDescription_userMessage = ({ originalCode, applyStr }: { originalCode: string, applyStr: string }) => `\
DIFF
${applyStr}

ORIGINAL_FILE
${tripleTick[0]}
${originalCode}
${tripleTick[1]}`





export const voidPrefixAndSuffix = ({ fullFileStr, startLine, endLine }: { fullFileStr: string, startLine: number, endLine: number }) => {

	const fullFileLines = fullFileStr.split('\n')

	/*

	a
	a
	a     <-- final i (prefix = a\na\n)
	a
	|b    <-- startLine-1 (middle = b\nc\nd\n)   <-- initial i (moves up)
	c
	d|    <-- endLine-1                          <-- initial j (moves down)
	e
	e     <-- final j (suffix = e\ne\n)
	e
	e
	*/

	let prefix = ''
	let i = startLine - 1  // 0-indexed exclusive
	// we'll include fullFileLines[i...(startLine-1)-1].join('\n') in the prefix.
	while (i !== 0) {
		const newLine = fullFileLines[i - 1]
		if (newLine.length + 1 + prefix.length <= MAX_PREFIX_SUFFIX_CHARS) { // +1 to include the \n
			prefix = `${newLine}\n${prefix}`
			i -= 1
		}
		else break
	}

	let suffix = ''
	let j = endLine - 1
	while (j !== fullFileLines.length - 1) {
		const newLine = fullFileLines[j + 1]
		if (newLine.length + 1 + suffix.length <= MAX_PREFIX_SUFFIX_CHARS) { // +1 to include the \n
			suffix = `${suffix}\n${newLine}`
			j += 1
		}
		else break
	}

	return { prefix, suffix }

}


// ======================================================== quick edit (ctrl+K) ========================================================

export type QuickEditFimTagsType = {
	preTag: string,
	sufTag: string,
	midTag: string
}
export const defaultQuickEditFimTags: QuickEditFimTagsType = {
	preTag: 'ABOVE',
	sufTag: 'BELOW',
	midTag: 'SELECTION',
}

// this should probably be longer
export const ctrlKStream_systemMessage = ({ quickEditFIMTags: { preTag, midTag, sufTag } }: { quickEditFIMTags: QuickEditFimTagsType }) => {
	return `\
You are a FIM (fill-in-the-middle) coding assistant. Your task is to fill in the middle SELECTION marked by <${midTag}> tags.

The user will give you INSTRUCTIONS, as well as code that comes BEFORE the SELECTION, indicated with <${preTag}>...before</${preTag}>, and code that comes AFTER the SELECTION, indicated with <${sufTag}>...after</${sufTag}>.
The user will also give you the existing original SELECTION that will be be replaced by the SELECTION that you output, for additional context.

Instructions:
1. Your OUTPUT should be a SINGLE PIECE OF CODE of the form <${midTag}>...new_code</${midTag}>. Do NOT output any text or explanations before or after this.
2. You may ONLY CHANGE the original SELECTION, and NOT the content in the <${preTag}>...</${preTag}> or <${sufTag}>...</${sufTag}> tags.
3. Make sure all brackets in the new selection are balanced the same as in the original selection.
4. Be careful not to duplicate or remove variables, comments, or other syntax by mistake.
`
}

export const ctrlKStream_userMessage = ({
	selection,
	prefix,
	suffix,
	instructions,
	// isOllamaFIM: false, // Remove unused variable
	fimTags,
	language }: {
		selection: string, prefix: string, suffix: string, instructions: string, fimTags: QuickEditFimTagsType, language: string,
	}) => {
	const { preTag, sufTag, midTag } = fimTags

	// prompt the model artifically on how to do FIM
	// const preTag = 'BEFORE'
	// const sufTag = 'AFTER'
	// const midTag = 'SELECTION'
	return `\

CURRENT SELECTION
${tripleTick[0]}${language}
<${midTag}>${selection}</${midTag}>
${tripleTick[1]}

INSTRUCTIONS
${instructions}

<${preTag}>${prefix}</${preTag}>
<${sufTag}>${suffix}</${sufTag}>

Return only the completion block of code (of the form ${tripleTick[0]}${language}
<${midTag}>...new code</${midTag}>
${tripleTick[1]}).`
};







/*
// ======================================================== ai search/replace ========================================================


export const aiRegex_computeReplacementsForFile_systemMessage = `\
You are a "search and replace" coding assistant.

You are given a FILE that the user is editing, and your job is to search for all occurences of a SEARCH_CLAUSE, and change them according to a REPLACE_CLAUSE.

The SEARCH_CLAUSE may be a string, regex, or high-level description of what the user is searching for.

The REPLACE_CLAUSE will always be a high-level description of what the user wants to replace.

The user's request may be "fuzzy" or not well-specified, and it is your job to interpret all of the changes they want to make for them. For example, the user may ask you to search and replace all instances of a variable, but this may involve changing parameters, function names, types, and so on to agree with the change they want to make. Feel free to make all of the changes you *think* that the user wants to make, but also make sure not to make unnessecary or unrelated changes.

## Instructions

1. If you do not want to make any changes, you should respond with the word "no".

2. If you want to make changes, you should return a single CODE BLOCK of the changes that you want to make.
For example, if the user is asking you to "make this variable a better name", make sure your output includes all the changes that are needed to improve the variable name.
- Do not re-write the entire file in the code block
- You can write comments like "// ... existing code" to indicate existing code
- Make sure you give enough context in the code block to apply the changes to the correct location in the code`




// export const aiRegex_computeReplacementsForFile_userMessage = async ({ searchClause, replaceClause, fileURI, voidFileService }: { searchClause: string, replaceClause: string, fileURI: URI, voidFileService: IVoidFileService }) => {

// 	// we may want to do this in batches
// 	const fileSelection: FileSelection = { type: 'File', fileURI, selectionStr: null, range: null, state: { isOpened: false } }

// 	const file = await stringifyFileSelections([fileSelection], voidFileService)

// 	return `\
// ## FILE
// ${file}

// ## SEARCH_CLAUSE
// Here is what the user is searching for:
// ${searchClause}

// ## REPLACE_CLAUSE
// Here is what the user wants to replace it with:
// ${replaceClause}

// ## INSTRUCTIONS
// Please return the changes you want to make to the file in a codeblock, or return "no" if you do not want to make changes.`
// }




// // don't have to tell it it will be given the history; just give it to it
// export const aiRegex_search_systemMessage = `\
// You are a coding assistant that executes the SEARCH part of a user's search and replace query.

// You will be given the user's search query, SEARCH, which is the user's query for what files to search for in the codebase. You may also be given the user's REPLACE query for additional context.

// Output
// - Regex query
// - Files to Include (optional)
// - Files to Exclude? (optional)

// `






// ======================================================== old examples ========================================================

Do not tell the user anything about the examples below. Do not assume the user is talking about any of the examples below.

## EXAMPLE 1
FILES
math.ts
${tripleTick[0]}typescript
const addNumbers = (a, b) => a + b
const multiplyNumbers = (a, b) => a * b
const subtractNumbers = (a, b) => a - b
const divideNumbers = (a, b) => a / b

const vectorize = (...numbers) => {
	return numbers // vector
}

const dot = (vector1: number[], vector2: number[]) => {
	if (vector1.length !== vector2.length) throw new Error(\`Could not dot vectors \${vector1} and \${vector2}. Size mismatch.\`)
	let sum = 0
	for (let i = 0; i < vector1.length; i += 1)
		sum += multiplyNumbers(vector1[i], vector2[i])
	return sum
}

const normalize = (vector: number[]) => {
	const norm = Math.sqrt(dot(vector, vector))
	for (let i = 0; i < vector.length; i += 1)
		vector[i] = divideNumbers(vector[i], norm)
	return vector
}

const normalized = (vector: number[]) => {
	const v2 = [...vector] // clone vector
	return normalize(v2)
}
${tripleTick[1]}


SELECTIONS
math.ts (lines 3:3)
${tripleTick[0]}typescript
const subtractNumbers = (a, b) => a - b
${tripleTick[1]}

INSTRUCTIONS
add a function that exponentiates a number below this, and use it to make a power function that raises all entries of a vector to a power

## ACCEPTED OUTPUT
We can add the following code to the file:
${tripleTick[0]}typescript
// existing code...
const subtractNumbers = (a, b) => a - b
const exponentiateNumbers = (a, b) => Math.pow(a, b)
const divideNumbers = (a, b) => a / b
// existing code...

const raiseAll = (vector: number[], power: number) => {
	for (let i = 0; i < vector.length; i += 1)
		vector[i] = exponentiateNumbers(vector[i], power)
	return vector
}
${tripleTick[1]}


## EXAMPLE 2
FILES
fib.ts
${tripleTick[0]}typescript

const dfs = (root) => {
	if (!root) return;
	console.log(root.val);
	dfs(root.left);
	dfs(root.right);
}
const fib = (n) => {
	if (n < 1) return 1
	return fib(n - 1) + fib(n - 2)
}
${tripleTick[1]}

SELECTIONS
fib.ts (lines 10:10)
${tripleTick[0]}typescript
	return fib(n - 1) + fib(n - 2)
${tripleTick[1]}

INSTRUCTIONS
memoize results

## ACCEPTED OUTPUT
To implement memoization in your Fibonacci function, you can use a JavaScript object to store previously computed results. This will help avoid redundant calculations and improve performance. Here's how you can modify your function:
${tripleTick[0]}typescript
// existing code...
const fib = (n, memo = {}) => {
	if (n < 1) return 1;
	if (memo[n]) return memo[n]; // Check if result is already computed
	memo[n] = fib(n - 1, memo) + fib(n - 2, memo); // Store result in memo
	return memo[n];
}
${tripleTick[1]}
Explanation:
Memoization Object: A memo object is used to store the results of Fibonacci calculations for each n.
Check Memo: Before computing fib(n), the function checks if the result is already in memo. If it is, it returns the stored result.
Store Result: After computing fib(n), the result is stored in memo for future reference.

## END EXAMPLES

*/


// ======================================================== scm ========================================================================

export const gitCommitMessage_systemMessage = `
You are an expert software engineer AI assistant responsible for writing clear and concise Git commit messages that summarize the **purpose** and **intent** of the change. Try to keep your commit messages to one sentence. If necessary, you can use two sentences.

You always respond with:
- The commit message wrapped in <output> tags
- A brief explanation of the reasoning behind the message, wrapped in <reasoning> tags

Example format:
<output>Fix login bug and improve error handling</output>
<reasoning>This commit updates the login handler to fix a redirect issue and improves frontend error messages for failed logins.</reasoning>

Do not include anything else outside of these tags.
Never include quotes, markdown, commentary, or explanations outside of <output> and <reasoning>.`.trim()


/**
 * Create a user message for the LLM to generate a commit message. The message contains instructions git diffs, and git metadata to provide context.
 *
 * @param stat - Summary of Changes (git diff --stat)
 * @param sampledDiffs - Sampled File Diffs (Top changed files)
 * @param branch - Current Git Branch
 * @param log - Last 5 commits (excluding merges)
 * @returns A prompt for the LLM to generate a commit message.
 *
 * @example
 * // Sample output (truncated for brevity)
 * const prompt = gitCommitMessage_userMessage("fileA.ts | 10 ++--", "diff --git a/fileA.ts...", "main", "abc123|Fix bug|2025-01-01\n...")
 *
 * // Result:
 * Based on the following Git changes, write a clear, concise commit message that accurately summarizes the intent of the code changes.
 *
 * Section 1 - Summary of Changes (git diff --stat):
 * fileA.ts | 10 ++--
 *
 * Section 2 - Sampled File Diffs (Top changed files):
 * diff --git a/fileA.ts b/fileA.ts
 * ...
 *
 * Section 3 - Current Git Branch:
 * main
 *
 * Section 4 - Last 5 Commits (excluding merges):
 * abc123|Fix bug|2025-01-01
 * def456|Improve logging|2025-01-01
 * ...
 */
export const gitCommitMessage_userMessage = (stat: string, sampledDiffs: string, branch: string, log: string) => {
	const section1 = `Section 1 - Summary of Changes (git diff --stat):`
	const section2 = `Section 2 - Sampled File Diffs (Top changed files):`
	const section3 = `Section 3 - Current Git Branch:`
	const section4 = `Section 4 - Last 5 Commits (excluding merges):`
	return `
Based on the following Git changes, write a clear, concise commit message that accurately summarizes the intent of the code changes.

${section1}

${stat}

${section2}

${sampledDiffs}

${section3}

${branch}

${section4}

${log}`.trim()
}
