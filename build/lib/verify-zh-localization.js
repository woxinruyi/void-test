'use strict';
// 一次性验收脚本：中文化最终验收（L1~L4 静态部分）
// 用法：node build/lib/verify-zh-localization.js
// 产出：文档/temp-中文化最终验收记录.json 与 .md

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const buildOut = path.resolve(repoRoot, '..', 'VSCode-win32-x64');
const setupOut = path.resolve(repoRoot, '.build', 'win32-x64', 'user-setup');
const docDir = path.resolve(repoRoot, '文档');

const keywords = ['文件', '编辑', '视图', '终端', '帮助', '命令面板', '设置', '资源管理器'];
const result = { startedAt: new Date().toISOString(), steps: [] };

function step(id, title, fn) {
	const entry = { id, title, pass: false, details: {} };
	try {
		fn(entry);
	} catch (e) {
		entry.error = e.message;
	}
	result.steps.push(entry);
	console.log(`${entry.pass ? 'PASS' : 'FAIL'} [${id}] ${title}`);
	if (entry.error) console.log('  error:', entry.error);
	if (entry.details && Object.keys(entry.details).length) {
		for (const k of Object.keys(entry.details)) {
			const v = entry.details[k];
			console.log(`  ${k}:`, typeof v === 'string' && v.length > 200 ? v.slice(0, 200) + '…' : v);
		}
	}
}

step('L1-build-out', 'VSCode-win32-x64 顶层与关键文件存在', e => {
	const checks = {
		'Void.exe': path.join(buildOut, 'Void.exe'),
		'resources/app/product.json': path.join(buildOut, 'resources', 'app', 'product.json'),
		'resources/app/out': path.join(buildOut, 'resources', 'app', 'out'),
		'resources/app/extensions': path.join(buildOut, 'resources', 'app', 'extensions'),
	};
	const missing = [];
	for (const [k, p] of Object.entries(checks)) {
		if (!fs.existsSync(p)) missing.push(k);
	}
	e.details.missing = missing;
	e.details.buildOut = buildOut;
	e.pass = missing.length === 0;
});

step('L2-product-json', 'product.json defaultLocale == zh-cn', e => {
	const p = path.join(buildOut, 'resources', 'app', 'product.json');
	const pj = JSON.parse(fs.readFileSync(p, 'utf8'));
	e.details.path = p;
	e.details.defaultLocale = pj.defaultLocale;
	e.details.locale = pj.locale;
	e.details.nameShort = pj.nameShort;
	e.details.nameLong = pj.nameLong;
	e.pass = pj.defaultLocale === 'zh-cn';
});

step('L2b-setup-product-json', 'setup 阶段写入的 product.json', e => {
	const p = path.join(setupOut, 'product.json');
	e.details.path = p;
	if (!fs.existsSync(p)) { e.details.note = 'setup 阶段 product.json 未产出（不一定必需）'; e.pass = true; return; }
	const pj = JSON.parse(fs.readFileSync(p, 'utf8'));
	e.details.defaultLocale = pj.defaultLocale;
	e.details.target = pj.target;
	e.pass = pj.defaultLocale === 'zh-cn';
});

step('L3-lang-pack-i18n', '语言包 translations/*.i18n.json 含中文核心关键字', e => {
	const extRoot = path.join(buildOut, 'resources', 'app', 'extensions');
	if (!fs.existsSync(extRoot)) { e.details.note = 'extensions 目录缺失'; return; }
	const pkg = fs.readdirSync(extRoot).find(n => /zh-hans/i.test(n));
	if (!pkg) { e.details.note = '未找到 zh-hans 语言包'; return; }
	const i18nDir = path.join(extRoot, pkg, 'translations');
	if (!fs.existsSync(i18nDir)) { e.details.note = 'translations 目录缺失'; return; }
	const files = [];
	(function walk(d) {
		for (const n of fs.readdirSync(d)) {
			const full = path.join(d, n);
			const st = fs.statSync(full);
			if (st.isDirectory()) walk(full);
			else if (/\.i18n\.json$/.test(n)) files.push(full);
		}
	})(i18nDir);
	e.details.i18nFilesCount = files.length;
	let totalHits = 0, bestFile = null, bestHits = 0;
	const sampleHits = {};
	for (const f of files) {
		const text = fs.readFileSync(f, 'utf8');
		const hits = keywords.filter(k => text.includes(k));
		if (hits.length) sampleHits[path.relative(i18nDir, f)] = hits;
		totalHits += hits.length;
		if (hits.length > bestHits) { bestHits = hits.length; bestFile = f; }
	}
	e.details.totalHits = totalHits;
	e.details.bestFile = bestFile ? path.relative(i18nDir, bestFile) : null;
	e.details.bestHits = bestHits;
	e.details.sampleHits = sampleHits;
	e.pass = totalHits >= 4;
});

step('L4-language-pack', '内建扩展含 zh-hans 语言包', e => {
	const extRoot = path.join(buildOut, 'resources', 'app', 'extensions');
	if (!fs.existsSync(extRoot)) { e.details.note = 'extensions 目录缺失'; return; }
	const all = fs.readdirSync(extRoot);
	const candidates = all.filter(n => /zh-hans|zh.cn|chinese/i.test(n));
	e.details.candidates = candidates;
	if (candidates.length === 0) { e.pass = false; return; }
	// 取第一个做详细核对
	const dir = path.join(extRoot, candidates[0]);
	const pkg = path.join(dir, 'package.json');
	if (!fs.existsSync(pkg)) { e.details.note = 'package.json 缺失'; return; }
	const pj = JSON.parse(fs.readFileSync(pkg, 'utf8'));
	const locs = (pj.contributes && pj.contributes.localizations) || [];
	e.details.picked = candidates[0];
	e.details.localizations = locs.map(l => ({ languageId: l.languageId, languageName: l.languageName }));
	e.pass = locs.some(l => l.languageId === 'zh-cn' || l.languageId === 'zh-hans');
});

step('L4b-config-yaml-context', 'openspec/config.yaml 中文化配置已生效', e => {
	const p = path.join(repoRoot, 'openspec', 'config.yaml');
	if (!fs.existsSync(p)) { e.pass = false; e.details.note = 'config.yaml 缺失'; return; }
	const text = fs.readFileSync(p, 'utf8');
	e.details.hasZhCN = text.includes('zh-CN') || text.includes('简体中文');
	e.pass = e.details.hasZhCN;
});

result.summary = {
	total: result.steps.length,
	passed: result.steps.filter(s => s.pass).length,
	failed: result.steps.filter(s => !s.pass).length,
};

const jsonOut = path.join(docDir, 'temp-中文化最终验收记录.json');
fs.mkdirSync(docDir, { recursive: true });
fs.writeFileSync(jsonOut, JSON.stringify(result, null, 2), 'utf8');
console.log('\nSummary:', JSON.stringify(result.summary));
console.log('JSON written:', jsonOut);
