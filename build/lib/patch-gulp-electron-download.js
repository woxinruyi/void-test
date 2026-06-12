'use strict';
// 就地补丁：让 @vscode/gulp-electron@1.41.x 在 Node 20 + CJS 环境下可运行
// 把顶层 3 个 ESM require 改成函数内动态 import / CJS 默认导入。
// 幂等：若已补丁则跳过。

const fs = require('fs');
const path = require('path');

const target = path.resolve(
	__dirname,
	'..',
	'..',
	'node_modules',
	'@vscode',
	'gulp-electron',
	'src',
	'download.js'
);

let src = fs.readFileSync(target, 'utf8');
const marker = '// [PATCHED-FOR-CJS-NODE20]';
if (src.includes(marker)) {
	console.log('already patched; skip');
	process.exit(0);
}

// 1) 移除三条顶层 require 语句
const removals = [
	'const { downloadArtifact } = require("@electron/get");',
	'const { Octokit } = require("@octokit/rest");',
	'const { got } = require("got");',
];
for (const r of removals) {
	if (!src.includes(r)) {
		console.error('missing expected line:', r);
		process.exit(1);
	}
	src = src.replace(r, '// ' + r + ' // removed by patch');
}

// 2) 在 getDownloadUrl 顶部注入 Octokit + got 的延迟加载
src = src.replace(
	'async function getDownloadUrl(\n  ownerRepo, customTag,\n  { version, platform, arch, token, artifactName, artifactSuffix }\n) {',
	`async function getDownloadUrl(
  ownerRepo, customTag,
  { version, platform, arch, token, artifactName, artifactSuffix }
) {
  ${marker}
  const { Octokit } = await import("@octokit/rest");
  const got = require("got");`
);

// 3) 在 download() 顶部注入 downloadArtifact 的延迟加载
src = src.replace(
	'async function download(opts) {\n  let bar;',
	`async function download(opts) {
  ${marker}
  const { downloadArtifact } = await import("@electron/get");
  let bar;`
);

fs.writeFileSync(target, src, 'utf8');
console.log('patched:', target);
