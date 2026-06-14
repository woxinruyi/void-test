/*--------------------------------------------------------------------------------------
 *  回滚冲突判定（纯函数，可单元测试）
 *
 *  对应 change: checkpoint-revert-conflict-detection
 *  动机：回滚时若文件在智能体写入后又被外部（用户手动）修改，直接覆写会静默丢失改动。
 *       比较"当前内容 hash" vs "智能体写入后 hash(afterHash)"以检测外部修改。
 *       向后兼容：afterHash 缺失（旧 manifest）→ 不判冲突，行为同今。
 *--------------------------------------------------------------------------------------*/

/**
 * 是否应标记为"外部修改"冲突。
 * - afterHash 为空（旧数据/未捕获）→ false（无信息，按现状直接 restore）。
 * - currentHash === afterHash → false（自智能体写入后未变）。
 * - 否则 → true（文件被外部修改过）。
 */
export const shouldFlagExternalModification = (currentHash: string, afterHash: string | undefined): boolean => {
	if (!afterHash) return false;
	return currentHash !== afterHash;
};
