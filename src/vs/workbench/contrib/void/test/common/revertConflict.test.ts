/*--------------------------------------------------------------------------------------
 *  回滚冲突判定单元测试（checkpoint-revert-conflict-detection）
 *--------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { shouldFlagExternalModification } from '../../common/helpers/revertConflict.js';

suite('Void - revert conflict detection', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('afterHash 缺失 → 不判冲突（向后兼容）', () => {
		assert.strictEqual(shouldFlagExternalModification('abc', undefined), false);
		assert.strictEqual(shouldFlagExternalModification('abc', ''), false);
	});

	test('当前 === afterHash → 不判冲突', () => {
		assert.strictEqual(shouldFlagExternalModification('h1', 'h1'), false);
	});

	test('当前 !== afterHash → 判冲突（外部修改）', () => {
		assert.strictEqual(shouldFlagExternalModification('h2', 'h1'), true);
	});
});
