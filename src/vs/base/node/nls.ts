/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as fs from 'fs';
import { createHash } from 'crypto';
import * as perf from '../common/performance.js';
import type { ILanguagePacks, INLSConfiguration } from '../../nls.js';

export interface IResolveNLSConfigurationContext {

	/**
	 * Location where `nls.messages.json` and `nls.keys.json` are stored.
	 */
	readonly nlsMetadataPath: string;

	/**
	 * Path to the user data directory. Used as a cache for
	 * language packs converted to the format we need.
	 */
	readonly userDataPath: string;

	/**
	 * Commit of the running application. Can be `undefined`
	 * when not built.
	 */
	readonly commit: string | undefined;

	/**
	 * Locale as defined in `argv.json` or `app.getLocale()`.
	 */
	readonly userLocale: string;

	/**
	 * Locale as defined by the OS (e.g. `app.getPreferredSystemLanguages()`).
	 */
	readonly osLocale: string;
}

export async function resolveNLSConfiguration({ userLocale, osLocale, userDataPath, commit, nlsMetadataPath }: IResolveNLSConfigurationContext): Promise<INLSConfiguration> {
	perf.mark('code/willGenerateNls');

	if (
		userLocale === 'pseudo' ||
		userLocale.startsWith('en') ||
		!commit ||
		!userDataPath
	) {
		return defaultNLSConfiguration(userLocale, osLocale, nlsMetadataPath);
	}

	try {
		let languagePacks = await getLanguagePackConfigurations(userDataPath);
		if (!languagePacks) {
			languagePacks = await getBuiltInLanguagePackConfigurations(nlsMetadataPath);
			if (languagePacks) {
				await storeLanguagePackConfigurations(userDataPath, languagePacks);
			} else {
				return defaultNLSConfiguration(userLocale, osLocale, nlsMetadataPath);
			}
		}

		let resolvedLanguage = resolveLanguagePackLanguage(languagePacks, userLocale);
		if (!resolvedLanguage) {
			const builtInLanguagePacks = await getBuiltInLanguagePackConfigurations(nlsMetadataPath);
			if (builtInLanguagePacks) {
				languagePacks = { ...builtInLanguagePacks, ...languagePacks };
				resolvedLanguage = resolveLanguagePackLanguage(languagePacks, userLocale);
				if (resolvedLanguage) {
					await storeLanguagePackConfigurations(userDataPath, languagePacks);
				}
			}
		}

		if (!resolvedLanguage) {
			return defaultNLSConfiguration(userLocale, osLocale, nlsMetadataPath);
		}

		let languagePack = languagePacks[resolvedLanguage];
		let mainLanguagePackPath = languagePack?.translations?.['vscode'];
		if (
			!languagePack ||
			typeof languagePack.hash !== 'string' ||
			!languagePack.translations ||
			typeof mainLanguagePackPath !== 'string' ||
			!(await exists(mainLanguagePackPath))
		) {
			const builtInLanguagePacks = await getBuiltInLanguagePackConfigurations(nlsMetadataPath);
			const builtInResolvedLanguage = builtInLanguagePacks ? resolveLanguagePackLanguage(builtInLanguagePacks, userLocale) : undefined;
			if (!builtInResolvedLanguage) {
				return defaultNLSConfiguration(userLocale, osLocale, nlsMetadataPath);
			}

			languagePacks = { ...builtInLanguagePacks, ...languagePacks };
			languagePack = languagePacks[builtInResolvedLanguage];
			if (!languagePack?.translations?.['vscode'] || !(await exists(languagePack.translations['vscode']))) {
				return defaultNLSConfiguration(userLocale, osLocale, nlsMetadataPath);
			}

			resolvedLanguage = builtInResolvedLanguage;
			mainLanguagePackPath = languagePack.translations['vscode'];
			await storeLanguagePackConfigurations(userDataPath, languagePacks);
		}

		const languagePackId = `${languagePack.hash}.${resolvedLanguage}`;
		const globalLanguagePackCachePath = path.join(userDataPath, 'clp', languagePackId);
		const commitLanguagePackCachePath = path.join(globalLanguagePackCachePath, commit);
		const languagePackMessagesFile = path.join(commitLanguagePackCachePath, 'nls.messages.json');
		const translationsConfigFile = path.join(globalLanguagePackCachePath, 'tcf.json');
		const languagePackCorruptMarkerFile = path.join(globalLanguagePackCachePath, 'corrupted.info');

		if (await exists(languagePackCorruptMarkerFile)) {
			await fs.promises.rm(globalLanguagePackCachePath, { recursive: true, force: true, maxRetries: 3 }); // delete corrupted cache folder
		}

		const result: INLSConfiguration = {
			userLocale,
			osLocale,
			resolvedLanguage,
			defaultMessagesFile: getNlsMessagesFilePath(nlsMetadataPath),
			languagePack: {
				translationsConfigFile,
				messagesFile: languagePackMessagesFile,
				corruptMarkerFile: languagePackCorruptMarkerFile
			},

			// NLS: below properties are a relic from old times only used by vscode-nls and deprecated
			locale: userLocale,
			availableLanguages: { '*': resolvedLanguage },
			_languagePackId: languagePackId,
			_languagePackSupport: true,
			_translationsConfigFile: translationsConfigFile,
			_cacheRoot: globalLanguagePackCachePath,
			_resolvedLanguagePackCoreLocation: commitLanguagePackCachePath,
			_corruptedFile: languagePackCorruptMarkerFile
		};

		if (await exists(commitLanguagePackCachePath)) {
			// Validate cached NLS messages count matches the default messages count.
			// The cache can become stale if NLS strings are added/removed between
			// builds that share the same commit hash (common in development).
			try {
				const cachedMessages: string[] = JSON.parse(await fs.promises.readFile(languagePackMessagesFile, 'utf-8'));
				const defaultMessages: string[] = JSON.parse(await fs.promises.readFile(getNlsMessagesFilePath(nlsMetadataPath), 'utf-8'));
				if (cachedMessages.length !== defaultMessages.length) {
					console.warn(`NLS cache entry count mismatch (cached: ${cachedMessages.length}, expected: ${defaultMessages.length}). Regenerating...`);
					await fs.promises.rm(commitLanguagePackCachePath, { recursive: true, force: true, maxRetries: 3 });
					// Fall through to regenerate below
				} else {
					touch(commitLanguagePackCachePath).catch(() => { }); // We don't wait for this. No big harm if we can't touch
					perf.mark('code/didGenerateNls');
					return result;
				}
			} catch {
				// If validation fails, delete cache and regenerate
				await fs.promises.rm(commitLanguagePackCachePath, { recursive: true, force: true, maxRetries: 3 }).catch(() => { });
			}
		}

		const [
			,
			nlsDefaultKeys,
			nlsDefaultMessages,
			nlsPackdata
		]:
			[unknown, Array<[string, string[]]>, string[], { contents: Record<string, Record<string, string>> }]
			//               ^moduleId ^nlsKeys                               ^moduleId      ^nlsKey ^nlsValue
			= await Promise.all([
				fs.promises.mkdir(commitLanguagePackCachePath, { recursive: true }),
				JSON.parse(await fs.promises.readFile(getNlsKeysFilePath(nlsMetadataPath), 'utf-8')),
				JSON.parse(await fs.promises.readFile(getNlsMessagesFilePath(nlsMetadataPath), 'utf-8')),
				JSON.parse(await fs.promises.readFile(mainLanguagePackPath, 'utf-8'))
			]);

		const nlsResult: string[] = [];

		// We expect NLS messages to be in a flat array in sorted order as they
		// where produced during build time. We use `nls.keys.json` to know the
		// right order and then lookup the related message from the translation.
		// If a translation does not exist, we fallback to the default message.

		let nlsIndex = 0;
		for (const [moduleId, nlsKeys] of nlsDefaultKeys) {
			const moduleTranslations = nlsPackdata.contents[moduleId];
			for (const nlsKey of nlsKeys) {
				nlsResult.push(moduleTranslations?.[nlsKey] || nlsDefaultMessages[nlsIndex]);
				nlsIndex++;
			}
		}

		await Promise.all([
			fs.promises.writeFile(languagePackMessagesFile, JSON.stringify(nlsResult), 'utf-8'),
			fs.promises.writeFile(translationsConfigFile, JSON.stringify(languagePack.translations), 'utf-8')
		]);

		perf.mark('code/didGenerateNls');

		return result;
	} catch (error) {
		console.error('Generating translation files failed.', error);
	}

	return defaultNLSConfiguration(userLocale, osLocale, nlsMetadataPath);
}

function getNlsMessagesFilePath(nlsMetadataPath: string): string {
	return getNlsMetadataFilePath(nlsMetadataPath, 'nls.messages.json');
}

function getNlsKeysFilePath(nlsMetadataPath: string): string {
	return getNlsMetadataFilePath(nlsMetadataPath, 'nls.keys.json');
}

function getNlsMetadataFilePath(nlsMetadataPath: string, fileName: 'nls.messages.json' | 'nls.keys.json'): string {
	const primaryPath = path.join(nlsMetadataPath, fileName);
	if (fs.existsSync(primaryPath)) {
		return primaryPath;
	}

	const outBuildPath = path.normalize(path.join(nlsMetadataPath, '..', 'out-build', fileName));
	if (fs.existsSync(outBuildPath)) {
		return outBuildPath;
	}

	return primaryPath;
}

function getBuiltInExtensionsPaths(nlsMetadataPath: string): string[] {
	const result: string[] = [];

	for (const candidate of [
		path.normalize(path.join(nlsMetadataPath, '..', 'extensions')),
		path.normalize(path.join(nlsMetadataPath, '..', '.build', 'builtInExtensions')),
	]) {
		if (!result.includes(candidate)) {
			result.push(candidate);
		}
	}

	return result;
}

/**
 * The `languagepacks.json` file is a JSON file that contains all metadata
 * about installed language extensions per language. Specifically, for
 * core (`vscode`) and all extensions it supports, it points to the related
 * translation files.
 *
 * The file is updated whenever a new language pack is installed or removed.
 */
async function getLanguagePackConfigurations(userDataPath: string): Promise<ILanguagePacks | undefined> {
	const configFile = path.join(userDataPath, 'languagepacks.json');
	try {
		return JSON.parse(await fs.promises.readFile(configFile, 'utf-8'));
	} catch (err) {
		return undefined; // Do nothing. If we can't read the file we have no language pack config.
	}
}

async function storeLanguagePackConfigurations(userDataPath: string, languagePacks: ILanguagePacks): Promise<void> {
	const configFile = path.join(userDataPath, 'languagepacks.json');
	await fs.promises.mkdir(path.dirname(configFile), { recursive: true });
	await fs.promises.writeFile(configFile, JSON.stringify(languagePacks), 'utf-8');
}

interface ILocalizationContributionLike {
	languageId?: string;
	languageName?: string;
	localizedLanguageName?: string;
	translations?: Array<{ id?: string; path?: string }>;
}

interface IExtensionManifestLike {
	name?: string;
	publisher?: string;
	version?: string;
	__metadata?: { id?: string };
	contributes?: {
		localizations?: ILocalizationContributionLike[];
	};
}

async function getBuiltInLanguagePackConfigurations(nlsMetadataPath: string): Promise<ILanguagePacks | undefined> {
	const languagePacks: ILanguagePacks = {};

	for (const builtinExtensionsPath of getBuiltInExtensionsPaths(nlsMetadataPath)) {
		let extensionFolders: string[];

		try {
			extensionFolders = await fs.promises.readdir(builtinExtensionsPath);
		} catch {
			continue;
		}

		for (const extensionFolder of extensionFolders) {
			const extensionLocation = path.join(builtinExtensionsPath, extensionFolder);
			const packageJsonPath = path.join(extensionLocation, 'package.json');

			let manifest: IExtensionManifestLike;
			try {
				manifest = JSON.parse(await fs.promises.readFile(packageJsonPath, 'utf-8')) as IExtensionManifestLike;
			} catch {
				continue;
			}

			const localizations = manifest.contributes?.localizations;
			if (!Array.isArray(localizations) || !manifest.version) {
				continue;
			}

			const extensionId = manifest.__metadata?.id || (manifest.publisher && manifest.name ? `${manifest.publisher}.${manifest.name}` : undefined);
			if (!extensionId) {
				continue;
			}

			for (const localization of localizations) {
				if (!isValidBuiltInLocalization(localization)) {
					continue;
				}

				let languagePack = languagePacks[localization.languageId];
				if (!languagePack) {
					languagePack = {
						hash: '',
						label: localization.localizedLanguageName ?? localization.languageName,
						extensions: [],
						translations: {}
					};
					languagePacks[localization.languageId] = languagePack;
				}

				if (!languagePack.extensions.some(extension => extension.extensionIdentifier.id === extensionId)) {
					languagePack.extensions.push({
						extensionIdentifier: { id: extensionId },
						version: manifest.version
					});
				}

				for (const translation of localization.translations) {
					const translationId = translation.id;
					const translationPath = translation.path;
					if (typeof translationId === 'string' && typeof translationPath === 'string') {
						languagePack.translations[translationId] = path.join(extensionLocation, translationPath);
					}
				}
			}
		}
	}

	for (const language of Object.keys(languagePacks)) {
		const languagePack = languagePacks[language];
		if (languagePack) {
			languagePacks[language] = {
				...languagePack,
				hash: computeBuiltInLanguagePackHash(languagePack)
			};
		}
	}

	return Object.keys(languagePacks).length ? languagePacks : undefined;
}

function isValidBuiltInLocalization(localization: ILocalizationContributionLike): localization is Required<Pick<ILocalizationContributionLike, 'languageId' | 'translations'>> & ILocalizationContributionLike {
	return typeof localization.languageId === 'string'
		&& Array.isArray(localization.translations)
		&& localization.translations.length > 0
		&& localization.translations.every(translation => typeof translation.id === 'string' && typeof translation.path === 'string');
}

function computeBuiltInLanguagePackHash(languagePack: NonNullable<ILanguagePacks[string]>): string {
	const md5 = createHash('md5');
	for (const extension of [...languagePack.extensions].sort((a, b) => a.extensionIdentifier.id.localeCompare(b.extensionIdentifier.id))) {
		md5.update(extension.extensionIdentifier.id).update(extension.version);
	}
	return md5.digest('hex');
}

function resolveLanguagePackLanguage(languagePacks: ILanguagePacks, locale: string | undefined): string | undefined {
	try {
		while (locale) {
			if (languagePacks[locale]) {
				return locale;
			}

			const index = locale.lastIndexOf('-');
			if (index > 0) {
				locale = locale.substring(0, index);
			} else {
				return undefined;
			}
		}
	} catch (error) {
		console.error('Resolving language pack configuration failed.', error);
	}

	return undefined;
}

function defaultNLSConfiguration(userLocale: string, osLocale: string, nlsMetadataPath: string): INLSConfiguration {
	perf.mark('code/didGenerateNls');

	return {
		userLocale,
		osLocale,
		resolvedLanguage: 'en',
		defaultMessagesFile: getNlsMessagesFilePath(nlsMetadataPath),

		// NLS: below 2 are a relic from old times only used by vscode-nls and deprecated
		locale: userLocale,
		availableLanguages: {}
	};
}

//#region fs helpers

async function exists(path: string): Promise<boolean> {
	try {
		await fs.promises.access(path);

		return true;
	} catch {
		return false;
	}
}

function touch(path: string): Promise<void> {
	const date = new Date();

	return fs.promises.utimes(path, date, date);
}

//#endregion
