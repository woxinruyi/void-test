/*--------------------------------------------------------------------------------------
 *  代码检索用的哈希嵌入（纯函数，可单元测试 / 可评测）
 *
 *  对应 change: improve-rag-hash-embedding
 *
 *  背景：codeIndexService 的"嵌入"是 FNV-1a 特征哈希（无神经模型，零依赖）。原实现仅
 *  unigram + word-bigram、各 token 等权。两大检索质量短板：
 *    1) 无词权重：const/return/function/import 等高频样板 token 与判别性标识符等权，淹没相关性。
 *    2) 无子词匹配：tokenize 按非字母数字切分，'getUserName' 是单 token，查询 'user name' 完全不重叠。
 *
 *  本模块在保持"零外部依赖"的前提下补两条业界标准做法（对标 Sourcegraph/Zoekt 的 trigram 代码检索 +
 *  TF-IDF 思路的轻量化）：停用词降权 + 字符 trigram 子词特征。仍是 FNV-1a 特征哈希 + 余弦。
 *--------------------------------------------------------------------------------------*/

const FNV_OFFSET = 2166136261
const FNV_PRIME = 16777619

/** FNV-1a 32-bit（无符号） */
export const fnv1a = (str: string): number => {
	let hash = FNV_OFFSET
	for (let i = 0; i < str.length; i++) {
		hash ^= str.charCodeAt(i)
		hash = (hash * FNV_PRIME) | 0
	}
	return hash >>> 0
}

/** 切词：小写、非 [a-z0-9_] 视作分隔、长度 (1,50) */
export const tokenizeForEmbed = (text: string): string[] =>
	text.toLowerCase()
		.replace(/[^a-z0-9_]/g, ' ')
		.split(/\s+/)
		.filter(t => t.length > 1 && t.length < 50)

/** 通用停用词（编程关键字 + 高频英文 + 高频样板标识符）——降权而非剔除，避免误伤。 */
export const STOP_TOKENS: ReadonlySet<string> = new Set([
	// JS/TS/通用关键字
	'const', 'let', 'var', 'function', 'return', 'import', 'export', 'from', 'default',
	'class', 'interface', 'type', 'enum', 'extends', 'implements', 'public', 'private',
	'protected', 'static', 'readonly', 'async', 'await', 'new', 'this', 'super', 'void',
	'null', 'undefined', 'true', 'false', 'if', 'else', 'for', 'while', 'switch', 'case',
	'break', 'continue', 'throw', 'try', 'catch', 'finally', 'typeof', 'instanceof',
	'in', 'of', 'as', 'is', 'do', 'yield',
	// 常见样板/通用名
	'value', 'result', 'data', 'item', 'items', 'list', 'string', 'number', 'boolean',
	'object', 'array', 'name', 'id', 'key', 'index', 'length', 'get', 'set', 'add',
	'push', 'map', 'filter', 'foreach', 'console', 'log', 'error', 'err', 'args', 'arg',
	'params', 'param', 'props', 'prop', 'self', 'init', 'main', 'temp', 'tmp', 'val',
	// 高频英文虚词
	'the', 'and', 'or', 'not', 'with', 'for', 'into', 'that', 'this', 'when', 'how', 'what',
])

export interface HashEmbedOptions {
	dims?: number
	/** 停用词降权系数（默认 0.15）；设 1 关闭降权 */
	stopWeight?: number
	/** 是否加入字符 trigram 子词特征（默认 true） */
	charNgrams?: boolean
}

/** 把一个特征哈希进向量（带符号 trick，缓解碰撞） */
const addFeature = (vec: Float32Array, feature: string, weight: number, dims: number): void => {
	const h = fnv1a(feature)
	const idx = h % dims
	const sign = (fnv1a(feature + '\x01') % 2 === 0) ? 1 : -1
	vec[idx] += sign * weight
}

/** 字符 trigram（滑窗，token 长度 ≥ 3 才有意义） */
const charTrigrams = (token: string): string[] => {
	if (token.length < 3) return []
	const out: string[] = []
	for (let i = 0; i <= token.length - 3; i++) out.push(token.slice(i, i + 3))
	return out
}

/**
 * 改进版哈希嵌入：unigram（停用词降权）+ word-bigram + char-trigram（子词）。L2 归一化。
 */
export const hashEmbed = (text: string, options: HashEmbedOptions = {}): Float32Array => {
	const dims = options.dims ?? 384
	const stopWeight = options.stopWeight ?? 0.15
	const useNgrams = options.charNgrams ?? true

	const vec = new Float32Array(dims)
	const tokens = tokenizeForEmbed(text)

	// 1) unigram：停用词降权
	for (const token of tokens) {
		const w = STOP_TOKENS.has(token) ? stopWeight : 1
		addFeature(vec, token, w, dims)
	}

	// 2) word-bigram：局部语序（权重 0.5）
	for (let i = 0; i < tokens.length - 1; i++) {
		addFeature(vec, tokens[i] + ' ' + tokens[i + 1], 0.5, dims)
	}

	// 3) char-trigram：子词匹配（权重 0.35），停用词不产出子词特征以免再度放大样板
	if (useNgrams) {
		for (const token of tokens) {
			if (STOP_TOKENS.has(token)) continue
			for (const tri of charTrigrams(token)) addFeature(vec, '#' + tri, 0.35, dims)
		}
	}

	// L2 归一化
	let norm = 0
	for (let i = 0; i < dims; i++) norm += vec[i] * vec[i]
	norm = Math.sqrt(norm)
	if (norm > 0) for (let i = 0; i < dims; i++) vec[i] /= norm
	return vec
}

/**
 * 原基线嵌入（unigram + word-bigram，等权，无子词）——仅供评测对比，勿用于生产路径。
 */
export const hashEmbedBaseline = (text: string, dims = 384): Float32Array => {
	const vec = new Float32Array(dims)
	const tokens = tokenizeForEmbed(text)
	for (const token of tokens) addFeature(vec, token, 1, dims)
	for (let i = 0; i < tokens.length - 1; i++) addFeature(vec, tokens[i] + ' ' + tokens[i + 1], 0.5, dims)
	let norm = 0
	for (let i = 0; i < dims; i++) norm += vec[i] * vec[i]
	norm = Math.sqrt(norm)
	if (norm > 0) for (let i = 0; i < dims; i++) vec[i] /= norm
	return vec
}

/** 余弦相似度 */
export const cosineSimilarity = (a: Float32Array, b: Float32Array): number => {
	let dot = 0, normA = 0, normB = 0
	const len = Math.min(a.length, b.length)
	for (let i = 0; i < len; i++) {
		dot += a[i] * b[i]
		normA += a[i] * a[i]
		normB += b[i] * b[i]
	}
	const denom = Math.sqrt(normA) * Math.sqrt(normB)
	return denom === 0 ? 0 : dot / denom
}
