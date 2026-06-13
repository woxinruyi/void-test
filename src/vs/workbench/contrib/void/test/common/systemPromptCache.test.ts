/*--------------------------------------------------------------------------------------
 *  系统提示缓存切分单元测试（optimize-system-prompt-caching）
 *--------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { splitSystemForCaching, stripCacheMarker, CACHE_BREAKPOINT_MARKER, chat_systemMessage } from '../../common/prompt/prompts.js';

suite('Void - system prompt caching split', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('split / strip 纯逻辑', () => {
		test('标记前后切分', () => {
			const r = splitSystemForCaching(`STABLE${CACHE_BREAKPOINT_MARKER}VOLATILE`);
			assert.strictEqual(r.cacheable, 'STABLE');
			assert.strictEqual(r.volatile, 'VOLATILE');
		});
		test('无标记 → 整体可缓存', () => {
			const r = splitSystemForCaching('no marker');
			assert.strictEqual(r.cacheable, 'no marker');
			assert.strictEqual(r.volatile, null);
		});
		test('strip 去除标记', () => {
			assert.ok(!stripCacheMarker(`A\n\n\n${CACHE_BREAKPOINT_MARKER}\n\n\nB`).includes(CACHE_BREAKPOINT_MARKER));
		});
	});

	suite('chat_systemMessage 结构（agent）', () => {
		const sys = chat_systemMessage({
			workspaceFolders: ['/ws'], openedURIs: ['/ws/a.ts'], activeURI: '/ws/ACTIVEFILE.ts',
			persistentTerminalIDs: [], directoryStr: 'DIRTREE_MARKER', chatMode: 'agent',
			mcpTools: undefined, includeXMLToolDefinitions: true,
		} as any);
		const { cacheable, volatile } = splitSystemForCaching(sys);

		test('含断点标记', () => assert.ok(sys.includes(CACHE_BREAKPOINT_MARKER)));
		test('稳定块含规则 + important notes', () => {
			assert.ok(cacheable.includes('Autonomy and Persistence'));
			assert.ok(cacheable.includes('Important notes'));
		});
		test('稳定块不含易变内容(活动文件/目录/日期)', () => {
			assert.ok(!cacheable.includes('ACTIVEFILE'));
			assert.ok(!cacheable.includes('DIRTREE_MARKER'));
			assert.ok(!cacheable.includes("Today's date"));
		});
		test('易变块含活动文件/目录/日期', () => {
			assert.ok(volatile && volatile.includes('ACTIVEFILE'));
			assert.ok(volatile && volatile.includes('DIRTREE_MARKER'));
			assert.ok(volatile && volatile.includes("Today's date"));
		});
	});
});
