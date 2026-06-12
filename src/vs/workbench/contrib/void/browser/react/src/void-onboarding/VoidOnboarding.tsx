/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
  *--------------------------------------------------------------------------------------*/

 import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccessor, useIsDark, useSettingsState, useRefreshModelState } from '../util/services.js';
 import { Brain, Check, ChevronRight, DollarSign, ExternalLink, Globe, Lock, X, Loader2, Wifi, WifiOff } from 'lucide-react';
 import { displayInfoOfProviderName, ProviderName, providerNames, localProviderNames, featureNames, FeatureName, isFeatureNameDisabled, RefreshableProviderName } from '../../../../common/voidSettingsTypes.js';
 import { ChatMarkdownRender } from '../markdown/ChatMarkdownRender.js';
import { OllamaSetupInstructions, OneClickSwitchButton, SettingsForProvider, ModelDump } from '../void-settings-tsx/Settings.js';
import { ColorScheme } from '../../../../../../../platform/theme/common/theme.js';
import ErrorBoundary from '../sidebar-tsx/ErrorBoundary.js';
import { isLinux } from '../../../../../../../base/common/platform.js';
import { t, useLocale, getLocale, getSupportedLocales } from '../i18n/index.js';
import { applyGlobalLocale } from '../util/locale.js';

const OVERRIDE_VALUE = false

export const VoidOnboarding = () => {

	const voidSettingsState = useSettingsState()
	const isOnboardingComplete = voidSettingsState.globalSettings.isOnboardingComplete || OVERRIDE_VALUE

	const isDark = useIsDark()

	// Onboarding 完成后直接 return null，彻底从 DOM 移除 overlay。
	// 原因：Chromium 的 `-webkit-app-region` hit-test 不受 pointer-events 影响，
	// 即使设了 pointer-events:none，appRegion:none 的元素仍会阻断底层 drag 区域。
	// 只有从 DOM 移除，.titlebar-drag-region 的 appRegion:drag 才能被 hit-test 命中。
	if (isOnboardingComplete) {
		return null
	}

	return (
		<div className={`@@void-scope ${isDark ? 'dark' : ''}`}>
			{/* overlay 从 top:30px 开始，不覆盖标题栏区域。
				标题栏约 30px 高，原生 -webkit-app-region:drag 在标题栏中生效。
				Chromium 的 app-region hit-test 不受 pointer-events 影响，
				只有不覆盖标题栏，才能保证原生 drag 可达。 */}
			<div
				className={`
					bg-void-bg-3 fixed right-0 bottom-0 left-0 width-full z-[99999]
					opacity-100 pointer-events-auto
				`}
				style={{ top: '30px', height: 'calc(100vh - 30px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
			>
				<ErrorBoundary>
					<VoidOnboardingContent />
				</ErrorBoundary>
			</div>
		</div>
	)
}

const VoidIcon = () => {
	const accessor = useAccessor()
	const themeService = accessor.get('IThemeService')

	const divRef = useRef<HTMLDivElement | null>(null)

	useEffect(() => {
		// void icon style
		const updateTheme = () => {
			const theme = themeService.getColorTheme().type
			const isDark = theme === ColorScheme.DARK || theme === ColorScheme.HIGH_CONTRAST_DARK
			if (divRef.current) {
				divRef.current.style.maxWidth = '220px'
				divRef.current.style.opacity = '50%'
				divRef.current.style.filter = isDark ? '' : 'invert(1)' //brightness(.5)
			}
		}
		updateTheme()
		const d = themeService.onDidColorThemeChange(updateTheme)
		return () => d.dispose()
	}, [])

	return <div ref={divRef} className='@@void-void-icon' />
}

const FADE_DURATION_MS = 2000

const FadeIn = ({ children, className, delayMs = 0, durationMs, ...props }: { children: React.ReactNode, delayMs?: number, durationMs?: number, className?: string } & React.HTMLAttributes<HTMLDivElement>) => {

	const [opacity, setOpacity] = useState(0)

	const effectiveDurationMs = durationMs ?? FADE_DURATION_MS

	useEffect(() => {

		const timeout = setTimeout(() => {
			setOpacity(1)
		}, delayMs)

		return () => clearTimeout(timeout)
	}, [setOpacity, delayMs])


	return (
		<div className={className} style={{ opacity, transition: `opacity ${effectiveDurationMs}ms ease-in-out` }} {...props}>
			{children}
		</div>
	)
}

// Onboarding

// =============================================
//  New AddProvidersPage Component and helpers
// =============================================

const tabNameKeys = ['default', 'local', 'compatible'] as const;
type TabNameKey = typeof tabNameKeys[number];

const tabKeyToI18n: Record<TabNameKey, keyof import('../i18n/types.js').TranslationKeys> = {
	default: 'onboarding.default',
	local: 'onboarding.local',
	compatible: 'onboarding.compatible',
};

// Data structures for provider tabs — only 3 tabs
const providerNamesOfTab: Record<TabNameKey, ProviderName[]> = {
	default: ['aiyiwei'],
	local: localProviderNames,
	compatible: ['openAICompatible'],
};

const descKeyOfTab: Record<TabNameKey, keyof import('../i18n/types.js').TranslationKeys> = {
	default: 'onboarding.defaultDesc',
	local: 'onboarding.localDesc',
	compatible: 'onboarding.compatibleDesc',
};


const featureNameMap: { displayKey: keyof import('../i18n/types.js').TranslationKeys, featureName: FeatureName }[] = [
	{ displayKey: 'onboarding.featureChat', featureName: 'Chat' },
	{ displayKey: 'onboarding.featureQuickEdit', featureName: 'Ctrl+K' },
	{ displayKey: 'onboarding.featureAutocomplete', featureName: 'Autocomplete' },
	{ displayKey: 'onboarding.featureFastApply', featureName: 'Apply' },
	{ displayKey: 'onboarding.featureSourceControl', featureName: 'SCM' },
];

const LanguageSelector = () => {
	const [locale, changeLocale] = useLocale();
	const locales = getSupportedLocales();

	return (
		<div className="flex items-center gap-2">
			<Globe className="w-4 h-4 text-void-fg-3 opacity-60" />
			<div className="flex rounded-md overflow-hidden border border-void-border-2">
				{locales.map(l => (
					<button
						key={l.id}
						onClick={() => changeLocale(l.id)}
						className={`px-3 py-1 text-xs font-medium transition-all duration-150
							${locale === l.id
								? 'bg-[#0e70c0]/80 text-white'
								: 'bg-void-bg-2/50 text-void-fg-3 hover:bg-void-bg-2 hover:text-void-fg-1'
							}`}
					>
						{l.shortLabel}
					</button>
				))}
			</div>
		</div>
	);
};

// Fetch models button for refreshable providers (aiyiwei, etc.)
const FetchModelsButton = ({ providerName }: { providerName: RefreshableProviderName }) => {
	const accessor = useAccessor();
	const refreshModelService = accessor.get('IRefreshModelService');
	const refreshState = useRefreshModelState();
	const state = refreshState[providerName];
	const isRefreshing = state?.state === 'refreshing';

	const [statusMsg, setStatusMsg] = useState<string | null>(null);

	const handleFetch = useCallback(() => {
		setStatusMsg(null);
		refreshModelService.startRefreshingModels(providerName, { enableProviderOnSuccess: true, doNotFire: false });
	}, [refreshModelService, providerName]);

	useEffect(() => {
		if (state?.state === 'finished') setStatusMsg(t('onboarding.fetchSuccess'));
		else if (state?.state === 'error') setStatusMsg(t('onboarding.fetchError'));
	}, [state?.state]);

	return (
		<div className="flex items-center gap-2 mt-2">
			<button
				onClick={handleFetch}
				disabled={isRefreshing}
				className="px-3 py-1.5 text-xs bg-[#0e70c0] text-white rounded hover:bg-[#0e70c0]/80 transition-all whitespace-nowrap flex items-center gap-1 disabled:opacity-50"
			>
				{isRefreshing && <Loader2 className="w-3 h-3 animate-spin" />}
				{isRefreshing ? t('onboarding.fetchingModels') : t('onboarding.fetchModels')}
			</button>
			{statusMsg && (
				<span className={`text-xs ${state?.state === 'error' ? 'text-red-400' : 'text-emerald-400'}`}>
					{statusMsg}
				</span>
			)}
		</div>
	);
};

// Test connectivity button — sends a lightweight /v1/models call
const TestConnectionButton = ({ providerName }: { providerName: RefreshableProviderName }) => {
	const accessor = useAccessor();
	const llmMessageService = accessor.get('ILLMMessageService');
	const [status, setStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
	const [errDetail, setErrDetail] = useState('');

	const handleTest = useCallback(() => {
		setStatus('testing');
		setErrDetail('');
		llmMessageService.openAICompatibleList({
			providerName,
			onSuccess: () => setStatus('success'),
			onError: ({ error }) => {
				setStatus('error');
				setErrDetail(typeof error === 'string' ? error : String(error));
			},
		});
	}, [llmMessageService, providerName]);

	return (
		<div className="flex items-center gap-2 mt-2">
			<button
				onClick={handleTest}
				disabled={status === 'testing'}
				className="px-3 py-1.5 text-xs bg-void-bg-2 border border-void-border-2 text-void-fg-1 rounded hover:bg-void-bg-2/80 transition-all whitespace-nowrap flex items-center gap-1 disabled:opacity-50"
			>
				{status === 'testing' ? <Loader2 className="w-3 h-3 animate-spin" /> : status === 'success' ? <Wifi className="w-3 h-3 text-emerald-400" /> : <Wifi className="w-3 h-3" />}
				{status === 'testing' ? t('onboarding.testingConnection')
					: status === 'success' ? t('onboarding.connectionSuccess')
					: status === 'error' ? t('onboarding.connectionError')
					: t('onboarding.testConnection')}
			</button>
			{status === 'error' && errDetail && (
				<span className="text-xs text-red-400 max-w-[200px] truncate" title={errDetail}>{errDetail}</span>
			)}
		</div>
	);
};

const AddProvidersPage = ({ pageIndex, setPageIndex }: { pageIndex: number, setPageIndex: (index: number) => void }) => {
	const [currentTab, setCurrentTab] = useState<TabNameKey>('default');
	const settingsState = useSettingsState();
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	// Clear error message after 5 seconds
	useEffect(() => {
		let timeoutId: NodeJS.Timeout | null = null;

		if (errorMessage) {
			timeoutId = setTimeout(() => {
				setErrorMessage(null);
			}, 5000);
		}

		return () => {
			if (timeoutId) {
				clearTimeout(timeoutId);
			}
		};
	}, [errorMessage]);

	const aiyiweiApiKeyFilled = !!settingsState.settingsOfProvider.aiyiwei.apiKey && settingsState.settingsOfProvider.aiyiwei.apiKey.length > 10;

	return (<div className="flex flex-col md:flex-row w-full h-[80vh] gap-6 max-w-[900px] mx-auto relative">
		{/* Left Column */}
		<div className="md:w-1/4 w-full flex flex-col gap-6 p-6 border-none border-void-border-2 h-full overflow-y-auto">
			{/* Tab Selector — only 3 tabs */}
			<div className="flex md:flex-col gap-2">
				{tabNameKeys.map(tabKey => (
					<button
						key={tabKey}
						className={`py-2 px-4 rounded-md text-left ${currentTab === tabKey
							? 'bg-[#0e70c0]/80 text-white font-medium shadow-sm'
							: 'bg-void-bg-2 hover:bg-void-bg-2/80 text-void-fg-1'
							} transition-all duration-200`}
						onClick={() => {
							setCurrentTab(tabKey);
							setErrorMessage(null);
						}}
					>
						{t(tabKeyToI18n[tabKey])}
					</button>
				))}
			</div>

			{/* Feature Checklist */}
			<div className="flex flex-col gap-1 mt-4 text-sm opacity-80">
				{featureNameMap.map(({ displayKey, featureName }) => {
					const hasModel = settingsState.modelSelectionOfFeature[featureName] !== null;
					return (
						<div key={featureName} className="flex items-center gap-2">
							{hasModel ? (
								<Check className="w-4 h-4 text-emerald-500" />
							) : (
								<div className="w-3 h-3 rounded-full flex items-center justify-center">
									<div className="w-1 h-1 rounded-full bg-white/70"></div>
								</div>
							)}
							<span>{t(displayKey)}</span>
						</div>
					);
				})}
			</div>
		</div>

		{/* Right Column — no scroll on the column itself */}
		<div className="flex-1 flex flex-col items-center justify-start p-6 h-full overflow-hidden">
			{/* Top: title + provider settings (fixed, no scroll) */}
			<div className="w-full max-w-xl shrink-0">
				<div className="text-5xl mb-2 text-center w-full">{t('onboarding.addProvider')}</div>

				<div className="w-full mt-4 mb-4">
					<div className="text-4xl font-light my-2 w-full">{t(tabKeyToI18n[currentTab])}</div>
					<div className="text-sm opacity-80 text-void-fg-3 my-2 w-full">{t(descKeyOfTab[currentTab])}</div>
				</div>

				{providerNamesOfTab[currentTab].map((providerName) => (
					<div key={providerName} className="w-full mb-4">
						<div className="text-xl mb-2">
							{t('onboarding.add')} {displayInfoOfProviderName(providerName).title}
						</div>
						<div>
							<SettingsForProvider providerName={providerName} showProviderTitle={false} showProviderSuggestions={true} />
						</div>

						{/* Fetch models + Test connection buttons for aiyiwei */}
						{providerName === 'aiyiwei' && aiyiweiApiKeyFilled && (
							<div className="flex flex-wrap gap-3 mt-3">
								<FetchModelsButton providerName="aiyiwei" />
								<TestConnectionButton providerName="aiyiwei" />
							</div>
						)}

						{providerName === 'ollama' && <OllamaSetupInstructions />}
					</div>
				))}
			</div>

			{/* Middle: model list (scrollable, takes remaining space) */}
			{(currentTab === 'default' || currentTab === 'local') && (
				<div className="w-full max-w-xl mt-2 bg-void-bg-2/50 rounded-lg p-4 border border-void-border-4 flex flex-col min-h-0 flex-1 overflow-hidden">
					<div className="flex items-center gap-2 mb-2 shrink-0">
						<div className="text-xl font-medium">{t('onboarding.models')}</div>
					</div>

					{currentTab === 'local' && (
						<div className="text-sm opacity-80 text-void-fg-3 mb-2 w-full shrink-0">{t('onboarding.localModelsAutoDetect')}</div>
					)}

					<div className="overflow-y-auto min-h-0 flex-1">
						{currentTab === 'default' && <ModelDump filteredProviders={['aiyiwei']} />}
						{currentTab === 'local' && <ModelDump filteredProviders={localProviderNames} />}
					</div>
				</div>
			)}

			{/* Bottom: navigation buttons (fixed at bottom) */}
			<div className="flex flex-col items-end w-full max-w-xl shrink-0 pt-4">
				{errorMessage && (
					<div className="text-amber-400 mb-2 text-sm opacity-80 transition-opacity duration-300">{errorMessage}</div>
				)}
				<div className="flex items-center gap-2">
					<PreviousButton onClick={() => setPageIndex(pageIndex - 1)} />
					<NextButton
						onClick={() => {
							// Allow proceeding if aiyiwei API key is filled (models will auto-refresh)
							if (aiyiweiApiKeyFilled) {
								setPageIndex(pageIndex + 1);
								setErrorMessage(null);
								return;
							}

							const isDisabled = isFeatureNameDisabled('Chat', settingsState)

							if (!isDisabled) {
								setPageIndex(pageIndex + 1);
								setErrorMessage(null);
							} else {
								setErrorMessage(t('onboarding.chatModelRequired'));
							}
						}}
					/>
				</div>
			</div>
		</div>
	</div>);
};
// =============================================
// 	OnboardingPage
// 		title:
// 			div
// 				"Welcome to Void"
// 			image
// 		content:<></>
// 		title
// 		content
// 		prev/next

// 	OnboardingPage
// 		title:
// 			div
// 				"How would you like to use Void?"
// 		content:
// 			ModelQuestionContent
// 				|
// 					div
// 						"I want to:"
// 					div
// 						"Use the smartest models"
// 						"Keep my data fully private"
// 						"Save money"
// 						"I don't know"
// 				| div
// 					| div
// 						"We recommend using "
// 						"Set API"
// 					| div
// 						""
// 					| div
//
// 		title
// 		content
// 		prev/next
//
// 	OnboardingPage
// 		title
// 		content
// 		prev/next

const NextButton = ({ onClick, ...props }: { onClick: () => void } & React.ButtonHTMLAttributes<HTMLButtonElement>) => {

	// Create a new props object without the disabled attribute
	const { disabled, ...buttonProps } = props;

	return (
		<button
			onClick={disabled ? undefined : onClick}
			onDoubleClick={onClick}
			className={`px-6 py-2 bg-zinc-100 ${disabled
				? 'bg-zinc-100/40 cursor-not-allowed'
				: 'hover:bg-zinc-100'
				} rounded text-black duration-600 transition-all
			`}
			{...disabled && {
				'data-tooltip-id': 'void-tooltip',
				"data-tooltip-content": t('onboarding.nextTooltip'),
				"data-tooltip-place": 'top',
			}}
			{...buttonProps}
		>
			{t('onboarding.next')}
		</button>
	)
}

const PreviousButton = ({ onClick, ...props }: { onClick: () => void } & React.ButtonHTMLAttributes<HTMLButtonElement>) => {
	return (
		<button
			onClick={onClick}
			className="px-6 py-2 rounded text-void-fg-3 opacity-80 hover:brightness-115 duration-600 transition-all"
			{...props}
		>
			{t('onboarding.back')}
		</button>
	)
}



const OnboardingPageShell = ({ top, bottom, content, hasMaxWidth = true, className = '', }: {
	top?: React.ReactNode,
	bottom?: React.ReactNode,
	content?: React.ReactNode,
	hasMaxWidth?: boolean,
	className?: string,
}) => {
	return (
		<div className={`h-[80vh] text-lg flex flex-col gap-4 w-full mx-auto ${hasMaxWidth ? 'max-w-[600px]' : ''} ${className}`}>
			{top && <FadeIn className='w-full mb-auto pt-16'>{top}</FadeIn>}
			{content && <FadeIn className='w-full my-auto'>{content}</FadeIn>}
			{bottom && <div className='w-full pb-8'>{bottom}</div>}
		</div>
	)
}

const OllamaDownloadOrRemoveModelButton = ({ modelName, isModelInstalled, sizeGb }: { modelName: string, isModelInstalled: boolean, sizeGb: number | false | 'not-known' }) => {
	// for now just link to the ollama download page
	return <a
		href={`https://ollama.com/library/${modelName}`}
		target="_blank"
		rel="noopener noreferrer"
		className="flex items-center justify-center text-void-fg-2 hover:text-void-fg-1"
	>
		<ExternalLink className="w-3.5 h-3.5" />
	</a>

}


const YesNoText = ({ val }: { val: boolean | null }) => {

	return <div
		className={
			val === true ? "text text-emerald-500"
				: val === false ? 'text-rose-600'
					: "text text-amber-300"
		}
	>
		{
			val === true ? t('common.yes')
				: val === false ? t('common.no')
					: t('common.yesStar')
		}
	</div>

}



const abbreviateNumber = (num: number): string => {
	if (num >= 1000000) {
		// For millions
		return Math.floor(num / 1000000) + 'M';
	} else if (num >= 1000) {
		// For thousands
		return Math.floor(num / 1000) + 'K';
	} else {
		// For numbers less than 1000
		return num.toString();
	}
}





const PrimaryActionButton = ({ children, className, ringSize, ...props }: { children: React.ReactNode, ringSize?: undefined | 'xl' | 'screen' } & React.ButtonHTMLAttributes<HTMLButtonElement>) => {


	return (
		<button
			type='button'
			className={`
				flex items-center justify-center

				text-white dark:text-black
				bg-black/90 dark:bg-white/90

				${ringSize === 'xl' ? `
					gap-2 px-16 py-8
					transition-all duration-300 ease-in-out
					`
					: ringSize === 'screen' ? `
					gap-2 px-16 py-8
					transition-all duration-1000 ease-in-out
					`: ringSize === undefined ? `
					gap-1 px-4 py-2
					transition-all duration-300 ease-in-out
				`: ''}

				rounded-lg
				group
				${className}
			`}
			{...props}
		>
			{children}
			<ChevronRight
				className={`
					transition-all duration-300 ease-in-out

					transform
					group-hover:translate-x-1
					group-active:translate-x-1
				`}
			/>
		</button>
	)
}


type WantToUseOption = 'smart' | 'private' | 'cheap' | 'all'

const VoidOnboardingContent = () => {
	const [locale] = useLocale()

	const accessor = useAccessor()
	const voidSettingsService = accessor.get('IVoidSettingsService')
	const voidMetricsService = accessor.get('IMetricsService')
	const localeService = accessor.get('ILocaleService')
	const languagePackService = accessor.get('ILanguagePackService')
	const environmentService = accessor.get('IEnvironmentService')
	const fileService = accessor.get('IFileService')
	const notificationService = accessor.get('INotificationService')
	const extensionManagementService = accessor.get('IExtensionManagementService')

	const voidSettingsState = useSettingsState()

	const [pageIndex, setPageIndex] = useState(0)

	// page 1 state
	const [wantToUseOption, setWantToUseOption] = useState<WantToUseOption>('smart')

	// Replace the single selectedProviderName with four separate states
	// page 2 state - each tab gets its own state
	const [selectedIntelligentProvider, setSelectedIntelligentProvider] = useState<ProviderName>('anthropic');
	const [selectedPrivateProvider, setSelectedPrivateProvider] = useState<ProviderName>('ollama');
	const [selectedAffordableProvider, setSelectedAffordableProvider] = useState<ProviderName>('gemini');
	const [selectedAllProvider, setSelectedAllProvider] = useState<ProviderName>('anthropic');

	// Helper function to get the current selected provider based on active tab
	const getSelectedProvider = (): ProviderName => {
		switch (wantToUseOption) {
			case 'smart': return selectedIntelligentProvider;
			case 'private': return selectedPrivateProvider;
			case 'cheap': return selectedAffordableProvider;
			case 'all': return selectedAllProvider;
		}
	}

	// Helper function to set the selected provider for the current tab
	const setSelectedProvider = (provider: ProviderName) => {
		switch (wantToUseOption) {
			case 'smart': setSelectedIntelligentProvider(provider); break;
			case 'private': setSelectedPrivateProvider(provider); break;
			case 'cheap': setSelectedAffordableProvider(provider); break;
			case 'all': setSelectedAllProvider(provider); break;
		}
	}

	const providerNamesOfWantToUseOption: { [wantToUseOption in WantToUseOption]: ProviderName[] } = {
		smart: ['anthropic', 'openAI', 'gemini', 'openRouter'],
		private: ['ollama', 'vLLM', 'openAICompatible', 'lmStudio'],
		cheap: ['gemini', 'deepseek', 'openRouter', 'ollama', 'vLLM'],
		all: providerNames,
	}


	const selectedProviderName = getSelectedProvider();
	const didFillInProviderSettings = selectedProviderName && voidSettingsState.settingsOfProvider[selectedProviderName]._didFillInProviderSettings
	const isApiKeyLongEnoughIfApiKeyExists = selectedProviderName && voidSettingsState.settingsOfProvider[selectedProviderName].apiKey ? voidSettingsState.settingsOfProvider[selectedProviderName].apiKey.length > 15 : true
	const isAtLeastOneModel = selectedProviderName && voidSettingsState.settingsOfProvider[selectedProviderName].models.length >= 1

	const didFillInSelectedProviderSettings = !!(didFillInProviderSettings && isApiKeyLongEnoughIfApiKeyExists && isAtLeastOneModel)
	const isDevMode = !environmentService.isBuilt

	const prevAndNextButtons = <div className="max-w-[600px] w-full mx-auto flex flex-col items-end">
		<div className="flex items-center gap-2">
			<PreviousButton
				onClick={() => { setPageIndex(pageIndex - 1) }}
			/>
			<NextButton
				onClick={() => { setPageIndex(pageIndex + 1) }}
			/>
		</div>
	</div>

	const handleCompleteOnboarding = useCallback(async () => {
		await voidSettingsService.setGlobalSetting('isOnboardingComplete', true);
		voidMetricsService.capture('Completed Onboarding', { selectedProviderName, wantToUseOption })

		const reactLocale = getLocale();

		try {
			await applyGlobalLocale({ reactLocale, isDevMode, localeService, languagePackService, environmentService, fileService, notificationService, extensionManagementService })
		} catch (e) {
			console.error('Failed to set VSCode locale', e);
		}
	}, [voidSettingsService, voidMetricsService, selectedProviderName, wantToUseOption, isDevMode, localeService, languagePackService, environmentService, fileService, notificationService, extensionManagementService]);


	const lastPagePrevAndNextButtons = <div className="max-w-[600px] w-full mx-auto flex flex-col items-end">
		<div className="flex items-center gap-2">
			<PreviousButton
				onClick={() => { setPageIndex(pageIndex - 1) }}
			/>
			<PrimaryActionButton
				onClick={handleCompleteOnboarding}
				ringSize={voidSettingsState.globalSettings.isOnboardingComplete ? 'screen' : undefined}
			>{t('onboarding.enterTheVoid')}</PrimaryActionButton>
		</div>
	</div>


	// cannot be md
	const basicDescOfWantToUseOption: { [wantToUseOption in WantToUseOption]: string } = {
		smart: t('onboarding.wantToUse.smartDesc'),
		private: t('onboarding.wantToUse.privateDesc'),
		cheap: t('onboarding.wantToUse.cheapDesc'),
		all: "",
	}

	// can be md
	const detailedDescOfWantToUseOption: { [wantToUseOption in WantToUseOption]: string } = {
		smart: t('onboarding.wantToUse.smartDetail'),
		private: t('onboarding.wantToUse.privateDetail'),
		cheap: t('onboarding.wantToUse.cheapDetail'),
		all: "",
	}

	// Modified: initialize separate provider states on initial render instead of watching wantToUseOption changes
	useEffect(() => {
		if (selectedIntelligentProvider === undefined) {
			setSelectedIntelligentProvider(providerNamesOfWantToUseOption['smart'][0]);
		}
		if (selectedPrivateProvider === undefined) {
			setSelectedPrivateProvider(providerNamesOfWantToUseOption['private'][0]);
		}
		if (selectedAffordableProvider === undefined) {
			setSelectedAffordableProvider(providerNamesOfWantToUseOption['cheap'][0]);
		}
		if (selectedAllProvider === undefined) {
			setSelectedAllProvider(providerNamesOfWantToUseOption['all'][0]);
		}
	}, []);

	// reset the page to page 0 if the user redos onboarding
	useEffect(() => {
		if (!voidSettingsState.globalSettings.isOnboardingComplete) {
			setPageIndex(0)
		}
	}, [setPageIndex, voidSettingsState.globalSettings.isOnboardingComplete])


	const contentOfIdx: { [pageIndex: number]: React.ReactNode } = {
		0: <OnboardingPageShell
			content={
				<div className='flex flex-col items-center gap-8'>
					<div className="text-5xl font-light text-center">{t('onboarding.welcome')}</div>

					{/* Slice of Void image */}
					<div className='max-w-md w-full h-[30vh] mx-auto flex items-center justify-center'>
						{!isLinux && <VoidIcon />}
					</div>


					<FadeIn
						delayMs={1000}
					>
						<div className="flex items-center gap-4">
							<LanguageSelector />
							<PrimaryActionButton
								onClick={() => { setPageIndex(1) }}
							>
								{t('onboarding.getStarted')}
							</PrimaryActionButton>
						</div>
					</FadeIn>

				</div>
			}
		/>,

		1: <OnboardingPageShell hasMaxWidth={false}
			content={
				<AddProvidersPage pageIndex={pageIndex} setPageIndex={setPageIndex} />
			}
		/>,
		2: <OnboardingPageShell

			content={
				<div>
					<div className="text-5xl font-light text-center">{t('onboarding.settingsAndThemes')}</div>

					<div className="mt-8 text-center flex flex-col items-center gap-4 w-full max-w-md mx-auto">
						<h4 className="text-void-fg-3 mb-4">{t('onboarding.transferSettings')}</h4>
						<OneClickSwitchButton className='w-full px-4 py-2' fromEditor="VS Code" />
						<OneClickSwitchButton className='w-full px-4 py-2' fromEditor="Cursor" />
						<OneClickSwitchButton className='w-full px-4 py-2' fromEditor="Windsurf" />
					</div>
				</div>
			}
			bottom={lastPagePrevAndNextButtons}
		/>,
	}


	return <div key={`${locale}-${pageIndex}`} className="w-full h-[80vh] text-left mx-auto flex flex-col items-center justify-center">
		<ErrorBoundary>
			{contentOfIdx[pageIndex]}
		</ErrorBoundary>
	</div>

}
