/*--------------------------------------------------------------------------------------
 *  Context Compaction Service
 *  Summarizes older conversation messages when context window fills up,
 *  preserving recent messages intact. Similar to Claude Code's compact service.
 *--------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ChatMessage } from '../common/chatThreadServiceTypes.js';
import type { CompactionResult, CompactionConfig } from '../common/contextCompactionTypes.js';
import { DEFAULT_COMPACTION_CONFIG } from '../common/contextCompactionTypes.js';
import { ILLMMessageService } from '../common/sendLLMMessageService.js';
import { IVoidSettingsService } from '../common/voidSettingsService.js';
import { getModelCapabilities } from '../common/modelCapabilities.js';

export interface IContextCompactionService {
	readonly _serviceBrand: undefined;
	shouldCompact(messages: ChatMessage[], contextWindowTokens: number): boolean;
	compact(messages: ChatMessage[], contextWindowTokens: number): Promise<CompactionResult>;
	estimateTokens(messages: ChatMessage[]): number;
}

export const IContextCompactionService = createDecorator<IContextCompactionService>('contextCompactionService');

const CHARS_PER_TOKEN = 4;

const COMPACTION_SYSTEM_MESSAGE = `You are a conversation summarizer. Your task is to create a concise but comprehensive summary of the conversation history provided.

Rules:
- Preserve ALL important technical details: file paths, function names, variable names, error messages, code snippets
- Preserve the user's goals and current task context
- Preserve any decisions made and their rationale
- Preserve the current state of any ongoing work (what's done, what's pending)
- Use bullet points for clarity
- Keep the summary as short as possible while retaining all actionable information
- Do NOT add any commentary or meta-text, just output the summary directly
- Write the summary in the same language as the conversation`;

class ContextCompactionService extends Disposable implements IContextCompactionService {
	_serviceBrand: undefined;

	private readonly _config: CompactionConfig = DEFAULT_COMPACTION_CONFIG;

	constructor(
		@ILLMMessageService private readonly _llmMessageService: ILLMMessageService,
		@IVoidSettingsService private readonly _settingsService: IVoidSettingsService,
	) {
		super();
	}

	estimateTokens(messages: ChatMessage[]): number {
		let totalChars = 0;
		for (const m of messages) {
			if (m.role === 'checkpoint') continue;
			if (m.role === 'interrupted_streaming_tool') continue;
			if (m.role === 'user') {
				totalChars += m.content.length;
			} else if (m.role === 'assistant') {
				totalChars += m.displayContent.length + (m.reasoning?.length ?? 0);
			} else if (m.role === 'tool') {
				totalChars += m.content.length;
			}
		}
		return Math.ceil(totalChars / CHARS_PER_TOKEN);
	}

	shouldCompact(messages: ChatMessage[], contextWindowTokens: number): boolean {
		const contentMessages = messages.filter(m => m.role !== 'checkpoint' && m.role !== 'interrupted_streaming_tool');
		if (contentMessages.length < this._config.minMessagesForCompaction) return false;

		const estimatedTokens = this.estimateTokens(messages);
		const threshold = contextWindowTokens * this._config.triggerThreshold;
		return estimatedTokens > threshold;
	}

	async compact(messages: ChatMessage[], contextWindowTokens: number): Promise<CompactionResult> {
		const contentMessages = messages.filter(m => m.role !== 'checkpoint' && m.role !== 'interrupted_streaming_tool');

		// Split into old (to summarize) and recent (to keep)
		const keepCount = Math.min(this._config.keepRecentCount, Math.floor(contentMessages.length / 2));
		const splitIdx = contentMessages.length - keepCount;

		const oldMessages = contentMessages.slice(0, splitIdx);
		const recentMessages = contentMessages.slice(splitIdx);

		if (oldMessages.length < 4) {
			// Not enough old messages to summarize
			return { compactedMessages: messages, summarizedCount: 0, tokensSaved: 0 };
		}

		// Build summary prompt from old messages
		const conversationText = this._messagesToText(oldMessages);
		const oldTokens = this.estimateTokens(oldMessages);

		try {
			const summary = await this._generateSummary(conversationText);

			// Create a summary user message that replaces all old messages
			const summaryMessage: ChatMessage = {
				role: 'user',
				content: `<conversation_summary>\nThe following is a summary of the earlier conversation:\n\n${summary}\n</conversation_summary>`,
				displayContent: `📋 Conversation compacted (${oldMessages.length} messages summarized)`,
				selections: null,
				state: { stagingSelections: [], isBeingEdited: false },
			};

			// Also keep checkpoint entries from recent messages
			const recentWithCheckpoints = messages.filter(m => {
				if (m.role === 'checkpoint') {
					// Keep checkpoint if it's among the recent messages
					const idx = messages.indexOf(m);
					const firstRecentIdx = messages.indexOf(recentMessages[0]);
					return idx >= firstRecentIdx;
				}
				return recentMessages.includes(m as any);
			});

			const compactedMessages: ChatMessage[] = [summaryMessage, ...recentWithCheckpoints];

			return {
				compactedMessages,
				summarizedCount: oldMessages.length,
				tokensSaved: Math.max(0, oldTokens - this.estimateTokens([summaryMessage])),
			};
		} catch (error) {
			console.warn('[ContextCompaction] Failed to generate summary, skipping compaction:', error);
			return { compactedMessages: messages, summarizedCount: 0, tokensSaved: 0 };
		}
	}

	private _messagesToText(messages: ChatMessage[]): string {
		const parts: string[] = [];
		for (const m of messages) {
			if (m.role === 'checkpoint' || m.role === 'interrupted_streaming_tool') continue;
			if (m.role === 'user') {
				parts.push(`[User]: ${m.content}`);
			} else if (m.role === 'assistant') {
				parts.push(`[Assistant]: ${m.displayContent}`);
			} else if (m.role === 'tool') {
				const truncatedContent = m.content.length > 2000
					? m.content.substring(0, 2000) + '...(truncated)'
					: m.content;
				parts.push(`[Tool ${m.name}]: ${truncatedContent}`);
			}
		}
		return parts.join('\n\n');
	}

	private _generateSummary(conversationText: string): Promise<string> {
		return new Promise((resolve, reject) => {
			const modelSelection = this._settingsService.state.modelSelectionOfFeature['Chat'] ?? null;
			if (!modelSelection) {
				reject(new Error('No model selection available'));
				return;
			}

			const overridesOfModel = this._settingsService.state.overridesOfModel;
			const modelSelectionOptions = this._settingsService.state.optionsOfModelSelection['Chat'][modelSelection.providerName]?.[modelSelection.modelName];

			// Truncate conversation text if it's too long for the summary call
			const { contextWindow } = getModelCapabilities(modelSelection.providerName, modelSelection.modelName, overridesOfModel);
			const maxInputChars = Math.floor(contextWindow * CHARS_PER_TOKEN * 0.5);
			const truncatedConversation = conversationText.length > maxInputChars
				? conversationText.substring(conversationText.length - maxInputChars)
				: conversationText;

			const requestId = this._llmMessageService.sendLLMMessage({
				messagesType: 'chatMessages',
				chatMode: null,
				messages: [
					{ role: 'system', content: COMPACTION_SYSTEM_MESSAGE },
					{ role: 'user', content: `Please summarize the following conversation:\n\n${truncatedConversation}` },
				],
				modelSelection,
				modelSelectionOptions,
				overridesOfModel,
				separateSystemMessage: undefined,
				logging: { loggingName: 'Context Compaction' },
				onText: () => { },
				onFinalMessage: ({ fullText }) => {
					resolve(fullText.trim());
				},
				onError: (error) => {
					reject(error);
				},
				onAbort: () => {
					reject(new Error('Summary generation aborted'));
				},
			});

			if (!requestId) {
				reject(new Error('Failed to send summary request'));
			}
		});
	}
}

registerSingleton(IContextCompactionService, ContextCompactionService, InstantiationType.Delayed);
