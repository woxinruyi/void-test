/*--------------------------------------------------------------------------------------
 *  斜杠命令纯逻辑单元测试（add-slash-commands Phase 1）
 *  评定方式：见 test/eval/slashCommandsEval.ts；本文件固化为 mocha 回归。
 *--------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import {
	parseSlashInput, parseLocalCommandFile, expandTemplate, commandNameFromFilename,
	aggregateCommands, lookupCommand, filterCommandsByPrefix, SlashCommand,
} from '../../common/slashCommands/slashCommandHelpers.js';
import { builtinSlashCommands } from '../../common/slashCommands/builtinSlashCommands.js';

suite('Void - slash commands', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('parseSlashInput', () => {
		test('/plan do x', () => assert.deepStrictEqual(parseSlashInput('/plan do x'), { name: 'plan', args: 'do x' }));
		test('/help', () => assert.deepStrictEqual(parseSlashInput('/help'), { name: 'help', args: '' }));
		test('普通消息 → null', () => assert.strictEqual(parseSlashInput('hello'), null));
		test('路径不误判 → null', () => assert.strictEqual(parseSlashInput('/usr/local/bin'), null));
		test('前导空格', () => assert.deepStrictEqual(parseSlashInput('  /review x'), { name: 'review', args: 'x' }));
		test('空串 → null', () => assert.strictEqual(parseSlashInput(''), null));
	});

	suite('parseLocalCommandFile', () => {
		test('front-matter', () => {
			const r = parseLocalCommandFile('---\ndescription: My cmd\n---\nDo it $ARGS');
			assert.strictEqual(r.description, 'My cmd');
			assert.strictEqual(r.body, 'Do it $ARGS');
		});
		test('无 front-matter', () => {
			const r = parseLocalCommandFile('just body');
			assert.strictEqual(r.description, '');
			assert.strictEqual(r.body, 'just body');
		});
		test('CRLF + 引号', () => {
			const r = parseLocalCommandFile('---\r\ndescription: "Q"\r\n---\r\nbody');
			assert.strictEqual(r.description, 'Q');
			assert.strictEqual(r.body, 'body');
		});
	});

	suite('expandTemplate', () => {
		test('$ARGS 替换', () => assert.strictEqual(expandTemplate('run $ARGS now', 'X'), 'run X now'));
		test('无 $ARGS 追加', () => assert.strictEqual(expandTemplate('do', 'extra'), 'do\n\nextra'));
		test('无 $ARGS 无 args', () => assert.strictEqual(expandTemplate('do', ''), 'do'));
	});

	test('commandNameFromFilename', () => assert.strictEqual(commandNameFromFilename('Make Changelog.md'), 'make-changelog'));

	suite('aggregateCommands 优先级 builtin > local > skill', () => {
		const mk = (name: string, source: SlashCommand['source']): SlashCommand => ({ name, description: source, source });
		const all = aggregateCommands(
			[mk('plan', 'builtin'), mk('dup', 'builtin')],
			[mk('foo', 'local'), mk('dup', 'local')],
			[mk('bar', 'skill'), mk('dup', 'skill')],
		);
		test('去重后数量', () => assert.strictEqual(all.length, 4));
		test('冲突由 builtin 覆盖', () => assert.strictEqual(lookupCommand(all, 'dup')?.source, 'builtin'));
		test('按 name 升序', () => assert.strictEqual(all.map(c => c.name).join(','), 'bar,dup,foo,plan'));
	});

	suite('builtins', () => {
		test('≥3 个', () => assert.ok(builtinSlashCommands.length >= 3));
		test('/help localOnly', () => assert.strictEqual(builtinSlashCommands.find(c => c.name === 'help')?.localOnly, true));
		test('lookup 大小写不敏感', () => assert.strictEqual(lookupCommand(builtinSlashCommands, 'PLAN')?.name, 'plan'));
		test('前缀过滤', () => assert.ok(filterCommandsByPrefix(builtinSlashCommands, 're').every(c => c.name.startsWith('re'))));
	});
});
