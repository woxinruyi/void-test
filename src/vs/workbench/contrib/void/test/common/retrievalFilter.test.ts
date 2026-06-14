/*--------------------------------------------------------------------------------------
 *  检索相关性过滤单元测试（rag-relevance-floor）
 *--------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { filterByScoreFloor } from '../../common/helpers/retrievalFilter.js';

const mk = (scores: number[]) => scores.map((score, i) => ({ id: i, score }));

suite('Void - retrieval relevance floor', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('空输入 → 空', () => {
		assert.deepStrictEqual(filterByScoreFloor([]), []);
	});

	test('全为近正交噪声（< 绝对下限）→ 全裁', () => {
		const r = filterByScoreFloor(mk([0.03, 0.01, 0.02]));
		assert.strictEqual(r.length, 0);
	});

	test('保留高分、裁掉长尾（相对下限）', () => {
		// top=0.8，相对下限=0.16；0.5/0.3 保留，0.1/0.04 裁掉
		const r = filterByScoreFloor(mk([0.8, 0.5, 0.3, 0.1, 0.04]));
		assert.deepStrictEqual(r.map(x => x.score), [0.8, 0.5, 0.3]);
	});

	test('最高分 <= 0 → 空', () => {
		assert.deepStrictEqual(filterByScoreFloor(mk([0, -0.1])), []);
	});

	test('自定义下限', () => {
		const r = filterByScoreFloor(mk([0.9, 0.4]), 0.5, 0.0);
		assert.deepStrictEqual(r.map(x => x.score), [0.9]);
	});
});
