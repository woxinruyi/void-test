/*--------------------------------------------------------------------------------------
 *  推理预算自适应 —— 纯函数层
 *
 *  职责：根据 prompt 关键词、启发式、thread 继承、默认档等多源信号，决策每轮 LLM
 *  调用的 ReasoningTier（'off' | 'default' | 'high' | 'max'），并映射到具体模型的
 *  SendableReasoningInfo（budget_slider 或 effort_slider）。
 *
 *  设计参考：
 *  - Claude Code：prompt 关键词 `think` / `think hard` / `ultrathink` 自动升档
 *  - Windsurf：根据任务复杂度自动调节（隐式）
 *--------------------------------------------------------------------------------------*/

import { ModelSelectionOptions } from '../voidSettingsTypes.js'

export type ReasoningTier = 'off' | 'default' | 'high' | 'max'

export type TierSource =
	| { kind: 'manual' }
	| { kind: 'keyword'; keyword: string }
	| { kind: 'heuristic'; reasons: string[] }
	| { kind: 'threadInherit'; fromTier: ReasoningTier }
	| { kind: 'defaultTier' }
	| { kind: 'modelDefault' }

export type EffectiveTier = { tier: ReasoningTier; source: TierSource }

export type ReasoningAutoSettings = {
	reasoningAutoEnabled?: boolean;
	reasoningKeywordTriggersEnabled?: boolean;
	reasoningHeuristicsEnabled?: boolean;
	reasoningDefaultTier?: ReasoningTier;
	reasoningThreadInherit?: boolean;
}

// ====================== 关键词检测 ======================

/** max 档关键词：触发深度思考。中英双语。 */
const TIER_MAX_KEYWORDS: Array<{ re: RegExp; keyword: string }> = [
	{ re: /\bultrathink\b/i, keyword: 'ultrathink' },
	{ re: /\bthink\s+harder\b/i, keyword: 'think harder' },
	{ re: /\bthink\s+hard\b/i, keyword: 'think hard' },
	{ re: /\bdeep\s+think\b/i, keyword: 'deep think' },
	{ re: /\bthink\s+step\s+by\s+step\b/i, keyword: 'think step by step' },
	{ re: /\u6df1\u5165\u601d\u8003/, keyword: '\u6df1\u5165\u601d\u8003' },
	{ re: /\u4ed4\u7ec6\u601d\u8003/, keyword: '\u4ed4\u7ec6\u601d\u8003' },
	{ re: /\u5f7b\u5e95\u60f3\u6e05\u695a/, keyword: '\u5f7b\u5e95\u60f3\u6e05\u695a' },
	{ re: /\u597d\u597d\u60f3\u4e00\u60f3/, keyword: '\u597d\u597d\u60f3\u4e00\u60f3' },
	{ re: /\u8ba4\u771f\u5206\u6790/, keyword: '\u8ba4\u771f\u5206\u6790' },
]

/** high 档关键词：触发中等强度思考。整词匹配，避免 "thinking" 误命中。 */
const TIER_HIGH_KEYWORDS: Array<{ re: RegExp; keyword: string }> = [
	{ re: /\bthink\b/i, keyword: 'think' },
	{ re: /\u60f3\u4e00\u4e0b/, keyword: '\u60f3\u4e00\u4e0b' },
	{ re: /\u601d\u8003\u4e00\u4e0b/, keyword: '\u601d\u8003\u4e00\u4e0b' },
]

/** 匹配 prompt 中的关键词，优先返回 max 档。 */
export function detectKeywordTier(prompt: string): { tier: ReasoningTier; keyword: string } | null {
	if (!prompt) return null
	for (const { re, keyword } of TIER_MAX_KEYWORDS) {
		if (re.test(prompt)) return { tier: 'max', keyword }
	}
	for (const { re, keyword } of TIER_HIGH_KEYWORDS) {
		if (re.test(prompt)) return { tier: 'high', keyword }
	}
	return null
}

// ====================== 启发式 ======================

/** 复杂度关键词（中英双语），命中视为 complex-keyword reason。 */
const COMPLEXITY_RE = /refactor|\u91cd\u6784|architect|\u67b6\u6784|design|\u8bbe\u8ba1|audit|\u5ba1\u8ba1|analyze|\u5206\u6790|optimize|\u4f18\u5316|restructure|\u68b3\u7406/i

/** 计算 prompt 有效内容长度：英文按空格分词数，中文按字数；取较大值。 */
function countContentLength(prompt: string): number {
	if (!prompt) return 0
	const trimmed = prompt.trim()
	const enTokens = trimmed.split(/\s+/).filter(Boolean).length
	const zhChars = (trimmed.match(/[\u4e00-\u9fff]/g) ?? []).length
	return Math.max(enTokens, zhChars)
}

/**
 * 启发式升档规则（命中 1 条 → high，≥2 条 → max，0 条 → null）：
 *  1. prompt 有效长度 ≥ 500 → prompt-length
 *  2. prompt 含复杂度关键词 → complex-keyword
 *  3. 近 5 轮工具调用深度 ≥ 8 → deep-tool-chain
 *  4. 当前重试次数 ≥ 2 → retry
 */
export function heuristicsTier(
	prompt: string,
	ctx: { toolChainDepth: number; retryCount: number }
): { tier: ReasoningTier; reasons: string[] } | null {
	const reasons: string[] = []
	if (countContentLength(prompt) >= 500) reasons.push('prompt-length')
	if (prompt && COMPLEXITY_RE.test(prompt)) reasons.push('complex-keyword')
	if (ctx.toolChainDepth >= 8) reasons.push('deep-tool-chain')
	if (ctx.retryCount >= 2) reasons.push('retry')

	if (reasons.length === 0) return null
	return { tier: reasons.length >= 2 ? 'max' : 'high', reasons }
}

// ====================== 主决策 ======================

/** 从用户手动 ModelSelectionOptions 反推档位（仅供 UI 显示；不影响 sendable 覆盖）。 */
function inferTierFromOptions(opts: ModelSelectionOptions | undefined): ReasoningTier {
	if (!opts) return 'default'
	if (opts.reasoningEnabled === false) return 'off'
	// 无法精确反推，粗略按"存在即为 default"
	if (opts.reasoningBudget !== undefined || opts.reasoningEffort !== undefined) return 'default'
	return 'default'
}

/**
 * 主决策函数。优先级（由高到低）：
 *  手动 slider > 关键词 > 启发式 > thread 继承 > 默认档 > 模型默认
 */
export function resolveEffectiveTier(args: {
	lastUserPrompt: string;
	manualOptions: ModelSelectionOptions | undefined;
	autoSettings: ReasoningAutoSettings;
	ctx: { toolChainDepth: number; retryCount: number; previousThreadTier?: ReasoningTier };
}): EffectiveTier {
	const { lastUserPrompt, manualOptions, autoSettings, ctx } = args

	// 1. 用户手动值存在 → 直接尊重手动
	if (manualOptions && (manualOptions.reasoningBudget !== undefined || manualOptions.reasoningEffort !== undefined)) {
		return { tier: inferTierFromOptions(manualOptions), source: { kind: 'manual' } }
	}

	// 2. 总开关：关闭时仅使用默认档
	if (autoSettings.reasoningAutoEnabled === false) {
		return { tier: autoSettings.reasoningDefaultTier ?? 'default', source: { kind: 'defaultTier' } }
	}

	// 3. 关键词触发
	if (autoSettings.reasoningKeywordTriggersEnabled !== false) {
		const kw = detectKeywordTier(lastUserPrompt)
		if (kw) return { tier: kw.tier, source: { kind: 'keyword', keyword: kw.keyword } }
	}

	// 4. 启发式升档
	if (autoSettings.reasoningHeuristicsEnabled !== false) {
		const h = heuristicsTier(lastUserPrompt, ctx)
		if (h) return { tier: h.tier, source: { kind: 'heuristic', reasons: h.reasons } }
	}

	// 5. thread 继承
	if (autoSettings.reasoningThreadInherit !== false && ctx.previousThreadTier) {
		return { tier: ctx.previousThreadTier, source: { kind: 'threadInherit', fromTier: ctx.previousThreadTier } }
	}

	// 6. 默认档
	return { tier: autoSettings.reasoningDefaultTier ?? 'default', source: { kind: 'defaultTier' } }
}
