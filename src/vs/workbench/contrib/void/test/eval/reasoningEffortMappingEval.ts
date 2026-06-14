/*--------------------------------------------------------------------------------------
 *  推理档位→effort 映射评测（确定性）。对应 change: optimize-reasoning-effort-mapping
 *  运行：npx tsx src/vs/workbench/contrib/void/test/eval/reasoningEffortMappingEval.ts
 *--------------------------------------------------------------------------------------*/

import { tierToSendableReasoning } from '../../common/modelCapabilities.js'

const results: { name: string, pass: boolean, detail: string }[] = []
const rec = (name: string, pass: boolean, detail = '') => results.push({ name, pass, detail })

const effortOf = (tier: any, provider: any, model: string) => {
	const r = tierToSendableReasoning(tier, provider, model, undefined) as any
	return r?.type === 'effort_slider_value' ? r.reasoningEffort : `(${r?.type ?? 'null'})`
}

// opus-4-8（effort: low/medium/high/xhigh/max）—— 对标 Claude Code 编码甜点
rec("opus-4-8 high → xhigh（编码甜点，原为 medium）", effortOf('high', 'anthropic', 'claude-opus-4-8') === 'xhigh', effortOf('high', 'anthropic', 'claude-opus-4-8'))
rec("opus-4-8 default → medium（原为 low）", effortOf('default', 'anthropic', 'claude-opus-4-8') === 'medium', effortOf('default', 'anthropic', 'claude-opus-4-8'))
rec("opus-4-8 max → max", effortOf('max', 'anthropic', 'claude-opus-4-8') === 'max')

// gpt-5.5（aiyiwei，effort: low/medium/high/xhigh）
rec("gpt-5.5 high → xhigh", effortOf('high', 'aiyiwei', 'gpt-5.5') === 'xhigh', effortOf('high', 'aiyiwei', 'gpt-5.5'))
rec("gpt-5.5 max → xhigh（无 max，回退最高）", effortOf('max', 'aiyiwei', 'gpt-5.5') === 'xhigh', effortOf('max', 'aiyiwei', 'gpt-5.5'))

// gemini-3-pro（aiyiwei，effort: low/high）
rec("gemini-3-pro high → high（无 xhigh，回退 high）", effortOf('high', 'aiyiwei', 'gemini-3-pro-preview') === 'high', effortOf('high', 'aiyiwei', 'gemini-3-pro-preview'))

// budget_slider 模型（旧 anthropic）零回退：仍走 budget，不是 effort
{
	const r = tierToSendableReasoning('high', 'anthropic', 'claude-opus-4-20250514', undefined) as any
	rec('budget_slider 模型仍走 budget（零回退）', r?.type === 'budget_slider_value', r?.type)
}

console.log('\n=========== 推理 effort 映射评测 ===========\n')
let fail = false
for (const r of results) { if (!r.pass) fail = true; console.log(`  ${r.pass ? '✅' : '❌'} ${r.name}${r.detail ? '  — ' + r.detail : ''}`) }
const pass = results.filter(r => r.pass).length
console.log(`\n  总计：${pass}/${results.length} 通过 — ${fail ? '❌' : '✅ 全部达标'}`)
console.log('\n===========================================\n')
process.exit(fail ? 1 : 0)
