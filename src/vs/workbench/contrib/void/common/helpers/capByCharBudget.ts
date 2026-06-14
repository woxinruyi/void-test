/*--------------------------------------------------------------------------------------
 *  按字符预算保留列表尾部（最近）项（纯函数，可单元测试）
 *
 *  对应 change: cap-memory-injection
 *  动机：记忆等上下文按"全量注入"会随累积无界膨胀，污染每次请求/抬高成本。
 *       对标 Claude Code（MEMORY.md 自动加载首 200 行 / 25KB 上限），给注入加预算上限，
 *       保留最近的（数组尾部）项，丢弃最早的。
 *--------------------------------------------------------------------------------------*/

/**
 * 在 maxChars 预算内保留 lines 的尾部（最近）项。
 * 总长（含换行）不超预算时全保留；超出则从尾部向前累积，丢弃最早的。
 * 至少保留 1 项（即使其自身超预算）。
 */
export const capByCharBudget = (lines: string[], maxChars: number): { kept: string[]; droppedCount: number } => {
	if (lines.length === 0) return { kept: [], droppedCount: 0 };
	const total = lines.join('\n').length;
	if (total <= maxChars) return { kept: lines, droppedCount: 0 };

	const kept: string[] = [];
	let used = 0;
	for (let i = lines.length - 1; i >= 0; i--) {
		const add = lines[i].length + 1; // +1 ≈ 换行
		if (used + add > maxChars && kept.length > 0) break;
		kept.unshift(lines[i]);
		used += add;
	}
	return { kept, droppedCount: lines.length - kept.length };
};
