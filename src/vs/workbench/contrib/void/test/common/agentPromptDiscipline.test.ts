/*--------------------------------------------------------------------------------------
 *  Agent 提示词纪律单元测试（refine-agent-prompt-discipline）
 *--------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { chat_systemMessage } from '../../common/prompt/prompts.js';

const mk = (chatMode: any) => chat_systemMessage({
	workspaceFolders: ['/ws'], openedURIs: [], activeURI: '/ws/a.ts', persistentTerminalIDs: [],
	directoryStr: 'D', chatMode, mcpTools: undefined, includeXMLToolDefinitions: true,
} as any);

suite('Void - agent prompt discipline', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const agent = mk('agent');
	const normal = mk('normal');

	test('agent 含 Scope and Output Discipline 段', () => assert.ok(agent.includes('## Scope and Output Discipline')));
	test('只做被要求的改动', () => assert.ok(agent.includes('Make ONLY the changes the user requested')));
	test('不重构无关相邻代码', () => assert.ok(agent.includes('Do not refactor or "improve" adjacent code')));
	test('结论先行', () => assert.ok(agent.includes('Lead with the outcome')));
	test('normal 模式不注入（模式隔离）', () => assert.ok(!normal.includes('## Scope and Output Discipline')));
	test('不再硬禁表格', () => assert.ok(!agent.includes('Do NOT write tables')));
	test('必要时可用表格', () => assert.ok(agent.includes('Use tables only when')));
});
