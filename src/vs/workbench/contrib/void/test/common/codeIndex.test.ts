/*--------------------------------------------------------------------------------------
 *  代码索引核心算法单元测试
 *  覆盖：FNV-1a 哈希、特征嵌入、余弦相似度、朴素分块、语言检测、向量存储
 *--------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';


// ---- Replicated pure algorithms from codeIndexService.ts (private classes) ----

function fnv1a(str: string): number {
	let hash = 2166136261;
	for (let i = 0; i < str.length; i++) {
		hash ^= str.charCodeAt(i);
		hash = (hash * 16777619) | 0;
	}
	return hash >>> 0;
}

function tokenize(text: string): string[] {
	return text.toLowerCase()
		.replace(/[^a-z0-9_]/g, ' ')
		.split(/\s+/)
		.filter(t => t.length > 1 && t.length < 50);
}

const DIMS = 384;

function hashEmbed(text: string): Float32Array {
	const vec = new Float32Array(DIMS);
	const tokens = tokenize(text);

	for (const token of tokens) {
		const h = fnv1a(token);
		const idx = h % DIMS;
		const sign = (fnv1a(token + '\x01') % 2 === 0) ? 1 : -1;
		vec[idx] += sign;
	}

	for (let i = 0; i < tokens.length - 1; i++) {
		const bigram = tokens[i] + ' ' + tokens[i + 1];
		const h = fnv1a(bigram);
		const idx = h % DIMS;
		const sign = (fnv1a(bigram + '\x01') % 2 === 0) ? 1 : -1;
		vec[idx] += sign * 0.5;
	}

	let norm = 0;
	for (let i = 0; i < DIMS; i++) norm += vec[i] * vec[i];
	norm = Math.sqrt(norm);
	if (norm > 0) for (let i = 0; i < DIMS; i++) vec[i] /= norm;

	return vec;
}

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
	let dot = 0, normA = 0, normB = 0;
	const len = Math.min(a.length, b.length);
	for (let i = 0; i < len; i++) {
		dot += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}
	const denom = Math.sqrt(normA) * Math.sqrt(normB);
	return denom === 0 ? 0 : dot / denom;
}

interface ChunkMetadata {
	id: string;
	filePath: string;
	startLine: number;
	endLine: number;
	language: string;
	symbolName?: string;
	symbolKind?: string;
}

interface SimpleCodeChunk {
	id: string;
	filePath: string;
	startLine: number;
	endLine: number;
	content: string;
	language: string;
	tokenCount: number;
}

function chunkNaive(filePath: string, content: string, language: string): SimpleCodeChunk[] {
	const MAX_CHUNK_CHARS = 2000;
	const chunks: SimpleCodeChunk[] = [];
	const lines = content.split('\n');
	let currentLines: string[] = [];
	let startLine = 1;

	for (let i = 0; i < lines.length; i++) {
		currentLines.push(lines[i]);
		const text = currentLines.join('\n');

		if (text.length >= MAX_CHUNK_CHARS || (i < lines.length - 1 && lines[i].trim() === '' && lines[i + 1].trim() === '' && currentLines.length > 3)) {
			if (currentLines.length > 0) {
				const chunkContent = currentLines.join('\n');
				chunks.push({
					id: `${filePath}:${startLine}:${startLine + currentLines.length - 1}`,
					filePath,
					startLine,
					endLine: startLine + currentLines.length - 1,
					content: chunkContent,
					language,
					tokenCount: Math.ceil(chunkContent.length / 4),
				});
				startLine = i + 2;
				currentLines = [];
			}
		}
	}

	if (currentLines.length > 0) {
		const chunkContent = currentLines.join('\n');
		chunks.push({
			id: `${filePath}:${startLine}:${startLine + currentLines.length - 1}`,
			filePath,
			startLine,
			endLine: startLine + currentLines.length - 1,
			content: chunkContent,
			language,
			tokenCount: Math.ceil(chunkContent.length / 4),
		});
	}

	return chunks;
}

function languageFromExt(ext: string): string {
	const extToLang: Record<string, string> = {
		ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
		py: 'python', rs: 'rust', go: 'go', java: 'java', kt: 'kotlin',
		c: 'c', h: 'c', cpp: 'cpp', hpp: 'cpp', cs: 'csharp',
		rb: 'ruby', php: 'php', swift: 'swift', m: 'objective-c',
		scala: 'scala', sh: 'shell', bash: 'shell', zsh: 'shell',
		sql: 'sql', html: 'html', css: 'css', scss: 'scss', less: 'less',
		json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml',
		md: 'markdown', xml: 'xml', dockerfile: 'dockerfile',
	};
	return extToLang[ext] ?? 'unknown';
}

// Simple in-memory vector store for testing
class TestVectorStore {
	private _items: { embedding: Float32Array; metadata: ChunkMetadata }[] = [];

	insert(embedding: Float32Array, metadata: ChunkMetadata): void {
		this._items.push({ embedding, metadata });
	}

	search(queryEmbedding: Float32Array, topK: number, filter?: { language?: string; searchInFolder?: string }): { metadata: ChunkMetadata; score: number }[] {
		const candidates = filter
			? this._items.filter(item => {
				if (filter.language && item.metadata.language !== filter.language) return false;
				if (filter.searchInFolder && !item.metadata.filePath.startsWith(filter.searchInFolder)) return false;
				return true;
			})
			: this._items;

		const scored = candidates.map(item => ({
			metadata: item.metadata,
			score: cosineSimilarity(queryEmbedding, item.embedding),
		}));
		scored.sort((a, b) => b.score - a.score);
		return scored.slice(0, topK);
	}

	deleteByFilePath(filePath: string): void {
		this._items = this._items.filter(item => item.metadata.filePath !== filePath);
	}

	getIndexedFiles(): string[] {
		return Array.from(new Set(this._items.map(item => item.metadata.filePath)));
	}

	get size(): number { return this._items.length; }
}


// ---- Tests ----

suite('Void - Code Index Algorithms', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('CI-01/02: FNV-1a 哈希', () => {
		test('CI-01: 相同输入产生相同输出（确定性）', () => {
			assert.strictEqual(fnv1a('hello'), fnv1a('hello'));
			assert.strictEqual(fnv1a('function_declaration'), fnv1a('function_declaration'));
			assert.strictEqual(fnv1a(''), fnv1a(''));
		});

		test('CI-02: 不同输入产生不同输出（分散性）', () => {
			const hashes = new Set([
				fnv1a('hello'), fnv1a('world'), fnv1a('function'),
				fnv1a('class'), fnv1a('interface'), fnv1a('const'),
				fnv1a('import'), fnv1a('export'), fnv1a('return'),
				fnv1a('async'), fnv1a('await'), fnv1a('promise'),
			]);
			assert.strictEqual(hashes.size, 12, '12 个不同输入应产生 12 个不同哈希');
		});
	});

	suite('CI-03/04/05/06: 特征嵌入', () => {
		test('CI-03: 输出为 384 维 Float32Array', () => {
			const vec = hashEmbed('function hello() { return 42; }');
			assert.strictEqual(vec.length, 384);
			assert.ok(vec instanceof Float32Array);
		});

		test('CI-04: 嵌入向量已 L2 归一化（范数 ≈ 1.0）', () => {
			const vec = hashEmbed('const x = 1; const y = 2; return x + y;');
			let norm = 0;
			for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
			norm = Math.sqrt(norm);
			assert.ok(Math.abs(norm - 1.0) < 0.001, `范数应接近 1.0，实际为 ${norm}`);
		});

		test('CI-04b: 空文本嵌入为零向量', () => {
			const vec = hashEmbed('');
			let norm = 0;
			for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
			assert.strictEqual(norm, 0, '空文本嵌入应为零向量');
		});

		test('CI-05: 相似文本嵌入相近', () => {
			const v1 = hashEmbed('function add(a, b) { return a + b; }');
			const v2 = hashEmbed('function sum(x, y) { return x + y; }');
			const sim = cosineSimilarity(v1, v2);
			assert.ok(sim > 0.3, `相似函数的相似度应 > 0.3，实际为 ${sim}`);
		});

		test('CI-06: 不相关文本嵌入距离较远', () => {
			const vCode = hashEmbed('function add(a, b) { return a + b; }');
			const vSimilar = hashEmbed('function sum(x, y) { return x + y; }');
			const vDifferent = hashEmbed('the quick brown fox jumps over the lazy dog');
			const simSimilar = cosineSimilarity(vCode, vSimilar);
			const simDifferent = cosineSimilarity(vCode, vDifferent);
			assert.ok(simSimilar > simDifferent, `相似代码(${simSimilar.toFixed(3)}) 应比不相关文本(${simDifferent.toFixed(3)}) 更接近`);
		});
	});

	suite('CI-07: 余弦相似度', () => {
		test('相同向量 → 1.0', () => {
			const v = new Float32Array([1, 2, 3]);
			assert.ok(Math.abs(cosineSimilarity(v, v) - 1.0) < 0.001);
		});

		test('正交向量 → 0.0', () => {
			const v1 = new Float32Array([1, 0, 0]);
			const v2 = new Float32Array([0, 1, 0]);
			assert.ok(Math.abs(cosineSimilarity(v1, v2)) < 0.001);
		});

		test('反向向量 → -1.0', () => {
			const v1 = new Float32Array([1, 2, 3]);
			const v2 = new Float32Array([-1, -2, -3]);
			assert.ok(Math.abs(cosineSimilarity(v1, v2) - (-1.0)) < 0.001);
		});

		test('零向量 → 0.0', () => {
			const v1 = new Float32Array([1, 2, 3]);
			const v2 = new Float32Array([0, 0, 0]);
			assert.strictEqual(cosineSimilarity(v1, v2), 0);
		});
	});

	suite('CI-08/09: 朴素分块', () => {
		test('CI-08: 短文本产生单个块', () => {
			const code = 'const x = 1;\nconst y = 2;\nreturn x + y;';
			const chunks = chunkNaive('/test/file.ts', code, 'typescript');
			assert.strictEqual(chunks.length, 1);
			assert.strictEqual(chunks[0].content, code);
			assert.strictEqual(chunks[0].language, 'typescript');
		});

		test('CI-09: 行号正确（startLine=1, endLine=行数）', () => {
			const code = 'line1\nline2\nline3\nline4\nline5';
			const chunks = chunkNaive('/test/file.ts', code, 'typescript');
			assert.strictEqual(chunks[0].startLine, 1);
			assert.strictEqual(chunks[0].endLine, 5);
		});

		test('CI-08b: 大文本按 2000 字符切分', () => {
			const longLine = 'a'.repeat(100);
			const lines = Array.from({ length: 50 }, () => longLine);
			const code = lines.join('\n');
			assert.ok(code.length > 2000, '测试文本应超过 2000 字符');
			const chunks = chunkNaive('/test/big.ts', code, 'typescript');
			assert.ok(chunks.length > 1, `应产生多个块，实际为 ${chunks.length}`);
		});

		test('CI-08c: 双空行分块', () => {
			const code = 'function a() {}\nconst x = 1;\nconst y = 2;\nconst z = 3;\n\n\nfunction b() {}';
			const chunks = chunkNaive('/test/file.ts', code, 'typescript');
			assert.ok(chunks.length >= 2, `双空行应触发分块，实际块数 ${chunks.length}`);
		});

		test('CI-09b: tokenCount 近似估计', () => {
			const code = 'const message = "hello world";';
			const chunks = chunkNaive('/test/file.ts', code, 'typescript');
			assert.strictEqual(chunks[0].tokenCount, Math.ceil(code.length / 4));
		});
	});

	suite('CI-10: 语言检测', () => {
		const cases: [string, string][] = [
			['ts', 'typescript'], ['tsx', 'typescript'],
			['js', 'javascript'], ['jsx', 'javascript'],
			['py', 'python'], ['rs', 'rust'], ['go', 'go'],
			['java', 'java'], ['cpp', 'cpp'], ['cs', 'csharp'],
			['rb', 'ruby'], ['php', 'php'], ['swift', 'swift'],
			['sh', 'shell'], ['css', 'css'], ['html', 'html'],
			['json', 'json'], ['yaml', 'yaml'], ['yml', 'yaml'],
			['md', 'markdown'], ['sql', 'sql'], ['toml', 'toml'],
		];

		for (const [ext, expected] of cases) {
			test(`.${ext} → ${expected}`, () => {
				assert.strictEqual(languageFromExt(ext), expected);
			});
		}

		test('未知扩展 → unknown', () => {
			assert.strictEqual(languageFromExt('xyz'), 'unknown');
			assert.strictEqual(languageFromExt(''), 'unknown');
		});
	});

	suite('CI-11/12/13: 向量存储', () => {
		test('CI-11: 插入后能搜索到最相似项', () => {
			const store = new TestVectorStore();

			const meta1: ChunkMetadata = { id: '1', filePath: '/src/auth.ts', startLine: 1, endLine: 10, language: 'typescript' };
			const meta2: ChunkMetadata = { id: '2', filePath: '/src/math.ts', startLine: 1, endLine: 10, language: 'typescript' };
			const meta3: ChunkMetadata = { id: '3', filePath: '/src/readme.md', startLine: 1, endLine: 10, language: 'markdown' };

			store.insert(hashEmbed('authentication login password jwt token'), meta1);
			store.insert(hashEmbed('function add subtract multiply divide'), meta2);
			store.insert(hashEmbed('project readme documentation setup guide'), meta3);

			const query = hashEmbed('user authentication login');
			const results = store.search(query, 2);

			assert.strictEqual(results.length, 2);
			assert.strictEqual(results[0].metadata.filePath, '/src/auth.ts', '最相似应为 auth.ts');
		});

		test('CI-12: language 过滤生效', () => {
			const store = new TestVectorStore();

			store.insert(hashEmbed('function hello'), { id: '1', filePath: '/a.ts', startLine: 1, endLine: 5, language: 'typescript' });
			store.insert(hashEmbed('function hello'), { id: '2', filePath: '/b.py', startLine: 1, endLine: 5, language: 'python' });

			const results = store.search(hashEmbed('function'), 10, { language: 'python' });
			assert.strictEqual(results.length, 1);
			assert.strictEqual(results[0].metadata.language, 'python');
		});

		test('CI-12b: searchInFolder 过滤生效', () => {
			const store = new TestVectorStore();

			store.insert(hashEmbed('auth code'), { id: '1', filePath: '/src/auth/login.ts', startLine: 1, endLine: 5, language: 'typescript' });
			store.insert(hashEmbed('auth code'), { id: '2', filePath: '/lib/utils.ts', startLine: 1, endLine: 5, language: 'typescript' });

			const results = store.search(hashEmbed('auth'), 10, { searchInFolder: '/src' });
			assert.strictEqual(results.length, 1);
			assert.strictEqual(results[0].metadata.filePath, '/src/auth/login.ts');
		});

		test('CI-13: deleteByFilePath 正确移除', () => {
			const store = new TestVectorStore();
			store.insert(hashEmbed('code a'), { id: '1', filePath: '/a.ts', startLine: 1, endLine: 5, language: 'typescript' });
			store.insert(hashEmbed('code b'), { id: '2', filePath: '/b.ts', startLine: 1, endLine: 5, language: 'typescript' });

			assert.strictEqual(store.size, 2);
			store.deleteByFilePath('/a.ts');
			assert.strictEqual(store.size, 1);
			assert.deepStrictEqual(store.getIndexedFiles(), ['/b.ts']);
		});
	});
});
