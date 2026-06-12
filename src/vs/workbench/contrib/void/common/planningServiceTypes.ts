/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// --- TodoItem ---

export type TodoStatus = 'pending' | 'in_progress' | 'completed'
export type TodoPriority = 'high' | 'medium' | 'low'

export interface TodoItem {
	id: string
	content: string
	status: TodoStatus
	priority: TodoPriority
	parentId?: string       // for nested sub-tasks
	createdAt: number       // timestamp ms
	updatedAt: number       // timestamp ms
}


// --- Plan ---

export interface Plan {
	id: string
	title: string
	description?: string
	todos: TodoItem[]
	threadId?: string       // associated chat thread ID
	createdAt: number
	updatedAt: number
}


// --- PlanningService state ---

export type PlanningServiceState = 'idle' | 'active'


// --- Tool result types ---

export interface PlanningToolResult {
	plan: Plan
	action: 'created' | 'updated' | 'completed'
	summary: string
}
