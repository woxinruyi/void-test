/*--------------------------------------------------------------------------------------
 *  斜杠命令服务（renderer）：聚合 builtin / skill / local 三源，解析并展开用户输入。
 *  对应 change: add-slash-commands（Phase 1）
 *
 *  纯逻辑在 common/slashCommands/*；本服务只负责注入 settings/file/request 后调用它们，
 *  并实现技能正文的渐进式加载（仅在被调起时载入，不进常驻系统提示）。
 *--------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IRequestService, asText } from '../../../../platform/request/common/request.js';
import { IVoidSettingsService } from '../common/voidSettingsService.js';
import { SkillInfo } from '../common/voidSettingsTypes.js';
import {
	SlashCommand, parseSlashInput, parseLocalCommandFile, expandTemplate,
	commandNameFromFilename, aggregateCommands, lookupCommand,
} from '../common/slashCommands/slashCommandHelpers.js';
import { builtinSlashCommands } from '../common/slashCommands/builtinSlashCommands.js';

export type SlashResolution =
	| { kind: 'local-render'; command: SlashCommand; text: string }              // 本地渲染（如 /help），不发 LLM
	| { kind: 'inject'; command: SlashCommand; instruction: string; args: string } // 前置指令注入本轮

export interface ISlashCommandService {
	readonly _serviceBrand: undefined;
	/** 当前可用命令（builtin + 已启用技能 + 本地 .void/commands），供输入框候选。 */
	listCommands(): Promise<SlashCommand[]>;
	/** 若输入是已注册命令则返回解析结果，否则 null（普通消息走原流程）。 */
	resolveInput(text: string): Promise<SlashResolution | null>;
}

export const ISlashCommandService = createDecorator<ISlashCommandService>('voidSlashCommandService');

const LOCAL_COMMANDS_DIR = '.void/commands';

class SlashCommandService extends Disposable implements ISlashCommandService {
	_serviceBrand: undefined;

	constructor(
		@IVoidSettingsService private readonly _settings: IVoidSettingsService,
		@IFileService private readonly _fileService: IFileService,
		@IWorkspaceContextService private readonly _workspace: IWorkspaceContextService,
		@IRequestService private readonly _requestService: IRequestService,
	) {
		super();
	}

	// ---- 三源 ----

	private _skillByCommandName(): Map<string, SkillInfo> {
		const out = new Map<string, SkillInfo>();
		const installed = this._settings.state.installedSkills ?? {};
		for (const id in installed) {
			const s = installed[id];
			if (!s || !s.enabled) continue;
			const name = commandNameFromFilename(s.name || s.id);
			if (name) out.set(name, s);
		}
		return out;
	}

	private async _localByCommandName(): Promise<Map<string, { description: string; body: string }>> {
		const out = new Map<string, { description: string; body: string }>();
		const root = this._workspace.getWorkspace().folders[0]?.uri;
		if (!root) return out;
		const dir = URI.joinPath(root, LOCAL_COMMANDS_DIR);
		try {
			if (!(await this._fileService.exists(dir))) return out;
			const stat = await this._fileService.resolve(dir);
			for (const child of stat.children ?? []) {
				if (child.isDirectory || !child.name.toLowerCase().endsWith('.md')) continue;
				try {
					const content = (await this._fileService.readFile(child.resource)).value.toString();
					const { description, body } = parseLocalCommandFile(content);
					const name = commandNameFromFilename(child.name);
					if (name) out.set(name, { description, body });
				} catch { /* 跳过坏文件 */ }
			}
		} catch { /* 目录读失败：本地源为空 */ }
		return out;
	}

	async listCommands(): Promise<SlashCommand[]> {
		const skills = [...this._skillByCommandName().entries()].map(([name, s]): SlashCommand =>
			({ name, description: s.description || 'Agent skill', source: 'skill' }));
		const locals = [...(await this._localByCommandName()).entries()].map(([name, l]): SlashCommand =>
			({ name, description: l.description || 'Local command', source: 'local' }));
		const builtins = builtinSlashCommands.map((b): SlashCommand =>
			({ name: b.name, description: b.description, source: 'builtin', localOnly: b.localOnly }));
		return aggregateCommands(builtins, locals, skills);
	}

	async resolveInput(text: string): Promise<SlashResolution | null> {
		const parsed = parseSlashInput(text);
		if (!parsed) return null;
		const all = await this.listCommands();
		const command = lookupCommand(all, parsed.name);
		if (!command) return null; // 未命中：当普通消息处理

		if (command.source === 'builtin') {
			const b = builtinSlashCommands.find(x => x.name === command.name)!;
			if (b.localOnly) {
				return { kind: 'local-render', command, text: this._renderHelp(all) };
			}
			return { kind: 'inject', command, instruction: b.expand(parsed.args), args: parsed.args };
		}

		if (command.source === 'local') {
			const local = (await this._localByCommandName()).get(command.name);
			const instruction = local ? expandTemplate(local.body, parsed.args) : '';
			return { kind: 'inject', command, instruction, args: parsed.args };
		}

		// skill：渐进式加载正文
		const skill = this._skillByCommandName().get(command.name);
		const body = skill ? await this._loadSkillBody(skill) : '';
		const instruction = body
			? expandTemplate(body, parsed.args)
			: (skill?.description ?? '');
		return { kind: 'inject', command, instruction, args: parsed.args };
	}

	private _renderHelp(commands: readonly SlashCommand[]): string {
		const lines = commands.map(c => `  /${c.name} — ${c.description} [${c.source}]`);
		return `可用斜杠命令：\n${lines.join('\n')}`;
	}

	/** 技能正文按需加载：优先 body 缓存 → 否则 bodyUrl 拉取（经 IRequestService 代理，失败降级空串）。 */
	private async _loadSkillBody(skill: SkillInfo): Promise<string> {
		if (skill.body) return skill.body;
		if (!skill.bodyUrl) return '';
		try {
			const context = await this._requestService.request({ type: 'GET', url: skill.bodyUrl }, CancellationToken.None);
			const body = (await asText(context)) ?? '';
			return body;
		} catch {
			return ''; // 拉取失败：降级（调用方将回退 description）
		}
	}
}

registerSingleton(ISlashCommandService, SlashCommandService, InstantiationType.Delayed);
