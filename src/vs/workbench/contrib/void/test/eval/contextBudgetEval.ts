/*--------------------------------------------------------------------------------------
 *  上下文预算纯逻辑评测（确定性）。对应 change: add-context-budget-tool
 *  运行：npx tsx src/vs/workbench/contrib/void/test/eval/contextBudgetEval.ts
 *--------------------------------------------------------------------------------------*/

import { computeContextBudget, formatContextBudget } from '../../common/contextBudget.js'

const results: { name: string, pass: boolean, detail: string }[] = []
const rec = (name: string, pass: boolean, detail = '') => results.push({ name, pass, detail })

{
	const b = computeContextBudget(50_000, 200_000)
	rec('常规：50K/200K', b.usedTokens === 50000 && b.contextWindow === 200000 && b.remainingTokens === 150000 && b.usedPercent === 25, JSON.stringify(b))
}
{
	const b = computeContextBudget(250_000, 200_000) // 超用
	rec('超用截断：remaining=0, pct=100', b.remainingTokens === 0 && b.usedPercent === 100, JSON.stringify(b))
}
{
	const b = computeContextBudget(0, 1_000_000)
	rec('零使用：remaining=full, pct=0', b.remainingTokens === 1000000 && b.usedPercent === 0, JSON.stringify(b))
}
{
	const b = computeContextBudget(100, 0) // 无效 contextWindow
	rec('contextWindow=0 不除零', b.contextWindow === 0 && b.remainingTokens === 0 && b.usedPercent === 0, JSON.stringify(b))
}
{
	const b = computeContextBudget(-5, -5) // 负值钳制
	rec('负值钳制为 0', b.usedTokens === 0 && b.contextWindow === 0 && b.remainingTokens === 0, JSON.stringify(b))
}
{
	rec('formatContextBudget 含 K 与 %', /Context: \d+K \/ \d+K tokens used \(\d+%\), \d+K remaining\./.test(formatContextBudget(computeContextBudget(50_000, 200_000))), formatContextBudget(computeContextBudget(50_000, 200_000)))
}

console.log('\n=========== 上下文预算评测 ===========\n')
let fail = false
for (const r of results) { if (!r.pass) fail = true; console.log(`  ${r.pass ? '✅' : '❌'} ${r.name}${r.detail ? '  — ' + r.detail : ''}`) }
const pass = results.filter(r => r.pass).length
console.log(`\n  总计：${pass}/${results.length} 通过 — ${fail ? '❌' : '✅ 全部达标'}`)
console.log('\n=====================================\n')
process.exit(fail ? 1 : 0)
