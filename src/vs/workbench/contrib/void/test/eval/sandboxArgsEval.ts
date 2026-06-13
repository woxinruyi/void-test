/*--------------------------------------------------------------------------------------
 *  沙箱参数/profile 生成评测（确定性，纯生成层；真机隔离另需运行时验证）
 *  对应 change: add-terminal-sandbox（纯部分）
 *  运行：npx tsx src/vs/workbench/contrib/void/test/eval/sandboxArgsEval.ts
 *--------------------------------------------------------------------------------------*/

import { buildBwrapArgs, buildSeatbeltProfile, sandboxAllowsNetwork, sandboxAllowsOutsideWorkspaceWrite } from '../../common/helpers/sandboxArgs.js'

const results: { name: string, pass: boolean, detail: string }[] = []
const rec = (name: string, pass: boolean, detail = '') => results.push({ name, pass, detail })
const WS = '/home/u/proj'

// --- bwrap ---
{
	const a = buildBwrapArgs({ workspaceDir: WS, mode: 'workspace-write' })!
	const s = a.join(' ')
	rec('bwrap workspace-write: 根只读', s.includes('--ro-bind / /'))
	rec('bwrap workspace-write: 工作区可写', a.includes('--bind') && a.includes(WS))
	rec('bwrap workspace-write: 断网', a.includes('--unshare-net'))
}
{
	const a = buildBwrapArgs({ workspaceDir: WS, mode: 'read-only' })!
	rec('bwrap read-only: 无 --bind 工作区(纯只读)', !a.includes('--bind'))
	rec('bwrap read-only: 断网', a.includes('--unshare-net'))
}
rec('bwrap full → null(不沙箱)', buildBwrapArgs({ workspaceDir: WS, mode: 'full' }) === null)

// --- seatbelt ---
{
	const p = buildSeatbeltProfile({ workspaceDir: WS, mode: 'workspace-write' })!
	rec('seatbelt: deny default', p.includes('(deny default)'))
	rec('seatbelt: 允许读', p.includes('(allow file-read*)'))
	rec('seatbelt: 默认断网', p.includes('(deny network*)'))
	rec('seatbelt workspace-write: 写工作区', p.includes(`(allow file-write* (subpath "${WS}"))`))
}
{
	const p = buildSeatbeltProfile({ workspaceDir: WS, mode: 'read-only' })!
	rec('seatbelt read-only: 无写工作区(纯只读)', !p.includes('file-write* (subpath'))
}
rec('seatbelt full → null', buildSeatbeltProfile({ workspaceDir: WS, mode: 'full' }) === null)

// --- 能力位 ---
rec('网络仅 full 放开', !sandboxAllowsNetwork('read-only') && !sandboxAllowsNetwork('workspace-write') && sandboxAllowsNetwork('full'))
rec('工作区外写仅 full', !sandboxAllowsOutsideWorkspaceWrite('workspace-write') && sandboxAllowsOutsideWorkspaceWrite('full'))

console.log('\n=========== 沙箱参数生成评测 ===========\n')
let fail = false
for (const r of results) { if (!r.pass) fail = true; console.log(`  ${r.pass ? '✅' : '❌'} ${r.name}${r.detail ? '  — ' + r.detail : ''}`) }
const pass = results.filter(r => r.pass).length
console.log(`\n  总计：${pass}/${results.length} 通过 — ${fail ? '❌' : '✅ 全部达标'}`)
console.log('\n  注：本评测验证"参数/profile 生成"逻辑；真机隔离生效需运行时端到端验证。')
console.log('\n=======================================\n')
process.exit(fail ? 1 : 0)
