/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { useState, useEffect, useCallback } from 'react';
import { SupportedLocale, TranslationKeys } from './types.js';
import { en } from './locales/en.js';
import { zhCN } from './locales/zh-cn.js';

const translations: Record<SupportedLocale, TranslationKeys> = {
	'en': en,
	'zh-cn': zhCN,
};

function getInitialLocale(): SupportedLocale {
	try {
		const cached = localStorage.getItem('void-locale');
		if (cached && cached in translations) return cached as SupportedLocale;
	} catch { }

	return 'zh-cn';
}

let currentLocale: SupportedLocale = getInitialLocale();
const localeListeners = new Set<(locale: SupportedLocale) => void>();

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
	localeListeners.forEach(fn => fn(locale));
}

export function getLocale(): SupportedLocale {
	return currentLocale;
}

export function useLocale(): [SupportedLocale, (locale: SupportedLocale) => void] {
	const [locale, _setLocale] = useState(currentLocale);

	useEffect(() => {
		const listener = (newLocale: SupportedLocale) => _setLocale(newLocale);
		localeListeners.add(listener);
		return () => { localeListeners.delete(listener); };
	}, []);

	const changeLocale = useCallback((newLocale: SupportedLocale) => {
		setLocale(newLocale);
	}, []);

	return [locale, changeLocale];
}

export function getSupportedLocales(): { id: SupportedLocale; label: string }[] {
	return [
		{ id: 'zh-cn', label: '简体中文' },
		{ id: 'en', label: 'English' },
	];
}

export type { SupportedLocale, TranslationKeys };
