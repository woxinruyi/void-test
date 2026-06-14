/*--------------------------------------------------------------------------------------
 *  字符预算裁剪单元测试（cap-memory-injection）
 *--------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { capByCharBudget } from '../../common/helpers/capByCharBudget.js';

suite('Void - cap by char budget', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('预算内全保留', () => {
		const r = capByCharBudget(['aaa', 'bbb', 'ccc'], 1000);
		assert.strictEqual(r.kept.length, 3);
		assert.strictEqual(r.droppedCount, 0);
	});

	test('超预算保留尾部最近项、丢弃最早', () => {
		const r = capByCharBudget(['old01', 'mid02', 'new03'], 13);
		assert.strictEqual(r.kept[r.kept.length - 1], 'new03');
		assert.ok(!r.kept.includes('old01'));
		assert.strictEqual(r.droppedCount, 3 - r.kept.length);
	});

	test('空列表', () => {
		const r = capByCharBudget([], 100);
		assert.strictEqual(r.kept.length, 0);
		assert.strictEqual(r.droppedCount, 0);
	});

	test('单项超预算至少保留 1', () => {
		const r = capByCharBudget(['this-single-line-exceeds'], 5);
		assert.strictEqual(r.kept.length, 1);
		assert.strictEqual(r.droppedCount, 0);
	});

	test('恰好等于预算全保留', () => {
		const r = capByCharBudget(['ab', 'cd'], 5);
		assert.strictEqual(r.kept.length, 2);
		assert.strictEqual(r.droppedCount, 0);
	});
});
