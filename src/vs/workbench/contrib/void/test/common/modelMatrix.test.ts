/*--------------------------------------------------------------------------------------
 *  模型能力矩阵单元测试（refresh-model-matrix：Anthropic 新旗舰条目）
 *
 *  评定方式：见 test/eval/modelMatrixEval.ts（确定性 harness，可单独跑出报告）。
 *  本文件把同一套断言固化为 mocha 回归，纳入 `npm run test-node`。
 *--------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { getModelCapabilities, getProviderCapabilities } from '../../common/modelCapabilities.js';

suite('Void - model matrix (refresh-model-matrix)', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('Anthropic 新旗舰条目', () => {
		for (const id of ['claude-opus-4-8', 'claude-opus-4-7'] as const) {
			test(`${id}：识别 + 字段正确 + 自适应推理档位`, () => {
				const c = getModelCapabilities('anthropic', id, undefined);
				assert.strictEqual(c.isUnrecognizedModel, false);
				assert.strictEqual(c.contextWindow, 1_000_000);
				assert.strictEqual(c.cost.input, 5.00);
				assert.strictEqual(c.cost.output, 25.00);
				assert.strictEqual(c.specialToolFormat, 'anthropic-style');
				assert.strictEqual(c.supportsSystemMessage, 'separated');
				assert.ok(c.reasoningCapabilities);
				assert.strictEqual(c.reasoningCapabilities && c.reasoningCapabilities.reasoningSlider?.type, 'effort_slider');
			});
		}
	});

	suite('直连 Anthropic 推理负载', () => {
		const inc = getProviderCapabilities('anthropic').providerReasoningIOSettings?.input?.includeInPayload;

		test('effort 档位 → thinking.adaptive，不发 budget_tokens（避免 4.7/4.8 的 400）', () => {
			const p = inc?.({ type: 'effort_slider_value', isReasoningEnabled: true, reasoningEffort: 'high' }) as any;
			assert.ok(p);
			assert.strictEqual(p.thinking?.type, 'adaptive');
			assert.ok(!('budget_tokens' in (p.thinking ?? {})));
		});

		test('budget 档位 → thinking.enabled + budget_tokens（旧模型零回退）', () => {
			const p = inc?.({ type: 'budget_slider_value', isReasoningEnabled: true, reasoningBudget: 4096 }) as any;
			assert.ok(p);
			assert.strictEqual(p.thinking?.type, 'enabled');
			assert.strictEqual(p.thinking?.budget_tokens, 4096);
		});

		test('未开启推理 → null', () => {
			assert.strictEqual(inc?.(null as any), null);
		});
	});

	suite('既有条目零改动（抽样回归）', () => {
		test('claude-opus-4-20250514 不受影响', () => {
			const c = getModelCapabilities('anthropic', 'claude-opus-4-20250514', undefined);
			assert.strictEqual(c.cost.input, 15.00);
			assert.strictEqual(c.cost.output, 30.00);
			assert.strictEqual(c.contextWindow, 200_000);
		});
	});

	suite('aiyiwei 聚合路径新增旗舰', () => {
		const cases = [
			{ id: 'gpt-5.5', input: 2.50, output: 15.00 },
			{ id: 'gemini-3-pro-preview', input: 3.00, output: 18.00 },
		] as const;
		for (const { id, input, output } of cases) {
			test(`${id}：识别 + 价格 + openai-style + effort 推理`, () => {
				const c = getModelCapabilities('aiyiwei', id, undefined);
				assert.strictEqual(c.isUnrecognizedModel, false);
				assert.strictEqual(c.cost.input, input);
				assert.strictEqual(c.cost.output, output);
				assert.strictEqual(c.specialToolFormat, 'openai-style');
				assert.ok(c.reasoningCapabilities);
				assert.strictEqual(c.reasoningCapabilities && c.reasoningCapabilities.reasoningSlider?.type, 'effort_slider');
			});
		}

		test('aiyiwei effort 档位 → reasoning_effort（推理真正下发）', () => {
			const inc = getProviderCapabilities('aiyiwei').providerReasoningIOSettings?.input?.includeInPayload;
			const p = inc?.({ type: 'effort_slider_value', isReasoningEnabled: true, reasoningEffort: 'high' }) as any;
			assert.ok(p);
			assert.strictEqual(p.reasoning_effort, 'high');
		});
	});
});
