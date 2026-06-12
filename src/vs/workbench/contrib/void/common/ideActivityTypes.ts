/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// --- IDE Activity Tracking Types ---

export interface FileVisitRecord {
	filePath: string
	language: string
	timestamp: number       // ms since epoch
	lineNumber: number      // cursor line at time of visit
}

export interface CursorContext {
	filePath: string
	lineNumber: number
	column: number
	language: string
	/** Nearby lines around cursor for context (±5 lines) */
	surroundingSnippet?: string
}

export interface SelectionContext {
	filePath: string
	startLine: number
	endLine: number
	selectedText: string
	language: string
	timestamp: number
}

export interface IDEActivitySnapshot {
	/** Current cursor position */
	cursor: CursorContext | null
	/** Recent file visits (most recent first, max 15) */
	recentFiles: FileVisitRecord[]
	/** Recent selections (most recent first, max 5) */
	recentSelections: SelectionContext[]
}
