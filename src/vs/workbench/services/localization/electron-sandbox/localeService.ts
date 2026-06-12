/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *
 *  【业务逻辑说明 - Electron 区域设置服务】
 *  本文件实现 Electron 桌面环境的区域设置（语言）服务，负责：
 *
 *  【核心职责】
 *  1. setLocale() - 设置显示语言（写入 argv.json）
 *  2. clearLocalePreference() - 清除语言设置
 *  3. 自动安装语言包扩展（如果是 Microsoft 发布的）
 *  4. 提示用户重启应用以应用语言更改
 *
 *  【实现类】
 *  ┌─────────────────────────────────────────────────────────┐
 *  │              ILocaleService (接口)                     │
 *  │                     ↑ 实现                             │
 *  │           NativeLocaleService (本文件)                 │
 *  │                     ↑ 继承                             │
 *  │  ┌─────────────────┐  ┌─────────────────┐               │
 *  │  │ setLocale()     │  │ clearLocale()   │               │
 *  │  │ 设置语言        │  │ 清除设置        │               │
 *  │  └─────────────────┘  └─────────────────┘               │
 *  └─────────────────────────────────────────────────────────┘
 *
 *  【语言设置流程】
 *  1. 用户选择语言（通过 QuickPick）
 *  2. 调用 setLocale(languagePackItem)
 *  3. 检查语言包是否已安装
 *     └─ 未安装 → 打开扩展市场搜索并提示安装
 *  4. 写入 argv.json（位于用户数据目录）
 *     {
 *       "locale": "zh-cn"
 *     }
 *  5. 显示通知："需要重启应用以应用语言更改"
 *  6. 用户重启后，main.ts 读取 argv.json 加载对应语言包
 *
 *  【依赖服务】
 *  - @IJSONEditingService - 编辑 argv.json
 *  - @IEnvironmentService - 获取配置路径
 *  - @IExtensionManagementService - 安装语言包扩展
 *  - @INotificationService - 显示通知
 *  - @IHostService - 重启应用
 *
 *  【与 Web 版本的区别】
 *  - Electron: 写入 argv.json，需要重启
 *  - Web: 使用 localStorage，刷新页面即可
 *
 *  【修改历史】2026-04-02: 添加业务逻辑注释
 *--------------------------------------------------------------------------------------------*/

import { Language, LANGUAGE_DEFAULT } from '../../../../base/common/platform.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IJSONEditingService } from '../../configuration/common/jsonEditing.js';
import { IActiveLanguagePackService, ILocaleService } from '../common/locale.js';
import { ILanguagePackItem, ILanguagePackService } from '../../../../platform/languagePacks/common/languagePacks.js';
import { IPaneCompositePartService } from '../../panecomposite/browser/panecomposite.js';
import { IViewPaneContainer, ViewContainerLocation } from '../../../common/views.js';
import { IExtensionManagementService } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { IProgressService, ProgressLocation } from '../../../../platform/progress/common/progress.js';
import { localize } from '../../../../nls.js';
import { toAction } from '../../../../base/common/actions.js';
import { ITextFileService } from '../../textfile/common/textfiles.js';
import { parse } from '../../../../base/common/jsonc.js';
import { IEditorService } from '../../editor/common/editorService.js';
import { IHostService } from '../../host/browser/host.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';

// duplicate of IExtensionsViewPaneContainer in contrib
interface IExtensionsViewPaneContainer extends IViewPaneContainer {
	readonly searchValue: string | undefined;
	search(text: string): void;
	refresh(): Promise<void>;
}

// duplicate of VIEWLET_ID in contrib/extensions
const EXTENSIONS_VIEWLET_ID = 'workbench.view.extensions';

class NativeLocaleService implements ILocaleService {
	_serviceBrand: undefined;

	constructor(
		@IJSONEditingService private readonly jsonEditingService: IJSONEditingService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@INotificationService private readonly notificationService: INotificationService,
		@ILanguagePackService private readonly languagePackService: ILanguagePackService,
		@IPaneCompositePartService private readonly paneCompositePartService: IPaneCompositePartService,
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
		@IProgressService private readonly progressService: IProgressService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@IEditorService private readonly editorService: IEditorService,
		@IDialogService private readonly dialogService: IDialogService,
		@IHostService private readonly hostService: IHostService,
		@IProductService private readonly productService: IProductService
	) { }

	private async validateLocaleFile(): Promise<boolean> {
		try {
			const content = await this.textFileService.read(this.environmentService.argvResource, { encoding: 'utf8' });

			// This is the same logic that we do where argv.json is parsed so mirror that:
			// https://github.com/microsoft/vscode/blob/32d40cf44e893e87ac33ac4f08de1e5f7fe077fc/src/main.js#L238-L246
			parse(content.value);
		} catch (error) {
			this.notificationService.notify({
				severity: Severity.Error,
				message: localize('argvInvalid', 'Unable to write display language. Please open the runtime settings, correct errors/warnings in it and try again.'),
				actions: {
					primary: [
						toAction({
							id: 'openArgv',
							label: localize('openArgv', "Open Runtime Settings"),
							run: () => this.editorService.openEditor({ resource: this.environmentService.argvResource })
						})
					]
				}
			});
			return false;
		}
		return true;
	}

	private async writeLocaleValue(locale: string | undefined): Promise<boolean> {
		if (!(await this.validateLocaleFile())) {
			return false;
		}
		await this.jsonEditingService.write(this.environmentService.argvResource, [{ path: ['locale'], value: locale }], true);
		return true;
	}

	private getConfiguredDefaultLocale(): string {
		return typeof this.productService.defaultLocale === 'string' ? this.productService.defaultLocale.toLowerCase() : LANGUAGE_DEFAULT;
	}

	async setLocale(languagePackItem: ILanguagePackItem, skipDialog = false): Promise<void> {
		const locale = languagePackItem.id;
		if (locale === Language.value() || (!locale && Language.isDefaultVariant())) {
			return;
		}
		const installedLanguages = await this.languagePackService.getInstalledLanguages();
		try {

			// Only Desktop has the concept of installing language packs so we only do this for Desktop
			// and only if the language pack is not installed
			if (!installedLanguages.some(installedLanguage => installedLanguage.id === languagePackItem.id)) {

				// Only actually install a language pack from Microsoft
				if (languagePackItem.galleryExtension?.publisher.toLowerCase() !== 'ms-ceintl') {
					// Show the view so the user can see the language pack that they should install
					// as of now, there are no 3rd party language packs available on the Marketplace.
					const viewlet = await this.paneCompositePartService.openPaneComposite(EXTENSIONS_VIEWLET_ID, ViewContainerLocation.Sidebar);
					(viewlet?.getViewPaneContainer() as IExtensionsViewPaneContainer).search(`@id:${languagePackItem.extensionId}`);
					return;
				}

				await this.progressService.withProgress(
					{
						location: ProgressLocation.Notification,
						title: localize('installing', "Installing {0} language support...", languagePackItem.label),
					},
					progress => this.extensionManagementService.installFromGallery(languagePackItem.galleryExtension!, {
						// Setting this to false is how you get the extension to be synced with Settings Sync (if enabled).
						isMachineScoped: false,
					})
				);
			}

			if (!skipDialog && !await this.showReloadDialog(languagePackItem.label)) {
				return;
			}
			if (!await this.writeLocaleValue(locale)) {
				return;
			}
			await this.hostService.reload();
		} catch (err) {
			this.notificationService.error(err);
		}
	}

	async clearLocalePreference(): Promise<void> {
		try {
			const defaultLocale = this.getConfiguredDefaultLocale();
			if (Language.value() !== defaultLocale && !await this.showClearPreferenceDialog()) {
				return;
			}
			if (!await this.writeLocaleValue(undefined)) {
				return;
			}
			if (Language.value() !== defaultLocale) {
				await this.hostService.reload();
			}
		} catch (err) {
			this.notificationService.error(err);
		}
	}

	private async showReloadDialog(languageName: string): Promise<boolean> {
		const { confirmed } = await this.dialogService.confirm({
			message: localize('reloadDisplayLanguageMessage1', "Reload {0} to switch to {1}?", this.productService.nameLong, languageName),
			detail: localize(
				'reloadDisplayLanguageDetail1',
				"To change the display language to {0}, {1} needs to reload the window.",
				languageName,
				this.productService.nameLong
			),
			primaryButton: localize({ key: 'reload', comment: ['&& denotes a mnemonic character'] }, "&&Reload"),
		});

		return confirmed;
	}

	private async showClearPreferenceDialog(): Promise<boolean> {
		const { confirmed } = await this.dialogService.confirm({
			message: localize('reloadDefaultDisplayLanguageMessage', "Reload {0} to restore the default display language?", this.productService.nameLong),
			detail: localize(
				'reloadDefaultDisplayLanguageDetail',
				"To clear the display language preference, {0} needs to reload the window.",
				this.productService.nameLong
			),
			primaryButton: localize({ key: 'reloadDefaultLanguage', comment: ['&& denotes a mnemonic character'] }, "&&Reload"),
		});

		return confirmed;
	}
}

// This is its own service because the localeService depends on IJSONEditingService which causes a circular dependency
// Once that's ironed out, we can fold this into the localeService.
class NativeActiveLanguagePackService implements IActiveLanguagePackService {
	_serviceBrand: undefined;

	constructor(
		@ILanguagePackService private readonly languagePackService: ILanguagePackService
	) { }

	async getExtensionIdProvidingCurrentLocale(): Promise<string | undefined> {
		const language = Language.value();
		if (language === LANGUAGE_DEFAULT) {
			return undefined;
		}
		const languages = await this.languagePackService.getInstalledLanguages();
		const languagePack = languages.find(l => l.id === language);
		return languagePack?.extensionId;
	}
}

registerSingleton(ILocaleService, NativeLocaleService, InstantiationType.Delayed);
registerSingleton(IActiveLanguagePackService, NativeActiveLanguagePackService, InstantiationType.Delayed);
