/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../nls.js'
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js'
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js'
import { ThemeIcon } from '../../../../base/common/themables.js'
import { ISCMService } from '../../scm/common/scm.js'
import { IVoidSCMService } from '../common/voidSCMTypes.js'
import { IVoidSettingsService } from '../common/voidSettingsService.js'
import { IConvertToLLMMessageService } from './convertToLLMMessageService.js'
import { ILLMMessageService } from '../common/sendLLMMessageService.js'
import { LLMChatMessage } from '../common/sendLLMMessageTypes.js'
import { codeReview_systemMessage, codeReview_userMessage, ReviewFinding } from '../common/prompt/reviewPrompts.js'
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js'
import { createDecorator, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js'
import { Disposable } from '../../../../base/common/lifecycle.js'
import { INotificationService } from '../../../../platform/notification/common/notification.js'
import { IEditorService } from '../../../services/editor/common/editorService.js'
import { CancellationError, isCancellationError } from '../../../../base/common/errors.js'
import { IMarkerService, MarkerSeverity, IResourceMarker } from '../../../../platform/markers/common/markers.js'
import { URI } from '../../../../base/common/uri.js'

const REVIEW_MARKER_OWNER = 'void-code-review'

export interface IReviewService {
	readonly _serviceBrand: undefined
	reviewChanges(compareRef?: string): Promise<void>
	abort(): void
}

export const IReviewService = createDecorator<IReviewService>('voidReviewService')

class ReviewService extends Disposable implements IReviewService {
	readonly _serviceBrand: undefined
	private llmRequestId: string | null = null

	constructor(
		@ISCMService private readonly scmService: ISCMService,
		@IVoidSCMService private readonly voidSCMService: IVoidSCMService,
		@IConvertToLLMMessageService private readonly convertToLLMMessageService: IConvertToLLMMessageService,
		@ILLMMessageService private readonly llmMessageService: ILLMMessageService,
		@IVoidSettingsService private readonly voidSettingsService: IVoidSettingsService,
		@INotificationService private readonly notificationService: INotificationService,
		@IEditorService private readonly editorService: IEditorService,
		@IMarkerService private readonly markerService: IMarkerService,
	) {
		super()
	}

	private gitRepoPath(): string {
		const repo = Array.from(this.scmService.repositories || []).find((r: any) => r.provider.contextValue === 'git')
		if (!repo) { throw new Error('No git repository found') }
		if (!repo.provider.rootUri?.fsPath) { throw new Error('No git repository root path found') }
		return repo.provider.rootUri.fsPath
	}

	async reviewChanges(compareRef: string = 'HEAD'): Promise<void> {
		let path: string
		try {
			path = this.gitRepoPath()
		} catch {
			this.notificationService.info(localize2('voidReviewNoRepo', '未找到 git 仓库，无法审查。').value)
			return
		}

		const diff = await this.voidSCMService.gitDiff(path, compareRef)
		if (!diff.trim()) {
			this.notificationService.info(localize2('voidReviewNoChanges', '没有未提交的改动可审查。').value)
			return
		}

		const modelSelection = this.voidSettingsService.state.modelSelectionOfFeature['Review'] ?? null
		const modelSelectionOptions = modelSelection ? this.voidSettingsService.state.optionsOfModelSelection['Review'][modelSelection.providerName]?.[modelSelection.modelName] : undefined
		const overridesOfModel = this.voidSettingsService.state.overridesOfModel

		const { messages, separateSystemMessage } = this.convertToLLMMessageService.prepareLLMSimpleMessages({
			simpleMessages: [{ role: 'user', content: codeReview_userMessage(diff) } as const],
			systemMessage: codeReview_systemMessage,
			modelSelection,
			featureName: 'Review',
		})

		let fullText: string
		try {
			fullText = await this.sendLLMMessage(messages, separateSystemMessage!, modelSelection, modelSelectionOptions, overridesOfModel)
		} catch (error) {
			if (!isCancellationError(error)) {
				this.notificationService.error(localize2('voidReviewFailed', '代码审查失败。').value)
			}
			return
		}

		const findings = this.parseFindings(fullText)
		await this.renderFindings(findings, path)
	}

	abort() {
		if (this.llmRequestId) { this.llmMessageService.abort(this.llmRequestId) }
		this.llmRequestId = null
	}

	private parseFindings(fullText: string): ReviewFinding[] {
		// strip ```json fences if the model added them despite instructions
		const cleaned = fullText.replace(/^[\s\S]*?\{/, '{').replace(/\}[\s\S]*$/, '}')
		try {
			const obj = JSON.parse(cleaned)
			return Array.isArray(obj?.findings) ? obj.findings : []
		} catch {
			return []
		}
	}

	private severityToMarker(s: string): MarkerSeverity {
		return s === 'bug' ? MarkerSeverity.Error : s === 'risk' ? MarkerSeverity.Warning : MarkerSeverity.Info
	}

	private async renderFindings(findings: ReviewFinding[], repoPath: string): Promise<void> {
		// always reset this owner's markers (clears stale results on re-run / no findings)
		const resourceMarkers: IResourceMarker[] = findings.map(f => {
			const resource = URI.joinPath(URI.file(repoPath), ...String(f.file).split(/[\\/]/).filter(Boolean))
			const line = Math.max(1, Number(f.line) || 1)
			return {
				resource,
				marker: {
					severity: this.severityToMarker(f.severity),
					message: `${f.title}\n${f.detail}${f.suggestion ? `\n建议：${f.suggestion}` : ''}`,
					source: 'YWCode Review',
					startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: 1,
				},
			}
		})
		this.markerService.changeAll(REVIEW_MARKER_OWNER, resourceMarkers)

		if (findings.length === 0) {
			this.notificationService.info(localize2('voidReviewClean', '代码审查完成：未发现问题。').value)
			return
		}

		const order = { bug: 0, risk: 1, nit: 2 } as const
		const sorted = [...findings].sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9))
		const icon = (s: string) => s === 'bug' ? '🛑' : s === 'risk' ? '⚠️' : '💡'
		const lines: string[] = [`# 代码审查结果（${findings.length} 项）`, '', '> 问题已同时发布到「问题」面板，可点击跳转到对应文件行。', '']
		for (const f of sorted) {
			lines.push(`## ${icon(f.severity)} ${f.severity.toUpperCase()} · ${f.file}:${f.line}`)
			lines.push(`**${f.title}**`, '', f.detail)
			if (f.suggestion) lines.push('', `**建议**：${f.suggestion}`)
			lines.push('')
		}
		const md = lines.join('\n')

		this.notificationService.info(localize2('voidReviewDone', '代码审查完成：发现 {0} 项（见「问题」面板）。', findings.length).value)
		await this.editorService.openEditor({ resource: undefined, contents: md, languageId: 'markdown', options: { pinned: true } })
	}

	private sendLLMMessage(messages: LLMChatMessage[], separateSystemMessage: string, modelSelection: any, modelSelectionOptions: any, overridesOfModel: any): Promise<string> {
		return new Promise((resolve, reject) => {
			this.llmRequestId = this.llmMessageService.sendLLMMessage({
				messagesType: 'chatMessages',
				messages,
				separateSystemMessage,
				chatMode: null,
				modelSelection,
				modelSelectionOptions,
				overridesOfModel,
				onText: () => { },
				onFinalMessage: (params: { fullText: string }) => { resolve(params.fullText) },
				onError: (error) => { reject(error) },
				onAbort: () => { reject(new CancellationError()) },
				logging: { loggingName: 'Void - Code Review' },
			})
		})
	}
}

class ReviewChangesAction extends Action2 {
	constructor() {
		super({
			id: 'void.reviewChanges',
			title: localize2('voidReviewChanges', 'YWCode: 审查未提交改动'),
			icon: ThemeIcon.fromId('git-pull-request-go-to-changes'),
			f1: true,
			menu: [{
				id: MenuId.SCMTitle,
				when: ContextKeyExpr.equals('scmProvider', 'git'),
				group: 'navigation',
			}]
		})
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		await accessor.get(IReviewService).reviewChanges()
	}
}

registerAction2(ReviewChangesAction)
registerSingleton(IReviewService, ReviewService, InstantiationType.Delayed)
