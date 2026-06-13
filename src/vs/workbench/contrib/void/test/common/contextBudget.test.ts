/*--------------------------------------------------------------------------------------
 *  上下文预算纯逻辑单元测试（add-context-budget-tool）
 *--------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { computeContextBudget, formatContextBudget } from '../../common/contextBudget.js';

suite('Void - context budget', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('常规 50K/200K', () => {
		const b = computeContextBudget(50_000, 200_000);
		assert.deepStrictEqual(b, { usedTokens: 50000, contextWindow: 200000, remainingTokens: 150000, usedPercent: 25 });
	});
	test('超用截断', () => {
		const b = computeContextBudget(250_000, 200_000);
		assert.strictEqual(b.remainingTokens, 0);
		assert.strictEqual(b.usedPercent, 100);
	});
	test('零使用', () => {
		const b = computeContextBudget(0, 1_000_000);
		assert.strictEqual(b.remainingTokens, 1_000_000);
		assert.strictEqual(b.usedPercent, 0);
	});
	test('contextWindow=0 不除零', () => {
		const b = computeContextBudget(100, 0);
		assert.strictEqual(b.usedPercent, 0);
		assert.strictEqual(b.remainingTokens, 0);
	});
	test('负值钳制', () => {
		const b = computeContextBudget(-5, -5);
		assert.deepStrictEqual(b, { usedTokens: 0, contextWindow: 0, remainingTokens: 0, usedPercent: 0 });
	});
	test('format 含 K 与 %', () => {
		assert.match(formatContextBudget(computeContextBudget(50_000, 200_000)), /50K \/ 200K tokens used \(25%\), 150K remaining/);
	});
});
