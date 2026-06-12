// CJS bootstrap: Wait for Electron's browser_init to register the 'electron' built-in,
// then load the ESM main entry point with the electron module available via globalThis.
const Module = require('module');

let attempts = 0;
function tryLoadElectron() {
	attempts++;
	const hasElectron = Module.builtinModules.includes('electron');
	const pType = process.type;
	if (attempts <= 5 || attempts % 100 === 0) {
		console.error(`[BOOTSTRAP] attempt ${attempts}: process.type=${pType} builtins.electron=${hasElectron}`);
	}
	if (attempts > 1000) {
		console.error('[BOOTSTRAP] Gave up waiting for electron. Loading main anyway...');
		import('./main.js').catch(err => { console.error('[BOOTSTRAP] error:', err); process.exit(1); });
		return;
	}
	// Check if the real electron module is available
	try {
		const e = require('electron');
		if (typeof e === 'object' && e.app) {
			console.error(`[BOOTSTRAP] electron found at attempt ${attempts}! Keys:`, Object.keys(e).slice(0, 8));
			globalThis.__electron = e;
			import('./main.js').catch(err => { console.error('[BOOTSTRAP] error:', err); process.exit(1); });
			return;
		}
	} catch (err) { /* not available yet */ }
	setImmediate(tryLoadElectron);
}

tryLoadElectron();
