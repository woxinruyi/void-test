/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { FileVisitRecord, CursorContext, SelectionContext, IDEActivitySnapshot } from '../common/ideActivityTypes.js';


const MAX_RECENT_FILES = 15
const MAX_RECENT_SELECTIONS = 5
const CURSOR_DEBOUNCE_MS = 500
const SNIPPET_LINES = 5 // ±5 lines around cursor


export interface IIDEActivityService {
	readonly _serviceBrand: undefined

	readonly snapshot: IDEActivitySnapshot

	onDidChangeActivity: Event<IDEActivitySnapshot>

	getActivitySummary(): string
}

export const IIDEActivityService = createDecorator<IIDEActivityService>('ideActivityService');


class IDEActivityService extends Disposable implements IIDEActivityService {
	_serviceBrand: undefined;

	private _cursor: CursorContext | null = null
	private _recentFiles: FileVisitRecord[] = []
	private _recentSelections: SelectionContext[] = []

	private readonly _onDidChangeActivity = this._register(new Emitter<IDEActivitySnapshot>());
	readonly onDidChangeActivity: Event<IDEActivitySnapshot> = this._onDidChangeActivity.event;

	private readonly _cursorDebouncer: RunOnceScheduler

	get snapshot(): IDEActivitySnapshot {
		return {
			cursor: this._cursor,
			recentFiles: [...this._recentFiles],
			recentSelections: [...this._recentSelections],
		}
	}

	constructor(
		@ICodeEditorService private readonly _codeEditorService: ICodeEditorService,
		@IEditorService private readonly _editorService: IEditorService,
	) {
		super()

		this._cursorDebouncer = this._register(new RunOnceScheduler(() => this._updateCursorContext(), CURSOR_DEBOUNCE_MS))

		// Track active editor changes
		this._register(this._editorService.onDidActiveEditorChange(() => {
			this._onActiveEditorChange()
		}))

		// Track cursor/selection changes on any code editor
		this._register(this._codeEditorService.onCodeEditorAdd((editor) => {
			this._register(editor.onDidChangeCursorPosition(() => {
				this._cursorDebouncer.schedule()
			}))
			this._register(editor.onDidChangeCursorSelection(() => {
				this._onSelectionChange()
			}))
		}))

		// Initialize with current state
		this._onActiveEditorChange()
	}

	private _onActiveEditorChange(): void {
		const editor = this._codeEditorService.getActiveCodeEditor()
		if (!editor || !editor.hasModel()) return

		const model = editor.getModel()
		if (!model || model.uri.scheme !== 'file') return

		const filePath = model.uri.fsPath
		const language = model.getLanguageId()
		const position = editor.getPosition()
		const lineNumber = position?.lineNumber ?? 1

		// Record file visit
		const visit: FileVisitRecord = {
			filePath,
			language,
			timestamp: Date.now(),
			lineNumber,
		}

		// Deduplicate: remove previous visit to same file
		this._recentFiles = this._recentFiles.filter(f => f.filePath !== filePath)
		this._recentFiles.unshift(visit)
		this._recentFiles = this._recentFiles.slice(0, MAX_RECENT_FILES)

		// Update cursor context
		this._updateCursorContext()
	}

	private _updateCursorContext(): void {
		const editor = this._codeEditorService.getActiveCodeEditor()
		if (!editor || !editor.hasModel()) {
			this._cursor = null
			this._fireChanged()
			return
		}

		const model = editor.getModel()
		if (!model || model.uri.scheme !== 'file') {
			this._cursor = null
			this._fireChanged()
			return
		}

		const position = editor.getPosition()
		if (!position) {
			this._cursor = null
			this._fireChanged()
			return
		}

		const lineCount = model.getLineCount()
		const startLine = Math.max(1, position.lineNumber - SNIPPET_LINES)
		const endLine = Math.min(lineCount, position.lineNumber + SNIPPET_LINES)

		const lines: string[] = []
		for (let i = startLine; i <= endLine; i++) {
			const prefix = i === position.lineNumber ? '>>>' : '   '
			lines.push(`${prefix} ${i}: ${model.getLineContent(i)}`)
		}

		this._cursor = {
			filePath: model.uri.fsPath,
			lineNumber: position.lineNumber,
			column: position.column,
			language: model.getLanguageId(),
			surroundingSnippet: lines.join('\n'),
		}

		this._fireChanged()
	}

	private _onSelectionChange(): void {
		const editor = this._codeEditorService.getActiveCodeEditor()
		if (!editor || !editor.hasModel()) return

		const model = editor.getModel()
		if (!model || model.uri.scheme !== 'file') return

		const selection = editor.getSelection()
		if (!selection || selection.isEmpty()) return

		const selectedText = model.getValueInRange(selection)
		if (selectedText.length < 10 || selectedText.length > 2000) return

		const selCtx: SelectionContext = {
			filePath: model.uri.fsPath,
			startLine: selection.startLineNumber,
			endLine: selection.endLineNumber,
			selectedText: selectedText.length > 500 ? selectedText.substring(0, 500) + '...' : selectedText,
			language: model.getLanguageId(),
			timestamp: Date.now(),
		}

		// Deduplicate by file+lines
		this._recentSelections = this._recentSelections.filter(
			s => !(s.filePath === selCtx.filePath && s.startLine === selCtx.startLine && s.endLine === selCtx.endLine)
		)
		this._recentSelections.unshift(selCtx)
		this._recentSelections = this._recentSelections.slice(0, MAX_RECENT_SELECTIONS)
	}

	getActivitySummary(): string {
		const parts: string[] = []

		// Current cursor
		if (this._cursor) {
			parts.push(`Current cursor: ${this._cursor.filePath}:${this._cursor.lineNumber} (${this._cursor.language})`)
			if (this._cursor.surroundingSnippet) {
				parts.push(`\`\`\`\n${this._cursor.surroundingSnippet}\n\`\`\``)
			}
		}

		// Recent files
		if (this._recentFiles.length > 0) {
			const fileLines = this._recentFiles.slice(0, 8).map((f, i) => {
				const ago = Math.round((Date.now() - f.timestamp) / 1000)
				return `${i + 1}. ${f.filePath} (${f.language}, ${ago}s ago, line ${f.lineNumber})`
			})
			parts.push(`Recent files:\n${fileLines.join('\n')}`)
		}

		// Recent selections
		if (this._recentSelections.length > 0) {
			const selLines = this._recentSelections.map(s =>
				`- ${s.filePath}:${s.startLine}-${s.endLine} (${s.language}): "${s.selectedText.substring(0, 80)}..."`
			)
			parts.push(`Recent selections:\n${selLines.join('\n')}`)
		}

		return parts.join('\n\n')
	}

	private _fireChanged(): void {
		this._onDidChangeActivity.fire(this.snapshot)
	}
}

registerSingleton(IIDEActivityService, IDEActivityService, InstantiationType.Delayed);
