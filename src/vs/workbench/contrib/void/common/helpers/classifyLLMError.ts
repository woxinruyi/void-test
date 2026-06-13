/*--------------------------------------------------------------------------------------
 *  LLM 错误分类（纯函数，无依赖，可单元测试）
 *
 *  对应 change: add-llm-error-classification
 *  动机：Agent 循环对所有 LLM 错误统一重试 3 次、固定 2500ms，问题：
 *    - 鉴权(401/403)/请求格式(400)错误重试必然再失败 → 白白浪费时间与 token；
 *    - 限流(429)/过载(529)/网络(5xx) 应指数退避，固定短延迟会被继续限流。
 *  对标 Codex / Claude Code：按错误类型决定"是否重试 + 退避时长"。
 *  保守：未知错误维持原行为（可重试、2500ms）。
 *--------------------------------------------------------------------------------------*/

export type LLMErrorKind = 'auth' | 'rate_limit' | 'overloaded' | 'network' | 'bad_request' | 'unknown';

export interface LLMErrorClass {
	kind: LLMErrorKind;
	retryable: boolean;
	/** 第 attempt 次重试(0-indexed)前应等待的毫秒数 */
	backoffMs: (attempt: number) => number;
}

const errorText = (error: unknown): string => {
	if (error == null) return '';
	if (typeof error === 'string') return error;
	if (typeof error === 'object') {
		const o = error as Record<string, any>;
		const parts: string[] = [];
		if (typeof o.message === 'string') parts.push(o.message);
		if (o.fullError != null) {
			try { parts.push(typeof o.fullError === 'string' ? o.fullError : JSON.stringify(o.fullError)); } catch { /* ignore */ }
		}
		if (!parts.length) { try { parts.push(JSON.stringify(o)); } catch { parts.push(String(o)); } }
		return parts.join(' ');
	}
	return String(error);
};

const statusOf = (error: unknown, text: string): number | null => {
	if (error && typeof error === 'object') {
		const o = error as Record<string, any>;
		if (typeof o.status === 'number') return o.status;
		if (typeof o.statusCode === 'number') return o.statusCode;
		if (o.fullError && typeof o.fullError === 'object' && typeof o.fullError.status === 'number') return o.fullError.status;
	}
	const m = text.match(/\b(4\d\d|5\d\d)\b/);
	return m ? parseInt(m[1], 10) : null;
};

const expBackoff = (base: number, cap: number) => (attempt: number) => Math.min(cap, base * 2 ** Math.max(0, attempt));

export const classifyLLMError = (error: unknown): LLMErrorClass => {
	const text = errorText(error).toLowerCase();
	const status = statusOf(error, text);

	// 鉴权/权限：重试无意义
	if (status === 401 || status === 403 || /unauthorized|invalid api key|invalid x-api-key|authentication|permission denied|forbidden|no auth/.test(text))
		return { kind: 'auth', retryable: false, backoffMs: () => 0 };

	// 限流：指数退避
	if (status === 429 || /rate.?limit|too many requests|quota exceeded/.test(text))
		return { kind: 'rate_limit', retryable: true, backoffMs: expBackoff(2000, 30000) };

	// 过载（Anthropic 529）：指数退避
	if (status === 529 || /overloaded/.test(text))
		return { kind: 'overloaded', retryable: true, backoffMs: expBackoff(1500, 30000) };

	// 请求格式/不存在：重试无意义（注意 DNS 的 enotfound 归网络，不在此匹配 bare "not found"）
	if (status === 400 || status === 404 || status === 422 || /invalid request|bad request|invalid_request_error|unsupported|malformed|no such model|model not found|does not exist/.test(text))
		return { kind: 'bad_request', retryable: false, backoffMs: () => 0 };

	// 网络/服务端 5xx/超时：指数退避
	if ((status !== null && status >= 500) || /timeout|timed out|econnreset|enotfound|eai_again|getaddrinfo|socket hang|network error|fetch failed|connection (reset|refused|closed)|temporarily unavailable/.test(text))
		return { kind: 'network', retryable: true, backoffMs: expBackoff(1000, 20000) };

	// 未知：保留原行为（可重试、固定 2500ms）
	return { kind: 'unknown', retryable: true, backoffMs: () => 2500 };
};
