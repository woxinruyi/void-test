/*--------------------------------------------------------------------------------------
 *  工具调用 JSON 容错解析单元测试（add-toolcall-json-repair）
 *--------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { tryParseToolJson } from '../../common/helpers/repairToolJson.js';

suite('Void - tool-call JSON repair', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('happy path（行为不变）', () => {
		test('合法 JSON', () => assert.deepStrictEqual(tryParseToolJson('{"uri":"/a","n":1}'), { uri: '/a', n: 1 }));
		test('嵌套', () => assert.deepStrictEqual(tryParseToolJson('{"a":{"b":[1,2]}}'), { a: { b: [1, 2] } }));
		test('字符串内含 } 和逗号不误伤', () => assert.deepStrictEqual(tryParseToolJson('{"cmd":"echo a, b }"}'), { cmd: 'echo a, b }' }));
	});

	suite('修复', () => {
		test('尾随逗号(对象)', () => assert.deepStrictEqual(tryParseToolJson('{"a":1,}'), { a: 1 }));
		test('尾随逗号(数组)', () => assert.deepStrictEqual(tryParseToolJson('{"a":[1,2,]}'), { a: [1, 2] }));
		test('智能引号', () => assert.deepStrictEqual(tryParseToolJson('{“a”:“x”}'), { a: 'x' }));
		test('截断缺右括号', () => assert.deepStrictEqual(tryParseToolJson('{"a":1'), { a: 1 }));
		test('截断嵌套', () => assert.deepStrictEqual(tryParseToolJson('{"a":{"b":2'), { a: { b: 2 } }));
		test('截断在字符串中', () => assert.deepStrictEqual(tryParseToolJson('{"a":"foo'), { a: 'foo' }));
		test('截断数组', () => assert.deepStrictEqual(tryParseToolJson('{"a":[1,2'), { a: [1, 2] }));
	});

	suite('安全（返回 null，与原 JSON.parse 失败一致）', () => {
		test('数组非对象', () => assert.strictEqual(tryParseToolJson('[1,2,3]'), null));
		test('纯垃圾', () => assert.strictEqual(tryParseToolJson('not json'), null));
		test('空串', () => assert.strictEqual(tryParseToolJson(''), null));
		test('非字符串', () => assert.strictEqual(tryParseToolJson(123 as any), null));
		test('null 字面量', () => assert.strictEqual(tryParseToolJson('null'), null));
	});
});
