/*--------------------------------------------------------------------------------------
 *  终端沙箱参数/profile 生成（纯函数，无依赖，可单元测试）
 *
 *  对应 change: add-terminal-sandbox（可先行落地的纯部分）
 *  说明：本文件只生成沙箱后端的"参数/配置"，不执行命令、不依赖真机。
 *       三档语义对齐 Codex：read-only / workspace-write / full。
 *       真机端到端（实际隔离生效）需运行时验证，见提案"状态"。
 *
 *  - Linux：bubblewrap (bwrap) 参数数组
 *  - macOS：Seatbelt (sandbox-exec) profile 文本
 *--------------------------------------------------------------------------------------*/

export type SandboxMode = 'read-only' | 'workspace-write' | 'full';

/**
 * 生成 bwrap 参数。`full` 返回 null（表示不沙箱、直接执行，行为同现状）。
 * workspace-write：根只读 + 工作区可写 + 默认断网；read-only：全只读 + 断网。
 */
export const buildBwrapArgs = (opts: { workspaceDir: string; mode: SandboxMode }): string[] | null => {
	const { workspaceDir, mode } = opts;
	if (mode === 'full') return null;

	const args: string[] = [
		'--ro-bind', '/', '/',     // 整个根只读
		'--dev', '/dev',
		'--proc', '/proc',
		'--tmpfs', '/tmp',
		'--unshare-net',           // 默认断网（read-only 与 workspace-write 都断；full 才放开）
		'--die-with-parent',
	];
	if (mode === 'workspace-write' && workspaceDir) {
		args.push('--bind', workspaceDir, workspaceDir); // 工作区可写（覆盖上面的 ro-bind）
	}
	return args;
};

/**
 * 生成 Seatbelt (sandbox-exec) profile 文本。`full` 返回 null。
 * 默认 deny，允许读，按档允许写工作区，默认 deny 网络出站。
 */
export const buildSeatbeltProfile = (opts: { workspaceDir: string; mode: SandboxMode }): string | null => {
	const { workspaceDir, mode } = opts;
	if (mode === 'full') return null;

	const lines: string[] = [
		'(version 1)',
		'(deny default)',
		'(allow process-exec)',
		'(allow process-fork)',
		'(allow file-read*)',           // 允许读
		'(allow sysctl-read)',
		'(deny network*)',              // 默认断网
	];
	if (mode === 'workspace-write' && workspaceDir) {
		// 仅允许写工作区子树
		lines.push(`(allow file-write* (subpath "${workspaceDir.replace(/"/g, '\\"')}"))`);
		lines.push('(allow file-write* (subpath "/tmp"))');
		lines.push('(allow file-write-data (literal "/dev/null"))');
	}
	// read-only：不追加任何 file-write*，即纯只读
	return lines.join('\n') + '\n';
};

/** 该档是否允许出站网络（仅 full 放开）。供审批/能力提示用。 */
export const sandboxAllowsNetwork = (mode: SandboxMode): boolean => mode === 'full';

/** 该档是否允许写工作区外（仅 full）。 */
export const sandboxAllowsOutsideWorkspaceWrite = (mode: SandboxMode): boolean => mode === 'full';
