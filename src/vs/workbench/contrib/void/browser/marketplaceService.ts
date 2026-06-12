/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IPathService } from '../../../services/path/common/pathService.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { IVoidSettingsService } from '../common/voidSettingsService.js';
import { SkillInfo } from '../common/voidSettingsTypes.js';
import { MarketplaceItem, MarketplaceSearchParams, MarketplaceSearchResult, MarketplaceSortBy } from '../common/marketplaceTypes.js';
import { SmitheryApiClient } from './marketplaceClients/smitheryApiClient.js';
import { ModelScopeApiClient } from './marketplaceClients/modelscopeApiClient.js';
import { IRequestService } from '../../../../platform/request/common/request.js';


const MCP_CONFIG_FILE_NAME = 'mcp.json';
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const CACHE_MAX_ENTRIES = 100;


// ====================== Service Interface ======================

export interface IMarketplaceService {
	readonly _serviceBrand: undefined;

	search(params: MarketplaceSearchParams): Promise<MarketplaceSearchResult>;
	installMCPServer(item: MarketplaceItem): Promise<void>;
	installSkill(item: MarketplaceItem): Promise<void>;
	hasSmitheryApiKey(): boolean;

	onDidChangeState: Event<void>;
}

export const IMarketplaceService = createDecorator<IMarketplaceService>('marketplaceService');


// ====================== Cache ======================

class MarketplaceCache {
	private cache = new Map<string, { data: MarketplaceSearchResult; timestamp: number }>();

	get(key: string): MarketplaceSearchResult | undefined {
		const entry = this.cache.get(key);
		if (!entry) return undefined;
		if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
			this.cache.delete(key);
			return undefined;
		}
		return entry.data;
	}

	set(key: string, data: MarketplaceSearchResult): void {
		this.cache.set(key, { data, timestamp: Date.now() });
		if (this.cache.size > CACHE_MAX_ENTRIES) {
			const oldest = this.cache.keys().next().value;
			if (oldest) this.cache.delete(oldest);
		}
	}
}


// ====================== Sort Helpers ======================

function sortItems(items: MarketplaceItem[], sort: MarketplaceSortBy): MarketplaceItem[] {
	if (sort === 'default') {
		return [...items];
	}
	const sorted = [...items];
	switch (sort) {
		case 'downloads':
			sorted.sort((a, b) => b.useCount - a.useCount);
			break;
		case 'updated':
			sorted.sort((a, b) => {
				const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
				const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
				return tb - ta;
			});
			break;
		case 'score':
			sorted.sort((a, b) => b.score - a.score);
			break;
	}
	return sorted;
}


// ====================== Service Implementation ======================

class MarketplaceService extends Disposable implements IMarketplaceService {
	_serviceBrand: undefined;

	private readonly _cache = new MarketplaceCache();
	private readonly _smithery: SmitheryApiClient;
	private readonly _modelscope: ModelScopeApiClient;

	private readonly _onDidChangeState = new Emitter<void>();
	public readonly onDidChangeState = this._onDidChangeState.event;

	constructor(
		@IVoidSettingsService private readonly voidSettingsService: IVoidSettingsService,
		@IFileService private readonly fileService: IFileService,
		@IPathService private readonly pathService: IPathService,
		@IProductService private readonly productService: IProductService,
		@IRequestService private readonly requestService: IRequestService,
	) {
		super();
		this._smithery = new SmitheryApiClient(() => this.voidSettingsService.state.globalSettings.smitheryApiKey);
		this._modelscope = new ModelScopeApiClient(this.requestService);
	}

	hasSmitheryApiKey(): boolean {
		return !!this.voidSettingsService.state.globalSettings.smitheryApiKey;
	}

	async search(params: MarketplaceSearchParams): Promise<MarketplaceSearchResult> {
		const cacheKey = JSON.stringify(params);
		const cached = this._cache.get(cacheKey);
		if (cached) return cached;

		const sources = params.sources || ['smithery', 'modelscope'];
		const sourceResults: { source: string; count: number; error?: string }[] = [];
		let allItems: MarketplaceItem[] = [];

		// Parallel fetch from all sources
		const promises: Promise<void>[] = [];

		if (sources.includes('smithery')) {
			promises.push((async () => {
				try {
					if (params.type === 'mcp-server' || params.type === 'all') {
						const result = await this._smithery.searchServers(
							params.query, params.page, params.pageSize, params.verifiedOnly
						);
						allItems.push(...result.items);
						sourceResults.push({ source: 'smithery', count: result.totalCount });
					}
					if (params.type === 'skill' || params.type === 'all') {
						const category = params.filter !== 'all' ? params.filter : undefined;
						const result = await this._smithery.searchSkills(
							params.query, params.page, params.pageSize, category
						);
						allItems.push(...result.items);
						const existing = sourceResults.find(s => s.source === 'smithery');
						if (existing) existing.count += result.totalCount;
						else sourceResults.push({ source: 'smithery', count: result.totalCount });
					}
				} catch (err: any) {
					sourceResults.push({ source: 'smithery', count: 0, error: err?.message || 'Unknown error' });
				}
			})());
		}

		if (sources.includes('modelscope')) {
			promises.push((async () => {
				try {
					if (params.type === 'mcp-server' || params.type === 'all') {
						// 魔搭 MCP 支持分类筛选：代码相关时传 'developer-tools'
						const category = params.filter === 'code' ? 'developer-tools' : undefined;
						const result = await this._modelscope.searchMCPServers(
							params.query, params.page, params.pageSize, category
						);
						allItems.push(...result.items);
						sourceResults.push({ source: 'modelscope', count: result.totalCount });
					}
					if (params.type === 'skill' || params.type === 'all') {
						// 魔搭 Skills API: PUT /api/v1/dolphin/skills (80,464+ skills)
						const result = await this._modelscope.searchSkills(
							params.query, params.page, params.pageSize
						);
						allItems.push(...result.items);
						const existing = sourceResults.find(s => s.source === 'modelscope');
						if (existing) existing.count += result.totalCount;
						else sourceResults.push({ source: 'modelscope', count: result.totalCount });
					}
					if (params.type !== 'mcp-server' && params.type !== 'skill' && params.type !== 'all') {
						sourceResults.push({ source: 'modelscope', count: 0 });
					}
				} catch (err: any) {
					sourceResults.push({ source: 'modelscope', count: 0, error: err?.message || 'Unknown error' });
				}
			})());
		}

		await Promise.all(promises);

		// Apply code filter
		if (params.filter === 'code') {
			allItems = allItems.filter(item => item.isCodeRelated);
		}

		// Sort
		allItems = sortItems(allItems, params.sort);

		const result: MarketplaceSearchResult = {
			items: allItems,
			totalCount: sourceResults.reduce((sum, s) => sum + s.count, 0),
			page: params.page,
			pageSize: params.pageSize,
			sources: sourceResults,
		};

		this._cache.set(cacheKey, result);
		return result;
	}

	async installMCPServer(item: MarketplaceItem): Promise<void> {
		if (!item.installConfig) {
			console.warn('[MarketplaceService] No install config for MCP server:', item.name);
			return;
		}

		const mcpConfigUri = await this._getMCPConfigFilePath();

		// Read existing config
		let existingConfig: { mcpServers: Record<string, any> } = { mcpServers: {} };
		try {
			const fileContent = await this.fileService.readFile(mcpConfigUri);
			existingConfig = JSON.parse(fileContent.value.toString());
			if (!existingConfig.mcpServers) {
				existingConfig.mcpServers = {};
			}
		} catch {
			// File doesn't exist or is invalid, use default
		}

		// Determine server name
		const serverName = item.qualifiedName.replace(/\//g, '-');

		// Build server entry
		const serverEntry: Record<string, any> = {};
		if (item.installConfig.url) {
			serverEntry.url = item.installConfig.url;
		}
		if (item.installConfig.command) {
			serverEntry.command = item.installConfig.command;
			if (item.installConfig.args) serverEntry.args = item.installConfig.args;
		}
		if (item.installConfig.env) {
			serverEntry.env = item.installConfig.env;
		}
		if (item.installConfig.requiresApiKey && item.installConfig.apiKeyEnvName) {
			serverEntry.env = { ...serverEntry.env, [item.installConfig.apiKeyEnvName]: 'your-api-key-here' };
		}

		// Add to config
		existingConfig.mcpServers[serverName] = serverEntry;

		// Write back
		const buffer = VSBuffer.fromString(JSON.stringify(existingConfig, null, 2) + '\n');
		await this.fileService.writeFile(mcpConfigUri, buffer);

		this._onDidChangeState.fire();
		console.log(`[MarketplaceService] Installed MCP server: ${serverName}`);
	}

	async installSkill(item: MarketplaceItem): Promise<void> {
		const skill: SkillInfo = {
			id: item.qualifiedName || item.id,
			name: item.name,
			description: item.description,
			url: item.homepage || '',
			enabled: true,
			installedAt: Date.now(),
		};

		await this.voidSettingsService.addSkill(skill);
		this._onDidChangeState.fire();
		console.log(`[MarketplaceService] Installed skill: ${skill.name}`);
	}

	private async _getMCPConfigFilePath(): Promise<URI> {
		const appName = this.productService.dataFolderName;
		const userHome = await this.pathService.userHome();
		return URI.joinPath(userHome, appName, MCP_CONFIG_FILE_NAME);
	}
}

registerSingleton(IMarketplaceService, MarketplaceService, InstantiationType.Delayed);
