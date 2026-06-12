/*--------------------------------------------------------------------------------------
 *  Context Compaction Types
 *  Defines the interfaces for context window management and conversation summarization.
 *--------------------------------------------------------------------------------------*/

import { ChatMessage } from './chatThreadServiceTypes.js';

export interface CompactionResult {
	/** The compacted messages array (summary + recent messages) */
	compactedMessages: ChatMessage[];
	/** Number of original messages that were summarized */
	summarizedCount: number;
	/** Estimated tokens saved */
	tokensSaved: number;
}

export interface CompactionConfig {
	/** Fraction of context window that triggers compaction (default 0.6) */
	triggerThreshold: number;
	/** Number of recent messages to always keep uncompacted */
	keepRecentCount: number;
	/** Minimum number of messages before compaction is considered */
	minMessagesForCompaction: number;
}

export const DEFAULT_COMPACTION_CONFIG: CompactionConfig = {
	triggerThreshold: 0.6,
	keepRecentCount: 10,
	minMessagesForCompaction: 16,
};

export interface IContextCompactionService {
	readonly _serviceBrand: undefined;

	/**
	 * Check if the conversation should be compacted based on the current context window usage.
	 */
	shouldCompact(messages: ChatMessage[], contextWindowTokens: number): boolean;

	/**
	 * Compact the conversation by summarizing older messages.
	 * Returns a new messages array with older messages replaced by a summary.
	 */
	compact(messages: ChatMessage[], contextWindowTokens: number): Promise<CompactionResult>;

	/**
	 * Estimate the token count of a messages array.
	 */
	estimateTokens(messages: ChatMessage[]): number;
}
