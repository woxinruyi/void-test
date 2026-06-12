/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { useState, useEffect, useCallback } from 'react';
import { SupportedLocale, TranslationKeys } from './types.js';
import { en } from './locales/en.js';
import { zhCN } from './locales/zh-cn.js';
import { ko } from './locales/ko.js';

const translations: Record<SupportedLocale, TranslationKeys> = {
	'en': en,
	'zh-cn': zhCN,
	'ko': ko,
};

function detectPlatformLocale(): SupportedLocale | undefined {
	try {
		// globalThis._VSCODE_NLS_LANGUAGE is set by VSCode's bootstrap-window setupNLS()
		const nlsLang = (globalThis as any)._VSCODE_NLS_LANGUAGE as string | undefined;
		if (nlsLang && nlsLang in translations) return nlsLang as SupportedLocale;
	} catch { }
	try {
		// document.documentElement.lang is also set by setupNLS, but zh-cn becomes zh-Hans there.
		// Map known BCP47 variants back to our locale IDs.
		const htmlLang = document.documentElement.lang?.toLowerCase();
		if (htmlLang) {
			const map: Record<string, SupportedLocale> = { 'zh-hans': 'zh-cn', 'zh-hant': 'zh-cn', 'ko': 'ko', 'en': 'en' };
			if (htmlLang in map) return map[htmlLang];
			if (htmlLang in translations) return htmlLang as SupportedLocale;
		}
	} catch { }
	return undefined;
}

function getInitialLocale(): SupportedLocale {
	// 1. Read the user's explicit preference from localStorage (set by changeLocale / setLocale)
	let stored: SupportedLocale | undefined;
	try {
		const cached = localStorage.getItem('void-locale');
		if (cached && cached in translations) stored = cached as SupportedLocale;
	} catch { }

	// 2. Detect the VSCode platform locale (reflects argv.json / language pack after restart)
	const platform = detectPlatformLocale();

	// 3. If both exist and disagree, prefer platform — it is the ground truth after a restart.
	//    But if platform is the implicit default (English with no explicit NLS language),
	//    trust localStorage because the user may have explicitly picked a locale that hasn't
	//    reloaded yet, OR picked English themselves (stored would be 'en').
	if (stored && platform) {
		if (stored === platform) return stored;
		// _VSCODE_NLS_LANGUAGE being falsy means "no language pack active" (English default).
		// In that case trust the user's stored preference.
		const nlsLang = (globalThis as any)._VSCODE_NLS_LANGUAGE;
		if (!nlsLang) return stored;
		// An explicit non-English language pack is active → platform wins
		try { localStorage.setItem('void-locale', platform); } catch { }
		return platform;
	}

	if (stored) return stored;

	if (platform) {
		try { localStorage.setItem('void-locale', platform); } catch { }
		return platform;
	}

	return 'zh-cn';
}

let currentLocale: SupportedLocale = getInitialLocale();
const localeListeners = new Set<(locale: SupportedLocale) => void>();
const localeChangeEventName = 'void-locale-change';

function readStoredLocale(): SupportedLocale | undefined {
	try {
		const cached = localStorage.getItem('void-locale');
		if (cached && cached in translations) return cached as SupportedLocale;
	} catch { }
	return undefined;
}

export function t(key: keyof TranslationKeys, ...args: (string | number)[]): string {
	let text = translations[currentLocale]?.[key]
		|| translations['en'][key]
		|| key;

	args.forEach((arg, i) => {
		text = text.replace(`{${i}}`, String(arg));
	});

	return text;
}

export function setLocale(locale: SupportedLocale) {
	currentLocale = locale;
	try { localStorage.setItem('void-locale', locale); } catch { }
	try { window.dispatchEvent(new CustomEvent(localeChangeEventName, { detail: locale })); } catch { }
	localeListeners.forEach(fn => fn(locale));
}

export function getLocale(): SupportedLocale {
	return currentLocale;
}

export function useLocale(): [SupportedLocale, (locale: SupportedLocale) => void] {
	const [locale, _setLocale] = useState(currentLocale);

	useEffect(() => {
		const listener = (newLocale: SupportedLocale) => _setLocale(newLocale);
		const windowListener = (event: Event) => {
			const nextLocale = (event as CustomEvent<SupportedLocale>).detail;
			if (nextLocale && nextLocale in translations) {
				currentLocale = nextLocale;
				_setLocale(nextLocale);
			}
		};
		const storageListener = (event: StorageEvent) => {
			if (event.key !== 'void-locale') return;
			const nextLocale = readStoredLocale();
			if (nextLocale) {
				currentLocale = nextLocale;
				_setLocale(nextLocale);
			}
		};
		localeListeners.add(listener);
		window.addEventListener(localeChangeEventName, windowListener);
		window.addEventListener('storage', storageListener);
		return () => {
			localeListeners.delete(listener);
			window.removeEventListener(localeChangeEventName, windowListener);
			window.removeEventListener('storage', storageListener);
		};
	}, []);

	const changeLocale = useCallback((newLocale: SupportedLocale) => {
		setLocale(newLocale);
	}, []);

	return [locale, changeLocale];
}

export function getSupportedLocales(): { id: SupportedLocale; label: string; shortLabel: string }[] {
	return [
		{ id: 'zh-cn', label: '简体中文', shortLabel: '中文' },
		{ id: 'en', label: 'English', shortLabel: 'EN' },
		{ id: 'ko', label: '한국어', shortLabel: '한국어' },
	];
}

export type { SupportedLocale, TranslationKeys };
