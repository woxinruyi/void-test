/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { applyEdits, modify } from 'jsonc-parser';
import { VSBuffer } from '../../../../../../../base/common/buffer.js';
import { IFileService } from '../../../../../../../platform/files/common/files.js';
import { INotificationService } from '../../../../../../../platform/notification/common/notification.js';
import { ILanguagePackService } from '../../../../../../../platform/languagePacks/common/languagePacks.js';
import { IEnvironmentService } from '../../../../../../../platform/environment/common/environment.js';
import { IExtensionManagementService } from '../../../../../../../platform/extensionManagement/common/extensionManagement.js';
import { ILocaleService } from '../../../../../../../workbench/services/localization/common/locale.js';

export async function writeLocalePreference(environmentService: IEnvironmentService, fileService: IFileService, nextLocale: string | undefined): Promise<void> {
	const argvResource = environmentService.argvResource
	let content = '{}'

	try {
		const existing = await fileService.readFile(argvResource)
		const existingContent = existing.value.toString()
		content = existingContent.trim().length > 0 ? existingContent : '{}'
	} catch {
		content = '{}'
	}

	const edits = modify(content, ['locale'], nextLocale, {
		formattingOptions: {
			insertSpaces: false,
			tabSize: 4,
			eol: '\r\n',
		},
	})
	const updatedContent = applyEdits(content, edits)
	await fileService.writeFile(argvResource, VSBuffer.fromString(updatedContent))
}

export async function applyGlobalLocale(options: {
	reactLocale: string;
	isDevMode: boolean;
	localeService: ILocaleService;
	languagePackService: ILanguagePackService;
	environmentService: IEnvironmentService;
	fileService: IFileService;
	notificationService: INotificationService;
	extensionManagementService: IExtensionManagementService;
}): Promise<void> {
	const { reactLocale, isDevMode, localeService, languagePackService, environmentService, fileService, notificationService, extensionManagementService } = options

	if (reactLocale === 'en') {
		if (isDevMode) {
			await writeLocalePreference(environmentService, fileService, undefined)
			notificationService.info('Void Dev: Display language preference saved as English. Use "Developer: Reload Window" or restart Void manually to apply it.')
		} else {
			await localeService.clearLocalePreference()
		}
		return
	}

	const installedLanguages = await languagePackService.getInstalledLanguages()
	const installedMatch = installedLanguages.find(l => l.id === reactLocale)
	if (installedMatch) {
		if (isDevMode) {
			await writeLocalePreference(environmentService, fileService, installedMatch.id)
			notificationService.info(`Void Dev: Display language preference saved as ${installedMatch.label}. Use "Developer: Reload Window" or restart Void manually to apply it.`)
		} else {
			await localeService.setLocale(installedMatch, true)
		}
		return
	}

	const availableLanguages = await languagePackService.getAvailableLanguages()
	const availableMatch = availableLanguages.find(l => l.id === reactLocale)
	if (availableMatch) {
		if (isDevMode) {
			if (availableMatch.galleryExtension?.publisher.toLowerCase() === 'ms-ceintl') {
				await extensionManagementService.installFromGallery(availableMatch.galleryExtension, { isMachineScoped: false })
				await writeLocalePreference(environmentService, fileService, availableMatch.id)
				notificationService.info(`Void Dev: Display language preference saved as ${availableMatch.label}. Use "Developer: Reload Window" or restart Void manually to apply it.`)
			} else {
				notificationService.info(`Void Dev: Please install the ${availableMatch.label} language pack manually, then reload the window.`)
			}
		} else {
			await localeService.setLocale(availableMatch, true)
		}
		return
	}

	console.warn('No language pack found for locale:', reactLocale)
	await writeLocalePreference(environmentService, fileService, reactLocale)
	if (isDevMode) {
		notificationService.info(`Void Dev: Display language preference saved as ${reactLocale}. Use "Developer: Reload Window" or restart Void manually to apply it.`)
	}
}
