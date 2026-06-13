/*--------------------------------------------------------------------------------------
 *  聚合网关故障回退解析（纯函数，无依赖，可单元测试）
 *
 *  对应 change: add-aggregator-fallback
 *  动机：YWCode 主路径全压 aiyiwei 聚合网关——网关故障(网络/5xx/过载)即全功能不可用，
 *       而 Codex/Aider 等用原生 provider 端点无此单点风险。本模块在网关可重试故障时，
 *       把聚合模型名解析到对应的**原生 provider 端点**（前提：用户已配该原生 key）。
 *  纯部分：聚合模型名 → 原生 provider 的映射 + key 存在性判定。实际"换端点重试"接线为运行时，见提案。
 *--------------------------------------------------------------------------------------*/

export type NativeFallbackProvider = 'anthropic' | 'openAI' | 'gemini';

export interface AggregatorFallback {
	providerName: NativeFallbackProvider;
	modelName: string;
}

/**
 * 给定聚合(aiyiwei)模型名 + 原生 provider key 是否存在，解析回退目标。
 * 无匹配厂商 / 无对应原生 key → null（不回退，沿用原错误处理）。
 */
export const resolveAggregatorFallback = (
	modelName: string,
	hasNativeKey: (provider: NativeFallbackProvider) => boolean,
): AggregatorFallback | null => {
	const lower = modelName.toLowerCase();

	// Anthropic 系
	if (lower.startsWith('claude') && hasNativeKey('anthropic'))
		return { providerName: 'anthropic', modelName };

	// OpenAI 系（gpt-* / o1/o3/o4 推理系列）
	if ((lower.startsWith('gpt') || /^o[134]\b/.test(lower) || lower.startsWith('o1') || lower.startsWith('o3') || lower.startsWith('o4')) && hasNativeKey('openAI'))
		return { providerName: 'openAI', modelName };

	// Google 系
	if (lower.startsWith('gemini') && hasNativeKey('gemini'))
		return { providerName: 'gemini', modelName };

	return null;
};
