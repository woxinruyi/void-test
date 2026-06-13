/*--------------------------------------------------------------------------------------
 *  LLM 错误分类评测（确定性）。对应 change: add-llm-error-classification
 *  运行：npx tsx src/vs/workbench/contrib/void/test/eval/classifyLLMErrorEval.ts
 *--------------------------------------------------------------------------------------*/

import { classifyLLMError } from '../../common/helpers/classifyLLMError.js'

const results: { name: string, pass: boolean, detail: string }[] = []
const rec = (name: string, pass: boolean, detail = '') => results.push({ name, pass, detail })

const c = (e: unknown) => classifyLLMError(e)

// 鉴权 → 不重试
rec('401 → auth 不重试', !c({ status: 401, message: 'x' }).retryable && c({ status: 401, message: 'x' }).kind === 'auth')
rec('invalid api key → auth', c({ message: 'Invalid API key provided', fullError: null }).kind === 'auth')
rec('403 forbidden → auth 不重试', !c('403 Forbidden').retryable)

// 限流 → 重试 + 指数退避
{
	const r = c({ status: 429, message: 'rate limit exceeded' })
	rec('429 → rate_limit 可重试', r.kind === 'rate_limit' && r.retryable)
	rec('429 指数退避递增', r.backoffMs(0) < r.backoffMs(1) && r.backoffMs(1) < r.backoffMs(2), `${r.backoffMs(0)},${r.backoffMs(1)},${r.backoffMs(2)}`)
	rec('429 退避有上限', r.backoffMs(20) <= 30000)
}

// 过载
rec('529 overloaded → 可重试', c({ status: 529, message: 'Overloaded' }).kind === 'overloaded' && c({ status: 529 }).retryable)

// 请求格式 → 不重试
rec('400 invalid_request → bad_request 不重试', c({ status: 400, message: 'invalid_request_error' }).kind === 'bad_request' && !c({ status: 400 }).retryable)
rec('no such model → bad_request', c({ message: 'no such model: foo' }).kind === 'bad_request')

// 网络/5xx → 重试 + 退避
rec('500 → network 可重试', c({ status: 500, message: 'server error' }).kind === 'network' && c({ status: 500 }).retryable)
rec('timeout → network', c({ message: 'request timed out' }).kind === 'network')
rec('ECONNRESET → network', c({ message: 'read ECONNRESET' }).kind === 'network')
rec('DNS enotfound → network(非 bad_request)', c({ message: 'getaddrinfo ENOTFOUND api.x' }).kind === 'network')

// 未知 → 保留原行为
{
	const r = c({ message: 'something weird happened' })
	rec('未知 → 可重试且 2500ms(原行为)', r.kind === 'unknown' && r.retryable && r.backoffMs(0) === 2500 && r.backoffMs(5) === 2500)
}

// 形状鲁棒
rec('字符串错误', c('429 too many requests').kind === 'rate_limit')
rec('null → unknown 可重试', c(null).kind === 'unknown' && c(null).retryable)
rec('{message,fullError} 形状', c({ message: 'failed', fullError: { status: 429 } as any }).kind === 'rate_limit')

console.log('\n=========== LLM 错误分类评测 ===========\n')
let fail = false
for (const r of results) { if (!r.pass) fail = true; console.log(`  ${r.pass ? '✅' : '❌'} ${r.name}${r.detail ? '  — ' + r.detail : ''}`) }
const pass = results.filter(r => r.pass).length
console.log(`\n  总计：${pass}/${results.length} 通过 — ${fail ? '❌' : '✅ 全部达标'}`)
console.log('\n=======================================\n')
process.exit(fail ? 1 : 0)
