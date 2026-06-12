/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// ====================== MCP/Skill Marketplace Aggregation Types ======================

export type MarketplaceSource = 'smithery' | 'modelscope';

export type MarketplaceItemType = 'mcp-server' | 'skill';

export type MarketplaceSortBy = 'default' | 'downloads' | 'score' | 'updated';

export type MarketplaceFilter = 'code' | 'all';

/** Unified marketplace item from any source */
export interface MarketplaceItem {
	// Identity
	id: string;                    // Global unique: "smithery:server:xxx" | "modelscope:mcp:xxx"
	source: MarketplaceSource;
	type: MarketplaceItemType;

	// Basic info
	name: string;
	qualifiedName: string;         // e.g. "smithery/hello-world"
	description: string;
	iconUrl?: string;
	homepage?: string;

	// Metrics (normalized)
	useCount: number;
	score: number;                 // 0-1 normalized
	verified: boolean;
	createdAt: string;             // ISO timestamp
	updatedAt?: string;

	// Classification
	categories: string[];
	isCodeRelated: boolean;        // Pre-computed

	// Install info
	installConfig?: MCPInstallConfig;
	skillPrompt?: string;
}

/** MCP server install configuration */
export interface MCPInstallConfig {
	command?: string;
	args?: string[];
	env?: Record<string, string>;
	url?: string;
	requiresApiKey?: boolean;
	apiKeyEnvName?: string;
}

/** Search parameters */
export interface MarketplaceSearchParams {
	query?: string;
	type: MarketplaceItemType | 'all';
	sources?: MarketplaceSource[];
	sort: MarketplaceSortBy;
	filter: MarketplaceFilter | string;
	verifiedOnly?: boolean;
	page: number;
	pageSize: number;
}

/** Search result */
export interface MarketplaceSearchResult {
	items: MarketplaceItem[];
	totalCount: number;
	page: number;
	pageSize: number;
	sources: { source: string; count: number; error?: string }[];
}

// ====================== Code-Related Classification ======================

export const CODE_RELATED_KEYWORDS = [
	'code', 'coding', 'programming', 'development', 'developer',
	'ide', 'editor', 'git', 'github', 'gitlab',
	'debug', 'test', 'lint', 'format', 'refactor',
	'typescript', 'javascript', 'python', 'rust', 'go', 'java',
	'api', 'database', 'sql', 'docker', 'kubernetes',
	'ci', 'cd', 'devops', 'deploy', 'build',
	'documentation', 'markdown', 'readme',
	'file', 'filesystem', 'terminal', 'shell', 'cli',
];

export function isCodeRelated(item: { categories: string[]; name: string; description: string }): boolean {
	const text = [...item.categories, item.name, item.description].join(' ').toLowerCase();
	return CODE_RELATED_KEYWORDS.some(kw => text.includes(kw));
}

/** Format a large number for display (e.g. 12500 -> "12.5K") */
export function formatUseCount(count: number): string {
	if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
	if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
	return `${count}`;
}

/** Format ISO date to relative time string */
export function formatRelativeTime(isoDate: string): string {
	const now = Date.now();
	const then = new Date(isoDate).getTime();
	const diffMs = now - then;
	const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
	if (diffDays < 1) return 'today';
	if (diffDays < 7) return `${diffDays}d ago`;
	if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
	if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
	return `${Math.floor(diffDays / 365)}y ago`;
}
