/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// ====================== ModelScope MCP/Skill API Client ======================
//
// 基于实际浏览器抓包发现的魔搭 API 端点（2026-04-28 验证）：
//   - MCP 服务器: PUT /api/v1/dolphin/mcpServers  (9,468+ 个)
//   - Skills:     PUT /api/v1/dolphin/skills       (80,464+ 个)
//
// 注意：魔搭使用阿里云 WAF 反爬保护，需要携带浏览器 UA 和 Referer 头。
// 通过 VS Code 内置的 IRequestService 在 main process（Node.js）中发起请求，
// 绕过 Electron renderer 的 CORS 限制。失败时静默降级，不影响 Smithery 源。

import { MarketplaceItem, isCodeRelated } from '../../common/marketplaceTypes.js';
import { IRequestService, asJson } from '../../../../../platform/request/common/request.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';

const MODELSCOPE_API_BASE = 'https://www.modelscope.cn/api/v1';
const REQUEST_TIMEOUT_MS = 8000;
const UNAVAILABLE_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

// ---- MCP Server 响应结构（2026-04-29 PowerShell 验证完整字段） ----
interface ModelScopeMCPServerItem {
	Id?: number;
	Name?: string;
	ChineseName?: string;
	Publisher?: string;             // 如 "@modelcontextprotocol/fetch"
	Path?: string;                  // 组织路径，如 @modelcontextprotocol
	Abstract?: string;              // 英文摘要
	AbstractCN?: string;            // 中文摘要
	CallVolume?: number;            // 调用量（如 278,878,833）
	Category?: string[];            // 分类标签，如 ["browser-automation"]
	Hosted?: boolean;               // 是否魔搭托管
	License?: string;
	GmtCreated?: number;            // Unix timestamp (秒)
	GmtUpdated?: number;
	FromSiteUrl?: string;           // GitHub 源地址
	FromSiteIcon?: string;          // 来源站图标 URL
	IsTop?: number;                 // 排序权重
	TransportType?: string;
	Tags?: string[];
	// ---- 关键安装配置（直接可用的 mcp.json 格式） ----
	ServerConfig?: Record<string, { mcpServers?: Record<string, { command?: string; args?: string[]; env?: Record<string, string>; url?: string }> }> | { mcpServers?: Record<string, { command?: string; args?: string[]; env?: Record<string, string>; url?: string }> };
	EnvSchema?: { properties?: Record<string, any>; required?: string[]; type?: string };
	// ---- 丰富度指标 ----
	Stars?: number;                 // 收藏数（如 700）
	Verifed?: boolean;              // 是否认证（注意：API 拼写为 Verifed）
	ViewCount?: number;             // 浏览量
	// ---- 工具列表 ----
	Tools?: { name?: string; description?: string; inputSchema?: Record<string, any> }[];
	// ---- SSE/Streamable 部署配置 ----
	SSEParameterSchema?: Record<string, any>;
	SSEServerConfig?: Record<string, any> | null;
	StreamableHTTPParameterSchema?: Record<string, any>;
	StreamableHTTPServerConfig?: Record<string, any> | null;
	SupportedDeployTransportType?: string[];
	DeployedUrl?: string;
}

interface ModelScopeMCPResponse {
	Code?: number;
	Success?: boolean;
	Data?: {
		McpServer?: {
			McpServers?: ModelScopeMCPServerItem[];
			TotalCount?: number;
		};
		FiledAgg?: {
			Category?: { Count: number; Value: string }[];
		};
	};
}

// ---- Skill 响应结构（实际抓包，2026-04-29 PowerShell 验证完整字段） ----
interface ModelScopeSkillItem {
	Name?: string;
	DisplayName?: string;
	Description?: string;
	DescriptionEn?: string;
	Owner?: string;
	Path?: string;                  // 组织路径，如 @Alipay
	NickName?: string;
	DownloadCount?: number;
	Visits?: number;
	Likes?: number;
	GmtCreate?: number;            // Unix timestamp (秒)
	GmtModify?: number;
	IsTop?: number;
	L1?: { CatalogID?: string; ChineseName?: string; Name?: string; ID?: number; Business?: string; Parent?: number; Weight?: number };
	L2?: { CatalogID?: string; ChineseName?: string; Name?: string } | null;
	License?: string;
	Tags?: string[];                // 如 ["code-review","debugging"]
	Source?: string;                // "ModelScope" | "github"
	SourceURL?: string;             // GitHub 源地址
	SourceAvatar?: string;          // 开发者/组织头像 URL
	SourceDeveloper?: string;
	SourceStar?: number;            // GitHub star 数
	SourceForks?: number;           // GitHub fork 数
	CoverImages?: string;           // 封面图 URL
	ReadMeContent?: string;         // Readme 内容
	Visibility?: number;            // 可见性 (5=公开)
	Organization?: { Id?: number; Name?: string; Avatar?: string; Path?: string };
}

interface ModelScopeSkillResponse {
	Code?: number;
	Success?: boolean;
	Data?: {
		SkillList?: ModelScopeSkillItem[];
		TotalCount?: number;
	};
}

// ---- 分类筛选条件 ----
interface CriterionItem {
	Field: string;
	Value: string;
}

// ---- 代码相关分类 ID ----
const CODE_RELATED_CATEGORIES = [
	'developer-tools', 'code-execution', 'code-analysis', 'version-control',
	'ci-cd', 'testing-and-qa-tools', 'databases', 'shell-access', 'command-line',
	'coding-agents', 'software-architecture', 'api-testing',
];

export class ModelScopeApiClient {

	private _unavailableUntil: number = 0;

	constructor(private readonly _requestService: IRequestService) { }

	/**
	 * 搜索 MCP 服务器
	 * @param query 搜索关键词
	 * @param page 页码（从 1 开始）
	 * @param pageSize 每页数量
	 * @param category 可选分类过滤（如 'developer-tools'）
	 */
	async searchMCPServers(query?: string, page: number = 1, pageSize: number = 20, category?: string): Promise<{ items: MarketplaceItem[]; totalCount: number }> {
		if (Date.now() < this._unavailableUntil) {
			return { items: [], totalCount: 0 };
		}

		const criterion: CriterionItem[] = [];
		if (category) {
			criterion.push({ Field: 'Category', Value: category });
		}

		const body = {
			PageSize: pageSize,
			PageNumber: page,
			Query: query || '',
			Criterion: criterion,
		};

		const data = await this._putJson<ModelScopeMCPResponse>('/dolphin/mcpServers', body);
		if (!data?.Data?.McpServer) {
			return { items: [], totalCount: 0 };
		}

		const servers = data.Data.McpServer.McpServers || [];
		const totalCount = data.Data.McpServer.TotalCount || servers.length;

		const items: MarketplaceItem[] = servers.map(s => {
			const categories = s.Category || [];
			const name = s.ChineseName || s.Name || 'Unknown';
			const description = s.AbstractCN || s.Abstract || '';
			const publisher = s.Publisher || (s.Path ? `${s.Path}/${s.Name}` : s.Name) || '';

			// score 综合 IsTop 排序权重 + Stars 收藏数
			const topScore = s.IsTop ? Math.min(0.6, s.IsTop / 100) : 0;
			const starScore = s.Stars ? Math.min(0.4, s.Stars / 1000) : 0;
			const score = Math.min(1, topScore + starScore);

			return {
				id: `modelscope:mcp:${s.Id || s.Name || ''}`,
				source: 'modelscope' as const,
				type: 'mcp-server' as const,
				name,
				qualifiedName: publisher,
				description,
				iconUrl: s.FromSiteIcon || undefined,
				homepage: s.FromSiteUrl || (s.Name ? `https://www.modelscope.cn/mcp/servers/${s.Publisher || s.Name}` : undefined),
				useCount: s.CallVolume || 0,
				score,
				verified: s.Verifed === true,
				createdAt: s.GmtCreated ? new Date(s.GmtCreated * 1000).toISOString() : '',
				updatedAt: s.GmtUpdated ? new Date(s.GmtUpdated * 1000).toISOString() : undefined,
				categories,
				isCodeRelated: isCodeRelated({ categories, name, description }),
				installConfig: this._extractInstallConfig(s),
			};
		});

		return { items, totalCount };
	}

	/**
	 * 搜索 Skills
	 * @param query 搜索关键词
	 * @param page 页码（从 1 开始）
	 * @param pageSize 每页数量
	 */
	async searchSkills(query?: string, page: number = 1, pageSize: number = 20): Promise<{ items: MarketplaceItem[]; totalCount: number }> {
		if (Date.now() < this._unavailableUntil) {
			return { items: [], totalCount: 0 };
		}

		const body = {
			PageSize: pageSize,
			PageNumber: page,
			Query: query || '',
		};

		const data = await this._putJson<ModelScopeSkillResponse>('/dolphin/skills', body);
		if (!data?.Data?.SkillList) {
			return { items: [], totalCount: 0 };
		}

		const skills = data.Data.SkillList;
		const totalCount = data.Data.TotalCount || skills.length;

		const items: MarketplaceItem[] = skills.map(s => {
			// 合并 L1 分类 + Tags，去重
			const catSet = new Set<string>();
			if (s.L1?.CatalogID) catSet.add(s.L1.CatalogID);
			if (s.L2?.CatalogID) catSet.add(s.L2.CatalogID);
			if (s.Tags) s.Tags.forEach(t => catSet.add(t));
			const categories = [...catSet];

			const name = s.DisplayName || s.Name || 'Unknown';
			const description = s.Description || s.DescriptionEn || '';

			// homepage 优先用 GitHub 源地址，回退到魔搭 Skills 页
			const homepage = s.SourceURL
				|| (s.Name ? `https://www.modelscope.cn/skills/${s.Path || s.Owner}/${s.Name}` : undefined);

			// iconUrl 优先 CoverImages，回退 SourceAvatar
			const iconUrl = s.CoverImages || s.SourceAvatar || undefined;

			// score 综合 IsTop 排序权重 + GitHub star
			const starScore = s.SourceStar ? Math.min(0.3, s.SourceStar / 500) : 0;
			const topScore = s.IsTop ? Math.min(0.7, s.IsTop / 100) : 0;
			const score = Math.min(1, topScore + starScore);

			return {
				id: `modelscope:skill:${s.Path ? `${s.Path}/${s.Name}` : s.Name || ''}`,
				source: 'modelscope' as const,
				type: 'skill' as const,
				name,
				qualifiedName: s.Path ? `${s.Path}/${s.Name}` : (s.Name || ''),
				description,
				iconUrl,
				homepage,
				useCount: s.DownloadCount || 0,
				score,
				verified: false,
				createdAt: s.GmtCreate ? new Date(s.GmtCreate * 1000).toISOString() : '',
				updatedAt: s.GmtModify ? new Date(s.GmtModify * 1000).toISOString() : undefined,
				categories,
				isCodeRelated: isCodeRelated({ categories, name, description }),
				skillPrompt: s.Description,
			};
		});

		return { items, totalCount };
	}

	/**
	 * 获取可用的 MCP 分类列表（含计数）
	 */
	async getCategories(): Promise<{ id: string; count: number }[]> {
		if (Date.now() < this._unavailableUntil) return [];

		const data = await this._putJson<ModelScopeMCPResponse>('/dolphin/mcpServers', {
			PageSize: 1, PageNumber: 1, Query: '', Criterion: [],
		});

		const categories = data?.Data?.FiledAgg?.Category || [];
		return categories.map(c => ({ id: c.Value, count: c.Count }));
	}

	/**
	 * 获取代码相关的分类 ID 列表
	 */
	getCodeRelatedCategories(): string[] {
		return CODE_RELATED_CATEGORIES;
	}

	// ---- 从 ServerConfig 提取安装配置（直接 mcp.json 格式） ----
	// 实际 API 返回示例: ServerConfig = { mcpServers: { "fetch": { command: "uvx", args: ["mcp-server-fetch"] } } }
	private _extractInstallConfig(s: ModelScopeMCPServerItem): { command?: string; args?: string[]; env?: Record<string, string>; url?: string } | undefined {
		// 优先从 ServerConfig 提取（直接可用的 mcp.json 格式）
		if (s.ServerConfig) {
			try {
				const config = typeof s.ServerConfig === 'string' ? JSON.parse(s.ServerConfig) : s.ServerConfig;
				const mcpServers = config?.mcpServers || config;
				// 取第一个 server entry
				const serverNames = Object.keys(mcpServers).filter(k => k !== 'mcpServers');
				const firstKey = serverNames[0] || Object.keys(mcpServers?.mcpServers || {})[0];
				const entry = mcpServers[firstKey] || mcpServers?.mcpServers?.[firstKey];
				if (entry && (entry.command || entry.url)) {
					return {
						command: entry.command,
						args: entry.args,
						env: entry.env || {},
						url: entry.url,
					};
				}
			} catch {
				// ServerConfig 解析失败，继续回退
			}
		}

		// 回退：若有 DeployedUrl（SSE 部署），使用 URL 模式
		if (s.DeployedUrl) {
			return { url: s.DeployedUrl };
		}

		// 最终回退：基于 Publisher 猜测 uvx 安装命令
		if (s.Publisher) {
			return {
				command: 'uvx',
				args: [s.Name || s.Publisher.replace(/^@/, '').replace('/', '-')],
				env: {},
			};
		}
		return undefined;
	}

	// ---- PUT JSON 请求（通过 IRequestService 在 main process 中执行，绕过 CORS） ----
	private async _putJson<T>(path: string, body: Record<string, unknown>): Promise<T | null> {
		console.warn(`[ModelScopeApiClient] _putJson START: ${path}`);
		const cts = new CancellationTokenSource();
		const timeoutHandle = setTimeout(() => cts.cancel(), REQUEST_TIMEOUT_MS);

		try {
			const context = await this._requestService.request({
				type: 'PUT',
				url: `${MODELSCOPE_API_BASE}${path}`,
				headers: {
					'Content-Type': 'application/json',
					'Accept': 'application/json, text/plain, */*',
					'Referer': 'https://www.modelscope.cn/mcp',
					'Origin': 'https://www.modelscope.cn',
					'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
				},
				data: JSON.stringify(body),
				timeout: REQUEST_TIMEOUT_MS,
			}, cts.token);

			const statusCode = context.res.statusCode ?? 0;
			console.warn(`[ModelScopeApiClient] response status: ${statusCode}, headers:`, JSON.stringify(context.res.headers).substring(0, 300));

			if (statusCode === 403 || statusCode === 404 || statusCode === 405) {
				console.warn(`[ModelScopeApiClient] API unavailable (${statusCode}), cooling down 30min`);
				this._unavailableUntil = Date.now() + UNAVAILABLE_COOLDOWN_MS;
				return null;
			}

			if (statusCode < 200 || statusCode >= 300) {
				console.warn(`[ModelScopeApiClient] API error: ${statusCode}`);
				return null;
			}

			// 检测 WAF 拦截（返回 HTML 而非 JSON）
			const contentType = (context.res.headers['content-type'] as string) || '';
			if (!contentType.includes('application/json')) {
				console.warn('[ModelScopeApiClient] WAF blocked request (non-JSON response), cooling down 30min');
				this._unavailableUntil = Date.now() + UNAVAILABLE_COOLDOWN_MS;
				return null;
			}

			const data = await asJson<T>(context);
			console.warn(`[ModelScopeApiClient] parsed data keys:`, data ? Object.keys(data as any) : 'null');
			return data;
		} catch (err: any) {
			if (err?.name === 'CancellationError' || cts.token.isCancellationRequested) {
				console.warn('[ModelScopeApiClient] Request timed out after', REQUEST_TIMEOUT_MS, 'ms');
			} else {
				console.warn('[ModelScopeApiClient] Request error:', err?.name, err?.message || err);
			}
			return null;
		} finally {
			clearTimeout(timeoutHandle);
			cts.dispose();
		}
	}
}
