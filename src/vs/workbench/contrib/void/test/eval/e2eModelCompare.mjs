/*--------------------------------------------------------------------------------------
 *  端到端模型对比评测（真实调用 aiyiwei，耗 token）
 *
 *  目的：用固定可程序化校验的编码任务，对比 gpt-5.5 vs 旧模型的
 *        ①任务通过率（执行生成代码验证）②延迟 ③token 消耗。
 *
 *  运行：
 *    AIYIWEI_API_KEY=sk-xxx node src/vs/workbench/contrib/void/test/eval/e2eModelCompare.mjs [newModel] [oldModel]
 *  默认对比：gpt-5.5  vs  gpt-4.1
 *  环境变量：AIYIWEI_API_KEY(必填) AIYIWEI_BASE(默认 https://aiyiwei.vip/v1)
 *           N_RUNS(每任务重复次数,默认1) PYTHON(默认 python)
 *--------------------------------------------------------------------------------------*/

import { writeFileSync, mkdtempSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE = process.env.AIYIWEI_BASE || 'https://aiyiwei.vip/v1'
const KEY = process.env.AIYIWEI_API_KEY
const PY = process.env.PYTHON || 'python'
const N_RUNS = parseInt(process.env.N_RUNS || '1', 10)
const NEW_MODEL = process.argv[2] || 'gpt-5.5'
const OLD_MODEL = process.argv[3] || 'gpt-4.1'

if (!KEY) { console.error('缺少 AIYIWEI_API_KEY 环境变量'); process.exit(2) }

// 固定任务集：每个含 prompt + Python 校验断言（在生成代码后追加执行）
const TASKS = [
	{
		id: 'add',
		prompt: '写一个 Python 函数 add(a, b) 返回两数之和。只输出一个 ```python 代码块，不要解释。',
		check: 'assert add(2,3)==5 and add(-1,1)==0\nprint("OK")',
	},
	{
		id: 'palindrome',
		prompt: '写一个 Python 函数 is_palindrome(s)，忽略大小写与非字母数字字符判断回文，返回 bool。只输出一个 ```python 代码块。',
		check: 'assert is_palindrome("A man, a plan, a canal: Panama")==True\nassert is_palindrome("hello")==False\nassert is_palindrome("")==True\nprint("OK")',
	},
	{
		id: 'merge_intervals',
		prompt: '写一个 Python 函数 merge(intervals) 合并重叠区间（intervals 为 [start,end] 列表），返回合并后的列表（按 start 升序）。只输出一个 ```python 代码块。',
		check: 'assert merge([[1,3],[2,6],[8,10],[15,18]])==[[1,6],[8,10],[15,18]]\nassert merge([[1,4],[4,5]])==[[1,5]]\nprint("OK")',
	},
]

const extractCode = (text) => {
	const m = text.match(/```(?:python|py)?\s*([\s\S]*?)```/i)
	return (m ? m[1] : text).trim()
}

const runPython = (code) => {
	const dir = mkdtempSync(join(tmpdir(), 'eval-'))
	const file = join(dir, 'sol.py')
	writeFileSync(file, code, 'utf8')
	try {
		const out = execFileSync(PY, [file], { timeout: 15000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
		return { ok: out.includes('OK'), out: out.trim().slice(0, 120) }
	} catch (e) {
		return { ok: false, out: (e.stderr || e.message || '').toString().trim().split('\n').slice(-2).join(' ').slice(0, 160) }
	}
}

const callModel = async (model, prompt) => {
	const body = { model, messages: [{ role: 'user', content: prompt }] }
	const t0 = Date.now()
	const r = await fetch(`${BASE}/chat/completions`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
		body: JSON.stringify(body),
	})
	const ms = Date.now() - t0
	const j = await r.json().catch(() => ({}))
	if (!r.ok) return { ok: false, ms, err: `${r.status} ${JSON.stringify(j).slice(0, 160)}` }
	const text = j.choices?.[0]?.message?.content ?? ''
	const u = j.usage || {}
	return { ms, text, pt: u.prompt_tokens ?? 0, ct: u.completion_tokens ?? 0, tt: u.total_tokens ?? 0 }
}

const evalModel = async (model) => {
	const rows = []
	for (const task of TASKS) {
		for (let i = 0; i < N_RUNS; i++) {
			const res = await callModel(model, task.prompt)
			if (res.err) { rows.push({ task: task.id, pass: false, ms: res.ms, tokens: 0, note: res.err }); continue }
			const code = extractCode(res.text) + '\n' + task.check
			const run = runPython(code)
			rows.push({ task: task.id, pass: run.ok, ms: res.ms, tokens: res.tt, note: run.ok ? '' : run.out })
		}
	}
	return rows
}

const summarize = (model, rows) => {
	const n = rows.length
	const pass = rows.filter(r => r.pass).length
	const avgMs = Math.round(rows.reduce((a, r) => a + r.ms, 0) / n)
	const totTok = rows.reduce((a, r) => a + r.tokens, 0)
	return { model, n, pass, passRate: (pass / n * 100).toFixed(0) + '%', avgMs, totTok }
}

console.log(`\n=== 端到端模型对比：${NEW_MODEL} vs ${OLD_MODEL} ===`)
console.log(`端点 ${BASE} | 任务数 ${TASKS.length} | 每任务重复 ${N_RUNS}\n`)

const out = {}
for (const model of [NEW_MODEL, OLD_MODEL]) {
	console.log(`--- ${model} ---`)
	const rows = await evalModel(model)
	for (const r of rows) console.log(`  ${r.pass ? '✅' : '❌'} ${r.task.padEnd(16)} ${String(r.ms).padStart(6)}ms  ${String(r.tokens).padStart(6)}tok  ${r.note}`)
	out[model] = summarize(model, rows)
	console.log('')
}

console.log('=== 汇总 ===')
console.log('模型'.padEnd(24), '通过率', '  平均延迟', '  总token')
for (const m of [NEW_MODEL, OLD_MODEL]) {
	const s = out[m]
	console.log(m.padEnd(24), `${s.pass}/${s.n}=${s.passRate}`.padEnd(8), `${s.avgMs}ms`.padStart(8), `${s.totTok}`.padStart(9))
}
console.log('')
