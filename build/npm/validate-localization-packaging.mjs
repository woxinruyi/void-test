/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { existsSync, readFileSync } from 'fs';
import { resolve, join } from 'path';
import { fileURLToPath } from 'url';

const rootPath = resolve(fileURLToPath(import.meta.url), '..', '..', '..');
const productJsonPath = join(rootPath, 'product.json');
const product = JSON.parse(readFileSync(productJsonPath, 'utf8'));

const checks = [
	{
		name: 'product.defaultLocale is zh-cn',
		ok: product.defaultLocale === 'zh-cn',
		detail: `current=${product.defaultLocale}`
	},
	{
		name: 'builtInExtensions contains zh-hans language pack',
		ok: Array.isArray(product.builtInExtensions) && product.builtInExtensions.some((extension) => extension.name === 'ms-ceintl.vscode-language-pack-zh-hans'),
		detail: 'expected ms-ceintl.vscode-language-pack-zh-hans in product.json'
	},
	{
		name: 'product.commit is not hard-coded for local debugging',
		ok: product.commit !== 'dev-local',
		detail: `current=${product.commit ?? 'undefined'}`
	},
	{
		name: '.build/builtInExtensions contains zh-hans language pack',
		ok: existsSync(join(rootPath, '.build', 'builtInExtensions', 'ms-ceintl.vscode-language-pack-zh-hans')),
		detail: '.build/builtInExtensions/ms-ceintl.vscode-language-pack-zh-hans'
	},
	{
		name: '.build/extensions contains zh-hans language pack',
		ok: existsSync(join(rootPath, '.build', 'extensions', 'ms-ceintl.vscode-language-pack-zh-hans')),
		detail: '.build/extensions/ms-ceintl.vscode-language-pack-zh-hans'
	},
	{
		name: 'out-build contains nls.messages.json',
		ok: existsSync(join(rootPath, 'out-build', 'nls.messages.json')),
		detail: 'out-build/nls.messages.json'
	},
	{
		name: 'out-build contains nls.keys.json',
		ok: existsSync(join(rootPath, 'out-build', 'nls.keys.json')),
		detail: 'out-build/nls.keys.json'
	}
];

let hasFailure = false;
console.log('Localization packaging validation results:');
for (const check of checks) {
	const status = check.ok ? 'PASS' : 'FAIL';
	console.log(`- [${status}] ${check.name} (${check.detail})`);
	if (!check.ok) {
		hasFailure = true;
	}
}

if (hasFailure) {
	console.error('\nLocalization packaging validation failed. Fix the failed checks before using built/package artifacts for native Workbench Chinese validation.');
	process.exit(1);
}

console.log('\nLocalization packaging validation passed. Built/package Chinese verification prerequisites are satisfied.');
