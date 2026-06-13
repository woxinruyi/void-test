/*--------------------------------------------------------------------------------------
 *  LLM 错误分类单元测试（add-llm-error-classification）
 *--------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { classifyLLMError } from '../../common/helpers/classifyLLMError.js';

suite('Void - LLM error classification', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('不重试类（重试无意义）', () => {
		test('401 → auth', () => { const r = classifyLLMError({ status: 401, message: 'x' }); assert.strictEqual(r.kind, 'auth'); assert.strictEqual(r.retryable, false); });
		test('invalid api key → auth', () => assert.strictEqual(classifyLLMError({ message: 'Invalid API key', fullError: null }).kind, 'auth'));
		test('400 invalid_request → bad_request', () => { const r = classifyLLMError({ status: 400, message: 'invalid_request_error' }); assert.strictEqual(r.kind, 'bad_request'); assert.strictEqual(r.retryable, false); });
		test('no such model → bad_request', () => assert.strictEqual(classifyLLMError({ message: 'no such model: foo' }).kind, 'bad_request'));
	});

	suite('重试类 + 指数退避', () => {
		test('429 → rate_limit 可重试', () => { const r = classifyLLMError({ status: 429, message: 'rate limit' }); assert.strictEqual(r.kind, 'rate_limit'); assert.ok(r.retryable); });
		test('429 退避递增且有上限', () => { const r = classifyLLMError({ status: 429 }); assert.ok(r.backoffMs(0) < r.backoffMs(2)); assert.ok(r.backoffMs(20) <= 30000); });
		test('529 → overloaded 可重试', () => assert.strictEqual(classifyLLMError({ status: 529, message: 'Overloaded' }).kind, 'overloaded'));
		test('500 → network 可重试', () => { const r = classifyLLMError({ status: 500 }); assert.strictEqual(r.kind, 'network'); assert.ok(r.retryable); });
		test('timeout → network', () => assert.strictEqual(classifyLLMError({ message: 'request timed out' }).kind, 'network'));
		test('DNS enotfound → network（非 bad_request）', () => assert.strictEqual(classifyLLMError({ message: 'getaddrinfo ENOTFOUND api.x' }).kind, 'network'));
	});

	suite('未知保留原行为 + 形状鲁棒', () => {
		test('未知 → 可重试 2500ms', () => { const r = classifyLLMError({ message: 'weird' }); assert.strictEqual(r.kind, 'unknown'); assert.ok(r.retryable); assert.strictEqual(r.backoffMs(0), 2500); assert.strictEqual(r.backoffMs(9), 2500); });
		test('字符串错误', () => assert.strictEqual(classifyLLMError('429 too many requests').kind, 'rate_limit'));
		test('null → unknown 可重试', () => { const r = classifyLLMError(null); assert.strictEqual(r.kind, 'unknown'); assert.ok(r.retryable); });
		test('{message,fullError} 形状', () => assert.strictEqual(classifyLLMError({ message: 'failed', fullError: { status: 429 } as any }).kind, 'rate_limit'));
	});
});
