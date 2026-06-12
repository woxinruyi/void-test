'use strict';
const fs = require('fs');
const p = 'build/lib/verify-zh-localization.js';
let s = fs.readFileSync(p, 'utf8');
const startMarker = "step('L3-nls-messages'";
const endMarker = "step('L4-language-pack'";
const iStart = s.indexOf(startMarker);
const iEnd = s.indexOf(endMarker);
if (iStart < 0 || iEnd < 0) { console.error('markers not found'); process.exit(1); }
const newBlock = `step('L3-lang-pack-i18n', '语言包 translations/*.i18n.json 含中文核心关键字', e => {
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
			else if (/\\.i18n\\.json$/.test(n)) files.push(full);
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

`;
const out = s.slice(0, iStart) + newBlock + s.slice(iEnd);
fs.writeFileSync(p, out, 'utf8');
console.log('rewrote', p, 'old length', s.length, 'new length', out.length);
