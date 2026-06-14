/*--------------------------------------------------------------------------------------
 *  推理档位→effort 映射单元测试（optimize-reasoning-effort-mapping）
 *--------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { tierToSendableReasoning } from '../../common/modelCapabilities.js';

const effortOf = (tier: any, provider: any, model: string): string => {
	const r = tierToSendableReasoning(tier, provider, model, undefined) as any;
	return r?.type === 'effort_slider_value' ? r.reasoningEffort : `(${r?.type ?? 'null'})`;
};

suite('Void - reasoning effort mapping', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('opus-4-8 high → xhigh（编码甜点）', () => assert.strictEqual(effortOf('high', 'anthropic', 'claude-opus-4-8'), 'xhigh'));
	test('opus-4-8 default → medium', () => assert.strictEqual(effortOf('default', 'anthropic', 'claude-opus-4-8'), 'medium'));
	test('opus-4-8 max → max', () => assert.strictEqual(effortOf('max', 'anthropic', 'claude-opus-4-8'), 'max'));
	test('gpt-5.5 high → xhigh', () => assert.strictEqual(effortOf('high', 'aiyiwei', 'gpt-5.5'), 'xhigh'));
	test('gpt-5.5 max → xhigh（无 max 回退最高）', () => assert.strictEqual(effortOf('max', 'aiyiwei', 'gpt-5.5'), 'xhigh'));
	test('gemini-3-pro high → high（无 xhigh 回退）', () => assert.strictEqual(effortOf('high', 'aiyiwei', 'gemini-3-pro-preview'), 'high'));
	test('budget_slider 模型零回退', () => {
		const r = tierToSendableReasoning('high', 'anthropic', 'claude-opus-4-20250514', undefined) as any;
		assert.strictEqual(r?.type, 'budget_slider_value');
	});
});
