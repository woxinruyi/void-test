/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { URI } from '../../../../base/common/uri.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { Plan, TodoItem, TodoStatus, TodoPriority, PlanningServiceState } from '../common/planningServiceTypes.js';


export interface IPlanningService {
	readonly _serviceBrand: undefined

	readonly state: PlanningServiceState
	readonly currentPlan: Plan | null

	onDidChangePlan: Event<Plan | null>

	// Plan lifecycle
	createPlan(title: string, description?: string, threadId?: string): Plan
	getPlan(): Plan | null
	clearPlan(): void

	// Todo CRUD
	addTodo(content: string, priority?: TodoPriority, parentId?: string): TodoItem
	updateTodo(todoId: string, updates: Partial<Pick<TodoItem, 'content' | 'status' | 'priority'>>): TodoItem | null
	removeTodo(todoId: string): boolean
	getTodo(todoId: string): TodoItem | null

	// Bulk operations
	setTodos(todos: Array<{ content: string, status?: TodoStatus, priority?: TodoPriority, id?: string }>): Plan | null
	markAllCompleted(): void

	// Persistence
	savePlan(): Promise<void>
	loadPlan(): Promise<Plan | null>
}

export const IPlanningService = createDecorator<IPlanningService>('planningService');


class PlanningService extends Disposable implements IPlanningService {
	_serviceBrand: undefined;

	private _state: PlanningServiceState = 'idle';
	private _currentPlan: Plan | null = null;

	private readonly _onDidChangePlan = this._register(new Emitter<Plan | null>());
	readonly onDidChangePlan: Event<Plan | null> = this._onDidChangePlan.event;

	get state(): PlanningServiceState { return this._state }
	get currentPlan(): Plan | null { return this._currentPlan }

	constructor(
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IFileService private readonly _fileService: IFileService,
	) {
		super()

		// Auto-load plan from workspace on startup
		this._autoLoad()
	}

	private _autoLoad(): void {
		this.loadPlan().catch(e => {
			console.error('PlanningService: auto-load failed', e)
		})
	}

	// --- Plan lifecycle ---

	createPlan(title: string, description?: string, threadId?: string): Plan {
		const now = Date.now()
		this._currentPlan = {
			id: generateUuid(),
			title,
			description,
			todos: [],
			threadId,
			createdAt: now,
			updatedAt: now,
		}
		this._state = 'active'
		this._firePlanChanged()
		return this._currentPlan
	}

	getPlan(): Plan | null {
		return this._currentPlan
	}

	clearPlan(): void {
		this._currentPlan = null
		this._state = 'idle'
		this._firePlanChanged()
		this._deletePlanFile().catch(() => { /* ignore */ })
	}

	// --- Todo CRUD ---

	addTodo(content: string, priority: TodoPriority = 'medium', parentId?: string): TodoItem {
		if (!this._currentPlan) {
			this.createPlan('Auto Plan')
		}

		const now = Date.now()
		const todo: TodoItem = {
			id: generateUuid(),
			content,
			status: 'pending',
			priority,
			parentId,
			createdAt: now,
			updatedAt: now,
		}

		this._currentPlan!.todos.push(todo)
		this._currentPlan!.updatedAt = now
		this._firePlanChanged()
		return todo
	}

	updateTodo(todoId: string, updates: Partial<Pick<TodoItem, 'content' | 'status' | 'priority'>>): TodoItem | null {
		if (!this._currentPlan) return null

		const todo = this._currentPlan.todos.find(t => t.id === todoId)
		if (!todo) return null

		const now = Date.now()
		if (updates.content !== undefined) todo.content = updates.content
		if (updates.status !== undefined) todo.status = updates.status
		if (updates.priority !== undefined) todo.priority = updates.priority
		todo.updatedAt = now
		this._currentPlan.updatedAt = now
		this._firePlanChanged()
		return todo
	}

	removeTodo(todoId: string): boolean {
		if (!this._currentPlan) return false

		const idx = this._currentPlan.todos.findIndex(t => t.id === todoId)
		if (idx === -1) return false

		this._currentPlan.todos.splice(idx, 1)
		// Also remove children
		this._currentPlan.todos = this._currentPlan.todos.filter(t => t.parentId !== todoId)
		this._currentPlan.updatedAt = Date.now()
		this._firePlanChanged()
		return true
	}

	getTodo(todoId: string): TodoItem | null {
		return this._currentPlan?.todos.find(t => t.id === todoId) ?? null
	}

	// --- Bulk operations ---

	setTodos(todos: Array<{ content: string, status?: TodoStatus, priority?: TodoPriority, id?: string }>): Plan | null {
		if (!this._currentPlan) {
			this.createPlan('Auto Plan')
		}

		const now = Date.now()
		this._currentPlan!.todos = todos.map(t => ({
			id: t.id ?? generateUuid(),
			content: t.content,
			status: t.status ?? 'pending',
			priority: t.priority ?? 'medium',
			createdAt: now,
			updatedAt: now,
		}))
		this._currentPlan!.updatedAt = now
		this._firePlanChanged()
		return this._currentPlan
	}

	markAllCompleted(): void {
		if (!this._currentPlan) return

		const now = Date.now()
		for (const todo of this._currentPlan.todos) {
			todo.status = 'completed'
			todo.updatedAt = now
		}
		this._currentPlan.updatedAt = now
		this._firePlanChanged()
	}

	// --- Persistence ---

	async savePlan(): Promise<void> {
		if (!this._currentPlan) return

		const planPath = this._getPlanFilePath()
		if (!planPath) return

		try {
			const parentDir = URI.joinPath(planPath, '..')
			await this._fileService.createFolder(parentDir)
			const data = JSON.stringify(this._currentPlan, null, 2)
			await this._fileService.writeFile(planPath, VSBuffer.fromString(data))
		} catch (e) {
			console.error('PlanningService: save failed', e)
		}
	}

	async loadPlan(): Promise<Plan | null> {
		const planPath = this._getPlanFilePath()
		if (!planPath) return null

		try {
			const content = await this._fileService.readFile(planPath)
			const plan = JSON.parse(content.value.toString()) as Plan
			this._currentPlan = plan
			this._state = 'active'
			this._firePlanChanged()
			return plan
		} catch {
			// No saved plan or parse error
			return null
		}
	}

	// --- Helpers ---

	private _firePlanChanged(): void {
		this._onDidChangePlan.fire(this._currentPlan)
		// Auto-save on every change
		this.savePlan().catch(() => { /* ignore */ })
	}

	private _getPlanFilePath(): URI | null {
		const workspace = this._workspaceContextService.getWorkspace()
		const root = workspace.folders[0]?.uri
		if (!root) return null
		return URI.joinPath(root, '.void', 'plan.json')
	}

	private async _deletePlanFile(): Promise<void> {
		const planPath = this._getPlanFilePath()
		if (!planPath) return
		try {
			await this._fileService.del(planPath)
		} catch {
			// File doesn't exist, ignore
		}
	}

	override dispose(): void {
		super.dispose()
	}
}

registerSingleton(IPlanningService, PlanningService, InstantiationType.Delayed);
