'use strict';
// 一次性补丁：手工完成 packageTask 中与中文化相关的复制动作
// 1) product.json: 合并 defaultLocale / builtInExtensions
// 2) resources/app/extensions/ 加入 zh-hans 语言包
// 3) resources/app/out/ 更新为 out-vscode-min（携带新的 nls.ts / main.ts 运行时逻辑）

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const buildOut = path.resolve(repoRoot, '..', 'VSCode-win32-x64');
const appDir = path.join(buildOut, 'resources', 'app');

console.log('repoRoot :', repoRoot);
console.log('appDir   :', appDir);

// --- Step 1: product.json ---
const repoProductJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'product.json'), 'utf8'));
const builtProductPath = path.join(appDir, 'product.json');
const builtProduct = JSON.parse(fs.readFileSync(builtProductPath, 'utf8'));

const patchedProduct = {
	...builtProduct,
	defaultLocale: repoProductJson.defaultLocale,
	builtInExtensions: repoProductJson.builtInExtensions || builtProduct.builtInExtensions || [],
};

fs.writeFileSync(builtProductPath, JSON.stringify(patchedProduct, null, '\t'), 'utf8');
console.log('[1] product.json patched. defaultLocale =', patchedProduct.defaultLocale,
	'builtInExtensions count =', patchedProduct.builtInExtensions.length);

// --- Step 2: language pack ---
const pkgName = 'ms-ceintl.vscode-language-pack-zh-hans';
const src = path.join(repoRoot, '.build', 'extensions', pkgName);
const dst = path.join(appDir, 'extensions', pkgName);
if (!fs.existsSync(src)) {
	console.error('[2] SOURCE MISSING:', src);
	process.exit(1);
}
fs.rmSync(dst, { recursive: true, force: true });
fs.cpSync(src, dst, { recursive: true });
console.log('[2] language pack copied ->', dst);

// --- Step 3: out/ from out-vscode-min ---
const outSrc = path.join(repoRoot, 'out-vscode-min');
const outDst = path.join(appDir, 'out');
if (!fs.existsSync(outSrc)) {
	console.error('[3] out-vscode-min MISSING:', outSrc);
	process.exit(1);
}
// backup existing out as out.bak for safety
const outBak = path.join(appDir, 'out.bak');
if (fs.existsSync(outDst) && !fs.existsSync(outBak)) {
	fs.renameSync(outDst, outBak);
	console.log('[3] existing out/ renamed to out.bak');
}
fs.rmSync(outDst, { recursive: true, force: true });
fs.cpSync(outSrc, outDst, { recursive: true });
console.log('[3] out/ replaced from out-vscode-min');

console.log('\nDONE');
