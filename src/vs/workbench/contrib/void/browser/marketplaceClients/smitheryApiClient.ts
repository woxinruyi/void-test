/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { MarketplaceItem, isCodeRelated } from '../../common/marketplaceTypes.js';

const SMITHERY_API_BASE = 'https://api.smithery.ai';
const REQUEST_TIMEOUT_MS = 8000;

interface SmitheryServerResponse {
	servers: SmitheryServer[];
	pagination: { currentPage: number; pageSize: number; totalPages: number; totalCount: number };
}

interface SmitheryServer {
	id?: string;
	qualifiedName: string;
	displayName: string;
	description: string;
	iconUrl?: string;
	verified: boolean;
	useCount: number;
	remote?: boolean;
	isDeployed?: boolean;
	createdAt: string;
	homepage?: string;
	score?: number;
}

interface SmitherySkillResponse {
	skills: SmitherySkill[];
	pagination: { currentPage: number; pageSize: number; totalPages: number; totalCount: number };
}

interface SmitherySkill {
	id: string;
	namespace?: string;
	slug?: string;
	displayName: string;
	description: string;
	prompt?: string;
	qualityScore?: number;
	verified: boolean;
	listed?: boolean;
	createdAt: string;
	externalStars?: number;
	externalForks?: number;
	totalActivations?: number;
	uniqueUsers?: number;
	categories?: string[];
	servers?: string[];
	gitUrl?: string;
}

export class SmitheryApiClient {

	constructor(private readonly getApiKey: () => string) { }

	async searchServers(query?: string, page: number = 1, pageSize: number = 20, verified?: boolean): Promise<{ items: MarketplaceItem[]; totalCount: number }> {
		const params = new URLSearchParams();
		if (query) params.set('q', query);
		params.set('page', String(page));
		params.set('pageSize', String(pageSize));
		if (verified) params.set('verified', '1');

		const data = await this._fetch<SmitheryServerResponse>(`/servers?${params.toString()}`);
		if (!data) return { items: [], totalCount: 0 };

		const items: MarketplaceItem[] = data.servers.map(s => {
			const categories: string[] = [];
			if (s.remote) categories.push('remote');
			if (s.isDeployed) categories.push('deployed');
			return {
				id: `smithery:server:${s.qualifiedName}`,
				source: 'smithery' as const,
				type: 'mcp-server' as const,
				name: s.displayName || s.qualifiedName,
				qualifiedName: s.qualifiedName,
				description: s.description || '',
				iconUrl: s.iconUrl,
				homepage: s.homepage || `https://smithery.ai/server/${s.qualifiedName}`,
				useCount: s.useCount || 0,
				score: Math.min(1, Math.max(0, s.score ?? 0)),
				verified: s.verified,
				createdAt: s.createdAt,
				categories,
				isCodeRelated: isCodeRelated({ categories, name: s.displayName || s.qualifiedName, description: s.description || '' }),
				installConfig: s.isDeployed ? {
					url: `https://server.smithery.ai/${s.qualifiedName}`,
				} : undefined,
			};
		});

		return { items, totalCount: data.pagination.totalCount };
	}

	async searchSkills(query?: string, page: number = 1, pageSize: number = 20, category?: string): Promise<{ items: MarketplaceItem[]; totalCount: number }> {
		const params = new URLSearchParams();
		if (query) params.set('q', query);
		params.set('page', String(page));
		params.set('pageSize', String(pageSize));
		if (category) params.set('category', category);

		const data = await this._fetch<SmitherySkillResponse>(`/skills?${params.toString()}`);
		if (!data) return { items: [], totalCount: 0 };

		const items: MarketplaceItem[] = data.skills.map(s => {
			const categories = s.categories || [];
			return {
				id: `smithery:skill:${s.id}`,
				source: 'smithery' as const,
				type: 'skill' as const,
				name: s.displayName || s.id,
				qualifiedName: s.id,
				description: s.description || '',
				homepage: s.gitUrl || `https://smithery.ai/skills/${s.namespace}/${s.slug}`,
				useCount: s.totalActivations || 0,
				score: s.qualityScore != null ? Math.min(1, Math.max(0, s.qualityScore / 100)) : 0,
				verified: s.verified,
				createdAt: s.createdAt,
				categories,
				isCodeRelated: isCodeRelated({ categories, name: s.displayName || s.id, description: s.description || '' }),
				skillPrompt: s.prompt,
			};
		});

		return { items, totalCount: data.pagination.totalCount };
	}

	private async _fetch<T>(path: string): Promise<T | null> {
		const apiKey = this.getApiKey();
		if (!apiKey) {
			console.warn('[MarketplaceService] No Smithery API key configured');
			return null;
		}

		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

		try {
			const response = await fetch(`${SMITHERY_API_BASE}${path}`, {
				headers: {
					'Authorization': `Bearer ${apiKey}`,
					'Accept': 'application/json',
				},
				signal: controller.signal,
			});

			if (!response.ok) {
				if (response.status === 401) {
					console.warn('[MarketplaceService] Smithery API key invalid (401)');
				} else {
					console.warn(`[MarketplaceService] Smithery API error: ${response.status}`);
				}
				return null;
			}

			return await response.json() as T;
		} catch (err: any) {
			if (err?.name === 'AbortError') {
				console.warn('[MarketplaceService] Smithery API request timed out');
			} else {
				console.warn('[MarketplaceService] Smithery API fetch error:', err);
			}
			return null;
		} finally {
			clearTimeout(timeout);
		}
	}
}
