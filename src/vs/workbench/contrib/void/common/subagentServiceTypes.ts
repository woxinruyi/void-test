/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// --- Subagent task types ---

export type SubagentTaskType = 'grep' | 'read_file' | 'semantic_search' | 'list_symbols'

export interface SubagentTask {
	id: string
	type: SubagentTaskType
	description: string          // human-readable description of what this subtask does
	params: SubagentTaskParams
}

export type SubagentTaskParams =
	| { type: 'grep', query: string, includePattern?: string, searchInFolder?: string }
	| { type: 'read_file', filePath: string, startLine?: number, endLine?: number }
	| { type: 'semantic_search', query: string, maxResults?: number }
	| { type: 'list_symbols', filePath?: string, query?: string }


// --- Subagent result ---

export interface SubagentTaskResult {
	id: string
	type: SubagentTaskType
	description: string
	success: boolean
	content: string              // formatted result text
	error?: string
	durationMs: number
}

export interface SubagentDispatchResult {
	results: SubagentTaskResult[]
	totalTasks: number
	successCount: number
	totalDurationMs: number
}
