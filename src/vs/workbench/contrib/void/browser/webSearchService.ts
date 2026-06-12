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
import { WebSearchResult, WebSearchResponse, ReadUrlResult } from '../common/webSearchServiceTypes.js';


const MAX_CONTENT_LENGTH = 50_000
const MAX_SEARCH_RESULTS = 10


export interface IWebSearchService {
	readonly _serviceBrand: undefined

	search(query: string, maxResults?: number): Promise<WebSearchResponse>
	readUrl(url: string): Promise<ReadUrlResult>
}

export const IWebSearchService = createDecorator<IWebSearchService>('webSearchService');


class WebSearchService extends Disposable implements IWebSearchService {
	_serviceBrand: undefined;

	constructor(
		@IRequestService private readonly _requestService: IRequestService,
	) {
		super()
	}

	async search(query: string, maxResults: number = MAX_SEARCH_RESULTS): Promise<WebSearchResponse> {
		// Use DuckDuckGo HTML search (no API key required)
		const encodedQuery = encodeURIComponent(query)
		const searchUrl = `https://html.duckduckgo.com/html/?q=${encodedQuery}`

		try {
			const response = await this._requestService.request({
				type: 'GET',
				url: searchUrl,
				headers: {
					'User-Agent': 'Mozilla/5.0 (compatible; VoidEditor/1.0)',
					'Accept': 'text/html',
				},
			}, CancellationToken.None)

			if (response.res.statusCode !== 200) {
				return { query, results: [], totalResults: 0 }
			}

			const buffer = await streamToBuffer(response.stream)
			const html = buffer.toString()
			const results = this._parseDuckDuckGoResults(html, maxResults)

			return { query, results, totalResults: results.length }
		} catch (e) {
			console.error('WebSearchService: search failed', e)
			return { query, results: [], totalResults: 0 }
		}
	}

	async readUrl(url: string): Promise<ReadUrlResult> {
		try {
			const response = await this._requestService.request({
				type: 'GET',
				url,
				headers: {
					'User-Agent': 'Mozilla/5.0 (compatible; VoidEditor/1.0)',
					'Accept': 'text/html,text/plain,application/json',
				},
			}, CancellationToken.None)

			if (response.res.statusCode !== 200) {
				throw new Error(`HTTP ${response.res.statusCode}`)
			}

			const buffer = await streamToBuffer(response.stream)
			const rawContent = buffer.toString()
			const contentType = response.res.headers?.['content-type'] || ''

			let title = ''
			let textContent: string

			if (contentType.includes('application/json')) {
				// JSON: pretty-print
				try {
					textContent = JSON.stringify(JSON.parse(rawContent), null, 2)
				} catch {
					textContent = rawContent
				}
			} else if (contentType.includes('text/plain')) {
				textContent = rawContent
			} else {
				// HTML: extract text
				title = this._extractTitle(rawContent)
				textContent = this._htmlToText(rawContent)
			}

			const truncated = textContent.length > MAX_CONTENT_LENGTH
			const content = truncated ? textContent.substring(0, MAX_CONTENT_LENGTH) : textContent

			return {
				url,
				title,
				content,
				contentLength: textContent.length,
				truncated,
			}
		} catch (e) {
			throw new Error(`Failed to read URL ${url}: ${e instanceof Error ? e.message : String(e)}`)
		}
	}

	// --- HTML parsing helpers ---

	private _parseDuckDuckGoResults(html: string, maxResults: number): WebSearchResult[] {
		const results: WebSearchResult[] = []

		// DuckDuckGo HTML results are in <a class="result__a"> tags
		const resultPattern = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi
		const snippetPattern = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi

		const titles: Array<{ url: string, title: string }> = []
		let match: RegExpExecArray | null

		while ((match = resultPattern.exec(html)) !== null && titles.length < maxResults) {
			const url = this._decodeUrl(match[1])
			const title = this._stripHtmlTags(match[2]).trim()
			if (url && title && url.startsWith('http')) {
				titles.push({ url, title })
			}
		}

		const snippets: string[] = []
		while ((match = snippetPattern.exec(html)) !== null && snippets.length < maxResults) {
			snippets.push(this._stripHtmlTags(match[1]).trim())
		}

		for (let i = 0; i < titles.length; i++) {
			results.push({
				title: titles[i].title,
				url: titles[i].url,
				snippet: snippets[i] || '',
			})
		}

		return results
	}

	private _decodeUrl(url: string): string {
		// DuckDuckGo wraps URLs in redirects
		const uddgMatch = url.match(/uddg=([^&]+)/)
		if (uddgMatch) {
			try {
				return decodeURIComponent(uddgMatch[1])
			} catch {
				return url
			}
		}
		return url
	}

	private _extractTitle(html: string): string {
		const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
		return titleMatch ? this._stripHtmlTags(titleMatch[1]).trim() : ''
	}

	private _htmlToText(html: string): string {
		let text = html

		// Remove script and style blocks
		text = text.replace(/<script[\s\S]*?<\/script>/gi, '')
		text = text.replace(/<style[\s\S]*?<\/style>/gi, '')
		text = text.replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
		text = text.replace(/<nav[\s\S]*?<\/nav>/gi, '')
		text = text.replace(/<footer[\s\S]*?<\/footer>/gi, '')
		text = text.replace(/<header[\s\S]*?<\/header>/gi, '')

		// Convert block elements to newlines
		text = text.replace(/<\/?(p|div|br|h[1-6]|li|tr|blockquote|pre|section|article)[^>]*>/gi, '\n')

		// Strip remaining HTML tags
		text = this._stripHtmlTags(text)

		// Decode common HTML entities
		text = text.replace(/&amp;/g, '&')
		text = text.replace(/&lt;/g, '<')
		text = text.replace(/&gt;/g, '>')
		text = text.replace(/&quot;/g, '"')
		text = text.replace(/&#39;/g, "'")
		text = text.replace(/&nbsp;/g, ' ')

		// Clean up whitespace
		text = text.replace(/[ \t]+/g, ' ')
		text = text.replace(/\n\s*\n/g, '\n\n')
		text = text.trim()

		return text
	}

	private _stripHtmlTags(html: string): string {
		return html.replace(/<[^>]*>/g, '')
	}
}

registerSingleton(IWebSearchService, WebSearchService, InstantiationType.Delayed);
