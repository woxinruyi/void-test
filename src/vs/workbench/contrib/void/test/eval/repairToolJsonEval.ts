/*--------------------------------------------------------------------------------------
 *  工具调用 JSON 容错解析评测（确定性）。对应 change: add-toolcall-json-repair
 *  运行：npx tsx src/vs/workbench/contrib/void/test/eval/repairToolJsonEval.ts
 *--------------------------------------------------------------------------------------*/

import { tryParseToolJson } from '../../common/helpers/repairToolJson.js'

const results: { name: string, pass: boolean, detail: string }[] = []
const rec = (name: string, pass: boolean, detail = '') => results.push({ name, pass, detail })
const eq = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b)

// happy path（行为不变）
rec('合法 JSON 原样解析', eq(tryParseToolJson('{"uri":"/a","n":1}'), { uri: '/a', n: 1 }))
rec('嵌套对象', eq(tryParseToolJson('{"a":{"b":[1,2]}}'), { a: { b: [1, 2] } }))

// 修复：尾随逗号
rec('尾随逗号(对象)', eq(tryParseToolJson('{"a":1,}'), { a: 1 }))
rec('尾随逗号(数组)', eq(tryParseToolJson('{"a":[1,2,]}'), { a: [1, 2] }))

// 修复：智能引号
rec('智能引号', eq(tryParseToolJson('{“a”:“x”}'), { a: 'x' }))

// 修复：截断（未闭合括号）
rec('截断缺右括号', eq(tryParseToolJson('{"a":1'), { a: 1 }))
rec('截断缺右括号(嵌套)', eq(tryParseToolJson('{"a":{"b":2'), { a: { b: 2 } }))
rec('截断在字符串中', eq(tryParseToolJson('{"a":"foo'), { a: 'foo' }))
rec('截断数组', eq(tryParseToolJson('{"a":[1,2'), { a: [1, 2] }))

// 安全：必须是对象、非法返回 null（与原 JSON.parse 失败行为一致）
rec('数组(非对象)→ null', tryParseToolJson('[1,2,3]') === null)
rec('纯垃圾 → null', tryParseToolJson('not json at all') === null)
rec('空串 → null', tryParseToolJson('') === null)
rec('非字符串 → null', tryParseToolJson(123 as any) === null)
rec('null 字面量 → null', tryParseToolJson('null') === null)

// happy-path 不被修复逻辑破坏：字符串内含逗号/括号
rec('字符串内含 } 和逗号不误伤', eq(tryParseToolJson('{"cmd":"echo a, b }"}'), { cmd: 'echo a, b }' }))

console.log('\n=========== 工具JSON容错解析评测 ===========\n')
let fail = false
for (const r of results) { if (!r.pass) fail = true; console.log(`  ${r.pass ? '✅' : '❌'} ${r.name}${r.detail ? '  — ' + r.detail : ''}`) }
const pass = results.filter(r => r.pass).length
console.log(`\n  总计：${pass}/${results.length} 通过 — ${fail ? '❌' : '✅ 全部达标'}`)
console.log('\n===========================================\n')
process.exit(fail ? 1 : 0)
