'use strict';
// 一次性诊断脚本：定位 vscode-win32-x64-user-setup 中 `spawn UNKNOWN` 根因
// 跑完可删除，不纳入提交
const cp = require('child_process');
const path = require('path');

const iscc = path.resolve(__dirname, '..', '..', 'node_modules', 'innosetup', 'bin', 'ISCC.exe');
const iss = path.resolve(__dirname, '..', 'win32', 'code.iss');

console.log('ISCC:', iscc);
console.log('ISS :', iss);
console.log('CWD :', process.cwd());
console.log('Node:', process.version, 'Platform:', process.platform);
console.log('---');

function run(label, opts, args) {
	console.log('\n=== ' + label + ' ===');
	console.log('opts:', JSON.stringify({ ...opts, stdio: Array.isArray(opts.stdio) ? opts.stdio : opts.stdio }));
	console.log('args:', args);
	try {
		const r = cp.spawnSync(iscc, args, opts);
		console.log('status:', r.status, 'signal:', r.signal);
		if (r.error) {
			console.log('ERROR.code:', r.error.code);
			console.log('ERROR.errno:', r.error.errno);
			console.log('ERROR.syscall:', r.error.syscall);
			console.log('ERROR.message:', r.error.message);
		}
		if (r.stdout) { console.log('stdout bytes:', r.stdout.length); }
		if (r.stderr) { console.log('stderr bytes:', r.stderr.length); }
	} catch (e) {
		console.log('threw:', e.code, e.message);
	}
}

// 最小参数（仅 /? 看能否启动）
run('S0 /? pipe', { stdio: ['ignore', 'pipe', 'pipe'] }, ['/?']);

// A: 与 gulpfile 完全一致：stdio inherit + 完整参数形态
run('A inherit + iss (no run)', { stdio: ['ignore', 'inherit', 'inherit'] }, [iss, '/dFoo=bar']);

// B: stdio 改 pipe
run('B pipe + iss', { stdio: ['ignore', 'pipe', 'pipe'] }, [iss, '/dFoo=bar']);

// C: shell:true
run('C shell + inherit', { stdio: ['ignore', 'inherit', 'inherit'], shell: true }, [iss, '/dFoo=bar']);

// D: cwd 设为 ISCC 所在目录
run('D cwd=iscc-dir + pipe', { stdio: ['ignore', 'pipe', 'pipe'], cwd: path.dirname(iscc) }, [iss, '/dFoo=bar']);

// E: 完全模拟 gulpfile 的 /sesrp 参数
const signWin32Path = path.resolve(__dirname, '..', 'azure-pipelines', 'common', 'sign-win32');
const sesrp = `/sesrp=node ${signWin32Path} $f`;
run('E full gulpfile args', { stdio: ['ignore', 'inherit', 'inherit'] }, [iss, '/dNameLong=Void', '/dArch=x64', sesrp]);

// F: windowsHide + windowsVerbatimArguments
run('F verbatim', { stdio: ['ignore', 'pipe', 'pipe'], windowsVerbatimArguments: true }, [iss, '/dFoo=bar']);

console.log('\n--- done ---');
