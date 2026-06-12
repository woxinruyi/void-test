/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// --- Remote Repository Index Types ---

export interface RemoteRepoInfo {
	owner: string
	repo: string
	branch: string
	/** Cached file tree paths */
	filePaths: string[]
	/** Last indexed timestamp */
	indexedAt: number
}

export interface RemoteFileResult {
	path: string
	content: string
	size: number
	truncated: boolean
}

export interface RemoteSearchResult {
	owner: string
	repo: string
	branch: string
	matches: RemoteSearchMatch[]
	totalMatches: number
}

export interface RemoteSearchMatch {
	path: string
	/** Matched lines with surrounding context */
	snippet: string
	lineNumber: number
}

export interface RemoteTreeResult {
	owner: string
	repo: string
	branch: string
	paths: string[]
	totalFiles: number
}
