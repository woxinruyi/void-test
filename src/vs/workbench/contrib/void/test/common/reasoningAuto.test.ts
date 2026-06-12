/*--------------------------------------------------------------------------------------
 *  推理预算自适应单元测试
 *  覆盖：detectKeywordTier / heuristicsTier / resolveEffectiveTier
 *--------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import {
	detectKeywordTier,
	heuristicsTier,
	resolveEffectiveTier,
	ReasoningAutoSettings,
} from '../../common/helpers/reasoningAuto.js';

suite('Void - reasoningAuto helpers', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('detectKeywordTier', () => {
		test('空 prompt → null', () => {
			assert.strictEqual(detectKeywordTier(''), null);
		});

		test('无关键词 → null', () => {
			assert.strictEqual(detectKeywordTier('hello world, please fix a typo'), null);
		});

		test('ultrathink → max', () => {
			const r = detectKeywordTier('please ultrathink this');
			assert.strictEqual(r?.tier, 'max');
			assert.strictEqual(r?.keyword, 'ultrathink');
		});

		test('think hard → max', () => {
			const r = detectKeywordTier('please think hard about the architecture');
			assert.strictEqual(r?.tier, 'max');
		});

		test('深入思考 → max', () => {
			const r = detectKeywordTier('请深入思考这个问题');
			assert.strictEqual(r?.tier, 'max');
		});

		test('think 整词 → high', () => {
			const r = detectKeywordTier('think about this before answering');
			assert.strictEqual(r?.tier, 'high');
			assert.strictEqual(r?.keyword, 'think');
		});

		test('"thinking" 不应误命中（\\b think \\b 整词）', () => {
			// 'thinking' 含 'think' 子串但 \b 边界匹配："thinking" 词尾不满足
			const r = detectKeywordTier('I was thinking about it');
			assert.strictEqual(r, null);
		});

		test('think hard 优先于 think（max > high）', () => {
			const r = detectKeywordTier('think hard please, really think');
			assert.strictEqual(r?.tier, 'max');
		});

		test('大小写不敏感', () => {
			const r = detectKeywordTier('ULTRATHINK this!');
			assert.strictEqual(r?.tier, 'max');
		});
	});

	suite('heuristicsTier', () => {
		const ctxZero = { toolChainDepth: 0, retryCount: 0 };

		test('短 prompt 无命中 → null', () => {
			assert.strictEqual(heuristicsTier('fix typo', ctxZero), null);
		});

		test('500+ 英文词 → high (prompt-length)', () => {
			const prompt = 'word '.repeat(500);
			const r = heuristicsTier(prompt, ctxZero);
			assert.strictEqual(r?.tier, 'high');
			assert.ok(r?.reasons.includes('prompt-length'));
		});

		test('复杂度关键词 "refactor" → high', () => {
			const r = heuristicsTier('please refactor this', ctxZero);
			assert.strictEqual(r?.tier, 'high');
			assert.ok(r?.reasons.includes('complex-keyword'));
		});

		test('复杂度关键词 "重构" → high', () => {
			const r = heuristicsTier('请重构这个模块', ctxZero);
			assert.strictEqual(r?.tier, 'high');
		});

		test('工具链深度 ≥ 8 → high (deep-tool-chain)', () => {
			const r = heuristicsTier('short', { toolChainDepth: 8, retryCount: 0 });
			assert.strictEqual(r?.tier, 'high');
		});

		test('重试 ≥ 2 → high (retry)', () => {
			const r = heuristicsTier('short', { toolChainDepth: 0, retryCount: 2 });
			assert.strictEqual(r?.tier, 'high');
		});

		test('两条同时命中 → max', () => {
			const r = heuristicsTier('refactor this module', { toolChainDepth: 8, retryCount: 0 });
			assert.strictEqual(r?.tier, 'max');
			assert.strictEqual(r?.reasons.length, 2);
		});

		test('三条同时命中 → max', () => {
			const r = heuristicsTier('refactor', { toolChainDepth: 8, retryCount: 2 });
			assert.strictEqual(r?.tier, 'max');
			assert.ok(r!.reasons.length >= 2);
		});
	});

	suite('resolveEffectiveTier', () => {
		const baseCtx = { toolChainDepth: 0, retryCount: 0 };
		const autoOn: ReasoningAutoSettings = {
			reasoningAutoEnabled: true,
			reasoningKeywordTriggersEnabled: true,
			reasoningHeuristicsEnabled: true,
			reasoningDefaultTier: 'default',
			reasoningThreadInherit: true,
		};

		test('手动 reasoningBudget 设定 → manual source', () => {
			const r = resolveEffectiveTier({
				lastUserPrompt: 'think hard!',
				manualOptions: { reasoningBudget: 8192 },
				autoSettings: autoOn,
				ctx: baseCtx,
			});
			assert.strictEqual(r.source.kind, 'manual');
		});

		test('总开关关闭 → 仅用默认档', () => {
			const r = resolveEffectiveTier({
				lastUserPrompt: 'ultrathink',
				manualOptions: undefined,
				autoSettings: { ...autoOn, reasoningAutoEnabled: false, reasoningDefaultTier: 'high' },
				ctx: baseCtx,
			});
			assert.strictEqual(r.source.kind, 'defaultTier');
			assert.strictEqual(r.tier, 'high');
		});

		test('关键词触发 → keyword source, max', () => {
			const r = resolveEffectiveTier({
				lastUserPrompt: 'please ultrathink this',
				manualOptions: undefined,
				autoSettings: autoOn,
				ctx: baseCtx,
			});
			assert.strictEqual(r.source.kind, 'keyword');
			assert.strictEqual(r.tier, 'max');
		});

		test('关键词开关关闭 → 走启发式', () => {
			const r = resolveEffectiveTier({
				lastUserPrompt: 'please refactor the architecture',
				manualOptions: undefined,
				autoSettings: { ...autoOn, reasoningKeywordTriggersEnabled: false },
				ctx: baseCtx,
			});
			assert.strictEqual(r.source.kind, 'heuristic');
		});

		test('启发式命中 → heuristic source', () => {
			const r = resolveEffectiveTier({
				lastUserPrompt: 'please refactor this module',
				manualOptions: undefined,
				autoSettings: autoOn,
				ctx: baseCtx,
			});
			assert.strictEqual(r.source.kind, 'heuristic');
			assert.strictEqual(r.tier, 'high');
		});

		test('启发式关闭 → 走 thread 继承', () => {
			const r = resolveEffectiveTier({
				lastUserPrompt: 'refactor',
				manualOptions: undefined,
				autoSettings: { ...autoOn, reasoningKeywordTriggersEnabled: false, reasoningHeuristicsEnabled: false },
				ctx: { ...baseCtx, previousThreadTier: 'high' },
			});
			assert.strictEqual(r.source.kind, 'threadInherit');
			assert.strictEqual(r.tier, 'high');
		});

		test('thread 继承关闭 → 默认档', () => {
			const r = resolveEffectiveTier({
				lastUserPrompt: 'short',
				manualOptions: undefined,
				autoSettings: { ...autoOn, reasoningThreadInherit: false, reasoningDefaultTier: 'default' },
				ctx: { ...baseCtx, previousThreadTier: 'max' },
			});
			assert.strictEqual(r.source.kind, 'defaultTier');
		});

		test('全部未命中 → 默认档', () => {
			const r = resolveEffectiveTier({
				lastUserPrompt: 'small typo fix',
				manualOptions: undefined,
				autoSettings: autoOn,
				ctx: baseCtx,
			});
			assert.strictEqual(r.source.kind, 'defaultTier');
			assert.strictEqual(r.tier, 'default');
		});

		test('优先级：关键词 > 启发式（"think hard" + refactor，结果为 max 关键词）', () => {
			const r = resolveEffectiveTier({
				lastUserPrompt: 'think hard, please refactor this',
				manualOptions: undefined,
				autoSettings: autoOn,
				ctx: baseCtx,
			});
			assert.strictEqual(r.source.kind, 'keyword');
			assert.strictEqual(r.tier, 'max');
		});
	});
});
