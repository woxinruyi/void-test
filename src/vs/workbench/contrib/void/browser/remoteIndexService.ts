/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IRequestService } from '../../../../platform/request/common/request.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { streamToBuffer } from '../../../../base/common/buffer.js';
import { RemoteRepoInfo, RemoteFileResult, RemoteSearchResult, RemoteSearchMatch, RemoteTreeResult } from '../common/remoteIndexTypes.js';


const MAX_TREE_FILES = 5000
const MAX_FILE_SIZE = 100_000
const CACHE_TTL_MS = 30 * 60 * 1000 // 30 minutes


export interface IRemoteIndexService {
	readonly _serviceBrand: undefined

	getTree(owner: string, repo: string, branch?: string): Promise<RemoteTreeResult>
	readFile(owner: string, repo: string, path: string, branch?: string): Promise<RemoteFileResult>
	searchCode(owner: string, repo: string, query: string, branch?: string): Promise<RemoteSearchResult>
}

export const IRemoteIndexService = createDecorator<IRemoteIndexService>('remoteIndexService');


class RemoteIndexService extends Disposable implements IRemoteIndexService {
	_serviceBrand: undefined;

	private readonly _repoCache = new Map<string, RemoteRepoInfo>()

	constructor(
		@IRequestService private readonly _requestService: IRequestService,
	) {
		super()
	}

	async getTree(owner: string, repo: string, branch: string = 'main'): Promise<RemoteTreeResult> {
		const cacheKey = `${owner}/${repo}/${branch}`
		const cached = this._repoCache.get(cacheKey)

		if (cached && (Date.now() - cached.indexedAt) < CACHE_TTL_MS) {
			return {
				owner, repo, branch,
				paths: cached.filePaths,
				totalFiles: cached.filePaths.length,
			}
		}

		// Fetch tree from GitHub API (recursive)
		const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`
		const data = await this._githubRequest(url)

		if (!data.tree || !Array.isArray(data.tree)) {
			throw new Error(`Failed to fetch tree for ${owner}/${repo}@${branch}`)
		}

		const filePaths = data.tree
			.filter((item: any) => item.type === 'blob')
			.map((item: any) => item.path as string)
			.slice(0, MAX_TREE_FILES)

		// Cache the result
		this._repoCache.set(cacheKey, {
			owner, repo, branch,
			filePaths,
			indexedAt: Date.now(),
		})

		return {
			owner, repo, branch,
			paths: filePaths,
			totalFiles: filePaths.length,
		}
	}

	async readFile(owner: string, repo: string, path: string, branch: string = 'main'): Promise<RemoteFileResult> {
		const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`
		const data = await this._githubRequest(url)

		if (data.type !== 'file') {
			throw new Error(`${path} is not a file`)
		}

		let content: string
		let truncated = false

		if (data.encoding === 'base64' && data.content) {
			// Decode base64 content
			const decoded = atob(data.content.replace(/\n/g, ''))
			content = decoded
		} else if (data.download_url) {
			// Fallback: fetch raw content
			const rawResp = await this._requestService.request({
				type: 'GET',
				url: data.download_url,
				headers: { 'User-Agent': 'VoidEditor/1.0' },
			}, CancellationToken.None)
			const buf = await streamToBuffer(rawResp.stream)
			content = buf.toString()
		} else {
			throw new Error(`Cannot read file ${path}`)
		}

		if (content.length > MAX_FILE_SIZE) {
			content = content.substring(0, MAX_FILE_SIZE)
			truncated = true
		}

		return {
			path,
			content,
			size: data.size ?? content.length,
			truncated,
		}
	}

	async searchCode(owner: string, repo: string, query: string, branch: string = 'main'): Promise<RemoteSearchResult> {
		// Use GitHub code search API
		const encodedQuery = encodeURIComponent(`${query} repo:${owner}/${repo}`)
		const url = `https://api.github.com/search/code?q=${encodedQuery}&per_page=10`

		try {
			const data = await this._githubRequest(url)
			const matches: RemoteSearchMatch[] = []

			if (data.items && Array.isArray(data.items)) {
				for (const item of data.items.slice(0, 10)) {
					// For each match, try to get a text snippet
					let snippet = ''
					if (item.text_matches && Array.isArray(item.text_matches)) {
						snippet = item.text_matches.map((tm: any) => tm.fragment || '').join('\n...\n')
					}
					matches.push({
						path: item.path || '',
						snippet: snippet || `Match in ${item.name || item.path}`,
						lineNumber: 0, // GitHub search API doesn't provide line numbers
					})
				}
			}

			return {
				owner, repo, branch,
				matches,
				totalMatches: data.total_count ?? matches.length,
			}
		} catch {
			// Fallback: search locally in cached tree by filename pattern
			const tree = await this.getTree(owner, repo, branch)
			const lowerQuery = query.toLowerCase()
			const pathMatches = tree.paths
				.filter(p => p.toLowerCase().includes(lowerQuery))
				.slice(0, 10)

			return {
				owner, repo, branch,
				matches: pathMatches.map(p => ({ path: p, snippet: `Filename match: ${p}`, lineNumber: 0 })),
				totalMatches: pathMatches.length,
			}
		}
	}

	// --- GitHub API helper ---

	private async _githubRequest(url: string): Promise<any> {
		const response = await this._requestService.request({
			type: 'GET',
			url,
			headers: {
				'User-Agent': 'VoidEditor/1.0',
				'Accept': 'application/vnd.github.v3+json',
				// GitHub text-match requires this media type
				'X-GitHub-Api-Version': '2022-11-28',
			},
		}, CancellationToken.None)

		if (response.res.statusCode !== 200) {
			throw new Error(`GitHub API error: HTTP ${response.res.statusCode} for ${url}`)
		}

		const buffer = await streamToBuffer(response.stream)
		return JSON.parse(buffer.toString())
	}
}

registerSingleton(IRemoteIndexService, RemoteIndexService, InstantiationType.Delayed);
