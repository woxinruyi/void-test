'use strict';
// 让 @vscode/gulp-electron 跳过 SHASUMS 校验，以便命中本地已缓存的 zip
const fs = require('fs');
const path = require('path');

const target = path.resolve(__dirname, '..', '..', 'node_modules', '@vscode', 'gulp-electron', 'src', 'download.js');
let src = fs.readFileSync(target, 'utf8');
const marker = '// [PATCHED-SKIP-CHECKSUM]';
if (src.includes(marker)) { console.log('already patched; skip'); process.exit(0); }

// 在 download() 里 downloadOpts 声明处之后立刻追加 unsafelyDisableChecksums: true
// 注入在 `downloadArtifact = await import(...)` 之后
src = src.replace(
	'  const { downloadArtifact } = await import("@electron/get");',
	`  const { downloadArtifact } = await import("@electron/get");
  ${marker}
  const __forceSkipChecksum = true;`
);

// 修改 return 之前，强制设置 unsafelyDisableChecksums
src = src.replace(
	'  const start = new Date();\n  bar.start = start;\n\n  return await downloadArtifact(downloadOpts);',
	`  const start = new Date();
  bar.start = start;

  if (__forceSkipChecksum) { downloadOpts.unsafelyDisableChecksums = true; }
  return await downloadArtifact(downloadOpts);`
);

if (!src.includes(marker)) { console.error('patch FAILED: marker not injected'); process.exit(1); }
fs.writeFileSync(target, src, 'utf8');
console.log('patched:', target);
