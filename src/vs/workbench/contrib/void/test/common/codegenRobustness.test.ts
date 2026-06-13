/*--------------------------------------------------------------------------------------
 *  Codegen 链路鲁棒性单元测试（容差匹配 / SEARCH·REPLACE 解析 / 工具结果截断）
 *
 *  对应 change: add-codegen-robustness-eval
 *  评定方式：见 test/eval/codegenRobustnessEval.ts（确定性 harness，可单独跑出指标报告）。
 *  本文件把同一套用例固化为 mocha 断言，纳入 `npm run test-node` 回归。
 *--------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { findTextInCode, FindTextResult } from '../../common/helpers/findTextInCode.js';
import { extractSearchReplaceBlocks } from '../../common/helpers/extractCodeFromResult.js';
import { truncateMiddle, ORIGINAL, DIVIDER, FINAL } from '../../common/prompt/prompts.js';

const FILE = [
	'function add(a, b) {',
	'  return a + b;',
	'}',
	'',
	'function sub(a, b) {',
	'  return a - b;',
	'}',
	'',
	'const x = 10;',
	'const y = 20;',
].join('\n');

const opts = { returnType: 'lines' as const };
const isRange = (r: FindTextResult, s: number, e: number) => Array.isArray(r) && r[0] === s && r[1] === e;

suite('Void - codegen robustness', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('findTextInCode 容差匹配（命中 sub 体 [5,7]）', () => {
		test('精确匹配', () => {
			assert.ok(isRange(findTextInCode('function sub(a, b) {\n  return a - b;\n}', FILE, true, opts), 5, 7));
		});
		test('尾随空格差异', () => {
			assert.ok(isRange(findTextInCode('function sub(a, b) { \n  return a - b;  \n} ', FILE, true, opts), 5, 7));
		});
		test('缩进差异 Tab vs 空格', () => {
			assert.ok(isRange(findTextInCode('function sub(a, b) {\n\treturn a - b;\n}', FILE, true, opts), 5, 7));
		});
		test('CRLF vs LF 行尾差异', () => {
			assert.ok(isRange(findTextInCode('function sub(a, b) {\r\n  return a - b;\r\n}', FILE, true, opts), 5, 7));
		});
		test('行内注释/小改动（行级模糊回退）', () => {
			assert.ok(isRange(findTextInCode('function sub(a, b) {\n  return a - b; // subtract\n}', FILE, true, opts), 5, 7));
		});
	});

	suite('findTextInCode 安全性（不得误匹配）', () => {
		test('不存在块 → Not found', () => {
			assert.strictEqual(findTextInCode("import React from 'react';\nconst App = () => null;", FILE, true, opts), 'Not found');
		});
		test('严格模式拒绝空白变体 → Not found', () => {
			assert.strictEqual(findTextInCode('function sub(a, b) {\n\treturn a - b;\n}', FILE, false, opts), 'Not found');
		});
		test('去空白后重复 → Not unique', () => {
			assert.strictEqual(findTextInCode('a  =  1;', 'a = 1;\nb = 2;\na = 1;', true, opts), 'Not unique');
		});
	});

	suite('extractSearchReplaceBlocks 解析', () => {
		test('单块完整解析', () => {
			const b = extractSearchReplaceBlocks(`${ORIGINAL}\nfoo\n${DIVIDER}\nbar\n${FINAL}`);
			assert.strictEqual(b.length, 1);
			assert.strictEqual(b[0].state, 'done');
			assert.strictEqual(b[0].orig, 'foo');
			assert.strictEqual(b[0].final, 'bar');
		});
		test('多块解析', () => {
			const b = extractSearchReplaceBlocks(`${ORIGINAL}\nfoo\n${DIVIDER}\nbar\n${FINAL}\n${ORIGINAL}\nbaz\n${DIVIDER}\nqux\n${FINAL}`);
			assert.strictEqual(b.length, 2);
			assert.ok(b.every(x => x.state === 'done'));
		});
		test('流式部分块 → writingFinal，不丢块', () => {
			const b = extractSearchReplaceBlocks(`${ORIGINAL}\nfoo\n${DIVIDER}\nba`);
			assert.strictEqual(b.length, 1);
			assert.strictEqual(b[0].state, 'writingFinal');
			assert.strictEqual(b[0].orig, 'foo');
		});
		test('CRLF 块完整解析（归一，否则整块丢失）', () => {
			const b = extractSearchReplaceBlocks(`${ORIGINAL}\r\nfoo\r\n${DIVIDER}\r\nbar\r\n${FINAL}`);
			assert.strictEqual(b.length, 1);
			assert.strictEqual(b[0].state, 'done');
			assert.strictEqual(b[0].orig, 'foo');
			assert.strictEqual(b[0].final, 'bar');
		});
	});

	suite('truncateMiddle 工具结果截断', () => {
		test('短文本原样返回', () => {
			assert.strictEqual(truncateMiddle('hello world', 100), 'hello world');
		});
		test('长文本中间截断：保首尾 + 截断标记 + 长度收缩', () => {
			const long = 'A'.repeat(600) + 'B'.repeat(600);
			const out = truncateMiddle(long, 200);
			assert.ok(out.startsWith('A'.repeat(100)));
			assert.ok(out.endsWith('B'.repeat(100)));
			assert.ok(out.includes('characters truncated'));
			assert.ok(out.length < long.length);
		});
	});
});
