/*--------------------------------------------------------------------------------------
 *  哈希嵌入单元测试（improve-rag-hash-embedding）
 *--------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { hashEmbed, hashEmbedBaseline, cosineSimilarity, tokenizeForEmbed, STOP_TOKENS } from '../../common/helpers/hashEmbed.js';

suite('Void - hash embedding (RAG)', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('维度与 L2 归一化', () => {
		const v = hashEmbed('authenticate user', { dims: 384 });
		assert.strictEqual(v.length, 384);
		let norm = 0; for (let i = 0; i < v.length; i++) norm += v[i] * v[i];
		assert.ok(Math.abs(Math.sqrt(norm) - 1) < 1e-5, 'L2 norm ≈ 1');
	});

	test('确定性：同输入同输出', () => {
		const a = hashEmbed('parseJsonSafely(raw)');
		const b = hashEmbed('parseJsonSafely(raw)');
		assert.strictEqual(cosineSimilarity(a, b), 1);
	});

	test('子词匹配：char-trigram 让 "user profile" 命中 "updateUserProfile"（improved > baseline）', () => {
		const q = 'user profile';
		const doc = 'function updateUserProfile(userId, profile) { return saveUser(userId, profile) }';
		const impSim = cosineSimilarity(hashEmbed(q), hashEmbed(doc));
		const baseSim = cosineSimilarity(hashEmbedBaseline(q), hashEmbedBaseline(doc));
		assert.ok(impSim > baseSim, `improved ${impSim} 应 > baseline ${baseSim}`);
	});

	test('停用词降权：关闭子词后，含判别词的查询更偏向判别性文档', () => {
		// 两个文档都含大量样板关键字；只有 docA 含判别性标识符 quickSort
		const q = 'quicksort array';
		const docA = 'function quickSort(arr) { return arr }';
		const docB = 'const value = 1; let result = 2; return value';
		const simA = cosineSimilarity(hashEmbed(q, { charNgrams: false }), hashEmbed(docA, { charNgrams: false }));
		const simB = cosineSimilarity(hashEmbed(q, { charNgrams: false }), hashEmbed(docB, { charNgrams: false }));
		assert.ok(simA > simB, `判别性文档 ${simA} 应 > 样板文档 ${simB}`);
	});

	test('tokenize 与 STOP_TOKENS 基本性质', () => {
		assert.deepStrictEqual(tokenizeForEmbed('Get-User_Name 42'), ['get', 'user_name', '42']);
		assert.ok(STOP_TOKENS.has('const') && STOP_TOKENS.has('return'));
	});
});
