/*--------------------------------------------------------------------------------------
 *  聚合网关回退解析评测（确定性）。对应 change: add-aggregator-fallback
 *  运行：npx tsx src/vs/workbench/contrib/void/test/eval/aggregatorFallbackEval.ts
 *--------------------------------------------------------------------------------------*/

import { resolveAggregatorFallback, NativeFallbackProvider } from '../../common/helpers/aggregatorFallback.js'

const results: { name: string, pass: boolean, detail: string }[] = []
const rec = (name: string, pass: boolean, detail = '') => results.push({ name, pass, detail })
const eq = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b)

const all = (_p: NativeFallbackProvider) => true
const none = (_p: NativeFallbackProvider) => false
const only = (set: NativeFallbackProvider[]) => (p: NativeFallbackProvider) => set.includes(p)

rec('claude-opus-4-8 + anthropic key → anthropic', eq(resolveAggregatorFallback('claude-opus-4-8', all), { providerName: 'anthropic', modelName: 'claude-opus-4-8' }))
rec('gpt-5.5 + openAI key → openAI', eq(resolveAggregatorFallback('gpt-5.5', all), { providerName: 'openAI', modelName: 'gpt-5.5' }))
rec('o3 + openAI key → openAI', resolveAggregatorFallback('o3', all)?.providerName === 'openAI')
rec('gemini-3-pro-preview + gemini key → gemini', eq(resolveAggregatorFallback('gemini-3-pro-preview', all), { providerName: 'gemini', modelName: 'gemini-3-pro-preview' }))

rec('claude + 无 anthropic key → null', resolveAggregatorFallback('claude-opus-4-8', none) === null)
rec('claude + 仅 openAI key → null（厂商不匹配）', resolveAggregatorFallback('claude-opus-4-8', only(['openAI'])) === null)
rec('gpt + 仅 anthropic key → null', resolveAggregatorFallback('gpt-5.5', only(['anthropic'])) === null)
rec('未知模型 → null', resolveAggregatorFallback('llama-3', all) === null)
rec('大小写不敏感', resolveAggregatorFallback('CLAUDE-OPUS-4-8', all)?.providerName === 'anthropic')

console.log('\n=========== 聚合网关回退解析评测 ===========\n')
let fail = false
for (const r of results) { if (!r.pass) fail = true; console.log(`  ${r.pass ? '✅' : '❌'} ${r.name}${r.detail ? '  — ' + r.detail : ''}`) }
const pass = results.filter(r => r.pass).length
console.log(`\n  总计：${pass}/${results.length} 通过 — ${fail ? '❌' : '✅ 全部达标'}`)
console.log('\n===========================================\n')
process.exit(fail ? 1 : 0)
