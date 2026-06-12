/*--------------------------------------------------------------------------------------
 *  工具参数验证 + 模糊编辑匹配 + Provider工具格式集成 单元测试
 *  覆盖：工具名完整性、审批分类、LCS 行相似度、模糊查找行、危险命令硬审批、
 *        Provider-ToolFormat 集成（确保 OAI 兼容 provider 返回 openai-style）
 *--------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { builtinToolNames, builtinTools, chat_systemMessage } from '../../common/prompt/prompts.js';
import { approvalTypeOfBuiltinToolName } from '../../common/toolsServiceTypes.js';
import { DEFAULT_MUST_ALWAYS_APPROVE_PATTERNS } from '../../common/voidSettingsTypes.js';
import { matchesAllowlist } from '../../common/helpers/autoApprove.js';
import { getModelCapabilities } from '../../common/modelCapabilities.js';
import type { ProviderName } from '../../common/voidSettingsTypes.js';


// ---- Replicated pure algorithms from editCodeService.ts (private functions) ----

const normalizeLine = (line: string): string => line.replace(/\s+/g, ' ').trim().toLowerCase();

const lineSimilarity = (a: string, b: string): number => {
	if (a === b) return 1;
	if (a.length === 0 || b.length === 0) return 0;
	const la = a.length, lb = b.length;
	if (la > 500 || lb > 500) {
		return a.includes(b) || b.includes(a) ? 0.8 : 0;
	}
	const prev = new Uint16Array(lb + 1);
	const curr = new Uint16Array(lb + 1);
	for (let i = 1; i <= la; i++) {
		curr.fill(0);
		for (let j = 1; j <= lb; j++) {
			if (a[i - 1] === b[j - 1]) curr[j] = prev[j - 1] + 1;
			else curr[j] = Math.max(prev[j], curr[j - 1]);
		}
		prev.set(curr);
	}
	const lcsLen = prev[lb];
	return (2 * lcsLen) / (la + lb);
};

const fuzzyFindLines = (textLines: string[], fileLines: string[], startLine: number): { startLine: number; endLine: number; score: number } | null => {
	const searchLen = textLines.length;
	if (searchLen === 0 || fileLines.length === 0) return null;

	const normalizedSearch = textLines.map(normalizeLine);
	const normalizedFile = fileLines.map(normalizeLine);

	let bestScore = -1;
	let bestStart = -1;
	const THRESHOLD = 0.7;

	const searchStart = Math.max(0, startLine - 1);
	for (let i = searchStart; i <= normalizedFile.length - searchLen; i++) {
		let totalSim = 0;
		for (let j = 0; j < searchLen; j++) {
			totalSim += lineSimilarity(normalizedSearch[j], normalizedFile[i + j]);
		}
		const avgSim = totalSim / searchLen;
		if (avgSim > bestScore) {
			bestScore = avgSim;
			bestStart = i;
		}
	}

	if (bestScore >= THRESHOLD && bestStart >= 0) {
		return { startLine: bestStart + 1, endLine: bestStart + searchLen, score: bestScore };
	}
	return null;
};


// ---- Tests ----

suite('Void - Tool Validation & Fuzzy Edit', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('TV-01: builtinToolNames 完整性', () => {
		const expectedTools = [
			'read_file', 'ls_dir', 'get_dir_tree',
			'search_pathnames_only', 'search_for_files', 'search_in_file', 'read_lint_errors',
			'edit_file', 'batch_edit', 'rewrite_file', 'create_file_or_folder', 'delete_file_or_folder',
			'run_command', 'open_persistent_terminal', 'run_persistent_command', 'kill_persistent_terminal',
			'go_to_definition', 'find_references', 'get_type_definition', 'list_symbols', 'find_implementations',
			'semantic_search',
			'update_plan',
			'dispatch_agents',
			'web_search', 'read_url',
			'save_memory', 'delete_memory',
			'remote_repo_tree', 'remote_repo_read', 'remote_repo_search',
		];

		test('包含所有预期工具', () => {
			for (const tool of expectedTools) {
				assert.ok(builtinToolNames.includes(tool as any), `缺失工具: ${tool}`);
			}
		});

		test('工具总数 ≥ 31', () => {
			assert.ok(builtinToolNames.length >= 31, `工具数应 ≥ 31，实际为 ${builtinToolNames.length}`);
		});
	});

	suite('TV-02: approvalType 分类正确', () => {
		test('只读工具无 approvalType', () => {
			const readOnlyTools = [
				'read_file', 'ls_dir', 'get_dir_tree',
				'search_pathnames_only', 'search_for_files', 'search_in_file', 'read_lint_errors',
				'go_to_definition', 'find_references', 'get_type_definition', 'list_symbols', 'find_implementations',
				'semantic_search', 'update_plan', 'dispatch_agents',
				'web_search', 'read_url', 'save_memory', 'delete_memory',
				'remote_repo_tree', 'remote_repo_read', 'remote_repo_search',
			];
			for (const tool of readOnlyTools) {
				assert.strictEqual(
					(approvalTypeOfBuiltinToolName as any)[tool],
					undefined,
					`${tool} 不应需要审批`
				);
			}
		});

		test('编辑工具归类为 edits', () => {
			const editTools = ['edit_file', 'batch_edit', 'rewrite_file', 'create_file_or_folder', 'delete_file_or_folder'];
			for (const tool of editTools) {
				assert.strictEqual(
					(approvalTypeOfBuiltinToolName as any)[tool],
					'edits',
					`${tool} 应为 edits 类`
				);
			}
		});

		test('终端工具归类为 terminal', () => {
			const terminalTools = ['run_command', 'run_persistent_command', 'open_persistent_terminal', 'kill_persistent_terminal'];
			for (const tool of terminalTools) {
				assert.strictEqual(
					(approvalTypeOfBuiltinToolName as any)[tool],
					'terminal',
					`${tool} 应为 terminal 类`
				);
			}
		});
	});

	suite('TV-05: mustAlwaysApprovePatterns 危险命令', () => {
		test('危险命令被识别', () => {
			const dangerous = [
				'rm -rf /',
				'sudo apt install malware',
				'git push --force origin main',
				'npm publish',
				'docker rm container-id',
				'kubectl delete pod my-pod',
			];
			for (const cmd of dangerous) {
				assert.strictEqual(
					matchesAllowlist(cmd, DEFAULT_MUST_ALWAYS_APPROVE_PATTERNS),
					true,
					`应匹配危险命令: ${cmd}`
				);
			}
		});

		test('安全命令不被误判', () => {
			const safe = [
				'git status',
				'ls -la',
				'cat README.md',
				'node --version',
				'npm test',
			];
			for (const cmd of safe) {
				assert.strictEqual(
					matchesAllowlist(cmd, DEFAULT_MUST_ALWAYS_APPROVE_PATTERNS),
					false,
					`不应匹配安全命令: ${cmd}`
				);
			}
		});
	});

	suite('TV-06/07/08: LCS 行相似度', () => {
		test('TV-07: 完全匹配 → 1.0', () => {
			assert.strictEqual(lineSimilarity('hello world', 'hello world'), 1.0);
		});

		test('TV-08: 完全不同 → 0.0 或极低', () => {
			const sim = lineSimilarity('abc', 'xyz');
			assert.ok(sim < 0.1, `完全不同的字符串相似度应 < 0.1，实际 ${sim}`);
		});

		test('TV-06: 已知字符串对正确评分', () => {
			// "const x = 1;" vs "const y = 1;" — 高度相似
			const sim = lineSimilarity('const x = 1;', 'const y = 1;');
			assert.ok(sim > 0.8, `近似行相似度应 > 0.8，实际 ${sim}`);
		});

		test('空字符串处理', () => {
			assert.strictEqual(lineSimilarity('', ''), 1, '两个空字符串完全相等 → 1.0');
			assert.strictEqual(lineSimilarity('abc', ''), 0);
			assert.strictEqual(lineSimilarity('', 'xyz'), 0);
		});

		test('normalize 处理空白', () => {
			const a = normalizeLine('  const   x = 1;  ');
			const b = normalizeLine('const x = 1;');
			assert.strictEqual(a, b);
		});
	});

	suite('TV-09: 模糊查找行（滑动窗口）', () => {
		test('精确匹配 → 找到', () => {
			const fileLines = ['line1', 'line2', 'const x = 1;', 'const y = 2;', 'line5'];
			const searchLines = ['const x = 1;', 'const y = 2;'];
			const result = fuzzyFindLines(searchLines, fileLines, 1);
			assert.ok(result !== null, '应找到匹配');
			assert.strictEqual(result!.startLine, 3);
			assert.strictEqual(result!.endLine, 4);
			assert.ok(result!.score >= 0.99);
		});

		test('近似匹配 → 找到（变量名微调）', () => {
			const fileLines = [
				'function add(a, b) {',
				'  return a + b;',
				'}',
			];
			const searchLines = [
				'function add(x, y) {',
				'  return x + y;',
				'}',
			];
			const result = fuzzyFindLines(searchLines, fileLines, 1);
			assert.ok(result !== null, '应找到近似匹配');
			assert.strictEqual(result!.startLine, 1);
			assert.ok(result!.score >= 0.7, `分数应 ≥ 0.7，实际 ${result!.score}`);
		});

		test('完全不匹配 → null', () => {
			const fileLines = ['line1', 'line2', 'line3'];
			const searchLines = ['completely different text here', 'nothing matches at all'];
			const result = fuzzyFindLines(searchLines, fileLines, 1);
			assert.strictEqual(result, null, '不匹配时应返回 null');
		});

		test('空输入 → null', () => {
			assert.strictEqual(fuzzyFindLines([], ['a'], 1), null);
			assert.strictEqual(fuzzyFindLines(['a'], [], 1), null);
		});
	});

	suite('TV-10: 工具定义参数完整', () => {
		test('semantic_search 有 query 和 maxResults 参数', () => {
			const tool = builtinTools['semantic_search'];
			assert.ok(tool, 'semantic_search 工具应存在');
			assert.ok(tool.params.query, '应有 query 参数');
			assert.ok(tool.params.max_results, '应有 max_results 参数');
		});

		test('remote_repo_tree 有 owner/repo/branch 参数', () => {
			const tool = builtinTools['remote_repo_tree'];
			assert.ok(tool, 'remote_repo_tree 工具应存在');
			assert.ok(tool.params.owner, '应有 owner 参数');
			assert.ok(tool.params.repo, '应有 repo 参数');
			assert.ok(tool.params.branch, '应有 branch 参数');
		});

		test('save_memory 有 content 参数', () => {
			const tool = builtinTools['save_memory'];
			assert.ok(tool, 'save_memory 工具应存在');
			assert.ok(tool.params.content, '应有 content 参数');
		});

		test('update_plan 有 todos 参数', () => {
			const tool = builtinTools['update_plan'];
			assert.ok(tool, 'update_plan 工具应存在');
			assert.ok(tool.params.todos, '应有 todos 参数');
		});

		test('dispatch_agents 有 tasks 参数', () => {
			const tool = builtinTools['dispatch_agents'];
			assert.ok(tool, 'dispatch_agents 工具应存在');
			assert.ok(tool.params.tasks, '应有 tasks 参数');
		});

		test('每个工具都有 name 和 description', () => {
			for (const toolName of builtinToolNames) {
				const tool = builtinTools[toolName];
				assert.ok(tool.name, `${toolName} 应有 name`);
				assert.ok(tool.description, `${toolName} 应有 description`);
				assert.ok(tool.description.length > 10, `${toolName} description 应 > 10 字符`);
			}
		});
	});

	suite('TV-10b: 系统提示注入验证', () => {
		const baseSysArgs = {
			workspaceFolders: ['/test/project'],
			directoryStr: 'src/\n  index.ts\n  app.ts',
			openedURIs: ['/test/project/src/index.ts'],
			activeURI: '/test/project/src/index.ts',
			persistentTerminalIDs: [],
			chatMode: 'agent' as const,
			mcpTools: undefined,
			includeXMLToolDefinitions: false,
		};

		test('含 <memories> 标签', () => {
			const msg = chat_systemMessage({
				...baseSysArgs,
				memoriesSummary: '- 项目使用 MIT 许可证',
			});
			assert.ok(msg.includes('<memories>'), '系统提示应包含 <memories> 标签');
			assert.ok(msg.includes('MIT 许可证'), '系统提示应包含 memory 内容');
		});

		test('含 <current_plan> 标签', () => {
			const msg = chat_systemMessage({
				...baseSysArgs,
				currentPlanSummary: '✅ 任务1\n⏳ 任务2',
			});
			assert.ok(msg.includes('<current_plan>'), '系统提示应包含 <current_plan> 标签');
		});

		test('含 <ide_activity> 标签', () => {
			const msg = chat_systemMessage({
				...baseSysArgs,
				ideActivitySummary: 'Cursor at line 42 in index.ts',
			});
			assert.ok(msg.includes('<ide_activity>'), '系统提示应包含 <ide_activity> 标签');
		});

		test('含 <recently_modified> 标签', () => {
			const msg = chat_systemMessage({
				...baseSysArgs,
				recentlyModifiedFiles: ['/test/project/src/app.ts'],
			});
			assert.ok(msg.includes('<recently_modified>'), '系统提示应包含 <recently_modified> 标签');
		});

		test('无可选参数时不注入对应标签', () => {
			const msg = chat_systemMessage(baseSysArgs);
			assert.ok(!msg.includes('<memories>'), '无 memories 时不应注入');
			assert.ok(!msg.includes('<current_plan>'), '无 plan 时不应注入');
			assert.ok(!msg.includes('<ide_activity>'), '无 activity 时不应注入');
			assert.ok(!msg.includes('<recently_modified>'), '无 modified files 时不应注入');
		});
	});

	suite('TV-11: Provider-ToolFormat 集成（OAI 兼容 provider 必须返回 openai-style）', () => {
		// 所有使用 _sendOpenAICompatibleChat 的 provider
		// 这些 provider 通过 OpenAI SDK 发送请求，只有 specialToolFormat === 'openai-style'
		// 时才会在 API 请求体中附带 tools 字段
		const oaiCompatibleProviders: ProviderName[] = [
			'openAI', 'xAI', 'deepseek', 'groq',
			'openRouter', 'vLLM', 'ollama', 'openAICompatible',
			'mistral', 'liteLLM', 'lmStudio',
			'googleVertex', 'microsoftAzure', 'awsBedrock',
			'aiyiwei',
		];

		// 各种可能遇到的模型名，包括已知和未知的
		const testModelNames = [
			'gpt-4o',
			'claude-3.5-sonnet',
			'deepseek-chat',
			'qwen-plus',
			'gemini-1.5-pro',
			'llama-3-70b',
			'unknown-model-xyz',     // 完全未知的模型
			'my-custom-finetune',    // 用户自定义微调模型
		];

		for (const provider of oaiCompatibleProviders) {
			suite(`${provider}`, () => {
				for (const modelName of testModelNames) {
					test(`${modelName} → specialToolFormat 不为 anthropic-style/gemini-style`, () => {
						const caps = getModelCapabilities(provider, modelName, undefined);
						// OAI 兼容 provider 绝不能返回 anthropic-style 或 gemini-style
						assert.notStrictEqual(
							caps.specialToolFormat,
							'anthropic-style',
							`${provider}/${modelName}: OAI 兼容 provider 不应返回 anthropic-style`
						);
						assert.notStrictEqual(
							caps.specialToolFormat,
							'gemini-style',
							`${provider}/${modelName}: OAI 兼容 provider 不应返回 gemini-style`
						);
					});
				}
			});
		}

		// aiyiwei 作为聚合 provider，必须严格返回 openai-style（不允许 undefined/XML fallback）
		suite('aiyiwei 严格要求 openai-style', () => {
			for (const modelName of testModelNames) {
				test(`${modelName} → specialToolFormat === 'openai-style'`, () => {
					const caps = getModelCapabilities('aiyiwei', modelName, undefined);
					assert.strictEqual(
						caps.specialToolFormat,
						'openai-style',
						`aiyiwei/${modelName}: 必须返回 openai-style，实际为 ${caps.specialToolFormat || 'undefined'}`
					);
				});
			}
		});
	});
});
