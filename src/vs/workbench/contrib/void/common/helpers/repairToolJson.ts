/*--------------------------------------------------------------------------------------
 *  工具调用 JSON 容错解析（纯函数，无依赖，可在 node 下单元测试）
 *
 *  对应 change: add-toolcall-json-repair
 *  动机：openai-compatible / 聚合(aiyiwei) 路径用裸 JSON.parse 解析工具参数，
 *       模型偶发输出轻微非法 JSON（尾随逗号、智能引号、被截断）时整次工具调用被丢弃。
 *  策略：**仅在精确解析失败时**才尝试保守修复 → 严格"挽回否则会丢失的调用"，
 *       不改变 happy-path 行为；修复后仍必须解析为对象，否则返回 null（与原行为一致）。
 *--------------------------------------------------------------------------------------*/

const asObject = (s: string): Record<string, any> | null => {
	try {
		const v = JSON.parse(s);
		return (v && typeof v === 'object' && !Array.isArray(v)) ? v : null;
	} catch {
		return null;
	}
};

// 在不破坏字符串字面量的前提下，补齐未闭合的 { [ 和未结束的字符串（应对截断输出）
const balanceBracketsAndStrings = (s: string): string => {
	const stack: string[] = [];
	let inStr = false, esc = false, quote = '';
	for (const ch of s) {
		if (inStr) {
			if (esc) { esc = false; }
			else if (ch === '\\') { esc = true; }
			else if (ch === quote) { inStr = false; }
			continue;
		}
		if (ch === '"' || ch === '\'') { inStr = true; quote = ch; continue; }
		if (ch === '{' || ch === '[') { stack.push(ch); }
		else if (ch === '}') { if (stack[stack.length - 1] === '{') stack.pop(); }
		else if (ch === ']') { if (stack[stack.length - 1] === '[') stack.pop(); }
	}
	let out = s;
	if (inStr) out += quote;          // 关闭未结束的字符串
	for (let i = stack.length - 1; i >= 0; i--) out += stack[i] === '{' ? '}' : ']';
	return out;
};

/**
 * 解析工具参数 JSON，失败时保守修复。始终返回对象或 null。
 * 修复顺序：精确 → 智能引号/尾随逗号 → 括号/字符串补齐。
 */
export const tryParseToolJson = (raw: unknown): Record<string, any> | null => {
	if (typeof raw !== 'string') return null;
	const s = raw.trim();
	if (!s) return null;

	// 1) 精确（happy path，行为不变）
	const exact = asObject(s);
	if (exact) return exact;

	// 2) 智能引号 → 直引号；移除 } ] 前的尾随逗号
	let r = s
		.replace(/[“”]/g, '"')
		.replace(/[‘’]/g, '\'')
		.replace(/,(\s*[}\]])/g, '$1');
	const repaired = asObject(r);
	if (repaired) return repaired;

	// 3) 截断：补齐未闭合括号/字符串
	const balanced = asObject(balanceBracketsAndStrings(r));
	if (balanced) return balanced;

	return null;
};
