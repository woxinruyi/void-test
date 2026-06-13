/*--------------------------------------------------------------------------------------
 *  斜杠命令纯逻辑（无浏览器/DI 依赖，可在 node 下单元测试）
 *
 *  对应 change: add-slash-commands（Phase 1）
 *  服务层 browser/slashCommandService.ts 注入 settings/file/request 后复用这些纯函数。
 *--------------------------------------------------------------------------------------*/

export type SlashCommandSource = 'builtin' | 'skill' | 'local'

export interface SlashCommand {
	/** 不含前导 '/'，注册表内唯一 */
	readonly name: string
	readonly description: string
	readonly source: SlashCommandSource
	/** 纯本地命令（如 /help）：展开后本地渲染，不发起 LLM 请求 */
	readonly localOnly?: boolean
}

/** 解析用户输入：行首 `/<name>` 视为命令，其余为 args。非命令返回 null。 */
export const parseSlashInput = (text: string): { name: string, args: string } | null => {
	if (!text) return null
	// 仅识别整段消息以 '/' 开头的情况（避免把粘贴的路径误判）
	const trimmedStart = text.replace(/^[ \t]+/, '')
	if (!trimmedStart.startsWith('/')) return null
	const m = trimmedStart.match(/^\/([A-Za-z0-9][A-Za-z0-9_-]*)(?:[ \t]+([\s\S]*))?$/)
	if (!m) return null
	return { name: m[1], args: (m[2] ?? '').trim() }
}

/** 解析本地命令文件：可选 front-matter（--- 包裹，取 description）+ 正文。 */
export const parseLocalCommandFile = (content: string): { description: string, body: string } => {
	const normalized = content.replace(/\r\n/g, '\n')
	const fm = normalized.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
	if (fm) {
		const meta = fm[1]
		const body = fm[2]
		const dm = meta.match(/^\s*description\s*:\s*(.+?)\s*$/m)
		return { description: dm ? dm[1].replace(/^["']|["']$/g, '') : '', body: body.trim() }
	}
	return { description: '', body: normalized.trim() }
}

/** 展开模板：将 $ARGS 替换为用户参数（无 $ARGS 时把 args 追加到末尾）。 */
export const expandTemplate = (body: string, args: string): string => {
	if (body.includes('$ARGS')) return body.split('$ARGS').join(args)
	return args ? `${body}\n\n${args}` : body
}

/** 文件名 → 命令名（去扩展名、转小写、非法字符转 -）。 */
export const commandNameFromFilename = (filename: string): string => {
	const base = filename.replace(/\.[^.]+$/, '')
	return base.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
}

/**
 * 合并三类来源为唯一注册表。冲突优先级：builtin > local > skill（高优先级覆盖同名）。
 * 返回按 name 升序、稳定的命令列表。
 */
export const aggregateCommands = (
	builtins: readonly SlashCommand[],
	locals: readonly SlashCommand[],
	skills: readonly SlashCommand[],
): SlashCommand[] => {
	const byName = new Map<string, SlashCommand>()
	// 先放低优先级，再用高优先级覆盖
	for (const c of skills) byName.set(c.name, c)
	for (const c of locals) byName.set(c.name, c)
	for (const c of builtins) byName.set(c.name, c)
	return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/** 大小写不敏感查找。 */
export const lookupCommand = (commands: readonly SlashCommand[], name: string): SlashCommand | undefined => {
	const lower = name.toLowerCase()
	return commands.find(c => c.name.toLowerCase() === lower)
}

/** 前缀过滤（用于输入框候选）。 */
export const filterCommandsByPrefix = (commands: readonly SlashCommand[], prefix: string): SlashCommand[] => {
	const lower = prefix.toLowerCase()
	return commands.filter(c => c.name.toLowerCase().startsWith(lower))
}
