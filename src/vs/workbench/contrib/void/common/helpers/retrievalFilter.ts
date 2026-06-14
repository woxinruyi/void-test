/*--------------------------------------------------------------------------------------
 *  检索结果相关性过滤（纯函数，可单元测试）
 *
 *  对应 change: rag-relevance-floor
 *  动机：向量检索按 topK 取分最高的，但**不设相关性下限**——当代码库无相关内容时，
 *       仍返回 topK 个"最不相关"的 chunk 当作匹配，污染上下文、误导智能体。
 *       加保守的相关性下限（绝对 + 相对），只裁掉近乎正交的噪声，保留真实弱匹配。
 *--------------------------------------------------------------------------------------*/

/**
 * 保留满足相关性下限的结果（已按 score 降序假设；不依赖顺序，内部自取最高分）。
 * 保留条件：score >= max(minAbsolute, minRelative * topScore)。
 * - minAbsolute：绝对下限，裁掉近正交噪声（保守默认 0.05）。
 * - minRelative：相对下限，裁掉远低于最佳匹配的长尾（保守默认 0.2，即 < 最高分 20% 丢弃）。
 * 空输入或最高分 <= 0 → 返回空（无可信匹配）。
 */
export const filterByScoreFloor = <T extends { score: number }>(
	results: readonly T[],
	minAbsolute = 0.05,
	minRelative = 0.2,
): T[] => {
	if (results.length === 0) return [];
	const top = results.reduce((m, r) => Math.max(m, r.score), -Infinity);
	if (top <= 0) return [];
	const floor = Math.max(minAbsolute, minRelative * top);
	return results.filter(r => r.score >= floor);
};
