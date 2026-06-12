/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// --- Memory item ---

export interface MemoryItem {
	id: string
	content: string
	tags: string[]
	createdAt: number       // timestamp ms
}


// --- Memory tool results ---

export interface SaveMemoryResult {
	memory: MemoryItem
	action: 'created' | 'updated'
	totalMemories: number
}

export interface DeleteMemoryResult {
	deleted: boolean
	id: string
	totalMemories: number
}
