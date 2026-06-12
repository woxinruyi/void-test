/*--------------------------------------------------------------------------------------
 *  工具审批分层信任模型 —— 纯函数判定层
 *
 *  职责：给定当前工具调用 + autoApprove 设置 + 上下文，决定是 'auto' 自动通过还是
 *  'manual' 等待用户审批。所有逻辑保持纯函数，便于单元测试。
 *
 *  设计参考：
 *  - Windsurf：工具 allowlist 与"信任一次即全程"
 *  - Claude Code：/permissions 的按作用域粒度授权
 *--------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js'
import { approvalTypeOfBuiltinToolName, BuiltinToolCallParams, BuiltinToolName, ToolCallParams, ToolName } from '../toolsServiceTypes.js'
import { AutoApproveSettings } from '../voidSettingsTypes.js'
import { isABuiltinToolName } from '../prompt/prompts.js'

export type ApprovalDecision = 'auto' | 'manual'

export type ApprovalContext = {
	workspaceFolders: URI[]
	mcpServerName?: string
}

/**
 * 判断一个 URI 是否位于任一 workspace folder 内。
 * 约定：完全等于某个 folder 本身或在其子路径下均视为"在工作区内"。
 */
export function isInWorkspace(uri: URI | undefined, workspaceFolders: URI[]): boolean {
	if (!uri) return true // 无 uri 时保守地视为工作区内
	if (!workspaceFolders || workspaceFolders.length === 0) return false
	const targetPath = normalizePath(uri.fsPath)
	for (const folder of workspaceFolders) {
		const folderPath = normalizePath(folder.fsPath)
		if (targetPath === folderPath) return true
		// 确保以分隔符结尾再做 startsWith，避免 /foo 匹配到 /foobar
		const folderPrefix = folderPath.endsWith('/') || folderPath.endsWith('\\') ? folderPath : folderPath + '/'
		if (targetPath.startsWith(folderPrefix)) return true
	}
	return false
}

function normalizePath(p: string): string {
	// 统一为正斜杠 + 去掉末尾分隔符；Windows 盘符大小写归一化
	let s = p.replace(/\\/g, '/')
	if (s.length > 1 && (s.endsWith('/'))) s = s.slice(0, -1)
	// Windows 盘符归一化（C: → c:）
	if (/^[a-zA-Z]:/.test(s)) s = s[0].toLowerCase() + s.slice(1)
	return s
}

/**
 * Shell 元字符黑名单：命令包含以下任一即不视为"单一安全命令"，直接拒绝自动通过。
 * 对齐 Cursor / Windsurf 的防御习惯：`cat x > y`、`echo $(curl ...)`、`ls && rm -rf` 等组合
 * 一律不走 allowlist 自动过，改为走 `terminalAny` 或人工审批。
 */
const SHELL_METACHAR_RE = /[|><;`$&]|\$\(|\|\||&&/

/**
 * 判断命令是否匹配 allowlist 中任一 pattern。
 * 匹配规则：pattern 为命令首段（等值）或命令以 "pattern + 空格" 开头。
 * 'git status' 匹配 'git status'、'git status --short'；
 * 不匹配 'git statusx'、'ls && git status'、'echo x > y'。
 * 安全护栏：命令含 shell 元字符（管道/重定向/子 shell/逻辑连接）即拒绝。
 */
export function matchesAllowlist(command: string, patterns: string[]): boolean {
	if (!command || !patterns || patterns.length === 0) return false
	const normalized = command.trimStart()
	// 含 shell 元字符 → 组合命令，不视为安全
	if (SHELL_METACHAR_RE.test(normalized)) return false
	for (const raw of patterns) {
		if (!raw) continue
		const p = raw.trimEnd() // 去尾部多余空格
		if (!p) continue
		if (normalized === p) return true
		if (normalized.startsWith(p + ' ')) return true
	}
	return false
}

/**
 * 审批判定主入口。
 *
 * - 只读类工具（approvalType 为 undefined）→ 'auto'
 * - 编辑类：按 uri 是否在 workspace 内分别查 editsInWorkspace / editsOutsideWorkspace
 * - 终端类：优先 allowlist 匹配 + allowlist 开关；否则 terminalAny
 * - MCP：先查 per-server，缺失回退 mcpAll
 */
export function resolveAutoApprove(
	toolName: ToolName,
	toolParams: ToolCallParams<ToolName> | undefined,
	autoApprove: AutoApproveSettings,
	ctx: ApprovalContext,
): ApprovalDecision {
	const isBuiltin = isABuiltinToolName(toolName)
	const approvalType = isBuiltin ? approvalTypeOfBuiltinToolName[toolName as BuiltinToolName] : 'MCP tools'

	// 只读类（无审批类型）
	if (!approvalType) return 'auto'

	// ── 第 0 层：per-tool-name 规则（最高优先级）──
	if (autoApprove.perToolRules) {
		const rule = autoApprove.perToolRules[toolName]
		if (rule === 'allow') return 'auto'
		if (rule === 'deny') return 'manual'
		// 'ask' 或 undefined → 继续走常规判定
	}

	// 编辑类：按 URI 范围
	if (approvalType === 'edits') {
		const uri = extractEditUri(toolName as BuiltinToolName, toolParams)
		const inWs = isInWorkspace(uri, ctx.workspaceFolders)
		return inWs
			? (autoApprove.editsInWorkspace ? 'auto' : 'manual')
			: (autoApprove.editsOutsideWorkspace ? 'auto' : 'manual')
	}

	// 终端类：mustAlwaysApprovePatterns 硬审批 → allowlist → terminalAny
	if (approvalType === 'terminal') {
		const cmd = extractTerminalCommand(toolName as BuiltinToolName, toolParams)

		// 硬审批模式：匹配 mustAlwaysApprovePatterns 即强制 manual，即使 terminalAny=true
		if (cmd && autoApprove.mustAlwaysApprovePatterns && autoApprove.mustAlwaysApprovePatterns.length > 0) {
			if (matchesAllowlist(cmd, autoApprove.mustAlwaysApprovePatterns)) {
				return 'manual'
			}
		}

		if (autoApprove.terminalAllowlist && cmd && matchesAllowlist(cmd, autoApprove.terminalAllowlistPatterns ?? [])) {
			return 'auto'
		}
		return autoApprove.terminalAny ? 'auto' : 'manual'
	}

	// MCP：server 粒度优先
	if (approvalType === 'MCP tools') {
		const server = ctx.mcpServerName
		if (server && autoApprove.mcpPerServer && server in autoApprove.mcpPerServer) {
			return autoApprove.mcpPerServer[server] ? 'auto' : 'manual'
		}
		return autoApprove.mcpAll ? 'auto' : 'manual'
	}

	return 'manual'
}

function extractEditUri(toolName: BuiltinToolName, params: any): URI | undefined {
	switch (toolName) {
		case 'edit_file':
		case 'rewrite_file':
		case 'create_file_or_folder':
		case 'delete_file_or_folder':
			return (params as BuiltinToolCallParams['edit_file'])?.uri
	}
	return undefined
}

function extractTerminalCommand(toolName: BuiltinToolName, params: any): string | undefined {
	switch (toolName) {
		case 'run_command':
			return (params as BuiltinToolCallParams['run_command'])?.command
		case 'run_persistent_command':
			return (params as BuiltinToolCallParams['run_persistent_command'])?.command
		case 'open_persistent_terminal':
		case 'kill_persistent_terminal':
			// 这两个本身不是"执行命令"，走 terminalAny 开关
			return undefined
	}
	return undefined
}
