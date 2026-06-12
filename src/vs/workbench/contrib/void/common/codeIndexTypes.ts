/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// --- CodeChunk ---

export interface CodeChunk {
	id: string              // unique identifier (hash of filePath:startLine:endLine)
	filePath: string        // file path
	startLine: number       // start line (1-indexed)
	endLine: number         // end line
	content: string         // code block text
	language: string        // language identifier
	symbolName?: string     // symbol name (e.g. function/class name)
	symbolKind?: string     // symbol type (function/class/method/variable)
	tokenCount: number      // approximate token count
}


// --- ChunkMetadata (stored in vector DB, no content) ---

export interface ChunkMetadata {
	id: string
	filePath: string
	startLine: number
	endLine: number
	language: string
	symbolName?: string
	symbolKind?: string
}


// --- SearchResult ---

export interface SearchResult {
	metadata: ChunkMetadata
	score: number        // cosine similarity [0, 1]
	content: string      // code block text (read from local file)
}


// --- MerkleTree ---

export interface MerkleNode {
	hash: string          // SHA-256 hash
	filePath?: string     // leaf nodes have this, internal nodes don't
	children?: MerkleNode[]
}

export interface MerkleDiff {
	added: string[]
	modified: string[]
	deleted: string[]
}


// --- CodeIndexService state ---

export type CodeIndexState = 'idle' | 'indexing' | 'ready' | 'error'
