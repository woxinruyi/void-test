/*--------------------------------------------------------------------------------------
 *  SEARCH 块在文件中的定位逻辑（纯函数，无浏览器/编辑器依赖）
 *
 *  从 browser/editCodeService.ts 抽出，使其可在 node 环境下单元测试。
 *  行为与原实现保持一致：精确匹配 → 去空白匹配（带唯一性校验）→ 行级模糊匹配。
 *  editCodeService.ts 通过 import 复用这些函数（手术式抽取，不改变匹配行为）。
 *--------------------------------------------------------------------------------------*/

export type FindTextResult = readonly [number, number] | 'Not found' | 'Not unique'

const numLinesOfStr = (str: string) => str.split('\n').length

// Helper function to remove whitespace except newlines
export const removeWhitespaceExceptNewlines = (str: string): string => {
	return str.replace(/[^\S\n]+/g, '');
}

// Normalize a line for fuzzy comparison: collapse whitespace, trim, lowercase
export const normalizeLine = (line: string): string => line.replace(/\s+/g, ' ').trim().toLowerCase()

// Compute similarity ratio between two strings (0..1) using longest common subsequence
export const lineSimilarity = (a: string, b: string): number => {
	if (a === b) return 1
	if (a.length === 0 || b.length === 0) return 0
	// Simple LCS-based ratio (optimized for short strings / single lines)
	const la = a.length, lb = b.length
	if (la > 500 || lb > 500) {
		// For very long lines, fall back to simple check
		return a.includes(b) || b.includes(a) ? 0.8 : 0
	}
	const prev = new Uint16Array(lb + 1)
	const curr = new Uint16Array(lb + 1)
	for (let i = 1; i <= la; i++) {
		curr.fill(0)
		for (let j = 1; j <= lb; j++) {
			if (a[i - 1] === b[j - 1]) curr[j] = prev[j - 1] + 1
			else curr[j] = Math.max(prev[j], curr[j - 1])
		}
		prev.set(curr)
	}
	const lcsLen = prev[lb]
	return (2 * lcsLen) / (la + lb)
}

// Line-level fuzzy matching: find best matching region in file for a block of text
export const fuzzyFindLines = (textLines: string[], fileLines: string[], startLine: number): { startLine: number, endLine: number, score: number } | null => {
	const searchLen = textLines.length
	if (searchLen === 0 || fileLines.length === 0) return null

	const normalizedSearch = textLines.map(normalizeLine)
	const normalizedFile = fileLines.map(normalizeLine)

	let bestScore = -1
	let bestStart = -1
	const THRESHOLD = 0.7 // minimum average similarity to accept

	// Sliding window over file lines
	const searchStart = Math.max(0, startLine - 1) // 0-indexed
	for (let i = searchStart; i <= normalizedFile.length - searchLen; i++) {
		let totalSim = 0
		for (let j = 0; j < searchLen; j++) {
			totalSim += lineSimilarity(normalizedSearch[j], normalizedFile[i + j])
		}
		const avgSim = totalSim / searchLen
		if (avgSim > bestScore) {
			bestScore = avgSim
			bestStart = i
		}
	}

	if (bestScore >= THRESHOLD && bestStart >= 0) {
		return { startLine: bestStart + 1, endLine: bestStart + searchLen, score: bestScore } // 1-indexed
	}
	return null
}

// finds block.orig in fileContents and return its range in file
// startingAtLine is 1-indexed and inclusive
// returns 1-indexed lines
export const findTextInCode = (text: string, fileContents: string, canFallbackToRemoveWhitespace: boolean, opts: { startingAtLine?: number, returnType: 'lines' }): FindTextResult => {

	const returnAns = (fileContents: string, idx: number) => {
		const startLine = numLinesOfStr(fileContents.substring(0, idx + 1))
		const numLines = numLinesOfStr(text)
		const endLine = startLine + numLines - 1

		return [startLine, endLine] as const
	}

	const startingAtLineIdx = (fileContents: string) => opts?.startingAtLine !== undefined ?
		fileContents.split('\n').slice(0, opts.startingAtLine).join('\n').length // num characters in all lines before startingAtLine
		: 0

	// idx = starting index in fileContents
	let idx = fileContents.indexOf(text, startingAtLineIdx(fileContents))

	// if idx was found
	if (idx !== -1) {
		return returnAns(fileContents, idx)
	}

	if (!canFallbackToRemoveWhitespace)
		return 'Not found' as const

	// try to find it ignoring all whitespace this time
	const strippedText = removeWhitespaceExceptNewlines(text)
	const strippedFile = removeWhitespaceExceptNewlines(fileContents)
	idx = strippedFile.indexOf(strippedText, startingAtLineIdx(strippedFile));

	if (idx !== -1) {
		const lastIdx = strippedFile.lastIndexOf(strippedText)
		if (lastIdx !== idx) return 'Not unique' as const
		return returnAns(strippedFile, idx)
	}

	// Fallback: line-level fuzzy matching
	const textLines = text.split('\n')
	const fileLines = fileContents.split('\n')
	const startLine = opts?.startingAtLine ?? 1
	const fuzzyResult = fuzzyFindLines(textLines, fileLines, startLine)
	if (fuzzyResult) {
		return [fuzzyResult.startLine, fuzzyResult.endLine] as const
	}

	return 'Not found' as const
}
