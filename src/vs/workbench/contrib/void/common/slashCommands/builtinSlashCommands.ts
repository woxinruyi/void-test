/*--------------------------------------------------------------------------------------
 *  内置斜杠命令（纯数据 + 展开逻辑，无 DI 依赖）
 *  对应 change: add-slash-commands（Phase 1）
 *--------------------------------------------------------------------------------------*/

import { SlashCommand } from './slashCommandHelpers.js'

export interface BuiltinSlashCommand extends SlashCommand {
	readonly source: 'builtin'
	/** 展开为本轮前置指令文本（localOnly 命令的文本用于本地渲染，不发 LLM）。 */
	expand(args: string): string
}

// 前置指令文本以 system-reminder 风格注入本轮用户消息（仅本轮，不进常驻系统提示）。
export const builtinSlashCommands: readonly BuiltinSlashCommand[] = [
	{
		name: 'plan',
		description: '先产出分步计划再执行（计划纪律）',
		source: 'builtin',
		expand: (args) =>
			`Before doing anything, produce a concise numbered plan (each step with how it will be verified). `
			+ `Do not write code until the plan is laid out. Then execute step by step.`
			+ (args ? `\n\nTask: ${args}` : ''),
	},
	{
		name: 'review',
		description: '按 checklist 评审当前改动/选中代码',
		source: 'builtin',
		expand: (args) =>
			`Review for: (1) correctness bugs, (2) edge cases, (3) error handling, (4) security, `
			+ `(5) reuse/simplification. Report findings first, ordered by severity; only then suggest fixes.`
			+ (args ? `\n\nScope: ${args}` : ''),
	},
	{
		name: 'compact-context',
		description: '压缩当前对话上下文（触发摘要）',
		source: 'builtin',
		expand: () =>
			`Summarize the conversation so far into a compact form preserving the current task, key decisions, `
			+ `and any files/edits in progress, then continue from that summary.`,
	},
	{
		name: 'help',
		description: '列出可用的斜杠命令（本地渲染，不发 LLM）',
		source: 'builtin',
		localOnly: true,
		// 实际帮助文本由服务层用完整注册表生成；此处返回占位提示。
		expand: () => `__SLASH_HELP__`,
	},
]
