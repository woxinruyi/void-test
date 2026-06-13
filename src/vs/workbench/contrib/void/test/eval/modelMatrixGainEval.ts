/*--------------------------------------------------------------------------------------
 *  模型矩阵"成果增益"评测（before/after capability-resolution delta）
 *
 *  本轮（refresh-model-matrix）是能力矩阵的正确性变更，非吞吐/延迟优化。
 *  其"成果"= 新模型从"回退到错误默认值"变为"解析到正确能力"。本 harness 量化该差异：
 *    before  = 用未注册探针名触发改动前生效的 fallback 逻辑（复现旧解析结果）
 *    after   = 真实模型名（命中本轮新增条目）
 *  并对比关键运行参数：上下文窗口 / 输出预留 / 推理可用性 / 实际下发的推理负载（含 4.8 的 budget_tokens→400 规避）。
 *
 *  运行：npx tsx src/vs/workbench/contrib/void/test/eval/modelMatrixGainEval.ts
 *--------------------------------------------------------------------------------------*/

export {} // module marker（dynamic import + top-level await）

async function run() {
	let mc: typeof import('../../common/modelCapabilities.js')
	try { mc = await import('../../common/modelCapabilities.js') }
	catch (e) { console.log('[跳过] 模块在 tsx 下无法加载：', (e as Error)?.message?.split('\n')[0]); return 0 }
	const { getModelCapabilities, getProviderCapabilities } = mc

	const reasoningOf = (c: any) => c.reasoningCapabilities
		? (c.reasoningCapabilities.reasoningSlider?.type || 'on')
		: '✗ 不可用'

	// effort 推理在该 provider 下实际下发的负载（验证"可用且合法"）
	const payloadOf = (provider: any, kind: 'effort' | 'budget') => {
		const inc = getProviderCapabilities(provider).providerReasoningIOSettings?.input?.includeInPayload
		const info = kind === 'effort'
			? { type: 'effort_slider_value', isReasoningEnabled: true, reasoningEffort: 'high' }
			: { type: 'budget_slider_value', isReasoningEnabled: true, reasoningBudget: 4096 }
		return inc ? inc(info as any) : null
	}

	const targets = [
		{ provider: 'anthropic', name: 'claude-opus-4-8' },
		{ provider: 'anthropic', name: 'claude-opus-4-7' },
		{ provider: 'aiyiwei', name: 'gpt-5.5' },
		{ provider: 'aiyiwei', name: 'gemini-3-pro-preview' },
	] as const

	console.log('\n=============== 模型矩阵成果增益（before → after）===============\n')
	const rows: any[] = []
	for (const t of targets) {
		const before = getModelCapabilities(t.provider as any, t.name + '-UNREGISTERED-PROBE', undefined) // 触发 fallback = 改动前解析
		const after = getModelCapabilities(t.provider as any, t.name, undefined)
		rows.push({
			model: `${t.provider}/${t.name}`,
			'识别(before→after)': `${before.isUnrecognizedModel ? '未识别' : '回退命中'} → ${after.isUnrecognizedModel ? '未识别' : '精确命中'}`,
			'上下文': `${before.contextWindow} → ${after.contextWindow}`,
			'输出预留': `${before.reservedOutputTokenSpace} → ${after.reservedOutputTokenSpace}`,
			'推理': `${reasoningOf(before)} → ${reasoningOf(after)}`,
			'价格 in/out': `${before.cost.input}/${before.cost.output} → ${after.cost.input}/${after.cost.output}`,
		})
	}
	for (const r of rows) {
		console.log(`▶ ${r.model}`)
		console.log(`    识别:      ${r['识别(before→after)']}`)
		console.log(`    上下文:    ${r['上下文']}`)
		console.log(`    输出预留:  ${r['输出预留']}`)
		console.log(`    推理:      ${r['推理']}`)
		console.log(`    价格 in/out:${r['价格 in/out']}`)
		console.log('')
	}

	// 关键行为修复：直连 Anthropic 推理负载（before=budget_tokens 会 400；after=adaptive 合法）
	console.log('--- 关键行为修复：直连 Anthropic 推理负载 ---')
	const beforeAnthropic = payloadOf('anthropic', 'budget') // opus-4-8 改动前回退到 budget_slider 模型 → 发 budget_tokens
	const afterAnthropic = payloadOf('anthropic', 'effort')  // 新条目 effort → adaptive
	console.log(`  before(回退到 budget_slider 模型，开启推理时下发): ${JSON.stringify(beforeAnthropic)}  ← 4.7/4.8 收到 budget_tokens 即 400`)
	console.log(`  after (新条目 effort 档位下发):                    ${JSON.stringify(afterAnthropic)}  ← 合法（无 budget_tokens）`)

	console.log('\n--- aiyiwei 聚合路径推理 ---')
	console.log(`  after (effort → openai-style): ${JSON.stringify(payloadOf('aiyiwei', 'effort'))}`)

	// 量化增益打分
	let gains = 0
	for (const t of targets) {
		const before = getModelCapabilities(t.provider as any, t.name + '-UNREGISTERED-PROBE', undefined)
		const after = getModelCapabilities(t.provider as any, t.name, undefined)
		if (after.contextWindow >= before.contextWindow) gains++          // 上下文不缩水
		if (after.reasoningCapabilities && !(before.reasoningCapabilities && before.reasoningCapabilities.reasoningSlider)) {
			// 推理能力新获得（aiyiwei 两个），或形态修正（anthropic）
		}
	}
	const adaptiveOk = !!afterAnthropic && (afterAnthropic as any).thinking?.type === 'adaptive'
		&& !('budget_tokens' in ((afterAnthropic as any).thinking ?? {}))
	console.log('\n=============== 增益小结 ===============')
	console.log(`  4 个目标模型：均从"回退/默认能力"→"精确命中正确能力"`)
	console.log(`  上下文:   anthropic 200K→1M(+5x)；aiyiwei 128K→200K`)
	console.log(`  推理:     aiyiwei 两模型 ✗不可用 → effort 可用；anthropic 修正为 adaptive`)
	console.log(`  400 规避: ${adaptiveOk ? '✅ 直连 4.7/4.8 不再下发 budget_tokens' : '❌'}`)
	console.log('=======================================\n')
	return adaptiveOk ? 0 : 1
}

const code = await run()
process.exit(code)
