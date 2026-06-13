/*--------------------------------------------------------------------------------------
 *  聚合网关回退解析单元测试（add-aggregator-fallback）
 *--------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { resolveAggregatorFallback, NativeFallbackProvider } from '../../common/helpers/aggregatorFallback.js';

const all = (_p: NativeFallbackProvider) => true;
const none = (_p: NativeFallbackProvider) => false;
const only = (set: NativeFallbackProvider[]) => (p: NativeFallbackProvider) => set.includes(p);

suite('Void - aggregator gateway fallback', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('claude → anthropic（有 key）', () => assert.deepStrictEqual(resolveAggregatorFallback('claude-opus-4-8', all), { providerName: 'anthropic', modelName: 'claude-opus-4-8' }));
	test('gpt → openAI（有 key）', () => assert.deepStrictEqual(resolveAggregatorFallback('gpt-5.5', all), { providerName: 'openAI', modelName: 'gpt-5.5' }));
	test('o3 → openAI', () => assert.strictEqual(resolveAggregatorFallback('o3', all)?.providerName, 'openAI'));
	test('gemini → gemini（有 key）', () => assert.strictEqual(resolveAggregatorFallback('gemini-3-pro-preview', all)?.providerName, 'gemini'));

	test('无对应 key → null', () => assert.strictEqual(resolveAggregatorFallback('claude-opus-4-8', none), null));
	test('厂商不匹配 → null', () => assert.strictEqual(resolveAggregatorFallback('claude-opus-4-8', only(['openAI'])), null));
	test('未知模型 → null', () => assert.strictEqual(resolveAggregatorFallback('llama-3', all), null));
	test('大小写不敏感', () => assert.strictEqual(resolveAggregatorFallback('CLAUDE-OPUS-4-8', all)?.providerName, 'anthropic'));
});
