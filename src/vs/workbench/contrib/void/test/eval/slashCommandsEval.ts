/*--------------------------------------------------------------------------------------
 *  斜杠命令纯逻辑评测 Harness（确定性，无需 LLM）
 *  对应 change: add-slash-commands（Phase 1）
 *  运行：npx tsx src/vs/workbench/contrib/void/test/eval/slashCommandsEval.ts
 *--------------------------------------------------------------------------------------*/

import {
	parseSlashInput, parseLocalCommandFile, expandTemplate, commandNameFromFilename,
	aggregateCommands, lookupCommand, filterCommandsByPrefix, SlashCommand,
} from '../../common/slashCommands/slashCommandHelpers.js'
import { builtinSlashCommands } from '../../common/slashCommands/builtinSlashCommands.js'

const results: { name: string, pass: boolean, detail: string }[] = []
const rec = (name: string, pass: boolean, detail = '') => results.push({ name, pass, detail })
const eq = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b)

// --- parseSlashInput ---
rec('解析 "/plan do x"', eq(parseSlashInput('/plan do x'), { name: 'plan', args: 'do x' }), JSON.stringify(parseSlashInput('/plan do x')))
rec('解析 "/help"', eq(parseSlashInput('/help'), { name: 'help', args: '' }))
rec('普通消息 → null', parseSlashInput('hello world') === null)
rec('路径 "/usr/local/bin" 不误判为命令', parseSlashInput('/usr/local/bin') === null, JSON.stringify(parseSlashInput('/usr/local/bin')))
rec('前导空格 "  /review x"', eq(parseSlashInput('  /review x'), { name: 'review', args: 'x' }))
rec('空串 → null', parseSlashInput('') === null)

// --- parseLocalCommandFile ---
{
	const f = '---\ndescription: My cmd\n---\nDo the thing $ARGS'
	const r = parseLocalCommandFile(f)
	rec('front-matter 解析 description+body', r.description === 'My cmd' && r.body === 'Do the thing $ARGS', JSON.stringify(r))
}
{
	const r = parseLocalCommandFile('just body, no frontmatter')
	rec('无 front-matter → 空描述+全文为 body', r.description === '' && r.body === 'just body, no frontmatter')
}
{
	// CRLF 容差
	const r = parseLocalCommandFile('---\r\ndescription: "Quoted"\r\n---\r\nbody here')
	rec('CRLF + 引号描述', r.description === 'Quoted' && r.body === 'body here', JSON.stringify(r))
}

// --- expandTemplate ---
rec('$ARGS 替换', expandTemplate('run $ARGS now', 'X') === 'run X now')
rec('无 $ARGS 时追加 args', expandTemplate('do it', 'extra') === 'do it\n\nextra')
rec('无 $ARGS 且无 args 原样', expandTemplate('do it', '') === 'do it')

// --- commandNameFromFilename ---
rec('文件名 → 命令名', commandNameFromFilename('Make Changelog.md') === 'make-changelog', commandNameFromFilename('Make Changelog.md'))

// --- aggregateCommands 优先级 builtin > local > skill ---
{
	const mk = (name: string, source: any): SlashCommand => ({ name, description: source, source })
	const builtins = [mk('plan', 'builtin'), mk('dup', 'builtin')]
	const locals = [mk('foo', 'local'), mk('dup', 'local')]
	const skills = [mk('bar', 'skill'), mk('dup', 'skill')]
	const all = aggregateCommands(builtins, locals, skills)
	const dup = lookupCommand(all, 'dup')
	const names = all.map(c => c.name).join(',')
	rec('三源合并去重', all.length === 4, `names=${names}`)
	rec('同名冲突 builtin 覆盖', dup?.source === 'builtin', `dup.source=${dup?.source}`)
	rec('按 name 升序', names === 'bar,dup,foo,plan', names)
}

// --- lookupCommand 大小写不敏感 ---
rec('lookup 大小写不敏感', lookupCommand(builtinSlashCommands, 'PLAN')?.name === 'plan')

// --- filterCommandsByPrefix ---
rec('前缀过滤 "re"', filterCommandsByPrefix(builtinSlashCommands, 're').every(c => c.name.startsWith('re')) && filterCommandsByPrefix(builtinSlashCommands, 're').length >= 1)

// --- builtins ---
rec('内置命令 ≥3', builtinSlashCommands.length >= 3, `count=${builtinSlashCommands.length}`)
rec('/help 为 localOnly', builtinSlashCommands.find(c => c.name === 'help')?.localOnly === true)
rec('/plan expand 含计划约束', /plan/i.test(builtinSlashCommands.find(c => c.name === 'plan')!.expand('T')) )

// --- report ---
console.log('\n=========== 斜杠命令纯逻辑评测 ===========\n')
let fail = false
for (const r of results) { if (!r.pass) fail = true; console.log(`  ${r.pass ? '✅' : '❌'} ${r.name}${r.detail ? '  — ' + r.detail : ''}`) }
const pass = results.filter(r => r.pass).length
console.log(`\n  总计：${pass}/${results.length} 通过 — ${fail ? '❌ 有未达标' : '✅ 全部达标'}`)
console.log('\n=========================================\n')
process.exit(fail ? 1 : 0)
