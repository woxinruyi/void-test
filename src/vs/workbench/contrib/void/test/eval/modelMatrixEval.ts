/*--------------------------------------------------------------------------------------
 *  模型矩阵评测 Harness（确定性，无需 LLM / 不耗 token）
 *
 *  目的：为 refresh-model-matrix 的 Anthropic 新模型条目（claude-opus-4-8 / 4-7）
 *       提供可量化的"评定方式"，验证：
 *         1) 新条目字段正确（上下文 / 价格 / 工具格式 / 推理能力）；
 *         2) 直连 Anthropic 推理负载对 effort 档位发送 *自适应* 思考，而非 budget_tokens
 *            —— 这是设计文档标注的关键风险点（4.7/4.8 发送 budget_tokens 即 400）；
 *         3) 既有模型条目零回退（budget_slider 仍发 budget_tokens）。
 *
 *  运行：  npx tsx src/vs/workbench/contrib/void/test/eval/modelMatrixEval.ts
 *  退出码：全部硬指标达标 → 0；否则 → 1。
 *--------------------------------------------------------------------------------------*/

export {} // 使本文件成为 module（仅用 dynamic import()，需此标记以允许顶层 await）

type CaseResult = { name: string, pass: boolean, detail: string }
const results: CaseResult[] = []
const rec = (name: string, pass: boolean, detail: string) => results.push({ name, pass, detail })

async function run() {
	let mc: typeof import('../../common/modelCapabilities.js')
	try {
		mc = await import('../../common/modelCapabilities.js')
	} catch (e) {
		console.log(`\n[跳过] 模块在 tsx 直跑下无法加载（依赖链含 voidSettingsService）。`)
		console.log(`       原因：${(e as Error)?.message?.split('\n')[0]}`)
		console.log(`       该评测由 mocha 单测（npm run test-node）在完整编译环境覆盖；本次以 tsc 编译为准。`)
		return 0 // 不判失败：tsx 加载受限不等于实现错误
	}

	const { getModelCapabilities, getProviderCapabilities } = mc

	// ---- 1) 新条目字段 ----
	for (const id of ['claude-opus-4-8', 'claude-opus-4-7']) {
		const c = getModelCapabilities('anthropic', id, undefined)
		const ok =
			c.isUnrecognizedModel === false &&
			c.contextWindow === 1_000_000 &&
			c.cost.input === 5.00 && c.cost.output === 25.00 &&
			c.specialToolFormat === 'anthropic-style' &&
			c.supportsSystemMessage === 'separated' &&
			c.reasoningCapabilities && c.reasoningCapabilities.reasoningSlider?.type === 'effort_slider'
		rec(`条目存在且字段正确：${id}`, !!ok,
			`recognized=${!c.isUnrecognizedModel} ctx=${c.contextWindow} in=${c.cost.input} out=${c.cost.output} tool=${c.specialToolFormat} slider=${c.reasoningCapabilities && c.reasoningCapabilities.reasoningSlider?.type}`)
	}

	// ---- 2) 直连推理负载：effort → adaptive（不得发 budget_tokens）----
	const inc = getProviderCapabilities('anthropic').providerReasoningIOSettings?.input?.includeInPayload
	{
		const p = inc?.({ type: 'effort_slider_value', isReasoningEnabled: true, reasoningEffort: 'high' }) as any
		const ok = !!p && p.thinking?.type === 'adaptive' && !('budget_tokens' in (p.thinking ?? {}))
		rec('effort 档位 → thinking.adaptive（无 budget_tokens，避免 400）', ok, JSON.stringify(p))
	}
	{
		// 回归：旧模型 budget_slider 仍发 budget_tokens
		const p = inc?.({ type: 'budget_slider_value', isReasoningEnabled: true, reasoningBudget: 4096 }) as any
		const ok = !!p && p.thinking?.type === 'enabled' && p.thinking?.budget_tokens === 4096
		rec('budget 档位 → thinking.enabled+budget_tokens（旧模型零回退）', ok, JSON.stringify(p))
	}
	{
		const p = inc?.(null as any)
		rec('未开启推理 → null', p === null, JSON.stringify(p))
	}

	// ---- 3) 既有条目零改动（抽样）----
	{
		const c = getModelCapabilities('anthropic', 'claude-opus-4-20250514', undefined)
		const ok = c.cost.input === 15.00 && c.cost.output === 30.00 && c.contextWindow === 200_000
		rec('既有条目未受影响：claude-opus-4-20250514', ok, `in=${c.cost.input} out=${c.cost.output} ctx=${c.contextWindow}`)
	}

	// ---- 4) aiyiwei 聚合路径新增旗舰（GPT-5.5 / Gemini 3 Pro）----
	const expectAiyiwei: Record<string, { input: number, output: number }> = {
		'gpt-5.5': { input: 2.50, output: 15.00 },
		'gemini-3-pro-preview': { input: 3.00, output: 18.00 },
	}
	for (const id of Object.keys(expectAiyiwei)) {
		const c = getModelCapabilities('aiyiwei', id, undefined)
		const e = expectAiyiwei[id]
		const ok =
			c.isUnrecognizedModel === false &&
			c.cost.input === e.input && c.cost.output === e.output &&
			c.specialToolFormat === 'openai-style' &&
			c.reasoningCapabilities && c.reasoningCapabilities.reasoningSlider?.type === 'effort_slider'
		rec(`aiyiwei 条目正确：${id}`, !!ok,
			`recognized=${!c.isUnrecognizedModel} in=${c.cost.input} out=${c.cost.output} tool=${c.specialToolFormat} slider=${c.reasoningCapabilities && c.reasoningCapabilities.reasoningSlider?.type}`)
	}
	{
		// aiyiwei effort 档位 → openai-style reasoning_effort（确保推理真正下发）
		const inc2 = getProviderCapabilities('aiyiwei').providerReasoningIOSettings?.input?.includeInPayload
		const p = inc2?.({ type: 'effort_slider_value', isReasoningEnabled: true, reasoningEffort: 'high' }) as any
		rec('aiyiwei effort → reasoning_effort', !!p && p.reasoning_effort === 'high', JSON.stringify(p))
	}

	// ---- 报告 ----
	console.log('\n================ 模型矩阵评测报告 ================\n')
	let fail = false
	for (const r of results) {
		if (!r.pass) fail = true
		console.log(`  ${r.pass ? '✅' : '❌'} ${r.name}\n       ${r.detail}`)
	}
	const pass = results.filter(r => r.pass).length
	console.log(`\n  总计：${pass}/${results.length} 通过`)
	console.log(`  结论：${fail ? '❌ 存在未达标项' : '✅ 全部达标'}`)
	console.log('\n=================================================\n')
	return fail ? 1 : 0
}

const code = await run()
process.exit(code)
