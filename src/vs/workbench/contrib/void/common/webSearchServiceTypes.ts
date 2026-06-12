/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// --- Web search result types ---

export interface WebSearchResult {
	title: string
	url: string
	snippet: string
}

export interface WebSearchResponse {
	query: string
	results: WebSearchResult[]
	totalResults: number
}


// --- URL read result types ---

export interface ReadUrlResult {
	url: string
	title: string
	content: string           // extracted text content
	contentLength: number     // original content length before truncation
	truncated: boolean
}
