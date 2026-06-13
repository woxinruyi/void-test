/*--------------------------------------------------------------------------------------
 *  Codegen 链路鲁棒性评测 Harness（确定性，无需 LLM / 不耗 token）
 *
 *  目的：为已落地的 codegen 优化（容差匹配 / 工具结果截断 / SEARCH·REPLACE 解析）
 *       提供可量化的"评定方式"，使每次改动可回归验证、可对比改动前后。
 *
 *  运行：  npx tsx src/vs/workbench/contrib/void/test/eval/codegenRobustnessEval.ts
 *  退出码：所有"硬指标"达标 → 0；否则 → 1（可直接接入 CI / pre-commit）。
 *
 *  指标分组与阈值（评定方式）：
 *    - RECALL_TOLERANT（精确/尾随空格/缩进/CRLF 变体）：硬指标，必须 100%
 *        —— 这些是日常编辑中最常见的差异，匹配失败 = 编辑直接失败。
 *    - RECALL_FUZZY（注释/小改动行级模糊）：硬指标，必须 100%。
 *    - SAFETY（不存在块→Not found / 严格模式拒绝 / 重复块→Not unique）：硬指标，必须 100%
 *        —— 误匹配会改错位置，比漏匹配更危险，零容忍。
 *    - PARSE（SEARCH/REPLACE 块解析，含流式部分块）：硬指标，必须 100%（模块可加载时）。
 *    - TRUNCATE（工具结果中间截断）：硬指标，必须 100%（模块可加载时）。
 *--------------------------------------------------------------------------------------*/

import { findTextInCode, FindTextResult } from '../../common/helpers/findTextInCode.js'

// ---------- 迷你断言/计分框架 ----------

type Group = 'RECALL_TOLERANT' | 'RECALL_FUZZY' | 'SAFETY' | 'PARSE' | 'TRUNCATE'
type CaseResult = { group: Group, name: string, pass: boolean, detail: string }

const results: CaseResult[] = []
const record = (group: Group, name: string, pass: boolean, detail: string) =>
	results.push({ group, name, pass, detail })

const eqRange = (res: FindTextResult, start: number, end: number) =>
	Array.isArray(res) && res[0] === start && res[1] === end
const showRes = (res: FindTextResult) => Array.isArray(res) ? `[${res[0]},${res[1]}]` : res

// ---------- 被测样本文件（LF）----------

const FILE = [
	'function add(a, b) {',   // 1
	'  return a + b;',        // 2
	'}',                      // 3
	'',                       // 4
	'function sub(a, b) {',   // 5
	'  return a - b;',        // 6
	'}',                      // 7
	'',                       // 8
	'const x = 10;',          // 9
	'const y = 20;',          // 10
].join('\n')

// 目标：定位 sub 函数体，期望命中行 [5,7]
const opts = { returnType: 'lines' as const }

// ========== RECALL_TOLERANT ==========

{
	const block = 'function sub(a, b) {\n  return a - b;\n}'
	const res = findTextInCode(block, FILE, true, opts)
	record('RECALL_TOLERANT', '精确匹配', eqRange(res, 5, 7), `期望[5,7] 实得${showRes(res)}`)
}
{
	// 每行带尾随空格，文件无 → 精确失败，去空白回退命中
	const block = 'function sub(a, b) { \n  return a - b;  \n} '
	const res = findTextInCode(block, FILE, true, opts)
	record('RECALL_TOLERANT', '尾随空格差异', eqRange(res, 5, 7), `期望[5,7] 实得${showRes(res)}`)
}
{
	// 缩进用 Tab，文件用 2 空格 → 精确失败，去空白回退命中
	const block = 'function sub(a, b) {\n\treturn a - b;\n}'
	const res = findTextInCode(block, FILE, true, opts)
	record('RECALL_TOLERANT', '缩进差异(Tab vs 空格)', eqRange(res, 5, 7), `期望[5,7] 实得${showRes(res)}`)
}
{
	// 块用 CRLF，文件用 LF → 精确失败，去空白回退命中（\r 被视为空白移除）
	const block = 'function sub(a, b) {\r\n  return a - b;\r\n}'
	const res = findTextInCode(block, FILE, true, opts)
	record('RECALL_TOLERANT', 'CRLF vs LF 行尾差异', eqRange(res, 5, 7), `期望[5,7] 实得${showRes(res)}`)
}

// ========== RECALL_FUZZY ==========

{
	// 行内追加注释（去空白也不等）→ 行级模糊回退命中
	const block = 'function sub(a, b) {\n  return a - b; // subtract\n}'
	const res = findTextInCode(block, FILE, true, opts)
	record('RECALL_FUZZY', '行内注释/小改动', eqRange(res, 5, 7), `期望[5,7] 实得${showRes(res)}`)
}

// ========== SAFETY ==========

{
	// 完全不存在的内容 → 不得误命中
	const block = "import React from 'react';\nconst App = () => null;"
	const res = findTextInCode(block, FILE, true, opts)
	record('SAFETY', '不存在块不得误命中', res === 'Not found', `期望Not found 实得${showRes(res)}`)
}
{
	// 严格模式（canFallback=false）应拒绝空白/缩进变体（对应应用阶段精确定位的调用点）
	const block = 'function sub(a, b) {\n\treturn a - b;\n}'
	const res = findTextInCode(block, FILE, false, opts)
	record('SAFETY', '严格模式拒绝空白变体', res === 'Not found', `期望Not found 实得${showRes(res)}`)
}
{
	// 去空白后出现 2 次 → 必须报 Not unique，避免改错位置
	const FILE2 = 'a = 1;\nb = 2;\na = 1;'
	const block = 'a  =  1;'
	const res = findTextInCode(block, FILE2, true, opts)
	record('SAFETY', '重复块报 Not unique', res === 'Not unique', `期望Not unique 实得${showRes(res)}`)
}

// ========== PARSE + TRUNCATE（需加载 prompts/extract 模块；tsx 下若加载失败则跳过该组）==========

async function runParseAndTruncate() {
	let extract: typeof import('../../common/helpers/extractCodeFromResult.js')
	let prompts: typeof import('../../common/prompt/prompts.js')
	try {
		extract = await import('../../common/helpers/extractCodeFromResult.js')
		prompts = await import('../../common/prompt/prompts.js')
	} catch (e) {
		console.log(`\n[跳过] PARSE/TRUNCATE 组：依赖模块在 tsx 直跑下无法加载（不影响 RECALL/SAFETY 硬指标）。`)
		console.log(`       原因：${(e as Error)?.message?.split('\n')[0]}`)
		console.log(`       这两组由 mocha 单测（npm run test-node）在完整编译环境中覆盖。`)
		return
	}

	const { extractSearchReplaceBlocks } = extract
	const { truncateMiddle, ORIGINAL, DIVIDER, FINAL } = prompts

	// --- PARSE ---
	{
		const s = `${ORIGINAL}\nfoo\n${DIVIDER}\nbar\n${FINAL}`
		const b = extractSearchReplaceBlocks(s)
		const ok = b.length === 1 && b[0].state === 'done' && b[0].orig === 'foo' && b[0].final === 'bar'
		record('PARSE', '单块完整解析', ok, `len=${b.length} state=${b[0]?.state} orig="${b[0]?.orig}" final="${b[0]?.final}"`)
	}
	{
		const s = `${ORIGINAL}\nfoo\n${DIVIDER}\nbar\n${FINAL}\n${ORIGINAL}\nbaz\n${DIVIDER}\nqux\n${FINAL}`
		const b = extractSearchReplaceBlocks(s)
		const ok = b.length === 2 && b.every(x => x.state === 'done')
		record('PARSE', '多块解析', ok, `len=${b.length} states=[${b.map(x => x.state).join(',')}]`)
	}
	{
		// 流式：final 尚未写完 → 部分块，state=writingFinal，不得丢块
		const s = `${ORIGINAL}\nfoo\n${DIVIDER}\nba`
		const b = extractSearchReplaceBlocks(s)
		const ok = b.length === 1 && b[0].state === 'writingFinal' && b[0].orig === 'foo'
		record('PARSE', '流式部分块(writingFinal)', ok, `len=${b.length} state=${b[0]?.state} final="${b[0]?.final}"`)
	}
	{
		// CRLF 输出：归一后仍能完整解析（否则 indexOf 全落空 → 丢块）
		const s = `${ORIGINAL}\r\nfoo\r\n${DIVIDER}\r\nbar\r\n${FINAL}`
		const b = extractSearchReplaceBlocks(s)
		const ok = b.length === 1 && b[0].state === 'done' && b[0].orig === 'foo' && b[0].final === 'bar'
		record('PARSE', 'CRLF 块完整解析(归一)', ok, `len=${b.length} state=${b[0]?.state} orig="${b[0]?.orig}" final="${b[0]?.final}"`)
	}

	// --- TRUNCATE ---
	{
		const short = 'hello world'
		const out = truncateMiddle(short, 100)
		record('TRUNCATE', '短文本原样返回', out === short, `len=${out.length}`)
	}
	{
		const long = 'A'.repeat(600) + 'B'.repeat(600) // 1200 chars
		const max = 200
		const out = truncateMiddle(long, max)
		const headOk = out.startsWith('A'.repeat(100))
		const tailOk = out.endsWith('B'.repeat(100))
		const markerOk = out.includes('characters truncated')
		const shrunk = out.length < long.length
		record('TRUNCATE', '长文本中间截断(保首尾+标记)', headOk && tailOk && markerOk && shrunk,
			`head=${headOk} tail=${tailOk} marker=${markerOk} shrunk=${shrunk} outLen=${out.length}`)
	}
}

// ---------- 汇总报告 ----------

function report(): number {
	console.log('\n================ Codegen 鲁棒性评测报告 ================\n')

	const groups: Group[] = ['RECALL_TOLERANT', 'RECALL_FUZZY', 'SAFETY', 'PARSE', 'TRUNCATE']
	const hardGroups = new Set<Group>(groups) // 全部为硬指标（按上文阈值，均要求 100%）

	let hardFail = false
	for (const g of groups) {
		const rs = results.filter(r => r.group === g)
		if (rs.length === 0) continue
		const passN = rs.filter(r => r.pass).length
		const rate = passN / rs.length
		const isHard = hardGroups.has(g)
		const threshold = 1.0 // 所有组要求 100%
		const ok = rate >= threshold
		if (isHard && !ok) hardFail = true
		const tag = ok ? '✅' : '❌'
		console.log(`${tag} ${g.padEnd(16)} 通过率 ${passN}/${rs.length} = ${(rate * 100).toFixed(0)}%  (阈值 ${(threshold * 100).toFixed(0)}%)`)
		for (const r of rs) {
			console.log(`     ${r.pass ? '·' : '✗'} ${r.name} — ${r.detail}`)
		}
	}

	const total = results.length
	const totalPass = results.filter(r => r.pass).length
	console.log(`\n  总计：${totalPass}/${total} 通过，总体鲁棒性得分 ${(totalPass / total * 100).toFixed(1)}%`)
	console.log(`  结论：${hardFail ? '❌ 存在硬指标未达标（详见上方 ❌ 行）' : '✅ 所有硬指标达标'}`)
	console.log('\n=======================================================\n')
	return hardFail ? 1 : 0
}

await runParseAndTruncate()
const code = report()
process.exit(code)
