/*--------------------------------------------------------------------------------------
 *  上下文预算计算（纯函数，无依赖，可在 node 下单元测试）
 *
 *  对应 change: add-context-budget-tool
 *  对标 Codex 的 get_context_remaining：让模型可查询"已用/总/剩余"上下文预算，
 *  自我节制（提前收尾 / 主动压缩），减少上下文溢出。
 *  used tokens 由 ContextCompactionService.estimateTokens 提供，contextWindow 由模型矩阵提供。
 *--------------------------------------------------------------------------------------*/

export interface ContextBudget {
	usedTokens: number;
	contextWindow: number;
	remainingTokens: number;
	usedPercent: number; // 0..100，四舍五入
}

export const computeContextBudget = (usedTokens: number, contextWindow: number): ContextBudget => {
	const total = Math.max(0, Math.floor(contextWindow) || 0);
	const used = Math.max(0, Math.floor(usedTokens) || 0);
	const remaining = Math.max(0, total - used);
	const usedPercent = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
	return { usedTokens: used, contextWindow: total, remainingTokens: remaining, usedPercent };
};

export const formatContextBudget = (b: ContextBudget): string => {
	const k = (n: number) => `${Math.round(n / 1000)}K`;
	return `Context: ${k(b.usedTokens)} / ${k(b.contextWindow)} tokens used (${b.usedPercent}%), ${k(b.remainingTokens)} remaining.`;
};
