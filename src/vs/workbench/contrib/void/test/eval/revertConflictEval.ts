/*--------------------------------------------------------------------------------------
 *  回滚冲突判定评测（确定性）。对应 change: checkpoint-revert-conflict-detection
 *  运行：npx tsx src/vs/workbench/contrib/void/test/eval/revertConflictEval.ts
 *--------------------------------------------------------------------------------------*/

import { shouldFlagExternalModification } from '../../common/helpers/revertConflict.js'

const results: { name: string, pass: boolean }[] = []
const rec = (name: string, pass: boolean) => results.push({ name, pass })

rec('afterHash undefined → false', shouldFlagExternalModification('abc', undefined) === false)
rec('afterHash 空串 → false', shouldFlagExternalModification('abc', '') === false)
rec('current === after → false', shouldFlagExternalModification('h1', 'h1') === false)
rec('current !== after → true（外部修改）', shouldFlagExternalModification('h2', 'h1') === true)

console.log('\n=========== 回滚冲突判定评测 ===========\n')
let fail = false
for (const r of results) { if (!r.pass) fail = true; console.log(`  ${r.pass ? '✅' : '❌'} ${r.name}`) }
console.log(`\n  总计：${results.filter(r => r.pass).length}/${results.length} 通过 — ${fail ? '❌' : '✅ 全部达标'}`)
console.log('\n=======================================\n')
process.exit(fail ? 1 : 0)
