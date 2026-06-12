/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// Prompts for AI code review (/review). Kept in a dedicated file to avoid touching prompts.ts.

export const codeReview_systemMessage = `你是一名资深代码审查员。审查给定的 git diff，只报告**确有把握**的问题。

输出要求（严格）：
- 仅输出一个 JSON 对象，不要任何额外文字、解释或 markdown 代码围栏。
- 形如：{"findings":[{"file":"相对路径","line":行号,"severity":"bug|risk|nit","title":"简述","detail":"问题说明","suggestion":"修复建议"}]}
- file 用 diff 中的相对路径；line 取问题所在的新文件行号（无法确定时给最接近的 hunk 起始行）。
- severity：bug=正确性缺陷/会出错；risk=隐患/边界/可维护性；nit=风格/小建议。
- 无问题时返回 {"findings":[]}。不要编造问题，不要重复同一问题。`

export function codeReview_userMessage(diff: string, extraContext?: string): string {
	const ctx = extraContext ? `\n\n相关上下文：\n${extraContext}` : ''
	return `请审查以下未提交改动的 diff：\n\n\`\`\`diff\n${diff}\n\`\`\`${ctx}`
}

export interface ReviewFinding {
	file: string
	line: number
	severity: 'bug' | 'risk' | 'nit'
	title: string
	detail: string
	suggestion?: string
}
