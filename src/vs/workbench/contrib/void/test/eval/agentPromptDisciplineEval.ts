/*--------------------------------------------------------------------------------------
 *  Agent 提示词纪律评测（确定性）。对应 change: refine-agent-prompt-discipline
 *  运行：npx tsx src/vs/workbench/contrib/void/test/eval/agentPromptDisciplineEval.ts
 *--------------------------------------------------------------------------------------*/

import { chat_systemMessage } from '../../common/prompt/prompts.js'

const results: { name: string, pass: boolean, detail: string }[] = []
const rec = (name: string, pass: boolean, detail = '') => results.push({ name, pass, detail })

const mk = (chatMode: any) => chat_systemMessage({
	workspaceFolders: ['/ws'], openedURIs: [], activeURI: '/ws/a.ts', persistentTerminalIDs: [],
	directoryStr: 'D', chatMode, mcpTools: undefined, includeXMLToolDefinitions: true,
} as any)

const agent = mk('agent')
const normal = mk('normal')

// 范围/输出纪律段（仅 agent）
rec('agent 含 Scope and Output Discipline 段', agent.includes('## Scope and Output Discipline'))
rec('agent 含"只做被要求的改动"', agent.includes('Make ONLY the changes the user requested'))
rec('agent 含"不重构无关相邻代码"', agent.includes('Do not refactor or "improve" adjacent code'))
rec('agent 含"结论先行"', agent.includes('Lead with the outcome'))
rec('normal 模式不注入该段（模式隔离）', !normal.includes('## Scope and Output Discipline'))

// 表格限制放宽
rec('不再硬禁表格', !agent.includes('Do NOT write tables'))
rec('改为"必要时可用表格"', agent.includes('Use tables only when'))

console.log('\n=========== Agent 提示词纪律评测 ===========\n')
let fail = false
for (const r of results) { if (!r.pass) fail = true; console.log(`  ${r.pass ? '✅' : '❌'} ${r.name}${r.detail ? '  — ' + r.detail : ''}`) }
const pass = results.filter(r => r.pass).length
console.log(`\n  总计：${pass}/${results.length} 通过 — ${fail ? '❌' : '✅ 全部达标'}`)
console.log('\n===========================================\n')
process.exit(fail ? 1 : 0)
