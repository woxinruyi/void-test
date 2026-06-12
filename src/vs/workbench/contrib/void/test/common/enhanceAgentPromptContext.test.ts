/*--------------------------------------------------------------------------------------
 *  enhance-agent-prompt-and-context 单元测试
 *  覆盖：
 *    - Phase 1：Agent 模式 system prompt 新增段落（Tool Usage Strategy / Error Recovery /
 *               Code Modification Best Practices / Verification After Changes）
 *    - Phase 2：自动上下文注入标签（<git_status> / <project_stack> / <recent_errors>）
 *               以及模式隔离（normal/gather 不注入 agent 专属段落与 recent_errors）
 *    - Phase 3：关键工具 examples 字段存在性 + toolCallDefinitionsXMLString 输出 Tips:
 *
 *  关联 change：openspec/changes/enhance-agent-prompt-and-context/
 *  测试方案：docs/testing/enhance-agent-prompt-test-plan.md
 *--------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { builtinTools, chat_systemMessage } from '../../common/prompt/prompts.js';


suite('enhance-agent-prompt-and-context', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	// 共享的 system message 入参，模拟最小可用 workspace
	const baseSysArgs = {
		workspaceFolders: ['/test/project'],
		directoryStr: 'src/\n  index.ts',
		openedURIs: ['/test/project/src/index.ts'],
		activeURI: '/test/project/src/index.ts',
		persistentTerminalIDs: [] as string[],
		mcpTools: undefined,
		includeXMLToolDefinitions: false,
	};

	// ============================================================
	// Phase 1：Agent 模式新增段落
	// ============================================================
	suite('EAP-1: Phase 1 — Agent 模式新增 Prompt 段落', () => {

		test('EAP-1.1 agent 模式包含 ## Tool Usage Strategy 段落', () => {
			const msg = chat_systemMessage({ ...baseSysArgs, chatMode: 'agent' });
			assert.ok(msg.includes('## Tool Usage Strategy'),
				'agent 模式应注入 Tool Usage Strategy 段落');
		});

		test('EAP-1.2 agent 模式包含 ## Error Recovery 段落', () => {
			const msg = chat_systemMessage({ ...baseSysArgs, chatMode: 'agent' });
			assert.ok(msg.includes('## Error Recovery'),
				'agent 模式应注入 Error Recovery 段落');
		});

		test('EAP-1.3 agent 模式包含 ## Code Modification Best Practices 段落', () => {
			const msg = chat_systemMessage({ ...baseSysArgs, chatMode: 'agent' });
			assert.ok(msg.includes('## Code Modification Best Practices'),
				'agent 模式应注入 Code Modification Best Practices 段落');
		});

		test('EAP-1.4 agent 模式包含 ## Verification After Changes 段落', () => {
			const msg = chat_systemMessage({ ...baseSysArgs, chatMode: 'agent' });
			assert.ok(msg.includes('## Verification After Changes'),
				'agent 模式应注入 Verification After Changes 段落');
		});

		test('EAP-1.5 normal 模式不注入 Tool Usage Strategy / Error Recovery / Verification 段落', () => {
			const msg = chat_systemMessage({ ...baseSysArgs, chatMode: 'normal' });
			assert.ok(!msg.includes('## Tool Usage Strategy'),
				'normal 模式不应注入 Tool Usage Strategy');
			assert.ok(!msg.includes('## Error Recovery'),
				'normal 模式不应注入 Error Recovery');
			assert.ok(!msg.includes('## Verification After Changes'),
				'normal 模式不应注入 Verification After Changes');
			assert.ok(!msg.includes('## Code Modification Best Practices'),
				'normal 模式不应注入 Code Modification Best Practices');
		});

		test('EAP-1.6 gather 模式不注入 agent 专属段落', () => {
			const msg = chat_systemMessage({ ...baseSysArgs, chatMode: 'gather' });
			assert.ok(!msg.includes('## Tool Usage Strategy'),
				'gather 模式不应注入 Tool Usage Strategy');
			assert.ok(!msg.includes('## Error Recovery'),
				'gather 模式不应注入 Error Recovery');
			assert.ok(!msg.includes('## Verification After Changes'),
				'gather 模式不应注入 Verification After Changes');
		});
	});

	// ============================================================
	// Phase 2：自动上下文注入标签
	// ============================================================
	suite('EAP-2: Phase 2 — 自动上下文注入', () => {

		test('EAP-2.1 传入 gitStatusSummary 时注入 <git_status> 标签和内容', () => {
			const msg = chat_systemMessage({
				...baseSysArgs,
				chatMode: 'agent',
				gitStatusSummary: ' M src/file1.ts\n?? src/file2.ts',
			});
			assert.ok(msg.includes('<git_status>'), '应包含 <git_status> 标签');
			assert.ok(msg.includes('src/file1.ts'), '应包含 git status 实际内容');
		});

		test('EAP-2.2 传入 projectStackSummary 时注入 <project_stack> 标签和内容', () => {
			const msg = chat_systemMessage({
				...baseSysArgs,
				chatMode: 'agent',
				projectStackSummary: 'Project: void-test\nScripts: build, lint',
			});
			assert.ok(msg.includes('<project_stack>'), '应包含 <project_stack> 标签');
			assert.ok(msg.includes('void-test'), '应包含项目名称');
			assert.ok(msg.includes('Scripts: build, lint'), '应包含 scripts 列表');
		});

		test('EAP-2.3 agent 模式 + recentErrorsSummary 注入 <recent_errors> 标签', () => {
			const msg = chat_systemMessage({
				...baseSysArgs,
				chatMode: 'agent',
				recentErrorsSummary: 'Error: Cannot find module \'./missing\'',
			});
			assert.ok(msg.includes('<recent_errors>'), 'agent 模式应注入 <recent_errors> 标签');
			assert.ok(msg.includes('Cannot find module'), '应包含具体错误内容');
		});

		test('EAP-2.4 normal 模式即使传入 recentErrorsSummary 也不注入（模式隔离）', () => {
			const msg = chat_systemMessage({
				...baseSysArgs,
				chatMode: 'normal',
				recentErrorsSummary: 'Error: should not appear',
			});
			assert.ok(!msg.includes('<recent_errors>'),
				'normal 模式不应注入 <recent_errors>');
			assert.ok(!msg.includes('should not appear'),
				'normal 模式不应泄漏 recentErrorsSummary 内容');
		});

		test('EAP-2.5 gather 模式不注入 <recent_errors>（仅 agent 注入）', () => {
			const msg = chat_systemMessage({
				...baseSysArgs,
				chatMode: 'gather',
				recentErrorsSummary: 'Error: gather mode should skip',
			});
			assert.ok(!msg.includes('<recent_errors>'),
				'gather 模式不应注入 <recent_errors>');
		});

		test('EAP-2.6 不传入 Phase 2 参数时不注入任何 Phase 2 标签', () => {
			const msg = chat_systemMessage({ ...baseSysArgs, chatMode: 'agent' });
			assert.ok(!msg.includes('<git_status>'), '不传 gitStatusSummary 时不应注入');
			assert.ok(!msg.includes('<project_stack>'), '不传 projectStackSummary 时不应注入');
			assert.ok(!msg.includes('<recent_errors>'), '不传 recentErrorsSummary 时不应注入');
		});

		test('EAP-2.7 空字符串/undefined 不应触发段落注入', () => {
			const msg = chat_systemMessage({
				...baseSysArgs,
				chatMode: 'agent',
				gitStatusSummary: undefined,
				projectStackSummary: undefined,
				recentErrorsSummary: undefined,
			});
			assert.ok(!msg.includes('<git_status>'));
			assert.ok(!msg.includes('<project_stack>'));
			assert.ok(!msg.includes('<recent_errors>'));
		});
	});

	// ============================================================
	// Phase 3：工具 Schema 增强（examples 字段）
	// ============================================================
	suite('EAP-3: Phase 3 — 工具 examples 字段', () => {

		test('EAP-3.1 edit_file 工具具有 examples 字段且非空', () => {
			const tool = builtinTools.edit_file;
			assert.ok(tool.examples, 'edit_file 应有 examples 字段');
			assert.ok(tool.examples.length > 0, 'examples 不应为空');
		});

		test('EAP-3.2 rewrite_file 工具具有 examples 字段且非空', () => {
			const tool = builtinTools.rewrite_file;
			assert.ok(tool.examples, 'rewrite_file 应有 examples 字段');
			assert.ok(tool.examples.length > 0);
		});

		test('EAP-3.3 run_command 工具具有 examples 字段且非空', () => {
			const tool = builtinTools.run_command;
			assert.ok(tool.examples, 'run_command 应有 examples 字段');
			assert.ok(tool.examples.length > 0);
		});

		test('EAP-3.4 search_for_files 工具具有 examples 字段且非空', () => {
			const tool = builtinTools.search_for_files;
			assert.ok(tool.examples, 'search_for_files 应有 examples 字段');
			assert.ok(tool.examples.length > 0);
		});

		test('EAP-3.5 includeXMLToolDefinitions=true 时输出中包含 Tips: 行', () => {
			const msg = chat_systemMessage({
				...baseSysArgs,
				chatMode: 'agent',
				includeXMLToolDefinitions: true,
			});
			assert.ok(msg.includes('Tips:'),
				'XML 工具定义渲染应包含 Tips: 行（来自 examples 字段）');
		});

		test('EAP-3.6 examples 应包含具体可操作指引（关键词检查）', () => {
			// edit_file: 应提示重读获取最新内容
			assert.ok(
				builtinTools.edit_file.examples!.some(e =>
					e.toLowerCase().includes('re-read') || e.includes('old_str')),
				'edit_file examples 应提示如何处理 old_str 不匹配'
			);
			// run_command: 应提及 cwd
			assert.ok(
				builtinTools.run_command.examples!.some(e =>
					e.toLowerCase().includes('cwd')),
				'run_command examples 应提及 cwd 使用建议'
			);
		});
	});

	// ============================================================
	// 综合：完整 system prompt 在 agent 模式同时注入多个段落
	// ============================================================
	suite('EAP-4: 综合验证', () => {

		test('EAP-4.1 agent 模式同时注入所有 Phase 1+2 段落', () => {
			const msg = chat_systemMessage({
				...baseSysArgs,
				chatMode: 'agent',
				gitStatusSummary: ' M src/a.ts',
				projectStackSummary: 'Project: demo',
				recentErrorsSummary: 'Error: xxx',
			});
			// Phase 1 段落
			assert.ok(msg.includes('## Tool Usage Strategy'));
			assert.ok(msg.includes('## Error Recovery'));
			assert.ok(msg.includes('## Code Modification Best Practices'));
			assert.ok(msg.includes('## Verification After Changes'));
			// Phase 2 标签
			assert.ok(msg.includes('<git_status>'));
			assert.ok(msg.includes('<project_stack>'));
			assert.ok(msg.includes('<recent_errors>'));
		});

		test('EAP-4.2 注入后整体长度保持在合理范围（< 50KB）', () => {
			const msg = chat_systemMessage({
				...baseSysArgs,
				chatMode: 'agent',
				includeXMLToolDefinitions: true,
				gitStatusSummary: 'M '.repeat(30),
				projectStackSummary: 'Scripts: ' + 'a, '.repeat(20),
				recentErrorsSummary: 'X'.repeat(800),
			});
			assert.ok(msg.length < 50_000,
				`system prompt 长度应 < 50KB，实际 ${msg.length} 字符`);
		});
	});

});
