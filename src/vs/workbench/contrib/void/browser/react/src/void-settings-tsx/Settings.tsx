/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react'; // Added useRef import just in case it was missed, though likely already present
import { ProviderName, SettingName, displayInfoOfSettingName, providerNames, VoidStatefulModelInfo, customSettingNamesOfProvider, RefreshableProviderName, refreshableProviderNames, displayInfoOfProviderName, nonlocalProviderNames, localProviderNames, GlobalSettingName, featureNames, displayInfoOfFeatureName, isProviderNameDisabled, FeatureName, hasDownloadButtonsOnModelsProviderNames, subTextMdOfProviderName, AutoApproveSettings, TrustLevel, TRUST_LEVEL_PRESETS, DEFAULT_TERMINAL_ALLOWLIST, SkillInfo } from '../../../../common/voidSettingsTypes.js'
import ErrorBoundary from '../sidebar-tsx/ErrorBoundary.js'
import { VoidButtonBgDarken, VoidCustomDropdownBox, VoidInputBox2, VoidSimpleInputBox, VoidSwitch } from '../util/inputs.js'
import { useAccessor, useIsDark, useIsOptedOut, useRefreshModelListener, useRefreshModelState, useSettingsState } from '../util/services.js'
import { X, RefreshCw, Loader2, Check, Asterisk, Plus, ExternalLink } from 'lucide-react'
import { URI } from '../../../../../../../base/common/uri.js'
import { ModelDropdown } from './ModelDropdown.js'
import { ChatMarkdownRender } from '../markdown/ChatMarkdownRender.js'
import { WarningBox } from './WarningBox.js'
import { os } from '../../../../common/helpers/systemInfo.js'
import { IconLoading } from '../sidebar-tsx/SidebarChat.js'
import { ToolApprovalType, toolApprovalTypes } from '../../../../common/toolsServiceTypes.js'
import Severity from '../../../../../../../base/common/severity.js'
import { getModelCapabilities, modelOverrideKeys, ModelOverrides } from '../../../../common/modelCapabilities.js';
import { TransferEditorType, TransferFilesInfo } from '../../../extensionTransferTypes.js';
import { MCPServer } from '../../../../common/mcpServiceTypes.js';
import { useMCPServiceState } from '../util/services.js';
import { MarketplaceItem, MarketplaceSearchParams, MarketplaceSortBy, MarketplaceFilter, formatUseCount, formatRelativeTime } from '../../../../common/marketplaceTypes.js';
import { OPT_OUT_KEY } from '../../../../common/storageKeys.js';
import { StorageScope, StorageTarget } from '../../../../../../../platform/storage/common/storage.js';
import { t, useLocale, getSupportedLocales } from '../i18n/index.js';
import { applyGlobalLocale } from '../util/locale.js';

type Tab =
	| 'models'
	| 'features'
	| 'trust'
	| 'codeIndex'
	| 'mcp'
	| 'skill'
	| 'general';


const ButtonLeftTextRightOption = ({ text, leftButton }: { text: string, leftButton?: React.ReactNode }) => {

	return <div className='flex items-center text-void-fg-3 px-3 py-0.5 rounded-sm overflow-hidden gap-2'>
		{leftButton ? leftButton : null}
		<span>
			{text}
		</span>
	</div>
}

// models
const RefreshModelButton = ({ providerName }: { providerName: RefreshableProviderName }) => {

	const refreshModelState = useRefreshModelState()

	const accessor = useAccessor()
	const refreshModelService = accessor.get('IRefreshModelService')
	const metricsService = accessor.get('IMetricsService')

	const [justFinished, setJustFinished] = useState<null | 'finished' | 'error'>(null)

	useRefreshModelListener(
		useCallback((providerName2, refreshModelState) => {
			if (providerName2 !== providerName) return
			const { state } = refreshModelState[providerName]
			if (!(state === 'finished' || state === 'error')) return
			// now we know we just entered 'finished' state for this providerName
			setJustFinished(state)
			const tid = setTimeout(() => { setJustFinished(null) }, 2000)
			return () => clearTimeout(tid)
		}, [providerName])
	)

	const { state } = refreshModelState[providerName]

	const { title: providerTitle } = displayInfoOfProviderName(providerName)

	return <ButtonLeftTextRightOption

		leftButton={
			<button
				className='flex items-center'
				disabled={state === 'refreshing' || justFinished !== null}
				onClick={() => {
					refreshModelService.startRefreshingModels(providerName, { enableProviderOnSuccess: false, doNotFire: false })
					metricsService.capture('Click', { providerName, action: 'Refresh Models' })
				}}
			>
				{justFinished === 'finished' ? <Check className='stroke-green-500 size-3' />
					: justFinished === 'error' ? <X className='stroke-red-500 size-3' />
						: state === 'refreshing' ? <Loader2 className='size-3 animate-spin' />
							: <RefreshCw className='size-3' />}
			</button>
		}

		text={justFinished === 'finished' ? t('settings.models.upToDate', providerTitle)
			: justFinished === 'error' ? t('settings.models.notFound', providerTitle)
				: t('settings.models.manuallyRefresh', providerTitle)}
	/>
}

const RefreshableModels = () => {
	const settingsState = useSettingsState()


	const buttons = refreshableProviderNames.map(providerName => {
		if (!settingsState.settingsOfProvider[providerName]._didFillInProviderSettings) return null
		return <RefreshModelButton key={providerName} providerName={providerName} />
	})

	return <>
		{buttons}
	</>

}



export const AnimatedCheckmarkButton = ({ text, className }: { text?: string, className?: string }) => {
	const [dashOffset, setDashOffset] = useState(40);

	useEffect(() => {
		const startTime = performance.now();
		const duration = 500; // 500ms animation

		const animate = (currentTime: number) => {
			const elapsed = currentTime - startTime;
			const progress = Math.min(elapsed / duration, 1);
			const newOffset = 40 - (progress * 40);

			setDashOffset(newOffset);

			if (progress < 1) {
				requestAnimationFrame(animate);
			}
		};

		const animationId = requestAnimationFrame(animate);
		return () => cancelAnimationFrame(animationId);
	}, []);

	return <div
		className={`flex items-center gap-1.5 w-fit
			${className ? className : `px-2 py-0.5 text-xs text-zinc-900 bg-zinc-100 rounded-sm`}
		`}
	>
		<svg className="size-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
			<path
				d="M5 13l4 4L19 7"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
				style={{
					strokeDasharray: 40,
					strokeDashoffset: dashOffset
				}}
			/>
		</svg>
		{text}
	</div>
}


const AddButton = ({ disabled, text = t('settings.models.add'), ...props }: { disabled?: boolean, text?: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) => {

	return <button
		disabled={disabled}
		className={`bg-[#0e70c0] px-3 py-1 text-white rounded-sm ${!disabled ? 'hover:bg-[#1177cb] cursor-pointer' : 'opacity-50 cursor-not-allowed bg-opacity-70'}`}
		{...props}
	>{text}</button>

}

// ConfirmButton prompts for a second click to confirm an action, cancels if clicking outside
const ConfirmButton = ({ children, onConfirm, className }: { children: React.ReactNode, onConfirm: () => void, className?: string }) => {
	const [confirm, setConfirm] = useState(false);
	const ref = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (!confirm) return;
		const handleClickOutside = (e: MouseEvent) => {
			if (ref.current && !ref.current.contains(e.target as Node)) {
				setConfirm(false);
			}
		};
		document.addEventListener('click', handleClickOutside);
		return () => document.removeEventListener('click', handleClickOutside);
	}, [confirm]);
	return (
		<div ref={ref} className={`inline-block`}>
			<VoidButtonBgDarken className={className} onClick={() => {
				if (!confirm) {
					setConfirm(true);
				} else {
					onConfirm();
					setConfirm(false);
				}
			}}>
				{confirm ? t('settings.general.confirmReset') : children}
			</VoidButtonBgDarken>
		</div>
	);
};

// ---------------- Simplified Model Settings Dialog ------------------

// keys of ModelOverrides we allow the user to override



// This new dialog replaces the verbose UI with a single JSON override box.
const SimpleModelSettingsDialog = ({
	isOpen,
	onClose,
	modelInfo,
}: {
	isOpen: boolean;
	onClose: () => void;
	modelInfo: { modelName: string; providerName: ProviderName; type: 'autodetected' | 'custom' | 'default' } | null;
}) => {
	if (!isOpen || !modelInfo) return null;

	const { modelName, providerName, type } = modelInfo;
	const accessor = useAccessor()
	const settingsState = useSettingsState()
	const mouseDownInsideModal = useRef(false); // Ref to track mousedown origin
	const settingsStateService = accessor.get('IVoidSettingsService')

	// current overrides and defaults
	const defaultModelCapabilities = getModelCapabilities(providerName, modelName, undefined);
	const currentOverrides = settingsState.overridesOfModel?.[providerName]?.[modelName] ?? undefined;
	const { recognizedModelName, isUnrecognizedModel } = defaultModelCapabilities

	// Create the placeholder with the default values for allowed keys
	const partialDefaults: Partial<ModelOverrides> = {};
	for (const k of modelOverrideKeys) { if (defaultModelCapabilities[k]) partialDefaults[k] = defaultModelCapabilities[k] as any; }
	const placeholder = JSON.stringify(partialDefaults, null, 2);

	const [overrideEnabled, setOverrideEnabled] = useState<boolean>(() => !!currentOverrides);

	const [errorMsg, setErrorMsg] = useState<string | null>(null);

	const textAreaRef = useRef<HTMLTextAreaElement | null>(null)

	// reset when dialog toggles
	useEffect(() => {
		if (!isOpen) return;
		const cur = settingsState.overridesOfModel?.[providerName]?.[modelName];
		setOverrideEnabled(!!cur);
		setErrorMsg(null);
	}, [isOpen, providerName, modelName, settingsState.overridesOfModel, placeholder]);

	const onSave = async () => {
		// if disabled override, reset overrides
		if (!overrideEnabled) {
			await settingsStateService.setOverridesOfModel(providerName, modelName, undefined);
			onClose();
			return;
		}

		// enabled overrides
		// parse json
		let parsedInput: Record<string, unknown>

		if (textAreaRef.current?.value) {
			try {
				parsedInput = JSON.parse(textAreaRef.current.value);
			} catch (e) {
				setErrorMsg(t('settings.modelOverride.invalidJson'));
				return;
			}
		} else {
			setErrorMsg(t('settings.modelOverride.invalidJson'));
			return;
		}

		// only keep allowed keys
		const cleaned: Partial<ModelOverrides> = {};
		for (const k of modelOverrideKeys) {
			if (!(k in parsedInput)) continue
			const isEmpty = parsedInput[k] === '' || parsedInput[k] === null || parsedInput[k] === undefined;
			if (!isEmpty) {
				cleaned[k] = parsedInput[k] as any;
			}
		}
		await settingsStateService.setOverridesOfModel(providerName, modelName, cleaned);
		onClose();
	};

	const sourcecodeOverridesLink = `https://github.com/voideditor/void/blob/2e5ecb291d33afbe4565921664fb7e183189c1c5/src/vs/workbench/contrib/void/common/modelCapabilities.ts#L146-L172`

	return (
		<div // Backdrop
			className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999999]"
			onMouseDown={() => {
				mouseDownInsideModal.current = false;
			}}
			onMouseUp={() => {
				if (!mouseDownInsideModal.current) {
					onClose();
				}
				mouseDownInsideModal.current = false;
			}}
		>
			{/* MODAL */}
			<div
				className="bg-void-bg-1 rounded-md p-4 max-w-xl w-full shadow-xl overflow-y-auto max-h-[90vh]"
				onClick={(e) => e.stopPropagation()} // Keep stopping propagation for normal clicks inside
				onMouseDown={(e) => {
					mouseDownInsideModal.current = true;
					e.stopPropagation();
				}}
			>
				<div className="flex justify-between items-center mb-4">
					<h3 className="text-lg font-medium">
						{t('settings.modelOverride.title', modelName, displayInfoOfProviderName(providerName).title)}
					</h3>
					<button
						onClick={onClose}
						className="text-void-fg-3 hover:text-void-fg-1"
					>
						<X className="size-5" />
					</button>
				</div>

				{/* Display model recognition status */}
				<div className="text-sm text-void-fg-3 mb-4">
					{type === 'default' ? t('settings.modelOverride.packagedModel', modelName)
						: isUnrecognizedModel
							? t('settings.modelOverride.unrecognized')
							: t('settings.modelOverride.recognized', modelName, recognizedModelName)}
				</div>


				{/* override toggle */}
				<div className="flex items-center gap-2 mb-4">
					<VoidSwitch size='xs' value={overrideEnabled} onChange={setOverrideEnabled} />
					<span className="text-void-fg-3 text-sm">{t('settings.modelOverride.overrideToggle')}</span>
				</div>

				{/* Informational link */}
				{overrideEnabled && <div className="text-sm text-void-fg-3 mb-4">
					<ChatMarkdownRender string={t('settings.modelOverride.sourcecodeRef', sourcecodeOverridesLink)} chatMessageLocation={undefined} />
				</div>}

				<textarea
					key={overrideEnabled + ''}
					ref={textAreaRef}
					className={`w-full min-h-[200px] p-2 rounded-sm border border-void-border-2 bg-void-bg-2 resize-none font-mono text-sm ${!overrideEnabled ? 'text-void-fg-3' : ''}`}
					defaultValue={overrideEnabled && currentOverrides ? JSON.stringify(currentOverrides, null, 2) : placeholder}
					placeholder={placeholder}
					readOnly={!overrideEnabled}
				/>
				{errorMsg && (
					<div className="text-red-500 mt-2 text-sm">{errorMsg}</div>
				)}


				<div className="flex justify-end gap-2 mt-4">
					<VoidButtonBgDarken onClick={onClose} className="px-3 py-1">
						{t('common.cancel')}
					</VoidButtonBgDarken>
					<VoidButtonBgDarken onClick={handleSave} className="px-3 py-1 bg-[#0e70c0] text-white">
						{t('common.save')}
					</VoidButtonBgDarken>
				</div>
			</div>
		</div>
	);
};




export const ModelDump = ({ filteredProviders }: { filteredProviders?: ProviderName[] }) => {
	const accessor = useAccessor()
	const settingsStateService = accessor.get('IVoidSettingsService')
	const settingsState = useSettingsState()

	// State to track which model's settings dialog is open
	const [openSettingsModel, setOpenSettingsModel] = useState<{
		modelName: string,
		providerName: ProviderName,
		type: 'autodetected' | 'custom' | 'default'
	} | null>(null);

	// States for add model functionality
	const [isAddModelOpen, setIsAddModelOpen] = useState(false);
	const [showCheckmark, setShowCheckmark] = useState(false);
	const [userChosenProviderName, setUserChosenProviderName] = useState<ProviderName | null>(null);
	const [modelName, setModelName] = useState<string>('');
	const [errorString, setErrorString] = useState('');

	// Search state for model filtering
	const [searchQuery, setSearchQuery] = useState<string>('');

	// a dump of all the enabled providers' models
	const modelDump: (VoidStatefulModelInfo & { providerName: ProviderName, providerEnabled: boolean })[] = []

	// Use either filtered providers or all providers
	const providersToShow = filteredProviders || providerNames;

	for (let providerName of providersToShow) {
		const providerSettings = settingsState.settingsOfProvider[providerName]
		// if (!providerSettings.enabled) continue
		modelDump.push(...providerSettings.models.map(model => ({ ...model, providerName, providerEnabled: !!providerSettings._didFillInProviderSettings })))
	}

	// sort by hidden
	modelDump.sort((a, b) => {
		return Number(b.providerEnabled) - Number(a.providerEnabled)
	})

	// fuzzy search filter
	const filteredModelDump = searchQuery.trim()
		? modelDump.filter(m => m.modelName.toLowerCase().includes(searchQuery.trim().toLowerCase()))
		: modelDump;

	// Add model handler
	const handleAddModel = () => {
		if (!userChosenProviderName) {
			setErrorString(t('settings.models.selectProvider'));
			return;
		}
		if (!modelName) {
			setErrorString(t('settings.models.enterModelName'));
			return;
		}

		// Check if model already exists
		if (settingsState.settingsOfProvider[userChosenProviderName].models.find(m => m.modelName === modelName)) {
			setErrorString(t('settings.models.modelAlreadyExists'));
			return;
		}

		settingsStateService.addModel(userChosenProviderName, modelName);
		setShowCheckmark(true);
		setTimeout(() => {
			setShowCheckmark(false);
			setIsAddModelOpen(false);
			setUserChosenProviderName(null);
			setModelName('');
		}, 1500);
		setErrorString('');
	};

	return <div className=''>
		{/* Search box */}
		{modelDump.length > 5 && (
			<div className="mb-3 flex items-center gap-2">
				<input
					type="text"
					value={searchQuery}
					onChange={(e) => setSearchQuery(e.target.value)}
					placeholder={t('models.searchPlaceholder')}
					className="flex-1 px-3 py-1.5 text-sm bg-void-bg-1 border border-void-border-2 rounded text-void-fg-1 placeholder:text-void-fg-3/50 focus:outline-none focus:border-[#0e70c0]"
				/>
				<span className="text-xs text-void-fg-3 whitespace-nowrap">{filteredModelDump.length}/{modelDump.length}</span>
			</div>
		)}
		{filteredModelDump.map((m, i) => {
			const { isHidden, type, modelName, providerName, providerEnabled } = m

			const isNewProviderName = (i > 0 ? filteredModelDump[i - 1] : undefined)?.providerName !== providerName

			const providerTitle = displayInfoOfProviderName(providerName).title

			const disabled = !providerEnabled
			const value = disabled ? false : !isHidden

			const tooltipName = (
				disabled ? t('settings.models.addProviderToEnable', providerTitle)
					: value === true ? t('settings.models.showInDropdown')
					: t('settings.models.hideFromDropdown')
			)


			const detailAboutModel = type === 'autodetected' ?
				<Asterisk size={14} className="inline-block align-text-top brightness-115 stroke-[2] text-[#0e70c0]" data-tooltip-id='void-tooltip' data-tooltip-place='right' data-tooltip-content={t('settings.models.detectedLocally')} />
				: type === 'custom' ?
					<Asterisk size={14} className="inline-block align-text-top brightness-115 stroke-[2] text-[#0e70c0]" data-tooltip-id='void-tooltip' data-tooltip-place='right' data-tooltip-content={t('settings.models.customModel')} />
					: undefined

			const hasOverrides = !!settingsState.overridesOfModel?.[providerName]?.[modelName]

			return <div key={`${modelName}${providerName}`}
				className={`flex items-center justify-between gap-4 hover:bg-black/10 dark:hover:bg-gray-300/10 py-1 px-3 rounded-sm overflow-hidden cursor-default truncate group
				`}
			>
				{/* left part is width:full */}
				<div className={`flex flex-grow items-center gap-4`}>
					<span className='w-full max-w-32'>{isNewProviderName ? providerTitle : ''}</span>
					<span className='w-fit max-w-[400px] truncate'>{modelName}</span>
				</div>

				{/* right part is anything that fits */}
				<div className="flex items-center gap-2 w-fit">

					{/* Advanced Settings button (gear). Hide entirely when provider/model disabled. */}
					{disabled ? null : (
						<div className="w-5 flex items-center justify-center">
							<button
								onClick={() => { setOpenSettingsModel({ modelName, providerName, type }) }}
								data-tooltip-id='void-tooltip'
								data-tooltip-place='right'
								data-tooltip-content={t('settings.models.advancedSettings')}
								className={`${hasOverrides ? '' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}
							>
								<Plus size={12} className="text-void-fg-3 opacity-50" />
							</button>
						</div>
					)}

					{/* Blue star */}
					{detailAboutModel}


					{/* Switch */}
					<VoidSwitch
						value={value}
						onChange={() => { settingsStateService.toggleModelHidden(providerName, modelName); }}
						disabled={disabled}
						size='sm'

						data-tooltip-id='void-tooltip'
						data-tooltip-place='right'
						data-tooltip-content={tooltipName}
					/>

					{/* X button */}
					<div className={`w-5 flex items-center justify-center`}>
						{type === 'default' || type === 'autodetected' ? null : <button
							onClick={() => { settingsStateService.deleteModel(providerName, modelName); }}
							data-tooltip-id='void-tooltip'
							data-tooltip-place='right'
							data-tooltip-content={t('settings.models.delete')}
							className={`${hasOverrides ? '' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}
						>
							<X size={12} className="text-void-fg-3 opacity-50" />
						</button>}
					</div>
				</div>
			</div>
		})}

		{/* Add Model Section */}
		{showCheckmark ? (
			<div className="mt-4">
				<AnimatedCheckmarkButton text={t('settings.models.added')} className="bg-[#0e70c0] text-white px-3 py-1 rounded-sm" />
			</div>
		) : isAddModelOpen ? (
			<div className="mt-4">
				<form className="flex items-center gap-2">

					{/* Provider dropdown */}
					<ErrorBoundary>
						<VoidCustomDropdownBox
							options={providersToShow}
							selectedOption={userChosenProviderName}
							onChangeOption={(pn) => setUserChosenProviderName(pn)}
							getOptionDisplayName={(pn) => pn ? displayInfoOfProviderName(pn).title : t('settings.models.providerName')}
							getOptionDropdownName={(pn) => pn ? displayInfoOfProviderName(pn).title : t('settings.models.providerName')}
							getOptionsEqual={(a, b) => a === b}
							className="max-w-32 mx-2 w-full resize-none bg-void-bg-1 text-void-fg-1 placeholder:text-void-fg-3 border border-void-border-2 focus:border-void-border-1 py-1 px-2 rounded"
							arrowTouchesText={false}
						/>
					</ErrorBoundary>

					{/* Model name input */}
					<ErrorBoundary>
						<VoidSimpleInputBox
							value={modelName}
							compact={true}
							onChangeValue={setModelName}
							placeholder={t('settings.models.modelName')}
							className='max-w-32'
						/>
					</ErrorBoundary>

					{/* Add button */}
					<ErrorBoundary>
						<AddButton
							type='button'
							disabled={!modelName || !userChosenProviderName}
							onClick={handleAddModel}
						/>
					</ErrorBoundary>

					{/* X button to cancel */}
					<button
						type="button"
						onClick={() => {
							setIsAddModelOpen(false);
							setErrorString('');
							setModelName('');
							setUserChosenProviderName(null);
						}}
						className='text-void-fg-4'
					>
						<X className='size-4' />
					</button>
				</form>

				{errorString && (
					<div className='text-red-500 truncate whitespace-nowrap mt-1'>
						{errorString}
					</div>
				)}
			</div>
		) : (
			<div
				className="text-void-fg-4 flex flex-nowrap text-nowrap items-center hover:brightness-110 cursor-pointer mt-4"
				onClick={() => setIsAddModelOpen(true)}
			>
				<div className="flex items-center gap-1">
					<Plus size={16} />
					<span>{t('settings.models.addAModel')}</span>
				</div>
			</div>
		)}

		{/* Model Settings Dialog */}
		<SimpleModelSettingsDialog
			isOpen={openSettingsModel !== null}
			onClose={() => setOpenSettingsModel(null)}
			modelInfo={openSettingsModel}
		/>
	</div>
}



// providers

const ProviderSetting = ({ providerName, settingName, subTextMd }: { providerName: ProviderName, settingName: SettingName, subTextMd: React.ReactNode }) => {

	const { title: settingTitle, placeholder, isPasswordField } = displayInfoOfSettingName(providerName, settingName)

	const accessor = useAccessor()
	const voidSettingsService = accessor.get('IVoidSettingsService')
	const settingsState = useSettingsState()

	const settingValue = settingsState.settingsOfProvider[providerName][settingName] as string // this should always be a string in this component
	if (typeof settingValue !== 'string') {
		console.log('Error: Provider setting had a non-string value.')
		return
	}

	// Create a stable callback reference using useCallback with proper dependencies
	const handleChangeValue = useCallback((newVal: string) => {
		voidSettingsService.setSettingOfProvider(providerName, settingName, newVal)
	}, [voidSettingsService, providerName, settingName]);

	return <ErrorBoundary>
		<div className='my-1'>
			<div className={providerName === 'aiyiwei' && settingName === 'apiKey' ? 'flex items-center gap-2' : ''}>
				<div className={providerName === 'aiyiwei' && settingName === 'apiKey' ? 'flex-1' : ''}>
					<VoidSimpleInputBox
						value={settingValue}
						onChangeValue={handleChangeValue}
						placeholder={`${settingTitle} (${placeholder})`}
						passwordBlur={isPasswordField}
						compact={true}
					/>
				</div>
				{providerName === 'aiyiwei' && settingName === 'apiKey' && (
					<a
						href="https://aiyiwei.vip/register?aff=qzKQV1"
						target="_blank"
						rel="noopener noreferrer"
						className="px-3 py-1.5 text-xs bg-[#0e70c0] text-white rounded hover:bg-[#0e70c0]/80 transition-all whitespace-nowrap flex items-center gap-1 shrink-0"
					>
						<ExternalLink className="w-3 h-3" />
						{t('onboarding.getApiKey')}
					</a>
				)}
			</div>
			{!subTextMd ? null : <div className='py-1 px-3 opacity-50 text-sm'>
				{subTextMd}
			</div>}
		</div>
	</ErrorBoundary>
}

// const OldSettingsForProvider = ({ providerName, showProviderTitle }: { providerName: ProviderName, showProviderTitle: boolean }) => {
// 	const voidSettingsState = useSettingsState()

// 	const needsModel = isProviderNameDisabled(providerName, voidSettingsState) === 'addModel'

// 	// const accessor = useAccessor()
// 	// const voidSettingsService = accessor.get('IVoidSettingsService')

// 	// const { enabled } = voidSettingsState.settingsOfProvider[providerName]
// 	const settingNames = customSettingNamesOfProvider(providerName)

// 	const { title: providerTitle } = displayInfoOfProviderName(providerName)

// 	return <div className='my-4'>

// 		<div className='flex items-center w-full gap-4'>
// 			{showProviderTitle && <h3 className='text-xl truncate'>{providerTitle}</h3>}

// 			{/* enable provider switch */}
// 			{/* <VoidSwitch
// 				value={!!enabled}
// 				onChange={
// 					useCallback(() => {
// 						const enabledRef = voidSettingsService.state.settingsOfProvider[providerName].enabled
// 						voidSettingsService.setSettingOfProvider(providerName, 'enabled', !enabledRef)
// 					}, [voidSettingsService, providerName])}
// 				size='sm+'
// 			/> */}
// 		</div>

// 		<div className='px-0'>
// 			{/* settings besides models (e.g. api key) */}
// 			{settingNames.map((settingName, i) => {
// 				return <ProviderSetting key={settingName} providerName={providerName} settingName={settingName} />
// 			})}

// 			{needsModel ?
// 				providerName === 'ollama' ?
// 					<WarningBox text={`Please install an Ollama model. We'll auto-detect it.`} />
// 					: <WarningBox text={`Please add a model for ${providerTitle} (Models section).`} />
// 				: null}
// 		</div>
// 	</div >
// }


export const SettingsForProvider = ({ providerName, showProviderTitle, showProviderSuggestions }: { providerName: ProviderName, showProviderTitle: boolean, showProviderSuggestions: boolean }) => {
	const voidSettingsState = useSettingsState()

	const needsModel = isProviderNameDisabled(providerName, voidSettingsState) === 'addModel'

	// const accessor = useAccessor()
	// const voidSettingsService = accessor.get('IVoidSettingsService')

	// const { enabled } = voidSettingsState.settingsOfProvider[providerName]
	const settingNames = customSettingNamesOfProvider(providerName)

	const { title: providerTitle } = displayInfoOfProviderName(providerName)

	return <div>

		<div className='flex items-center w-full gap-4'>
			{showProviderTitle && <h3 className='text-xl truncate'>{providerTitle}</h3>}

			{/* enable provider switch */}
			{/* <VoidSwitch
				value={!!enabled}
				onChange={
					useCallback(() => {
						const enabledRef = voidSettingsService.state.settingsOfProvider[providerName].enabled
						voidSettingsService.setSettingOfProvider(providerName, 'enabled', !enabledRef)
					}, [voidSettingsService, providerName])}
				size='sm+'
			/> */}
		</div>

		<div className='px-0'>
			{/* settings besides models (e.g. api key) */}
			{settingNames.map((settingName, i) => {

				return <ProviderSetting
					key={settingName}
					providerName={providerName}
					settingName={settingName}
					subTextMd={i !== settingNames.length - 1 ? null
						: <ChatMarkdownRender string={subTextMdOfProviderName(providerName)} chatMessageLocation={undefined} />}
				/>
			})}

			{showProviderSuggestions && needsModel ?
				providerName === 'ollama' ?
					<WarningBox className="pl-2 mb-4" textKey='settings.models.installOllamaModel' />
					: <WarningBox className="pl-2 mb-4" text={t('settings.models.addModelForProvider', providerTitle)} />
				: null}
		</div>
	</div >
}


export const VoidProviderSettings = ({ providerNames }: { providerNames: ProviderName[] }) => {
	return <>
		{providerNames.map(providerName =>
			<SettingsForProvider key={providerName} providerName={providerName} showProviderTitle={true} showProviderSuggestions={true} />
		)}
	</>
}


type TabName = 'models' | 'general'
export const AutoDetectLocalModelsToggle = () => {
	const settingName: GlobalSettingName = 'autoRefreshModels'

	const accessor = useAccessor()
	const voidSettingsService = accessor.get('IVoidSettingsService')
	const metricsService = accessor.get('IMetricsService')

	const voidSettingsState = useSettingsState()

	// right now this is just `enabled_autoRefreshModels`
	const enabled = voidSettingsState.globalSettings[settingName]

	return <ButtonLeftTextRightOption
		leftButton={<VoidSwitch
			size='xxs'
			value={enabled}
			onChange={(newVal) => {
				voidSettingsService.setGlobalSetting(settingName, newVal)
				metricsService.capture('Click', { action: 'Autorefresh Toggle', settingName, enabled: newVal })
			}}
		/>}
		text={t('settings.models.autoDetectDesc', refreshableProviderNames.map(providerName => displayInfoOfProviderName(providerName).title).join(', '))}
	/>


}

export const AIInstructionsBox = () => {
	const accessor = useAccessor()
	const voidSettingsService = accessor.get('IVoidSettingsService')
	const voidSettingsState = useSettingsState()
	return <VoidInputBox2
		className='min-h-[81px] p-3 rounded-sm'
		initValue={voidSettingsState.globalSettings.aiInstructions}
		placeholder={t('settings.general.aiInstructions.placeholder')}
		multiline
		onChangeText={(newText) => {
			voidSettingsService.setGlobalSetting('aiInstructions', newText)
		}}
	/>
}

const FastApplyMethodDropdown = () => {
	const accessor = useAccessor()
	const voidSettingsService = accessor.get('IVoidSettingsService')

	const options = useMemo(() => [true, false], [])

	const onChangeOption = useCallback((newVal: boolean) => {
		voidSettingsService.setGlobalSetting('enableFastApply', newVal)
	}, [voidSettingsService])

	return <VoidCustomDropdownBox
		className='text-xs text-void-fg-3 bg-void-bg-1 border border-void-border-1 rounded p-0.5 px-1'
		options={options}
		selectedOption={voidSettingsService.state.globalSettings.enableFastApply}
		onChangeOption={onChangeOption}
		getOptionDisplayName={(val) => val ? t('settings.models.fastApply') : t('settings.models.slowApply')}
		getOptionDropdownName={(val) => val ? t('settings.models.fastApply') : t('settings.models.slowApply')}
		getOptionDropdownDetail={(val) => val ? t('settings.models.fastApplyDetail') : t('settings.models.slowApplyDetail')}
		getOptionsEqual={(a, b) => a === b}
	/>

}


export const OllamaSetupInstructions = ({ sayWeAutoDetect }: { sayWeAutoDetect?: boolean }) => {
	return <div className='prose-p:my-0 prose-ol:list-decimal prose-p:py-0 prose-ol:my-0 prose-ol:py-0 prose-span:my-0 prose-span:py-0 text-void-fg-3 text-sm list-decimal select-text'>
		<div className=''><ChatMarkdownRender string={t('settings.ollama.title')} chatMessageLocation={undefined} /></div>
		<div className=' pl-6'><ChatMarkdownRender string={t('settings.ollama.step1')} chatMessageLocation={undefined} /></div>
		<div className=' pl-6'><ChatMarkdownRender string={t('settings.ollama.step2')} chatMessageLocation={undefined} /></div>
		<div
			className='pl-6 flex items-center w-fit'
			data-tooltip-id='void-tooltip-ollama-settings'
		>
			<ChatMarkdownRender string={t('settings.ollama.step3')} chatMessageLocation={undefined} />
		</div>
		{sayWeAutoDetect && <div className=' pl-6'><ChatMarkdownRender string={t('settings.ollama.autoDetect')} chatMessageLocation={undefined} /></div>}
	</div>
}


const LanguagePicker = () => {
	const accessor = useAccessor()
	const localeService = accessor.get('ILocaleService')
	const languagePackService = accessor.get('ILanguagePackService')
	const environmentService = accessor.get('IEnvironmentService')
	const fileService = accessor.get('IFileService')
	const notificationService = accessor.get('INotificationService')
	const extensionManagementService = accessor.get('IExtensionManagementService')
	const [locale, changeLocale] = useLocale()
	const [isApplyingLocale, setIsApplyingLocale] = useState(false)
	const locales = getSupportedLocales()
	const isDevMode = !environmentService.isBuilt
	return <VoidCustomDropdownBox
		className='text-xs text-void-fg-3 bg-void-bg-1 border border-void-border-1 rounded p-0.5 px-1'
		options={locales}
		selectedOption={locales.find(l => l.id === locale) ?? locales[0]}
		onChangeOption={async (opt) => {
			if (isApplyingLocale) {
				return
			}
			changeLocale(opt.id)
			setIsApplyingLocale(true)
			try {
				await applyGlobalLocale({ reactLocale: opt.id, isDevMode, localeService, languagePackService, environmentService, fileService, notificationService, extensionManagementService })
			} catch (e) {
				console.error('Failed to set VSCode locale', e)
			} finally {
				setIsApplyingLocale(false)
			}
		}}
		getOptionDisplayName={(opt) => opt.label}
		getOptionDropdownName={(opt) => opt.label}
		getOptionsEqual={(a, b) => a.id === b.id}
	/>
}

const RedoOnboardingButton = ({ className }: { className?: string }) => {
	const accessor = useAccessor()
	const voidSettingsService = accessor.get('IVoidSettingsService')
	return <div
		className={`text-void-fg-4 flex flex-nowrap text-nowrap items-center hover:brightness-110 cursor-pointer ${className}`}
		onClick={() => { voidSettingsService.setGlobalSetting('isOnboardingComplete', false) }}
	>
		{t('onboarding.redoOnboarding')}
	</div>

}


// ====================== Marketplace Components ======================

const MarketplaceItemCard = ({ item, onInstall, installedIds, installing }: {
	item: MarketplaceItem;
	onInstall: (item: MarketplaceItem) => void;
	installedIds: Set<string>;
	installing: string | null;
}) => {
	const isInstalled = installedIds.has(item.qualifiedName) || installedIds.has(item.id);
	const isInstalling = installing === item.id;

	return (
		<div className="border border-void-border-2 rounded-sm p-4 bg-void-bg-1 flex flex-col gap-2">
			<div className="flex items-start justify-between gap-3">
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2 flex-wrap">
						<h4 className="text-sm font-medium text-void-fg-1 truncate">{item.name}</h4>
						{item.verified && (
							<span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 shrink-0">
								{t('settings.marketplace.verified')}
							</span>
						)}
						<span className="text-[10px] px-1.5 py-0.5 rounded bg-void-bg-2 text-void-fg-3 shrink-0">
							{item.source === 'smithery' ? t('settings.marketplace.sourceSmithery') : t('settings.marketplace.sourceModelScope')}
						</span>
					</div>
					<p className="text-xs text-void-fg-3 mt-1 line-clamp-2">{item.description}</p>
				</div>
				<div className="shrink-0">
					{isInstalled ? (
						<span className="text-xs text-green-500 flex items-center gap-1 px-3 py-1">
							<Check className="w-3 h-3" /> {t('settings.marketplace.installed')}
						</span>
					) : isInstalling ? (
						<span className="text-xs text-void-fg-3 flex items-center gap-1 px-3 py-1">
							<Loader2 className="w-3 h-3 animate-spin" /> {t('settings.marketplace.installing')}
						</span>
					) : (
						<VoidButtonBgDarken className="px-3 py-1 text-xs" onClick={() => onInstall(item)}>
							{t('settings.marketplace.install')}
						</VoidButtonBgDarken>
					)}
				</div>
			</div>
			<div className="flex items-center gap-3 text-[11px] text-void-fg-3">
				{item.useCount > 0 && (
					<span>{formatUseCount(item.useCount)} {t('settings.marketplace.uses')}</span>
				)}
				{item.score > 0 && (
					<span>{(item.score * 100).toFixed(0)} {t('settings.marketplace.score')}</span>
				)}
				{item.createdAt && (
					<span>{formatRelativeTime(item.createdAt)}</span>
				)}
				{item.homepage && (
					<a
						href={item.homepage}
						target="_blank"
						rel="noopener noreferrer"
						className="flex items-center gap-0.5 text-blue-400 hover:text-blue-300"
					>
						{t('settings.marketplace.details')} <ExternalLink className="w-3 h-3" />
					</a>
				)}
			</div>
		</div>
	);
};

const MarketplaceBrowser = ({ type }: { type: 'mcp-server' | 'skill' }) => {
	const accessor = useAccessor();
	const marketplaceService = accessor.get('IMarketplaceService');
	const settingsState = useSettingsState();

	const [query, setQuery] = useState('');
	const [sort, setSort] = useState<MarketplaceSortBy>('default');
	const [filter, setFilter] = useState<MarketplaceFilter>('code');
	const [items, setItems] = useState<MarketplaceItem[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [page, setPage] = useState(1);
	const [totalCount, setTotalCount] = useState(0);
	const [installing, setInstalling] = useState<string | null>(null);
	const [hasMore, setHasMore] = useState(false);

	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Compute installed IDs
	const installedIds = useMemo(() => {
		const ids = new Set<string>();
		// From installed skills
		const skills = settingsState.installedSkills ?? {};
		Object.keys(skills).forEach(id => ids.add(id));
		// From MCP servers (check mcpUserStateOfName)
		const mcpState = settingsState.mcpUserStateOfName ?? {};
		Object.keys(mcpState).forEach(name => ids.add(name));
		return ids;
	}, [settingsState.installedSkills, settingsState.mcpUserStateOfName]);

	const hasApiKey = marketplaceService.hasSmitheryApiKey();

	const doSearch = useCallback(async (searchQuery: string, searchPage: number, searchSort: MarketplaceSortBy, searchFilter: MarketplaceFilter, append: boolean) => {
		setLoading(true);
		setError(null);
		try {
			// 无 Smithery Key 时仅查询魔搭源，有 Key 时双源并行
			const sources: ('smithery' | 'modelscope')[] = hasApiKey ? ['smithery', 'modelscope'] : ['modelscope'];
			const params: MarketplaceSearchParams = {
				query: searchQuery || undefined,
				type,
				sources,
				sort: searchSort,
				filter: searchFilter,
				page: searchPage,
				pageSize: 20,
			};
			const result = await marketplaceService.search(params);
			if (append) {
				setItems(prev => [...prev, ...result.items]);
			} else {
				setItems(result.items);
			}
			setTotalCount(result.totalCount);
			setHasMore(result.items.length >= 20);
		} catch (err: any) {
			setError(err?.message || t('settings.marketplace.error'));
		} finally {
			setLoading(false);
		}
	}, [hasApiKey, type, marketplaceService]);

	// Initial load and search on filter/sort change
	useEffect(() => {
		setPage(1);
		doSearch(query, 1, sort, filter, false);
	}, [sort, filter, hasApiKey]);

	// Debounced query search
	useEffect(() => {
		if (debounceRef.current) clearTimeout(debounceRef.current);
		debounceRef.current = setTimeout(() => {
			setPage(1);
			doSearch(query, 1, sort, filter, false);
		}, 300);
		return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
	}, [query]);

	const handleLoadMore = useCallback(() => {
		const nextPage = page + 1;
		setPage(nextPage);
		doSearch(query, nextPage, sort, filter, true);
	}, [page, query, sort, filter, doSearch]);

	const handleInstall = useCallback(async (item: MarketplaceItem) => {
		setInstalling(item.id);
		try {
			if (item.type === 'mcp-server') {
				await marketplaceService.installMCPServer(item);
			} else {
				await marketplaceService.installSkill(item);
			}
		} catch (err: any) {
			console.error('[MarketplaceBrowser] Install error:', err);
		} finally {
			setInstalling(null);
		}
	}, [marketplaceService]);

	return (
		<div className="space-y-3">
			{/* 无 Smithery Key 时显示轻量提示（不阻断浏览魔搭数据） */}
			{!hasApiKey && (
				<div className="text-xs text-void-fg-3/70 bg-void-bg-2 px-3 py-2 rounded">
					{t('settings.marketplace.apiKeyHint')}
				</div>
			)}
			{/* Search + Sort + Filter bar */}
			<div className="flex items-center gap-2 flex-wrap">
				<input
					type="text"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					placeholder={type === 'mcp-server' ? t('settings.marketplace.searchMCP') : t('settings.marketplace.searchSkills')}
					className="flex-1 min-w-[200px] px-3 py-1.5 text-sm bg-void-bg-1 border border-void-border-2 rounded text-void-fg-1 placeholder:text-void-fg-3/50 focus:outline-none focus:border-[#0e70c0]"
				/>
				<select
					value={sort}
					onChange={(e) => setSort(e.target.value as MarketplaceSortBy)}
					className="px-2 py-1.5 text-xs bg-void-bg-1 border border-void-border-2 rounded text-void-fg-1 focus:outline-none"
				>
					<option value="default">{t('settings.marketplace.sortDefault')}</option>
					<option value="downloads">{t('settings.marketplace.sortDownloads')}</option>
					<option value="score">{t('settings.marketplace.sortScore')}</option>
					<option value="updated">{t('settings.marketplace.sortUpdated')}</option>
				</select>
				<select
					value={filter}
					onChange={(e) => setFilter(e.target.value as MarketplaceFilter)}
					className="px-2 py-1.5 text-xs bg-void-bg-1 border border-void-border-2 rounded text-void-fg-1 focus:outline-none"
				>
					<option value="code">{t('settings.marketplace.filterCode')}</option>
					<option value="all">{t('settings.marketplace.filterAll')}</option>
				</select>
			</div>

			{/* Error */}
			{error && (
				<div className="text-sm text-red-400 bg-red-500/10 px-3 py-2 rounded">
					{t('settings.marketplace.error')}: {error}
				</div>
			)}

			{/* Results */}
			{loading && items.length === 0 ? (
				<div className="flex items-center justify-center py-8 text-void-fg-3">
					<Loader2 className="w-5 h-5 animate-spin mr-2" />
					<span className="text-sm">{t('settings.marketplace.search')}...</span>
				</div>
			) : items.length === 0 && !loading ? (
				<div className="text-sm text-void-fg-3 bg-void-bg-2 px-4 py-6 rounded text-center">
					{t('settings.marketplace.noResults')}
				</div>
			) : (
				<div className="max-h-[480px] overflow-y-auto">
					<div className="flex flex-col gap-2">
						{items.map(item => (
							<MarketplaceItemCard
								key={item.id}
								item={item}
								onInstall={handleInstall}
								installedIds={installedIds}
								installing={installing}
							/>
						))}
					</div>
				</div>
			)}

			{/* Load more */}
			{hasMore && items.length > 0 && (
				<div className="text-center">
					<VoidButtonBgDarken
						className="px-4 py-1 text-sm"
						onClick={handleLoadMore}
						disabled={loading}
					>
						{loading ? <Loader2 className="w-4 h-4 animate-spin inline mr-1" /> : null}
						{t('settings.marketplace.loadMore')}
					</VoidButtonBgDarken>
				</div>
			)}
		</div>
	);
};

const RECOMMENDED_SKILLS: { id: string; name: string; desc: string }[] = [
	{ id: '@pskoett/self-improving-agent', name: 'Self-Improving Agent', desc: '记录学习、错误和更正，实现持续改进' },
	{ id: '@anthropic/context-manager', name: 'Context Manager', desc: '智能管理上下文窗口，优化长对话性能' },
	{ id: '@anthropic/code-reviewer', name: 'Code Reviewer', desc: '自动审查代码质量、安全性和最佳实践' },
]

const SkillTab = () => {
	const accessor = useAccessor()
	const voidSettingsService = accessor.get('IVoidSettingsService')
	const settingsState = useSettingsState()
	const installedSkills = settingsState.installedSkills ?? {}
	const installedList = Object.values(installedSkills).filter((s): s is SkillInfo => !!s)

	const [skillUrl, setSkillUrl] = useState('')

	const parseSkillIdFromInput = (input: string): { id: string; name: string; url: string } | null => {
		const trimmed = input.trim()
		if (!trimmed) return null
		// Handle full URL: https://modelscope.cn/skills/@author/skill-name
		const urlMatch = trimmed.match(/modelscope\.cn\/skills\/(@[^/]+\/[^/?#]+)/)
		if (urlMatch) {
			const id = urlMatch[1]
			return { id, name: id.split('/').pop() || id, url: `https://modelscope.cn/skills/${id}` }
		}
		// Handle @author/skill-name format
		if (trimmed.startsWith('@') && trimmed.includes('/')) {
			return { id: trimmed, name: trimmed.split('/').pop() || trimmed, url: `https://modelscope.cn/skills/${trimmed}` }
		}
		// Fallback: treat as skill name
		return { id: trimmed, name: trimmed, url: `https://modelscope.cn/skills/${trimmed}` }
	}

	const handleInstall = useCallback((id: string, name: string, desc: string, url: string) => {
		const skill: SkillInfo = {
			id,
			name,
			description: desc,
			url,
			enabled: true,
			installedAt: Date.now(),
		}
		voidSettingsService.addSkill(skill)
	}, [voidSettingsService])

	const handleInstallFromInput = useCallback(() => {
		const parsed = parseSkillIdFromInput(skillUrl)
		if (!parsed) return
		handleInstall(parsed.id, parsed.name, '', parsed.url)
		setSkillUrl('')
	}, [skillUrl, handleInstall])

	const handleRemove = useCallback((skillId: string) => {
		voidSettingsService.removeSkill(skillId)
	}, [voidSettingsService])

	const handleToggle = useCallback((skillId: string, enabled: boolean) => {
		voidSettingsService.toggleSkillEnabled(skillId, enabled)
	}, [voidSettingsService])

	return (
		<div className="flex flex-col gap-10">
			<section className="space-y-4">
				<header>
					<h2 className="text-3xl mb-2">{t('settings.skill.title')}</h2>
					<p className="text-sm text-void-fg-3">{t('settings.skill.desc')}</p>
				</header>
			</section>

			{/* Skills Marketplace Browser */}
			<section className="space-y-3">
				<h3 className="text-xl">{t('settings.skill.marketplace.browse')}</h3>
				<ErrorBoundary>
					<MarketplaceBrowser type="skill" />
				</ErrorBoundary>
			</section>

			<hr className="border-void-border-2" />

			{/* Recommended skills (fallback) */}
			<section className="space-y-4">
				<h3 className="text-xl">{t('settings.skill.recommended')}</h3>
				<div className="flex flex-col gap-3">
					{RECOMMENDED_SKILLS.map(skill => {
						const isInstalled = !!installedSkills[skill.id]
						return (
							<div key={skill.id} className="border border-void-border-2 rounded-sm p-4 bg-void-bg-1 flex items-center justify-between gap-4">
								<div className="flex-1 min-w-0">
									<h4 className="text-sm font-medium text-void-fg-1 truncate">{skill.name}</h4>
									<p className="text-xs text-void-fg-3 mt-0.5">{skill.desc}</p>
									<span className="text-xs text-void-fg-3/60 mt-0.5">{skill.id}</span>
								</div>
								{isInstalled ? (
									<span className="text-xs text-green-500 flex items-center gap-1 shrink-0">
										<Check className="w-3 h-3" /> {t('settings.skill.installed')}
									</span>
								) : (
									<VoidButtonBgDarken className="px-3 py-1 text-xs shrink-0" onClick={() => {
										handleInstall(skill.id, skill.name, skill.desc, `https://modelscope.cn/skills/${skill.id}`)
									}}>
										{t('settings.skill.add.button')}
									</VoidButtonBgDarken>
								)}
							</div>
						)
					})}
				</div>
			</section>

			{/* Add skill by URL */}
			<section className="space-y-3">
				<h3 className="text-xl">{t('settings.skill.add')}</h3>
				<div className="flex items-center gap-2">
					<input
						type="text"
						value={skillUrl}
						onChange={(e) => setSkillUrl(e.target.value)}
						onKeyDown={(e) => { if (e.key === 'Enter') handleInstallFromInput() }}
						placeholder={t('settings.skill.add.urlPlaceholder')}
						className="flex-1 px-3 py-1.5 text-sm bg-void-bg-1 border border-void-border-2 rounded text-void-fg-1 placeholder:text-void-fg-3/50 focus:outline-none focus:border-[#0e70c0]"
					/>
					<VoidButtonBgDarken className="px-4 py-1.5 text-sm shrink-0" onClick={handleInstallFromInput}>
						{t('settings.skill.add.button')}
					</VoidButtonBgDarken>
				</div>
			</section>

			{/* Installed skills */}
			<section className="space-y-3">
				<h3 className="text-xl">{t('settings.skill.installed')}</h3>
				{installedList.length === 0 ? (
					<div className="text-sm text-void-fg-3 bg-void-bg-2 px-4 py-6 rounded text-center">
						{t('settings.skill.installed.empty')}
					</div>
				) : (
					<div className="flex flex-col gap-2">
						{installedList.map(skill => (
							<div key={skill.id} className="border border-void-border-2 rounded-sm p-3 bg-void-bg-1 flex items-center justify-between gap-3">
								<div className="flex-1 min-w-0">
									<div className="flex items-center gap-2">
										<h4 className="text-sm font-medium text-void-fg-1 truncate">{skill.name}</h4>
										{!skill.enabled && (
											<span className="text-[10px] px-1.5 py-0.5 rounded bg-void-bg-2 text-void-fg-3">{t('settings.skill.disable')}</span>
										)}
									</div>
									{skill.description && (
										<p className="text-xs text-void-fg-3 mt-0.5 truncate">{skill.description}</p>
									)}
									<span className="text-xs text-void-fg-3/60">{skill.id}</span>
								</div>
								<div className="flex items-center gap-2 shrink-0">
									<VoidSwitch
										value={skill.enabled}
										onChange={(val) => handleToggle(skill.id, val)}
										size='sm'
									/>
									<button
										className="text-void-fg-3 hover:text-red-400 transition-colors p-1"
										onClick={() => handleRemove(skill.id)}
										title={t('settings.skill.remove')}
									>
										<X className="w-3.5 h-3.5" />
									</button>
								</div>
							</div>
						))}
					</div>
				)}
			</section>
		</div>
	)
}





/**
 * 读写"新结构 AutoApproveSettings"字段的辅助，按 approvalType 粗粒度聚合。
 * - 'edits'     ⇆ editsInWorkspace && editsOutsideWorkspace （两者同时切换）
 * - 'terminal'  ⇆ terminalAny
 * - 'MCP tools' ⇆ mcpAll
 */
const getAggregateAutoApprove = (aa: import('../../../../common/voidSettingsTypes.js').AutoApproveSettings, approvalType: ToolApprovalType): boolean => {
	if (approvalType === 'edits') return !!(aa.editsInWorkspace && aa.editsOutsideWorkspace)
	if (approvalType === 'terminal') return !!aa.terminalAny
	if (approvalType === 'MCP tools') return !!aa.mcpAll
	return false
}

const applyAggregateAutoApprove = (
	aa: import('../../../../common/voidSettingsTypes.js').AutoApproveSettings,
	approvalType: ToolApprovalType,
	newValue: boolean
): import('../../../../common/voidSettingsTypes.js').AutoApproveSettings => {
	const next = { ...aa }
	if (approvalType === 'edits') {
		next.editsInWorkspace = newValue
		next.editsOutsideWorkspace = newValue
	} else if (approvalType === 'terminal') {
		next.terminalAny = newValue
	} else if (approvalType === 'MCP tools') {
		next.mcpAll = newValue
	}
	return next
}

export const ToolApprovalTypeSwitch = ({ approvalType, size, desc }: { approvalType: ToolApprovalType, size: "xxs" | "xs" | "sm" | "sm+" | "md", desc: string }) => {
	const accessor = useAccessor()
	const voidSettingsService = accessor.get('IVoidSettingsService')
	const voidSettingsState = useSettingsState()
	const metricsService = accessor.get('IMetricsService')

	const onToggleAutoApprove = useCallback((approvalType: ToolApprovalType, newValue: boolean) => {
		const next = applyAggregateAutoApprove(voidSettingsService.state.globalSettings.autoApprove, approvalType, newValue)
		voidSettingsService.setGlobalSetting('autoApprove', next)
		metricsService.capture('Tool Auto-Accept Toggle', { approvalType, enabled: newValue })
	}, [voidSettingsService, metricsService])

	return <>
		<VoidSwitch
			size={size}
			value={getAggregateAutoApprove(voidSettingsState.globalSettings.autoApprove, approvalType)}
			onChange={(newVal) => onToggleAutoApprove(approvalType, newVal)}
		/>
		<span className="text-void-fg-3 text-xs">{desc}</span>
	</>
}


// ====================== 信任级别选择器（对标 Windsurf） ======================

const TRUST_LEVEL_ORDER: TrustLevel[] = ['conservative', 'standard', 'seamless']

/** 单选卡片形式的 TrustLevelSelector：对标 Windsurf 的工作区信任 UI。 */
export const TrustLevelSelector = ({ compact = false }: { compact?: boolean }) => {
	const accessor = useAccessor()
	const voidSettingsService = accessor.get('IVoidSettingsService')
	const voidSettingsState = useSettingsState()
	const metricsService = accessor.get('IMetricsService')

	const current = voidSettingsState.globalSettings.trustLevel

	const onPick = useCallback((level: TrustLevel) => {
		voidSettingsService.setGlobalSetting('trustLevel', level)
		voidSettingsService.setGlobalSetting('autoApprove', { ...TRUST_LEVEL_PRESETS[level] })
		metricsService.capture('Trust Level Set', { level })
	}, [voidSettingsService, metricsService])

	return <div className={`flex ${compact ? 'gap-2' : 'gap-3'} flex-wrap`}>
		{TRUST_LEVEL_ORDER.map(level => {
			const selected = current === level
			return <button
				key={level}
				onClick={() => onPick(level)}
				className={`
					flex-1 min-w-[140px] text-left rounded-md border px-3 py-2 transition-all
					${selected
						? 'border-void-accent bg-void-bg-3 shadow-sm'
						: 'border-void-border-3 hover:border-void-border-2 hover:bg-void-bg-3'}
				`}
			>
				<div className='flex items-center justify-between'>
					<div className={`text-sm font-medium ${selected ? 'text-void-fg-1' : 'text-void-fg-2'}`}>
						{t(`settings.trust.level.${level}.title` as any)}
					</div>
					{selected && <Check className='w-3.5 h-3.5 text-void-accent' />}
				</div>
				<div className='mt-1 text-[11px] text-void-fg-3 leading-snug'>
					{t(`settings.trust.level.${level}.desc` as any)}
				</div>
			</button>
		})}
	</div>
}


/** 高级：每个 AutoApproveSettings 字段独立开关 + allowlist 编辑器 */
export const GranularAutoApprovePanel = () => {
	const accessor = useAccessor()
	const voidSettingsService = accessor.get('IVoidSettingsService')
	const voidSettingsState = useSettingsState()

	const aa = voidSettingsState.globalSettings.autoApprove

	const patch = useCallback((partial: AutoApproveSettings) => {
		voidSettingsService.setGlobalSetting('autoApprove', { ...voidSettingsService.state.globalSettings.autoApprove, ...partial })
	}, [voidSettingsService])

	// allowlist 编辑器的本地状态（多行文本）
	const patternsText = (aa.terminalAllowlistPatterns ?? DEFAULT_TERMINAL_ALLOWLIST).join('\n')
	const [draftPatterns, setDraftPatterns] = useState(patternsText)
	useEffect(() => { setDraftPatterns(patternsText) }, [patternsText])

	const savePatterns = useCallback(() => {
		const list = draftPatterns.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
		patch({ terminalAllowlistPatterns: list })
	}, [draftPatterns, patch])

	const rowCls = 'flex items-center gap-x-2 my-1.5'
	const descCls = 'text-void-fg-3 text-xs'

	return <div className='mt-2'>
		<div className={rowCls}>
			<VoidSwitch size='xs' value={!!aa.editsInWorkspace} onChange={v => patch({ editsInWorkspace: v })} />
			<span className={descCls}>{t('settings.trust.editsInWorkspace' as any)}</span>
		</div>
		<div className={rowCls}>
			<VoidSwitch size='xs' value={!!aa.editsOutsideWorkspace} onChange={v => patch({ editsOutsideWorkspace: v })} />
			<span className={descCls}>{t('settings.trust.editsOutsideWorkspace' as any)}</span>
		</div>
		<div className={rowCls}>
			<VoidSwitch size='xs' value={!!aa.terminalAllowlist} onChange={v => patch({ terminalAllowlist: v })} />
			<span className={descCls}>{t('settings.trust.terminalAllowlist' as any)}</span>
		</div>
		<div className={rowCls}>
			<VoidSwitch size='xs' value={!!aa.terminalAny} onChange={v => patch({ terminalAny: v })} />
			<span className={descCls}>{t('settings.trust.terminalAny' as any)}</span>
		</div>
		<div className={rowCls}>
			<VoidSwitch size='xs' value={!!aa.mcpAll} onChange={v => patch({ mcpAll: v })} />
			<span className={descCls}>{t('settings.trust.mcpAll' as any)}</span>
		</div>

		{/* allowlist 编辑器 */}
		<div className='mt-3'>
			<div className='text-xs text-void-fg-3 mb-1'>{t('settings.trust.terminalAllowlistPatterns.title' as any)}</div>
			<textarea
				className='w-full min-h-[84px] text-xs p-2 bg-void-bg-2 border border-void-border-3 rounded-sm font-mono'
				value={draftPatterns}
				onChange={e => setDraftPatterns(e.target.value)}
				onBlur={savePatterns}
				spellCheck={false}
			/>
			<div className='text-[10px] text-void-fg-4 mt-1'>{t('settings.trust.terminalAllowlistPatterns.hint' as any)}</div>
		</div>
	</div>
}


/** P0-2: 推理策略子区（自适应推理预算）。 */
export const ReasoningStrategySection = () => {
	const accessor = useAccessor()
	const voidSettingsService = accessor.get('IVoidSettingsService')
	const voidSettingsState = useSettingsState()
	const gs = voidSettingsState.globalSettings

	const setGs = useCallback(<K extends GlobalSettingName>(k: K, v: any) => {
		voidSettingsService.setGlobalSetting(k, v)
	}, [voidSettingsService])

	const disabled = !gs.reasoningAutoEnabled

	const rowCls = 'flex items-center gap-x-2 my-1.5'
	const descCls = 'text-void-fg-3 text-xs'
	const hintCls = 'text-[10px] text-void-fg-4 ml-8 mt-0.5'

	return <div className='mt-2'>
		<h4 className='text-base'>{t('settings.reasoning.title')}</h4>
		<div className='text-sm text-void-fg-3 mt-1'>{t('settings.reasoning.desc')}</div>

		<div className='my-2'>
			<div className={rowCls}>
				<VoidSwitch size='xs' value={gs.reasoningAutoEnabled} onChange={v => setGs('reasoningAutoEnabled', v)} />
				<span className={descCls}>{t('settings.reasoning.autoEnabled')}</span>
			</div>

			<div className={`${rowCls} ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
				<span className={descCls}>{t('settings.reasoning.defaultTier')}：</span>
				<select
					className='bg-void-bg-2 border border-void-border-3 text-xs px-1 py-0.5 rounded-sm'
					value={gs.reasoningDefaultTier}
					onChange={e => setGs('reasoningDefaultTier', e.target.value)}
					disabled={disabled}
				>
					<option value='default'>{t('settings.reasoning.tier.default')}</option>
					<option value='high'>{t('settings.reasoning.tier.high')}</option>
					<option value='max'>{t('settings.reasoning.tier.max')}</option>
				</select>
			</div>

			<div className={`${rowCls} ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
				<VoidSwitch size='xs' value={gs.reasoningKeywordTriggersEnabled} onChange={v => setGs('reasoningKeywordTriggersEnabled', v)} />
				<span className={descCls}>{t('settings.reasoning.keywordTriggersEnabled')}</span>
			</div>
			<div className={hintCls}>{t('settings.reasoning.keywordTriggersHint')}</div>

			<div className={`${rowCls} ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
				<VoidSwitch size='xs' value={gs.reasoningHeuristicsEnabled} onChange={v => setGs('reasoningHeuristicsEnabled', v)} />
				<span className={descCls}>{t('settings.reasoning.heuristicsEnabled')}</span>
			</div>
			<div className={hintCls}>{t('settings.reasoning.heuristicsHint')}</div>

			<div className={`${rowCls} ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
				<VoidSwitch size='xs' value={gs.reasoningThreadInherit} onChange={v => setGs('reasoningThreadInherit', v)} />
				<span className={descCls}>{t('settings.reasoning.threadInherit')}</span>
			</div>

			<div className='mt-2 text-[10px] text-void-fg-4'>{t('settings.reasoning.hintBill')}</div>
		</div>
	</div>
}


/** 聚合：TrustLevelSelector + 可折叠"高级"面板。Settings Tools 子区引用。 */
export const TrustAndApprovalSection = () => {
	const [showAdvanced, setShowAdvanced] = useState(false)
	const voidSettingsState = useSettingsState()
	const hasLegacy = !!(
		voidSettingsState.globalSettings.autoApprove.edits !== undefined ||
		voidSettingsState.globalSettings.autoApprove.terminal !== undefined ||
		voidSettingsState.globalSettings.autoApprove['MCP tools'] !== undefined
	)

	return <div>
		{hasLegacy && (
			<div className='mb-2 px-2 py-1.5 text-[11px] text-void-fg-3 bg-void-bg-3 border border-void-border-3 rounded-sm'>
				{t('settings.trust.legacyMigratedHint' as any)}
			</div>
		)}
		<TrustLevelSelector />
		<button
			className='mt-2 text-[11px] text-void-fg-3 hover:text-void-fg-2 underline-offset-2 hover:underline'
			onClick={() => setShowAdvanced(v => !v)}
		>
			{showAdvanced ? t('settings.trust.hideAdvanced' as any) : t('settings.trust.showAdvanced' as any)}
		</button>
		{showAdvanced && <GranularAutoApprovePanel />}
	</div>
}



export const OneClickSwitchButton = ({ fromEditor = 'VS Code', className = '' }: { fromEditor?: TransferEditorType, className?: string }) => {
	const accessor = useAccessor()
	const extensionTransferService = accessor.get('IExtensionTransferService')

	const [transferState, setTransferState] = useState<{ type: 'done', error?: string } | { type: | 'loading' | 'justfinished' }>({ type: 'done' })



	const onClick = async () => {
		if (transferState.type !== 'done') return

		setTransferState({ type: 'loading' })

		const errAcc = await extensionTransferService.transferExtensions(os, fromEditor)

		// Even if some files were missing, consider it a success if no actual errors occurred
		const hadError = !!errAcc
		if (hadError) {
			setTransferState({ type: 'done', error: errAcc })
		}
		else {
			setTransferState({ type: 'justfinished' })
			setTimeout(() => { setTransferState({ type: 'done' }); }, 3000)
		}
	}

	return <>
		<VoidButtonBgDarken className={`max-w-48 p-4 ${className}`} disabled={transferState.type !== 'done'} onClick={onClick}>
			{transferState.type === 'done' ? t('onboarding.transferFrom', fromEditor)
				: transferState.type === 'loading' ? <span className='text-nowrap flex flex-nowrap'>{t('onboarding.transferring')}<IconLoading /></span>
					: transferState.type === 'justfinished' ? <AnimatedCheckmarkButton text={t('onboarding.settingsTransferred')} className='bg-none' />
						: null
			}
		</VoidButtonBgDarken>
		{transferState.type === 'done' && transferState.error ? <WarningBox text={transferState.error} /> : null}
	</>
}


// full settings

// MCP Server component
const MCPServerComponent = ({ name, server }: { name: string, server: MCPServer }) => {
	const accessor = useAccessor();
	const mcpService = accessor.get('IMCPService');

	const voidSettings = useSettingsState()
	const isOn = voidSettings.mcpUserStateOfName[name]?.isOn

	const removeUniquePrefix = (name: string) => name.split('_').slice(1).join('_')

	return (
		<div className="border border-void-border-2 bg-void-bg-1 py-3 px-4 rounded-sm my-2">
			<div className="flex items-center justify-between">
				{/* Left side - status and name */}
				<div className="flex items-center gap-2">
					{/* Status indicator */}
					<div className={`w-2 h-2 rounded-full
						${server.status === 'success' ? 'bg-green-500'
							: server.status === 'error' ? 'bg-red-500'
								: server.status === 'loading' ? 'bg-yellow-500'
									: server.status === 'offline' ? 'bg-void-fg-3'
										: ''}
					`}></div>

					{/* Server name */}
					<div className="text-sm font-medium text-void-fg-1">{name}</div>
				</div>

				{/* Right side - power toggle switch */}
				<VoidSwitch
					value={isOn ?? false}
					size='xs'
					disabled={server.status === 'error'}
					onChange={() => mcpService.toggleServerIsOn(name, !isOn)}
				/>
			</div>

			{/* Tools section */}
			{isOn && (
				<div className="mt-3">
					<div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
						{(server.tools ?? []).length > 0 ? (
							(server.tools ?? []).map((tool: { name: string; description?: string }) => (
								<span
									key={tool.name}
									className="px-2 py-0.5 bg-void-bg-2 text-void-fg-3 rounded-sm text-xs"

									data-tooltip-id='void-tooltip'
									data-tooltip-content={tool.description || ''}
									data-tooltip-class-name='void-max-w-[300px]'
								>
									{removeUniquePrefix(tool.name)}
								</span>
							))
						) : (
							<span className="text-xs text-void-fg-3">{t('settings.mcp.noToolsAvailable')}</span>
						)}
					</div>
				</div>
			)}

			{/* Command badge */}
			{isOn && server.command && (
				<div className="mt-3">
					<div className="text-xs text-void-fg-3 mb-1">{t('settings.mcp.commandLabel')}</div>
					<div className="px-2 py-1 bg-void-bg-2 text-xs font-mono overflow-x-auto whitespace-nowrap text-void-fg-2 rounded-sm">
						{server.command}
					</div>
				</div>
			)}

			{/* Error message if present */}
			{server.error && (
				<div className="mt-3">
					<WarningBox text={server.error} />
				</div>
			)}
		</div>
	);
};

// Main component that renders the list of servers
const MCPServersList = () => {
	const mcpServiceState = useMCPServiceState()

	let content: React.ReactNode
	if (mcpServiceState.error) {
		content = <div className="text-void-fg-3 text-sm mt-2">
			{mcpServiceState.error}
		</div>
	}
	else {
		const entries = Object.entries(mcpServiceState.mcpServerOfName)
		if (entries.length === 0) {
			content = <div className="text-void-fg-3 text-sm mt-2">
				No servers found
			</div>
		}
		else {
			content = entries.map(([name, server]) => (
				<MCPServerComponent key={name} name={name} server={server} />
			))
		}
	}

	return <div className="my-2">{content}</div>
};

// --- Code Index Management ---

const formatBytes = (bytes: number): string => {
	if (bytes === 0) return '0 B'
	const units = ['B', 'KB', 'MB', 'GB']
	const i = Math.floor(Math.log(bytes) / Math.log(1024))
	const value = bytes / Math.pow(1024, i)
	return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

const CodeIndexManagement = () => {
	const accessor = useAccessor()
	const codeIndexService = accessor.get('ICodeIndexService')
	const notificationService = accessor.get('INotificationService')
	const nativeHostService = accessor.get('INativeHostService')
	const workspaceContextService = accessor.get('IWorkspaceContextService')

	const [indexState, setIndexState] = useState(codeIndexService.state)
	const [fileCount, setFileCount] = useState(codeIndexService.indexedFileCount)
	const [chunkCount, setChunkCount] = useState(codeIndexService.indexedChunkCount)
	const [totalFiles, setTotalFiles] = useState(codeIndexService.totalFileCount)
	const [cachePath, setCachePath] = useState<string | undefined>(codeIndexService.getCachePath())
	const [cacheSize, setCacheSize] = useState<{ totalBytes: number, fileCount: number } | null>(null)
	const [isClearing, setIsClearing] = useState(false)
	const [isRebuilding, setIsRebuilding] = useState(false)

	const refreshCacheInfo = useCallback(async () => {
		setCachePath(codeIndexService.getCachePath())
		const size = await codeIndexService.getCacheSize()
		setCacheSize(size)
		setFileCount(codeIndexService.indexedFileCount)
		setChunkCount(codeIndexService.indexedChunkCount)
		setTotalFiles(codeIndexService.totalFileCount)
	}, [codeIndexService])

	useEffect(() => {
		refreshCacheInfo()
		const stateDisposable = codeIndexService.onDidChangeState((newState) => {
			setIndexState(newState)
			setFileCount(codeIndexService.indexedFileCount)
			setChunkCount(codeIndexService.indexedChunkCount)
			setTotalFiles(codeIndexService.totalFileCount)
			refreshCacheInfo()
		})
		const progressDisposable = codeIndexService.onDidChangeProgress((progress) => {
			setFileCount(progress.indexedFiles)
			setChunkCount(progress.indexedChunks)
			setTotalFiles(progress.totalFiles)
		})
		return () => {
			stateDisposable.dispose()
			progressDisposable.dispose()
		}
	}, [codeIndexService, refreshCacheInfo])

	const statusColor = indexState === 'ready'
		? 'text-green-500'
		: indexState === 'indexing'
			? 'text-yellow-500'
			: indexState === 'error'
				? 'text-red-500'
				: 'text-void-fg-3'

	const statusKey = `settings.codeIndex.status.${indexState}` as const

	const hasWorkspace = workspaceContextService.getWorkspace().folders.length > 0

	const handleStop = useCallback(() => {
		codeIndexService.stop()
	}, [codeIndexService])

	const handleClearCache = useCallback(async () => {
		setIsClearing(true)
		try {
			await codeIndexService.clearCache()
			await refreshCacheInfo()
			notificationService.info(t('settings.codeIndex.cacheCleared'))
		} catch (e) {
			console.error('Failed to clear code index cache', e)
		} finally {
			setIsClearing(false)
		}
	}, [codeIndexService, notificationService, refreshCacheInfo])

	const handleRebuild = useCallback(async () => {
		const root = workspaceContextService.getWorkspace().folders[0]?.uri
		if (!root) return
		setIsRebuilding(true)
		try {
			await codeIndexService.clearCache()
			await codeIndexService.startIndexing(root)
		} catch (e) {
			console.error('Failed to rebuild code index', e)
		} finally {
			setIsRebuilding(false)
			await refreshCacheInfo()
		}
	}, [codeIndexService, workspaceContextService, refreshCacheInfo])

	return <div>
		<h2 className='text-3xl mb-2'>{t('settings.codeIndex.title')}</h2>
		<h4 className='text-void-fg-3 mb-4'>{t('settings.codeIndex.desc')}</h4>

		{!hasWorkspace ? (
			<div className='text-void-fg-3 text-sm p-4 rounded bg-void-bg-2'>
				{t('settings.codeIndex.noWorkspace')}
			</div>
		) : (
			<div className='flex flex-col gap-6'>
				{/* Status */}
				<div className='flex flex-col gap-2'>
					<h4 className='text-base font-medium'>{t('settings.codeIndex.status')}</h4>
					<div className='flex items-center gap-2'>
						<span className={`inline-block w-2.5 h-2.5 rounded-full ${indexState === 'ready' ? 'bg-green-500' : indexState === 'indexing' ? 'bg-yellow-500 animate-pulse' : indexState === 'error' ? 'bg-red-500' : 'bg-gray-400'}`} />
						<span className={`text-sm font-medium ${statusColor}`}>{t(statusKey)}</span>
						{indexState === 'indexing' && <Loader2 className='w-4 h-4 animate-spin text-yellow-500' />}
					</div>
					<div className='text-sm text-void-fg-3'>
						{indexState === 'indexing' && totalFiles > 0
							? t('settings.codeIndex.indexedFiles', `${fileCount} / ${totalFiles}`)
							: t('settings.codeIndex.indexedFiles', String(fileCount))
						}
						{indexState === 'indexing' && totalFiles > 0 && (
							<div className='mt-1 w-full max-w-xs bg-void-bg-2 rounded-full h-1.5'>
								<div
									className='bg-yellow-500 h-1.5 rounded-full transition-all duration-300'
									style={{ width: `${Math.min(100, (fileCount / totalFiles) * 100)}%` }}
								/>
							</div>
						)}
					</div>
					<div className='text-sm text-void-fg-3'>
						{t('settings.codeIndex.indexedChunks', String(chunkCount))}
					</div>
				</div>

				{/* Cache Path */}
				<div className='flex flex-col gap-2'>
					<h4 className='text-base font-medium'>{t('settings.codeIndex.cachePath')}</h4>
					{cachePath ? (
						<div
							className='text-sm text-void-fg-3 bg-void-bg-2 px-3 py-2 rounded cursor-pointer hover:bg-void-bg-2/80 transition-colors break-all'
							onClick={() => nativeHostService.showItemInFolder(cachePath)}
							title={cachePath}
						>
							{cachePath}
						</div>
					) : (
						<div className='text-sm text-void-fg-3'>{t('settings.codeIndex.noCache')}</div>
					)}
				</div>

				{/* Cache Size */}
				<div className='flex flex-col gap-2'>
					<h4 className='text-base font-medium'>
						{t('settings.codeIndex.cacheSize', cacheSize ? formatBytes(cacheSize.totalBytes) : '...')}
					</h4>
					{cacheSize && cacheSize.fileCount > 0 && (
						<div className='text-sm text-void-fg-3'>
							{cacheSize.fileCount} file(s)
						</div>
					)}
				</div>

				{/* Actions */}
				<div className='flex gap-3'>
					{indexState === 'indexing' && (
						<VoidButtonBgDarken
							className='px-4 py-1.5'
							onClick={handleStop}
						>
							{t('settings.codeIndex.stopIndex')}
						</VoidButtonBgDarken>
					)}
					<VoidButtonBgDarken
						className='px-4 py-1.5'
						onClick={handleClearCache}
						disabled={isClearing}
					>
						{isClearing ? <Loader2 className='w-4 h-4 animate-spin inline mr-1' /> : null}
						{t('settings.codeIndex.clearCache')}
					</VoidButtonBgDarken>
					<VoidButtonBgDarken
						className='px-4 py-1.5'
						onClick={handleRebuild}
						disabled={isRebuilding}
					>
						{isRebuilding ? <Loader2 className='w-4 h-4 animate-spin inline mr-1' /> : <RefreshCw className='w-4 h-4 inline mr-1' />}
						{t('settings.codeIndex.rebuildIndex')}
					</VoidButtonBgDarken>
				</div>
			</div>
		)}
	</div>
}

export const Settings = () => {
	const [locale] = useLocale()
	const isDark = useIsDark()
	// ─── sidebar nav ──────────────────────────
	const [selectedSection, setSelectedSection] =
		useState<Tab>('models');

	const navItems: { tab: Tab; labelKey: keyof import('../i18n/types.js').TranslationKeys }[] = [
		{ tab: 'models', labelKey: 'settings.nav.models' },
		{ tab: 'features', labelKey: 'settings.nav.featureOptions' },
		{ tab: 'trust', labelKey: 'settings.nav.trust' },
		{ tab: 'codeIndex', labelKey: 'settings.nav.codeIndex' },
		{ tab: 'mcp', labelKey: 'settings.nav.mcp' },
		{ tab: 'skill', labelKey: 'settings.nav.skill' },
		{ tab: 'general', labelKey: 'settings.nav.general' },
	];
	const accessor = useAccessor()
	const commandService = accessor.get('ICommandService')
	const settingsState = useSettingsState()
	const voidSettingsService = accessor.get('IVoidSettingsService')
	const chatThreadsService = accessor.get('IChatThreadService')
	const notificationService = accessor.get('INotificationService')
	const mcpService = accessor.get('IMCPService')
	const storageService = accessor.get('IStorageService')
	const metricsService = accessor.get('IMetricsService')
	const isOptedOut = useIsOptedOut()

	const onDownload = (downloadType: 'Chats' | 'Settings') => {
		let dataStr: string
		let downloadName: string
		if (downloadType === 'Chats') {
			// Export chat threads
			dataStr = JSON.stringify(chatThreadsService.state, null, 2)
			downloadName = 'void-chats.json'
		}
		else if (downloadType === 'Settings') {
			// Export user settings
			dataStr = JSON.stringify(voidSettingsService.state, null, 2)
			downloadName = 'void-settings.json'
		}
		else {
			dataStr = ''
			downloadName = ''
		}

		const blob = new Blob([dataStr], { type: 'application/json' })
		const url = URL.createObjectURL(blob)
		const a = document.createElement('a')
		a.href = url
		a.download = downloadName
		a.click()
		URL.revokeObjectURL(url)
	}


	// Add file input refs
	const fileInputSettingsRef = useRef<HTMLInputElement>(null)
	const fileInputChatsRef = useRef<HTMLInputElement>(null)

	const [s, ss] = useState(0)

	const handleUpload = (uploadType: 'Chats' | 'Settings') => (e: React.ChangeEvent<HTMLInputElement>) => {
		const files = e.target.files
		if (!files) return;
		const file = files[0]
		if (!file) return

		const reader = new FileReader();
		reader.onload = () => {
			try {
				const json = JSON.parse(reader.result as string);

				if (uploadType === 'Chats') {
					chatThreadsService.dangerousSetState(json as any)
				}
				else if (uploadType === 'Settings') {
					voidSettingsService.dangerousSetState(json as any)
				}

				notificationService.info(t('settings.general.importExport.importSuccess', uploadType))
			} catch (err) {
				notificationService.notify({ message: t('settings.general.importExport.importFailed', uploadType), source: err + '', severity: Severity.Error, })
			}
		};
		reader.readAsText(file);
		e.target.value = '';

		ss(s => s + 1)
	}

	return (
		<div key={locale} className={`@@void-scope ${isDark ? 'dark' : ''}`} style={{ height: '100%', width: '100%', overflow: 'auto' }}>
			<div className="flex flex-col md:flex-row w-full gap-6 max-w-[900px] mx-auto mb-32" style={{ minHeight: '80vh' }}>
				{/* ──────────────  SIDEBAR  ────────────── */}
				<aside className="md:w-1/4 w-full p-6 shrink-0">
					<div className="flex flex-col gap-2 mt-12">
						{navItems.map(({ tab, labelKey }) => (
							<button
								key={tab}
								onClick={() => {
									setSelectedSection(tab);
									window.scrollTo({ top: 0, behavior: 'smooth' });
								}}
								className={`
		  py-2 px-4 rounded-md text-left transition-all duration-200
		  ${selectedSection === tab
				? 'bg-[#0e70c0]/80 text-white font-medium shadow-sm'
				: 'bg-void-bg-2 hover:bg-void-bg-2/80 text-void-fg-1'}
		`}
							>
								{t(labelKey)}
							</button>
						))}
					</div>
				</aside>

				{/* ───────────── MAIN PANE ───────────── */}
				<main className="flex-1 p-6 select-none">
					<div className="max-w-3xl">
						<h1 className="text-2xl w-full">{t('settings.title')}</h1>
						<div className="w-full h-[1px] my-2" />

						{/* ═══════ Tab: Models ═══════ */}
						{selectedSection === 'models' && (
							<div className="flex flex-col gap-10">
								<ErrorBoundary>
									<RedoOnboardingButton />
								</ErrorBoundary>

								<section className="space-y-6">
									<header>
										<h2 className="text-3xl mb-3">{t('settings.models.title')}</h2>
										<p className="text-sm text-void-fg-3">{t('settings.models.intro')}</p>
									</header>

									<div className="flex flex-col gap-10">
										<section>
											<h3 className="text-2xl mb-2">{t('settings.models.aggregated.title')}</h3>
											<ChatMarkdownRender string={t('settings.models.aggregated.desc')} chatMessageLocation={undefined} />
											<div className="mt-4 border border-void-border-2 rounded-sm p-4 bg-void-bg-1">
												<SettingsForProvider providerName={'aiyiwei'} showProviderTitle={false} showProviderSuggestions={false} />
											</div>
										</section>

										<section>
											<h3 className="text-2xl mb-2">{t('settings.models.openAI.title')}</h3>
											<ChatMarkdownRender string={t('settings.models.openAI.desc')} chatMessageLocation={undefined} />
											<div className="mt-4 border border-void-border-2 rounded-sm p-4 bg-void-bg-1">
												<SettingsForProvider providerName={'openAICompatible'} showProviderTitle={false} showProviderSuggestions={false} />
											</div>
										</section>

										<section>
											<h3 className="text-2xl mb-2">{t('settings.localProviders.title')}</h3>
											<p className="text-sm text-void-fg-3 mb-4">{t('settings.localProviders.desc')}</p>
											<div className="flex flex-col gap-4">
												{localProviderNames.map((providerName) => (
													<div key={providerName} className="border border-void-border-2 rounded-sm p-4 bg-void-bg-1">
														<SettingsForProvider providerName={providerName} showProviderTitle={true} showProviderSuggestions={false} />
													</div>
												))}
											</div>
										</section>
									</div>
								</section>

								{/* Model list & auto-detect */}
								<section className="space-y-4">
									<ErrorBoundary><AutoDetectLocalModelsToggle /></ErrorBoundary>
									<ErrorBoundary><RefreshableModels /></ErrorBoundary>
									<ErrorBoundary><ModelDump /></ErrorBoundary>
								</section>
							</div>
						)}

						{/* ═══════ Tab: Features ═══════ */}
						{selectedSection === 'features' && (
							<div className="flex flex-col gap-10">
								<section className="space-y-4">
									<header>
										<h2 className="text-3xl mb-2">{t('settings.features.title')}</h2>
										<p className="text-sm text-void-fg-3">{t('settings.features.desc')}</p>
									</header>

									{/* Feature model selectors */}
									<div className="flex flex-col gap-6">
										{featureNames.map(featureName => {
											const displayName = displayInfoOfFeatureName(featureName)
											return <div key={featureName} className="border border-void-border-2 rounded-sm p-4 bg-void-bg-1">
												<h3 className="text-lg font-medium mb-2">{displayName}</h3>
												<ErrorBoundary>
													<ModelDropdown featureName={featureName} className='text-xs text-void-fg-3 bg-void-bg-1 border border-void-border-1 rounded p-0.5 px-1' />
												</ErrorBoundary>
											</div>
										})}
									</div>
								</section>

								{/* Apply strategy */}
								<section className="space-y-3">
									<h3 className="text-xl">{t('settings.features.apply.desc')}</h3>
									<ErrorBoundary><FastApplyMethodDropdown /></ErrorBoundary>
								</section>

								{/* Reasoning strategy */}
								<ErrorBoundary><ReasoningStrategySection /></ErrorBoundary>
							</div>
						)}

						{/* ═══════ Tab: Trust ═══════ */}
						{selectedSection === 'trust' && (
							<div className="flex flex-col gap-10">
								<section className="space-y-4">
									<header>
										<h2 className="text-3xl mb-2">{t('settings.trust.title')}</h2>
										<p className="text-sm text-void-fg-3">{t('settings.trust.desc')}</p>
									</header>
									<ErrorBoundary><TrustAndApprovalSection /></ErrorBoundary>
								</section>

								{/* Tool auto-approve switches */}
								<section className="space-y-4">
									<h3 className="text-xl">{t('settings.features.tools.title')}</h3>
									<p className="text-sm text-void-fg-3">{t('settings.features.tools.desc')}</p>
									<div className="flex flex-col gap-3">
										{[...toolApprovalTypes].map(approvalType => (
											<div key={approvalType} className="flex items-center gap-2">
												<ErrorBoundary>
													<ToolApprovalTypeSwitch approvalType={approvalType} size='xs' desc={t('settings.features.tools.autoApprove', approvalType)} />
												</ErrorBoundary>
											</div>
										))}
									</div>
								</section>
							</div>
						)}

						{/* ═══════ Tab: Code Index ═══════ */}
						{selectedSection === 'codeIndex' && (
							<ErrorBoundary><CodeIndexManagement /></ErrorBoundary>
						)}

						{/* ═══════ Tab: MCP ═══════ */}
						{selectedSection === 'mcp' && (
							<ErrorBoundary>
								<section className="space-y-4">
									<header>
										<h2 className="text-3xl mb-2">{t('settings.mcp.title')}</h2>
										<div className="text-sm text-void-fg-3">
											<ChatMarkdownRender inPTag={true} string={t('settings.mcp.desc')} chatMessageLocation={undefined} />
										</div>
									</header>

									{/* MCP Marketplace Browser */}
									<div className="space-y-3">
										<h3 className="text-xl">{t('settings.mcp.marketplace')}</h3>
										<ErrorBoundary>
											<MarketplaceBrowser type="mcp-server" />
										</ErrorBoundary>
									</div>

									<hr className="border-void-border-2" />

									<div className="space-y-4">
										<div className="border border-void-border-2 rounded-sm p-4 bg-void-bg-1">
											<h3 className="text-lg font-medium mb-2">{t('settings.mcp.modelscope.title')}</h3>
											<ChatMarkdownRender string={t('settings.mcp.modelscope.desc')} chatMessageLocation={undefined} />
											<div className="mt-3">
												<ChatMarkdownRender string={t('settings.mcp.modelscope.sample')} chatMessageLocation={undefined} />
											</div>
										</div>
										<div>
											<VoidButtonBgDarken className="px-4 py-1 w-full max-w-48" onClick={async () => { await mcpService.revealMCPConfigFile() }}>
												{t('settings.mcp.addServer')}
											</VoidButtonBgDarken>
										</div>
									</div>

									<MCPServersList />
								</section>
							</ErrorBoundary>
						)}

						{/* ═══════ Tab: Skill ═══════ */}
						{selectedSection === 'skill' && (
							<SkillTab />
						)}

						{/* ═══════ Tab: General ═══════ */}
						{selectedSection === 'general' && (
							<div className="flex flex-col gap-10">
								<section className="space-y-4">
									<header>
										<h2 className="text-3xl mb-2">{t('settings.general.title')}</h2>
										<p className="text-sm text-void-fg-3">{t('settings.general.desc')}</p>
									</header>
								</section>

								{/* AI Instructions */}
								<section className="space-y-3">
									<h3 className="text-xl">{t('settings.general.aiInstructions.title')}</h3>
									<p className="text-sm text-void-fg-3">{t('settings.general.aiInstructions.desc')}</p>
									<ErrorBoundary><AIInstructionsBox /></ErrorBoundary>
									<div className="flex items-center gap-2">
										<VoidSwitch
											size='xs'
											value={settingsState.globalSettings.disableSystemMessage ?? false}
											onChange={(newVal) => voidSettingsService.setGlobalSetting('disableSystemMessage', newVal)}
										/>
										<span className="text-void-fg-3 text-xs">{t('settings.general.aiInstructions.disableSystemMessage')}</span>
									</div>
								</section>

								{/* Smithery API Key */}
								<section className="space-y-3">
									<h3 className="text-xl">{t('settings.general.smitheryApiKey')}</h3>
									<ChatMarkdownRender string={t('settings.general.smitheryApiKeyDesc')} chatMessageLocation={undefined} />
									<input
										type="password"
										value={settingsState.globalSettings.smitheryApiKey ?? ''}
										onChange={(e) => voidSettingsService.setGlobalSetting('smitheryApiKey', e.target.value)}
										placeholder="sk-..."
										className="w-full max-w-md px-3 py-1.5 text-sm bg-void-bg-1 border border-void-border-2 rounded text-void-fg-1 placeholder:text-void-fg-3/50 focus:outline-none focus:border-[#0e70c0]"
									/>
								</section>

								{/* Language */}
								<section className="space-y-3">
									<h3 className="text-xl">{t('settings.general.language.title')}</h3>
									<ErrorBoundary>
										<LanguagePicker />
									</ErrorBoundary>
								</section>

								{/* One-click switch */}
								<section className="space-y-3">
									<h3 className="text-xl">{t('settings.general.oneClickSwitch.title')}</h3>
									<p className="text-sm text-void-fg-3">{t('settings.general.oneClickSwitch.desc')}</p>
									<div className="flex gap-3">
										<ErrorBoundary><OneClickSwitchButton fromEditor='VS Code' /></ErrorBoundary>
										<ErrorBoundary><OneClickSwitchButton fromEditor='Cursor' /></ErrorBoundary>
									</div>
								</section>

								{/* Import / Export */}
								<section className="space-y-3">
									<h3 className="text-xl">{t('settings.general.importExport.title')}</h3>
									<p className="text-sm text-void-fg-3">{t('settings.general.importExport.desc')}</p>
									<div className="flex flex-wrap gap-2">
										<input ref={fileInputSettingsRef} type="file" accept=".json" onChange={handleUpload('Settings')} className="hidden" />
										<VoidButtonBgDarken className="px-3 py-1" onClick={() => fileInputSettingsRef.current?.click()}>
											{t('settings.general.importExport.importSettings')}
										</VoidButtonBgDarken>
										<VoidButtonBgDarken className="px-3 py-1" onClick={() => onDownload('Settings')}>
											{t('settings.general.importExport.exportSettings')}
										</VoidButtonBgDarken>
										<ConfirmButton className="px-3 py-1" onConfirm={() => { voidSettingsService.dangerousSetState({} as any) }}>
											{t('settings.general.importExport.resetSettings')}
										</ConfirmButton>
									</div>
									<div className="flex flex-wrap gap-2 mt-2">
										<input ref={fileInputChatsRef} type="file" accept=".json" onChange={handleUpload('Chats')} className="hidden" />
										<VoidButtonBgDarken className="px-3 py-1" onClick={() => fileInputChatsRef.current?.click()}>
											{t('settings.general.importExport.importChats')}
										</VoidButtonBgDarken>
										<VoidButtonBgDarken className="px-3 py-1" onClick={() => onDownload('Chats')}>
											{t('settings.general.importExport.exportChats')}
										</VoidButtonBgDarken>
										<ConfirmButton className="px-3 py-1" onConfirm={() => { chatThreadsService.dangerousSetState({} as any) }}>
											{t('settings.general.importExport.resetChats')}
										</ConfirmButton>
									</div>
								</section>

								{/* Built-in Settings */}
								<section className="space-y-3">
									<h3 className="text-xl">{t('settings.general.builtInSettings.title')}</h3>
									<p className="text-sm text-void-fg-3">{t('settings.general.builtInSettings.desc')}</p>
									<div className="flex flex-wrap gap-2">
										<VoidButtonBgDarken className="px-3 py-1" onClick={() => commandService.executeCommand('workbench.action.openSettings')}>
											{t('settings.general.builtInSettings.general')}
										</VoidButtonBgDarken>
										<VoidButtonBgDarken className="px-3 py-1" onClick={() => commandService.executeCommand('workbench.action.openGlobalKeybindings')}>
											{t('settings.general.builtInSettings.keyboard')}
										</VoidButtonBgDarken>
										<VoidButtonBgDarken className="px-3 py-1" onClick={() => commandService.executeCommand('workbench.action.selectTheme')}>
											{t('settings.general.builtInSettings.theme')}
										</VoidButtonBgDarken>
										<VoidButtonBgDarken className="px-3 py-1" onClick={() => commandService.executeCommand('workbench.action.showLogs')}>
											{t('settings.general.builtInSettings.openLogs')}
										</VoidButtonBgDarken>
									</div>
								</section>

								{/* Metrics opt-out */}
								<section className="space-y-3">
									<h3 className="text-xl">{t('settings.general.metrics.title')}</h3>
									<p className="text-sm text-void-fg-3">{t('settings.general.metrics.desc')}</p>
									<div className="flex items-center gap-2">
										<VoidSwitch
											size='xs'
											value={!isOptedOut}
											onChange={(newVal) => {
												storageService.store(OPT_OUT_KEY, !newVal, StorageScope.APPLICATION, StorageTarget.USER)
												metricsService.capture('Metrics Opt-Out Toggle', { optedOut: !newVal })
											}}
										/>
										<span className="text-void-fg-3 text-xs">{t('settings.general.metrics.optOut')}</span>
									</div>
								</section>

								{/* Version info */}
								<section className="space-y-2">
									<h3 className="text-xl">{t('settings.general.version')}</h3>
									<div className="text-sm text-void-fg-3">
										YWCode
									</div>
								</section>
							</div>
						)}
					</div>
				</main>
			</div>
		</div>
	);
	};

	export default Settings;
