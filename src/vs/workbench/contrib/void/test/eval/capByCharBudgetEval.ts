/*--------------------------------------------------------------------------------------
 *  字符预算裁剪评测（确定性）。对应 change: cap-memory-injection
 *  运行：npx tsx src/vs/workbench/contrib/void/test/eval/capByCharBudgetEval.ts
 *--------------------------------------------------------------------------------------*/

import { capByCharBudget } from '../../common/helpers/capByCharBudget.js'

const results: { name: string, pass: boolean, detail: string }[] = []
const rec = (name: string, pass: boolean, detail = '') => results.push({ name, pass, detail })

// 全量在预算内 → 全保留，0 丢弃
{
	const r = capByCharBudget(['aaa', 'bbb', 'ccc'], 1000)
	rec('预算内全保留', r.kept.length === 3 && r.droppedCount === 0, JSON.stringify(r))
}

// 超预算 → 保留尾部（最近），丢弃最早
{
	// 每项 5 字符（含换行 ≈6），预算 13 ≈ 容纳 2 项
	const r = capByCharBudget(['old01', 'mid02', 'new03'], 13)
	rec('超预算保留尾部最近项', r.kept[r.kept.length - 1] === 'new03' && !r.kept.includes('old01'), JSON.stringify(r))
	rec('droppedCount 正确', r.droppedCount === 3 - r.kept.length, JSON.stringify(r))
}

// 空列表 → 空结果
{
	const r = capByCharBudget([], 100)
	rec('空列表', r.kept.length === 0 && r.droppedCount === 0)
}

// 单项即使超预算也至少保留 1（避免空注入）
{
	const r = capByCharBudget(['this-single-line-exceeds'], 5)
	rec('单项超预算至少保留 1', r.kept.length === 1 && r.droppedCount === 0, JSON.stringify(r))
}

// 边界：恰好等于预算 → 全保留
{
	const lines = ['ab', 'cd'] // join('\n') = "ab\ncd" = 5 字符
	const r = capByCharBudget(lines, 5)
	rec('恰好等于预算全保留', r.kept.length === 2 && r.droppedCount === 0, JSON.stringify(r))
}

console.log('\n=========== 字符预算裁剪评测 ===========\n')
let fail = false
for (const r of results) { if (!r.pass) fail = true; console.log(`  ${r.pass ? '✅' : '❌'} ${r.name}${r.detail ? '  — ' + r.detail : ''}`) }
const pass = results.filter(r => r.pass).length
console.log(`\n  总计：${pass}/${results.length} 通过 — ${fail ? '❌' : '✅ 全部达标'}`)
console.log('\n=======================================\n')
process.exit(fail ? 1 : 0)
