/*--------------------------------------------------------------------------------------
 *  系统提示缓存切分评测（确定性）。对应 change: optimize-system-prompt-caching
 *  运行：npx tsx src/vs/workbench/contrib/void/test/eval/systemPromptCacheEval.ts
 *--------------------------------------------------------------------------------------*/

import { splitSystemForCaching, stripCacheMarker, CACHE_BREAKPOINT_MARKER, chat_systemMessage } from '../../common/prompt/prompts.js'

const results: { name: string, pass: boolean, detail: string }[] = []
const rec = (name: string, pass: boolean, detail = '') => results.push({ name, pass, detail })

// --- split / strip 纯逻辑 ---
{
	const r = splitSystemForCaching(`STABLE${CACHE_BREAKPOINT_MARKER}VOLATILE`)
	rec('split：标记前后切分', r.cacheable === 'STABLE' && r.volatile === 'VOLATILE', JSON.stringify(r))
}
{
	const r = splitSystemForCaching('no marker here')
	rec('split：无标记 → 整体可缓存、volatile=null', r.cacheable === 'no marker here' && r.volatile === null)
}
rec('strip：去除标记', !stripCacheMarker(`A\n\n\n${CACHE_BREAKPOINT_MARKER}\n\n\nB`).includes(CACHE_BREAKPOINT_MARKER))

// --- chat_systemMessage 结构（agent）---
const sys = chat_systemMessage({
	workspaceFolders: ['/ws'], openedURIs: ['/ws/a.ts'], activeURI: '/ws/ACTIVEFILE.ts',
	persistentTerminalIDs: [], directoryStr: 'DIRTREE_MARKER', chatMode: 'agent',
	mcpTools: undefined, includeXMLToolDefinitions: true,
} as any)
const { cacheable, volatile } = splitSystemForCaching(sys)

rec('系统提示含断点标记', sys.includes(CACHE_BREAKPOINT_MARKER))
rec('稳定块含规则段(Autonomy)', cacheable.includes('Autonomy and Persistence'))
rec('稳定块含 Important notes', cacheable.includes('Important notes'))
rec('稳定块不含活动文件(易变)', !cacheable.includes('ACTIVEFILE'), `cacheableHasActive=${cacheable.includes('ACTIVEFILE')}`)
rec('稳定块不含目录树(易变)', !cacheable.includes('DIRTREE_MARKER'))
rec('稳定块不含日期(易变)', !cacheable.includes("Today's date"))
rec('易变块含活动文件', !!volatile && volatile.includes('ACTIVEFILE'))
rec('易变块含目录树', !!volatile && volatile.includes('DIRTREE_MARKER'))
rec('易变块含日期', !!volatile && volatile.includes("Today's date"))

console.log('\n=========== 系统提示缓存切分评测 ===========\n')
let fail = false
for (const r of results) { if (!r.pass) fail = true; console.log(`  ${r.pass ? '✅' : '❌'} ${r.name}${r.detail ? '  — ' + r.detail : ''}`) }
const pass = results.filter(r => r.pass).length
console.log(`\n  总计：${pass}/${results.length} 通过 — ${fail ? '❌' : '✅ 全部达标'}`)
console.log('  注：缓存命中率真实效果需 Anthropic 真机看 usage.cache_read（运行时）。')
console.log('\n===========================================\n')
process.exit(fail ? 1 : 0)
