/*--------------------------------------------------------------------------------------
 *  哈希嵌入检索质量评测（确定性）。对应 change: improve-rag-hash-embedding
 *  运行：npx tsx src/vs/workbench/contrib/void/test/eval/embedRetrievalEval.ts
 *
 *  指标：MRR（平均倒数排名）、Recall@3。对比 baseline(unigram+bigram) vs improved(停用词降权+char-trigram)。
 *  评定：improved 的 MRR 与 Recall@3 均不劣于 baseline，且在标识符/子词类查询上严格更优。
 *--------------------------------------------------------------------------------------*/

import { hashEmbed, hashEmbedBaseline, cosineSimilarity } from '../../common/helpers/hashEmbed.js'

// 合成代码语料（id + 代码文本）
const CORPUS: { id: string, text: string }[] = [
	{ id: 'auth', text: 'export async function authenticateUser(username, password) { const token = await validateCredentials(username, password); return token }' },
	{ id: 'profile', text: 'function updateUserProfile(userId, profile) { const user = getUserById(userId); user.profile = profile; return saveUser(user) }' },
	{ id: 'parseJson', text: 'export function parseJsonSafely(raw) { try { return JSON.parse(raw) } catch { return null } }' },
	{ id: 'retry', text: 'async function retryWithBackoff(fn, maxAttempts) { for (let i = 0; i < maxAttempts; i++) { try { return await fn() } catch (e) { await sleep(2 ** i * 100) } } }' },
	{ id: 'cache', text: 'class LruCache { constructor(capacity) { this.capacity = capacity; this.map = new Map() } get(key) { return this.map.get(key) } }' },
	{ id: 'http', text: 'export async function fetchWithTimeout(url, timeoutMs) { const controller = new AbortController(); const id = setTimeout(() => controller.abort(), timeoutMs); return fetch(url, { signal: controller.signal }) }' },
	{ id: 'sort', text: 'function quickSort(arr) { if (arr.length <= 1) return arr; const pivot = arr[0]; const rest = arr.slice(1); return [...quickSort(rest.filter(x => x < pivot)), pivot, ...quickSort(rest.filter(x => x >= pivot))] }' },
	{ id: 'debounce', text: 'function debounce(fn, waitMs) { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), waitMs) } }' },
	{ id: 'validate', text: 'export function validateEmailAddress(email) { const re = /^[^@]+@[^@]+\\.[^@]+$/; return re.test(email) }' },
	{ id: 'merkle', text: 'async function buildMerkleTree(files) { const hashes = await Promise.all(files.map(hashFile)); return combineHashes(hashes) }' },
]

// 查询 + 期望命中 id（含标识符子词、自然语言描述）
const QUERIES: { q: string, relevant: string, identifierLike: boolean }[] = [
	{ q: 'authenticate user with password', relevant: 'auth', identifierLike: false },
	{ q: 'update user profile', relevant: 'profile', identifierLike: true },     // 子词：user profile ↔ updateUserProfile
	{ q: 'parse json safely', relevant: 'parseJson', identifierLike: true },     // 子词：parse json ↔ parseJsonSafely
	{ q: 'retry with backoff', relevant: 'retry', identifierLike: true },
	{ q: 'fetch url with timeout', relevant: 'http', identifierLike: false },
	{ q: 'validate email address', relevant: 'validate', identifierLike: true },
	{ q: 'lru cache capacity', relevant: 'cache', identifierLike: false },
	{ q: 'debounce function wait', relevant: 'debounce', identifierLike: false },
]

const rankFor = (embed: (t: string) => Float32Array, query: string): string[] => {
	const qv = embed(query)
	return CORPUS
		.map(c => ({ id: c.id, score: cosineSimilarity(qv, embed(c.text)) }))
		.sort((a, b) => b.score - a.score)
		.map(s => s.id)
}

const evalMetrics = (embed: (t: string) => Float32Array, onlyIdentifier = false) => {
	let rrSum = 0, recallHits = 0, n = 0
	for (const { q, relevant, identifierLike } of QUERIES) {
		if (onlyIdentifier && !identifierLike) continue
		n++
		const ranked = rankFor(embed, q)
		const rank = ranked.indexOf(relevant) + 1 // 1-based
		rrSum += rank > 0 ? 1 / rank : 0
		if (rank > 0 && rank <= 3) recallHits++
	}
	return { mrr: rrSum / n, recallAt3: recallHits / n, n }
}

const baseEmbed = (t: string) => hashEmbedBaseline(t)
const impEmbed = (t: string) => hashEmbed(t)

const baseAll = evalMetrics(baseEmbed)
const impAll = evalMetrics(impEmbed)
const baseId = evalMetrics(baseEmbed, true)
const impId = evalMetrics(impEmbed, true)

console.log('\n=========== 哈希嵌入检索质量评测 ===========\n')
console.log(`  全部查询(${baseAll.n})  : MRR  baseline=${baseAll.mrr.toFixed(3)}  improved=${impAll.mrr.toFixed(3)}`)
console.log(`                  Recall@3  baseline=${baseAll.recallAt3.toFixed(3)}  improved=${impAll.recallAt3.toFixed(3)}`)
console.log(`  标识符/子词(${baseId.n}): MRR  baseline=${baseId.mrr.toFixed(3)}  improved=${impId.mrr.toFixed(3)}`)
console.log(`                  Recall@3  baseline=${baseId.recallAt3.toFixed(3)}  improved=${impId.recallAt3.toFixed(3)}`)

const checks: { name: string, pass: boolean }[] = [
	{ name: 'improved MRR ≥ baseline（全部）', pass: impAll.mrr >= baseAll.mrr - 1e-9 },
	{ name: 'improved Recall@3 ≥ baseline（全部）', pass: impAll.recallAt3 >= baseAll.recallAt3 - 1e-9 },
	{ name: 'improved MRR > baseline（标识符/子词类，严格更优）', pass: impId.mrr > baseId.mrr + 1e-9 },
]

console.log('')
let fail = false
for (const c of checks) { if (!c.pass) fail = true; console.log(`  ${c.pass ? '✅' : '❌'} ${c.name}`) }
console.log(`\n  ${fail ? '❌ 未达标' : '✅ 检索质量改进达标'}`)
console.log('\n===========================================\n')
process.exit(fail ? 1 : 0)
