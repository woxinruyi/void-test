/*--------------------------------------------------------------------------------------
 *  沙箱参数/profile 生成单元测试（add-terminal-sandbox 纯部分）
 *  仅验证生成逻辑；真机隔离生效需运行时端到端验证。
 *--------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { buildBwrapArgs, buildSeatbeltProfile, sandboxAllowsNetwork, sandboxAllowsOutsideWorkspaceWrite, wrapCommandForSandbox, shellSingleQuote } from '../../common/helpers/sandboxArgs.js';

const WS = '/home/u/proj';

suite('Void - terminal sandbox args (generation layer)', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('bwrap (Linux)', () => {
		test('workspace-write: 根只读 + 工作区可写 + 断网', () => {
			const a = buildBwrapArgs({ workspaceDir: WS, mode: 'workspace-write' })!;
			assert.ok(a.join(' ').includes('--ro-bind / /'));
			assert.ok(a.includes('--bind') && a.includes(WS));
			assert.ok(a.includes('--unshare-net'));
		});
		test('read-only: 纯只读(无 --bind 工作区) + 断网', () => {
			const a = buildBwrapArgs({ workspaceDir: WS, mode: 'read-only' })!;
			assert.ok(!a.includes('--bind'));
			assert.ok(a.includes('--unshare-net'));
		});
		test('full → null(不沙箱)', () => assert.strictEqual(buildBwrapArgs({ workspaceDir: WS, mode: 'full' }), null));
	});

	suite('seatbelt (macOS)', () => {
		test('workspace-write: deny default + 读 + 断网 + 写工作区', () => {
			const p = buildSeatbeltProfile({ workspaceDir: WS, mode: 'workspace-write' })!;
			assert.ok(p.includes('(deny default)'));
			assert.ok(p.includes('(allow file-read*)'));
			assert.ok(p.includes('(deny network*)'));
			assert.ok(p.includes(`(allow file-write* (subpath "${WS}"))`));
		});
		test('read-only: 无写工作区', () => {
			const p = buildSeatbeltProfile({ workspaceDir: WS, mode: 'read-only' })!;
			assert.ok(!p.includes('file-write* (subpath'));
		});
		test('full → null', () => assert.strictEqual(buildSeatbeltProfile({ workspaceDir: WS, mode: 'full' }), null));
	});

	suite('能力位', () => {
		test('网络仅 full', () => {
			assert.strictEqual(sandboxAllowsNetwork('read-only'), false);
			assert.strictEqual(sandboxAllowsNetwork('workspace-write'), false);
			assert.strictEqual(sandboxAllowsNetwork('full'), true);
		});
		test('工作区外写仅 full', () => {
			assert.strictEqual(sandboxAllowsOutsideWorkspaceWrite('workspace-write'), false);
			assert.strictEqual(sandboxAllowsOutsideWorkspaceWrite('full'), true);
		});
	});

	suite('命令包装 (wrapCommandForSandbox)', () => {
		test('shellSingleQuote 转义', () => assert.strictEqual(shellSingleQuote(`a'b`), `'a'\\''b'`));
		test('full → 原样', () => assert.strictEqual(wrapCommandForSandbox('npm test', { mode: 'full', platform: 'linux', workspaceDir: WS }), 'npm test'));
		test('win32 无后端 → 原样', () => assert.strictEqual(wrapCommandForSandbox('dir', { mode: 'workspace-write', platform: 'win32', workspaceDir: WS }), 'dir'));
		test('linux → bwrap + bind + bash -c', () => {
			const w = wrapCommandForSandbox('npm test', { mode: 'workspace-write', platform: 'linux', workspaceDir: WS });
			assert.ok(w.startsWith('bwrap '));
			assert.ok(w.includes(WS));
			assert.ok(w.includes("/bin/bash -c 'npm test'"));
		});
		test('darwin → sandbox-exec -p + bash -c', () => {
			const w = wrapCommandForSandbox('ls', { mode: 'read-only', platform: 'darwin', workspaceDir: WS });
			assert.ok(w.startsWith('sandbox-exec -p '));
			assert.ok(w.includes("/bin/bash -c 'ls'"));
		});
		test('命令含单引号安全转义', () => {
			const w = wrapCommandForSandbox(`echo 'hi'`, { mode: 'workspace-write', platform: 'linux', workspaceDir: WS });
			assert.ok(w.includes(`'echo '\\''hi'\\'''`));
		});
	});
});
