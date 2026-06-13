
/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *
 *  【业务逻辑说明 - Void 设置类型定义】
 *  本文件定义 Void 设置服务的类型系统，负责 AI 提供商和模型的类型定义：
 *
 *  【核心职责】
 *  1. 定义 ProviderName 类型 - 支持的 AI 提供商名称
 *  2. 区分本地和云端提供商
 *  3. 定义模型信息类型（VoidStatefulModelInfo）
 *  4. 定义提供商设置结构（SettingsAtProvider）
 *  5. 管理自定义设置名称
 *
 *  【提供商分类】
 *  ┌─────────────────────────────────────────────────────────┐
 *  │  本地提供商（Local Providers）                          │
 *  │  ├─ ollama - 本地 Ollama 部署                           │
 *  │  ├─ vLLM - 本地 vLLM 部署                             │
 *  │  └─ lmStudio - LM Studio 本地模型                       │
 *  ├─────────────────────────────────────────────────────────┤
 *  │  云端提供商（Cloud Providers）                          │
 *  │  ├─ anthropic - Claude API                              │
 *  │  ├─ openAI - GPT API                                    │
 *  │  ├─ gemini - Google Gemini API                          │
 *  │  └─ 其他云端服务...                                     │
 *  └─────────────────────────────────────────────────────────┘
 *
 *  【核心类型】
 *  - ProviderName: 提供商名称联合类型
 *  - VoidStatefulModelInfo: 模型信息（名称、类型、是否隐藏）
 *  - SettingsAtProvider<T>: 特定提供商的设置
 *  - SettingsOfProvider: 所有提供商的设置映射
 *
 *  【与 voidSettingsService.ts 的关系】
 *  - 本文件定义类型
 *  - voidSettingsService.ts 使用这些类型实现服务
 *
 *  【修改历史】2026-04-02: 添加业务逻辑注释
 *--------------------------------------------------------------------------------------*/

import { defaultModelsOfProvider, defaultProviderSettings, ModelOverrides } from './modelCapabilities.js';
import { VoidSettingsState } from './voidSettingsService.js'
import { SandboxMode } from './helpers/sandboxArgs.js'


type UnionOfKeys<T> = T extends T ? keyof T : never;



export type ProviderName = keyof typeof defaultProviderSettings
export const providerNames = Object.keys(defaultProviderSettings) as ProviderName[]

export const localProviderNames = ['ollama', 'vLLM', 'lmStudio'] satisfies ProviderName[] // all local names
export const nonlocalProviderNames = providerNames.filter((name) => !(localProviderNames as string[]).includes(name)) // all non-local names

type CustomSettingName = UnionOfKeys<typeof defaultProviderSettings[ProviderName]>
type CustomProviderSettings<providerName extends ProviderName> = {
	[k in CustomSettingName]: k extends keyof typeof defaultProviderSettings[providerName] ? string : undefined
}
export const customSettingNamesOfProvider = (providerName: ProviderName) => {
	return Object.keys(defaultProviderSettings[providerName]) as CustomSettingName[]
}



export type VoidStatefulModelInfo = { // <-- STATEFUL
	modelName: string,
	type: 'default' | 'autodetected' | 'custom';
	isHidden: boolean, // whether or not the user is hiding it (switched off)
}



type CommonProviderSettings = {
	_didFillInProviderSettings: boolean | undefined, // undefined initially, computed when user types in all fields
	models: VoidStatefulModelInfo[],
}

export type SettingsAtProvider<providerName extends ProviderName> = CustomProviderSettings<providerName> & CommonProviderSettings

// part of state
export type SettingsOfProvider = {
	[providerName in ProviderName]: SettingsAtProvider<providerName>
}


export type SettingName = keyof SettingsAtProvider<ProviderName>

type DisplayInfoForProviderName = {
	title: string,
	desc?: string,
}

export const displayInfoOfProviderName = (providerName: ProviderName): DisplayInfoForProviderName => {
	if (providerName === 'anthropic') {
		return { title: 'Anthropic', }
	}
	else if (providerName === 'openAI') {
		return { title: 'OpenAI', }
	}
	else if (providerName === 'deepseek') {
		return { title: 'DeepSeek', }
	}
	else if (providerName === 'openRouter') {
		return { title: 'OpenRouter', }
	}
	else if (providerName === 'ollama') {
		return { title: 'Ollama', }
	}
	else if (providerName === 'vLLM') {
		return { title: 'vLLM', }
	}
	else if (providerName === 'liteLLM') {
		return { title: 'LiteLLM', }
	}
	else if (providerName === 'lmStudio') {
		return { title: 'LM Studio', }
	}
	else if (providerName === 'openAICompatible') {
		return { title: 'OpenAI-Compatible', }
	}
	else if (providerName === 'gemini') {
		return { title: 'Gemini', }
	}
	else if (providerName === 'groq') {
		return { title: 'Groq', }
	}
	else if (providerName === 'xAI') {
		return { title: 'Grok (xAI)', }
	}
	else if (providerName === 'mistral') {
		return { title: 'Mistral', }
	}
	else if (providerName === 'googleVertex') {
		return { title: 'Google Vertex AI', }
	}
	else if (providerName === 'microsoftAzure') {
		return { title: 'Microsoft Azure OpenAI', }
	}
	else if (providerName === 'awsBedrock') {
		return { title: 'AWS Bedrock', }
	}
	else if (providerName === 'aiyiwei') {
		return { title: '聚合AI (aiyiwei.vip)', }
	}

	throw new Error(`descOfProviderName: Unknown provider name: "${providerName}"`)
}

export const subTextMdOfProviderName = (providerName: ProviderName): string => {

	if (providerName === 'anthropic') return 'Get your [API Key here](https://console.anthropic.com/settings/keys).'
	if (providerName === 'openAI') return 'Get your [API Key here](https://platform.openai.com/api-keys).'
	if (providerName === 'deepseek') return 'Get your [API Key here](https://platform.deepseek.com/api_keys).'
	if (providerName === 'openRouter') return 'Get your [API Key here](https://openrouter.ai/settings/keys). Read about [rate limits here](https://openrouter.ai/docs/api-reference/limits).'
	if (providerName === 'gemini') return 'Get your [API Key here](https://aistudio.google.com/apikey). Read about [rate limits here](https://ai.google.dev/gemini-api/docs/rate-limits#current-rate-limits).'
	if (providerName === 'groq') return 'Get your [API Key here](https://console.groq.com/keys).'
	if (providerName === 'xAI') return 'Get your [API Key here](https://console.x.ai).'
	if (providerName === 'mistral') return 'Get your [API Key here](https://console.mistral.ai/api-keys).'
	if (providerName === 'openAICompatible') return `Use any provider that's OpenAI-compatible (use this for llama.cpp and more).`
	if (providerName === 'googleVertex') return 'You must authenticate before using Vertex with Void. Read more about endpoints [here](https://cloud.google.com/vertex-ai/generative-ai/docs/multimodal/call-vertex-using-openai-library), and regions [here](https://cloud.google.com/vertex-ai/docs/general/locations#available-regions).'
	if (providerName === 'microsoftAzure') return 'Read more about endpoints [here](https://learn.microsoft.com/en-us/rest/api/aifoundry/model-inference/get-chat-completions/get-chat-completions?view=rest-aifoundry-model-inference-2024-05-01-preview&tabs=HTTP), and get your API key [here](https://learn.microsoft.com/en-us/azure/search/search-security-api-keys?tabs=rest-use%2Cportal-find%2Cportal-query#find-existing-keys).'
	if (providerName === 'awsBedrock') return 'Connect via a LiteLLM proxy or the AWS [Bedrock-Access-Gateway](https://github.com/aws-samples/bedrock-access-gateway). LiteLLM Bedrock setup docs are [here](https://docs.litellm.ai/docs/providers/bedrock).'
	if (providerName === 'ollama') return 'Read more about custom [Endpoints here](https://github.com/ollama/ollama/blob/main/docs/faq.md#how-can-i-expose-ollama-on-my-network).'
	if (providerName === 'vLLM') return 'Read more about custom [Endpoints here](https://docs.vllm.ai/en/latest/getting_started/quickstart.html#openai-compatible-server).'
	if (providerName === 'lmStudio') return 'Read more about custom [Endpoints here](https://lmstudio.ai/docs/app/api/endpoints/openai).'
	if (providerName === 'liteLLM') return 'Read more about endpoints [here](https://docs.litellm.ai/docs/providers/openai_compatible).'
	if (providerName === 'aiyiwei') return 'Aggregated AI model service supporting OpenAI/Claude/DeepSeek/Gemini and more. Get your [API Key here](https://aiyiwei.vip/register?aff=qzKQV1).'

	throw new Error(`subTextMdOfProviderName: Unknown provider name: "${providerName}"`)
}

type DisplayInfo = {
	title: string;
	placeholder: string;
	isPasswordField?: boolean;
}
export const displayInfoOfSettingName = (providerName: ProviderName, settingName: SettingName): DisplayInfo => {
	if (settingName === 'apiKey') {
		return {
			title: 'API Key',

			// **Please follow this convention**:
			// The word "key..." here is a placeholder for the hash. For example, sk-ant-key... means the key will look like sk-ant-abcdefg123...
			placeholder: providerName === 'anthropic' ? 'sk-ant-key...' : // sk-ant-api03-key
				providerName === 'openAI' ? 'sk-proj-key...' :
					providerName === 'deepseek' ? 'sk-key...' :
						providerName === 'openRouter' ? 'sk-or-key...' : // sk-or-v1-key
							providerName === 'gemini' ? 'AIzaSy...' :
								providerName === 'groq' ? 'gsk_key...' :
									providerName === 'openAICompatible' ? 'sk-key...' :
										providerName === 'xAI' ? 'xai-key...' :
											providerName === 'mistral' ? 'api-key...' :
												providerName === 'googleVertex' ? 'AIzaSy...' :
													providerName === 'microsoftAzure' ? 'key-...' :
														providerName === 'awsBedrock' ? 'key-...' :
															providerName === 'aiyiwei' ? 'sk-key...' :
																'',

			isPasswordField: true,
		}
	}
	else if (settingName === 'endpoint') {
		return {
			title: providerName === 'ollama' ? 'Endpoint' :
				providerName === 'vLLM' ? 'Endpoint' :
					providerName === 'lmStudio' ? 'Endpoint' :
						providerName === 'openAICompatible' ? 'baseURL' : // (do not include /chat/completions)
							providerName === 'googleVertex' ? 'baseURL' :
								providerName === 'microsoftAzure' ? 'baseURL' :
									providerName === 'liteLLM' ? 'baseURL' :
										providerName === 'awsBedrock' ? 'Endpoint' :
											providerName === 'aiyiwei' ? 'Endpoint' :
												'(never)',

			placeholder: providerName === 'ollama' ? defaultProviderSettings.ollama.endpoint
				: providerName === 'vLLM' ? defaultProviderSettings.vLLM.endpoint
					: providerName === 'openAICompatible' ? 'https://my-website.com/v1'
						: providerName === 'lmStudio' ? defaultProviderSettings.lmStudio.endpoint
							: providerName === 'liteLLM' ? 'http://localhost:4000'
								: providerName === 'awsBedrock' ? 'http://localhost:4000/v1'
									: providerName === 'aiyiwei' ? defaultProviderSettings.aiyiwei.endpoint
										: '(never)',


		}
	}
	else if (settingName === 'headersJSON') {
		return { title: 'Custom Headers', placeholder: '{ "X-Request-Id": "..." }' }
	}
	else if (settingName === 'region') {
		// vertex only
		return {
			title: 'Region',
			placeholder: providerName === 'googleVertex' ? defaultProviderSettings.googleVertex.region
				: providerName === 'awsBedrock'
					? defaultProviderSettings.awsBedrock.region
					: ''
		}
	}
	else if (settingName === 'azureApiVersion') {
		// azure only
		return {
			title: 'API Version',
			placeholder: providerName === 'microsoftAzure' ? defaultProviderSettings.microsoftAzure.azureApiVersion
				: ''
		}
	}
	else if (settingName === 'project') {
		return {
			title: providerName === 'microsoftAzure' ? 'Resource'
				: providerName === 'googleVertex' ? 'Project'
					: '',
			placeholder: providerName === 'microsoftAzure' ? 'my-resource'
				: providerName === 'googleVertex' ? 'my-project'
					: ''

		}

	}
	else if (settingName === '_didFillInProviderSettings') {
		return {
			title: '(never)',
			placeholder: '(never)',
		}
	}
	else if (settingName === 'models') {
		return {
			title: '(never)',
			placeholder: '(never)',
		}
	}

	throw new Error(`displayInfo: Unknown setting name: "${settingName}"`)
}


const defaultCustomSettings: Record<CustomSettingName, undefined> = {
	apiKey: undefined,
	endpoint: undefined,
	region: undefined, // googleVertex
	project: undefined,
	azureApiVersion: undefined,
	headersJSON: undefined,
}


const modelInfoOfDefaultModelNames = (defaultModelNames: string[]): { models: VoidStatefulModelInfo[] } => {
	return {
		models: defaultModelNames.map((modelName, i) => ({
			modelName,
			type: 'default',
			isHidden: defaultModelNames.length >= 10, // hide all models if there are a ton of them, and make user enable them individually
		}))
	}
}

// used when waiting and for a type reference
export const defaultSettingsOfProvider: SettingsOfProvider = {
	anthropic: {
		...defaultCustomSettings,
		...defaultProviderSettings.anthropic,
		...modelInfoOfDefaultModelNames(defaultModelsOfProvider.anthropic),
		_didFillInProviderSettings: undefined,
	},
	openAI: {
		...defaultCustomSettings,
		...defaultProviderSettings.openAI,
		...modelInfoOfDefaultModelNames(defaultModelsOfProvider.openAI),
		_didFillInProviderSettings: undefined,
	},
	deepseek: {
		...defaultCustomSettings,
		...defaultProviderSettings.deepseek,
		...modelInfoOfDefaultModelNames(defaultModelsOfProvider.deepseek),
		_didFillInProviderSettings: undefined,
	},
	gemini: {
		...defaultCustomSettings,
		...defaultProviderSettings.gemini,
		...modelInfoOfDefaultModelNames(defaultModelsOfProvider.gemini),
		_didFillInProviderSettings: undefined,
	},
	xAI: {
		...defaultCustomSettings,
		...defaultProviderSettings.xAI,
		...modelInfoOfDefaultModelNames(defaultModelsOfProvider.xAI),
		_didFillInProviderSettings: undefined,
	},
	mistral: {
		...defaultCustomSettings,
		...defaultProviderSettings.mistral,
		...modelInfoOfDefaultModelNames(defaultModelsOfProvider.mistral),
		_didFillInProviderSettings: undefined,
	},
	liteLLM: {
		...defaultCustomSettings,
		...defaultProviderSettings.liteLLM,
		...modelInfoOfDefaultModelNames(defaultModelsOfProvider.liteLLM),
		_didFillInProviderSettings: undefined,
	},
	lmStudio: {
		...defaultCustomSettings,
		...defaultProviderSettings.lmStudio,
		...modelInfoOfDefaultModelNames(defaultModelsOfProvider.lmStudio),
		_didFillInProviderSettings: undefined,
	},
	groq: { // aggregator (serves models from multiple providers)
		...defaultCustomSettings,
		...defaultProviderSettings.groq,
		...modelInfoOfDefaultModelNames(defaultModelsOfProvider.groq),
		_didFillInProviderSettings: undefined,
	},
	openRouter: { // aggregator (serves models from multiple providers)
		...defaultCustomSettings,
		...defaultProviderSettings.openRouter,
		...modelInfoOfDefaultModelNames(defaultModelsOfProvider.openRouter),
		_didFillInProviderSettings: undefined,
	},
	openAICompatible: { // aggregator (serves models from multiple providers)
		...defaultCustomSettings,
		...defaultProviderSettings.openAICompatible,
		...modelInfoOfDefaultModelNames(defaultModelsOfProvider.openAICompatible),
		_didFillInProviderSettings: undefined,
	},
	ollama: { // aggregator (serves models from multiple providers)
		...defaultCustomSettings,
		...defaultProviderSettings.ollama,
		...modelInfoOfDefaultModelNames(defaultModelsOfProvider.ollama),
		_didFillInProviderSettings: undefined,
	},
	vLLM: { // aggregator (serves models from multiple providers)
		...defaultCustomSettings,
		...defaultProviderSettings.vLLM,
		...modelInfoOfDefaultModelNames(defaultModelsOfProvider.vLLM),
		_didFillInProviderSettings: undefined,
	},
	googleVertex: { // aggregator (serves models from multiple providers)
		...defaultCustomSettings,
		...defaultProviderSettings.googleVertex,
		...modelInfoOfDefaultModelNames(defaultModelsOfProvider.googleVertex),
		_didFillInProviderSettings: undefined,
	},
	microsoftAzure: { // aggregator (serves models from multiple providers)
		...defaultCustomSettings,
		...defaultProviderSettings.microsoftAzure,
		...modelInfoOfDefaultModelNames(defaultModelsOfProvider.microsoftAzure),
		_didFillInProviderSettings: undefined,
	},
	awsBedrock: { // aggregator (serves models from multiple providers)
		...defaultCustomSettings,
		...defaultProviderSettings.awsBedrock,
		...modelInfoOfDefaultModelNames(defaultModelsOfProvider.awsBedrock),
		_didFillInProviderSettings: undefined,
	},
	aiyiwei: { // system default aggregated AI provider
		...defaultCustomSettings,
		...defaultProviderSettings.aiyiwei,
		...modelInfoOfDefaultModelNames(defaultModelsOfProvider.aiyiwei),
		_didFillInProviderSettings: undefined,
	},
}


export type ModelSelection = { providerName: ProviderName, modelName: string }

export const modelSelectionsEqual = (m1: ModelSelection, m2: ModelSelection) => {
	return m1.modelName === m2.modelName && m1.providerName === m2.providerName
}

// this is a state
export const featureNames = ['Chat', 'Ctrl+K', 'Autocomplete', 'Apply', 'SCM', 'Review'] as const
export type ModelSelectionOfFeature = Record<(typeof featureNames)[number], ModelSelection | null>
export type FeatureName = keyof ModelSelectionOfFeature

export const displayInfoOfFeatureName = (featureName: FeatureName) => {
	// editor:
	if (featureName === 'Autocomplete')
		return 'Autocomplete'
	else if (featureName === 'Ctrl+K')
		return 'Quick Edit'
	// sidebar:
	else if (featureName === 'Chat')
		return 'Chat'
	else if (featureName === 'Apply')
		return 'Apply'
	// source control:
	else if (featureName === 'SCM')
		return 'Commit Message Generator'
	else if (featureName === 'Review')
		return 'Code Review'
	else
		throw new Error(`Feature Name ${featureName} not allowed`)
}


// the models of these can be refreshed (in theory all can, but not all should)
export const refreshableProviderNames = [...localProviderNames, 'aiyiwei'] as const satisfies readonly ProviderName[]
export type RefreshableProviderName = typeof refreshableProviderNames[number]

// models that come with download buttons
export const hasDownloadButtonsOnModelsProviderNames = ['ollama'] as const satisfies ProviderName[]





// use this in isFeatuerNameDissbled
export const isProviderNameDisabled = (providerName: ProviderName, settingsState: VoidSettingsState) => {

	const settingsAtProvider = settingsState.settingsOfProvider[providerName]
	const isAutodetected = (refreshableProviderNames as readonly string[]).includes(providerName)

	const isDisabled = settingsAtProvider.models.length === 0
	if (isDisabled) {
		return isAutodetected ? 'providerNotAutoDetected' : (!settingsAtProvider._didFillInProviderSettings ? 'notFilledIn' : 'addModel')
	}
	return false
}

export const isFeatureNameDisabled = (featureName: FeatureName, settingsState: VoidSettingsState) => {
	// if has a selected provider, check if it's enabled
	const selectedProvider = settingsState.modelSelectionOfFeature[featureName]

	if (selectedProvider) {
		const { providerName } = selectedProvider
		return isProviderNameDisabled(providerName, settingsState)
	}

	// if there are any models they can turn on, tell them that
	const canTurnOnAModel = !!providerNames.find(providerName => settingsState.settingsOfProvider[providerName].models.filter(m => m.isHidden).length !== 0)
	if (canTurnOnAModel) return 'needToEnableModel'

	// if there are any providers filled in, then they just need to add a model
	const anyFilledIn = !!providerNames.find(providerName => settingsState.settingsOfProvider[providerName]._didFillInProviderSettings)
	if (anyFilledIn) return 'addModel'

	return 'addProvider'
}







export type ChatMode = 'agent' | 'gather' | 'normal'


// ====================== 工具审批分层信任模型 ======================
// 参考 Windsurf 的"信任一次全程自动" 与 Claude Code 的 /permissions 命令式设计。

export type TrustLevel = 'conservative' | 'standard' | 'seamless'

/**
 * 分层审批设置。新字段按"类 + 范围"双维度细化审批。
 * 保留三个 legacy 键（edits / terminal / 'MCP tools'）以向后兼容，
 * 由 voidSettingsService 的 normalizeAutoApprove 在读取时迁移到新字段。
 */
export type AutoApproveSettings = {
	// 新字段 —— 细化"类 + 范围"
	reads?: boolean;                        // 显示位（只读工具本就无审批）
	editsInWorkspace?: boolean;             // 仓库内编辑类（edit_file / rewrite_file / create_* / delete_*）
	editsOutsideWorkspace?: boolean;        // 仓库外路径编辑
	terminalAllowlist?: boolean;            // 启用 allowlist：对匹配 patterns 的命令免批
	terminalAllowlistPatterns?: string[];   // allowlist 模式（前缀匹配）
	terminalAny?: boolean;                  // 所有终端命令免批（激进）
	mcpPerServer?: { [serverName: string]: boolean };
	mcpAll?: boolean;
	mustAlwaysApprovePatterns?: string[];   // 危险命令硬审批模式：匹配即强制 manual，即使 terminalAny=true
	perToolRules?: { [toolName: string]: 'allow' | 'deny' | 'ask' }; // 按工具名细粒度规则

	// Legacy 字段（已废弃，migration 会在读取时迁移并清理）
	edits?: boolean;
	terminal?: boolean;
	'MCP tools'?: boolean;
}

/**
 * 默认终端 allowlist（对齐 Cursor / Windsurf 内置安全清单）。
 * 原则：只读 / 查询 / 用户项目内的测试。排除任何带副作用或联网写操作的命令。
 * 注意：配合 `matchesAllowlist` 的 shell-metachar 防御一起使用，命令含 `|`/`>`/`&&`/`;` 等均不会命中。
 */
export const DEFAULT_TERMINAL_ALLOWLIST: string[] = [
	// --- Git（只读查询；git push/pull/commit/rm/clean 不在白名单） ---
	'git status', 'git log', 'git diff', 'git branch', 'git show', 'git rev-parse',
	'git remote', 'git blame', 'git stash list', 'git tag', 'git describe',
	'git shortlog', 'git config --get', 'git config --list', 'git reflog',
	'git ls-files', 'git worktree list',

	// --- 文件系统（只读） ---
	'ls', 'dir', 'pwd', 'cat', 'type', 'echo', 'which', 'where',
	'head', 'tail', 'tree', 'file', 'stat', 'wc',

	// --- 代码搜索（只读） ---
	'grep', 'rg', 'ag', 'ack',

	// --- 语言运行时版本 ---
	'node --version', 'npm --version', 'pnpm --version', 'yarn --version',
	'python --version', 'py --version', 'pip --version',
	'tsc --version', 'deno --version', 'bun --version',
	'go version', 'rustc --version', 'cargo --version',
	'java -version', 'ruby --version', 'php --version', 'dotnet --version',

	// --- 包管理器（只读查询；install / add / publish / uninstall 不在白名单） ---
	'npm ls', 'npm list', 'npm view', 'npm outdated', 'npm root', 'npm config get',
	'pnpm list', 'pnpm why', 'pnpm outdated',
	'yarn list', 'yarn why',
	'pip list', 'pip show', 'pip freeze',

	// --- 测试（用户项目内脚本，与代码同信任域） ---
	'npm test', 'npm run test', 'pnpm test', 'pnpm run test',
	'yarn test', 'yarn run test', 'pytest', 'go test', 'cargo test', 'cargo check',

	// --- 静态分析 ---
	'go vet', 'go list', 'go env', 'go doc',
	'cargo tree', 'cargo clippy',

	// --- Docker / K8s（只读 inspect；run / exec / apply / delete 不在白名单） ---
	'docker ps', 'docker images', 'docker logs', 'docker inspect',
	'docker version', 'docker info',
	'kubectl get', 'kubectl describe', 'kubectl logs', 'kubectl version',
	'kubectl config view',

	// --- 系统信息（只读） ---
	'whoami', 'hostname', 'uname', 'date', 'uptime', 'df', 'ping',
	'tasklist', 'ver', 'systeminfo',

	// --- PowerShell 只读 cmdlet ---
	'Get-ChildItem', 'Get-Content', 'Get-Location', 'Get-Process',
	'Test-Path', 'Get-Command', 'Resolve-Path', 'Select-String',
]

/**
 * 默认危险命令硬审批模式列表。
 * 匹配这些 pattern 的命令即使 terminalAny=true 也强制人工审批。
 * 防止 AI 意外执行破坏性操作。
 */
export const DEFAULT_MUST_ALWAYS_APPROVE_PATTERNS: string[] = [
	// 破坏性文件操作
	'rm -rf', 'rmdir /s', 'del /f', 'format',
	// 权限 / 系统级
	'sudo', 'chmod', 'chown', 'chgrp',
	// 网络写操作
	'curl -X POST', 'curl -X PUT', 'curl -X DELETE', 'curl -X PATCH',
	'wget --post',
	// 包发布
	'npm publish', 'yarn publish', 'pnpm publish',
	'pip upload', 'twine upload', 'cargo publish',
	// Git 破坏性
	'git push --force', 'git reset --hard', 'git clean -fd',
	// Docker 破坏性
	'docker rm', 'docker rmi', 'docker system prune',
	// K8s 破坏性
	'kubectl delete', 'kubectl apply', 'kubectl exec',
]

/** 三档信任级别预设。 */
export const TRUST_LEVEL_PRESETS: Record<TrustLevel, AutoApproveSettings> = {
	conservative: {
		mustAlwaysApprovePatterns: DEFAULT_MUST_ALWAYS_APPROVE_PATTERNS,
	},
	standard: {
		editsInWorkspace: true,
		terminalAllowlist: true,
		terminalAllowlistPatterns: DEFAULT_TERMINAL_ALLOWLIST,
		mustAlwaysApprovePatterns: DEFAULT_MUST_ALWAYS_APPROVE_PATTERNS,
	},
	seamless: {
		editsInWorkspace: true,
		editsOutsideWorkspace: false, // 显式禁用，避免误写系统路径
		terminalAllowlist: true,
		terminalAllowlistPatterns: DEFAULT_TERMINAL_ALLOWLIST,
		terminalAny: true,
		mcpAll: true,
		mustAlwaysApprovePatterns: DEFAULT_MUST_ALWAYS_APPROVE_PATTERNS,
	},
}


// ====================== 推理预算自适应（P0-2: reasoning-budget-auto） ======================

// Re-export ReasoningTier 用于 GlobalSettings（helpers/reasoningAuto.ts 为权威定义）
export type ReasoningTier = 'off' | 'default' | 'high' | 'max'


export type GlobalSettings = {
	autoRefreshModels: boolean;
	aiInstructions: string;
	enableAutocomplete: boolean;
	syncApplyToChat: boolean;
	syncSCMToChat: boolean;
	enableFastApply: boolean;
	chatMode: ChatMode;
	autoApprove: AutoApproveSettings;
	trustLevel?: TrustLevel;                // 用户在 Onboarding/Settings 选择的信任级别（UI 记录）
	showInlineSuggestions: boolean;
	includeToolLintErrors: boolean;
	isOnboardingComplete: boolean;
	disableSystemMessage: boolean;
	autoAcceptLLMChanges: boolean;

	// 推理预算自适应（P0-2）
	reasoningAutoEnabled: boolean;            // 自适应总开关
	reasoningKeywordTriggersEnabled: boolean; // prompt 关键词触发
	reasoningHeuristicsEnabled: boolean;      // 任务复杂度启发式
	reasoningDefaultTier: ReasoningTier;      // 默认档位
	reasoningThreadInherit: boolean;          // 同 thread 内沿用上一轮档位

	// Marketplace
	smitheryApiKey: string;                   // Smithery API key for marketplace access

	// Anthropic Prompt 缓存（add-prompt-caching）：直连 Anthropic 路径为 tools/system 注入 cache_control
	anthropicPromptCaching: boolean;

	// 终端沙箱档位（add-terminal-sandbox）：对一次性 run_command 用 bwrap(Linux)/sandbox-exec(macOS) 隔离。
	// 默认 'full'（不隔离，行为同历史，零回退）；'read-only'/'workspace-write' 为实验性，需目标 OS + 已装 bwrap，隔离真实生效需本机验证。
	terminalSandboxMode: SandboxMode;
}

export const defaultGlobalSettings: GlobalSettings = {
	autoRefreshModels: true,
	aiInstructions: '',
	enableAutocomplete: false,
	syncApplyToChat: true,
	syncSCMToChat: true,
	enableFastApply: true,
	chatMode: 'agent',
	// 默认对齐主流 AI 编辑器（Cursor / Windsurf）：工作区内编辑自动通过 + 终端白名单自动通过；
	// 工作区外编辑、任意终端命令、MCP 工具仍需人工审批。用户可在 Settings → Tools 顶部切换三档预设。
	autoApprove: {
		editsInWorkspace: true,
		terminalAllowlist: true,
		terminalAllowlistPatterns: [...DEFAULT_TERMINAL_ALLOWLIST],
	},
	trustLevel: 'standard',
	showInlineSuggestions: true,
	includeToolLintErrors: true,
	isOnboardingComplete: false,
	disableSystemMessage: false,
	autoAcceptLLMChanges: false,

	reasoningAutoEnabled: true,
	reasoningKeywordTriggersEnabled: true,
	reasoningHeuristicsEnabled: true,
	reasoningDefaultTier: 'default',
	reasoningThreadInherit: true,

	smitheryApiKey: '',

	anthropicPromptCaching: true,

	terminalSandboxMode: 'full',
}

export type GlobalSettingName = keyof GlobalSettings
export const globalSettingNames = Object.keys(defaultGlobalSettings) as GlobalSettingName[]












export type ModelSelectionOptions = {
	reasoningEnabled?: boolean;
	reasoningBudget?: number;
	reasoningEffort?: string;
}

export type OptionsOfModelSelection = {
	[featureName in FeatureName]: Partial<{
		[providerName in ProviderName]: {
			[modelName: string]: ModelSelectionOptions | undefined
		}
	}>
}





export type OverridesOfModel = {
	[providerName in ProviderName]: {
		[modelName: string]: Partial<ModelOverrides> | undefined
	}
}


const overridesOfModel = {} as OverridesOfModel
for (const providerName of providerNames) { overridesOfModel[providerName] = {} }
export const defaultOverridesOfModel = overridesOfModel



export interface MCPUserStateOfName {
	[serverName: string]: MCPUserState | undefined;
}

export interface MCPUserState {
	isOn: boolean;
}

// ====================== Agent Skills（魔搭 Skills 市场） ======================

export interface SkillInfo {
	/** 技能 ID，格式为 @author/skill-name */
	id: string;
	/** 显示名称 */
	name: string;
	/** 技能描述 */
	description: string;
	/** 来源 URL（如 https://modelscope.cn/skills/@author/skill-name） */
	url: string;
	/** 是否启用 */
	enabled: boolean;
	/** 安装时间 */
	installedAt: number;
	/** 技能完整正文（渐进式披露：仅在被斜杠命令调起时使用；缓存后复用） */
	body?: string;
	/** 技能正文的拉取地址（无 body 缓存时按此加载；见 add-slash-commands） */
	bodyUrl?: string;
}

export interface InstalledSkills {
	[skillId: string]: SkillInfo | undefined;
}
