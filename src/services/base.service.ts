/**
 * Base Service Class
 * Provides common functionality for all DeBank services
 */

import axios from "axios";
import { config } from "../config.js";
import { env } from "../env.js";
import { extractErrorMessage } from "../lib/utils/index.js";
import { createChildLogger } from "../lib/utils/logger.js";

export type RequestOptions = { signal?: AbortSignal; timeout?: number };

const apiLogger = createChildLogger("DeBank API");

function pathOf(url: string): string {
	try {
		return new URL(url).pathname;
	} catch {
		return url;
	}
}

// Wall-clock instrumentation for every upstream HTTP request. Emits a single
// stderr line per call so we can identify slow endpoints (e.g. all_token_list
// for whales) from real session traces rather than guessing. Keep at info
// level so it shows up in MCP host logs by default; silence with LOG_LEVEL=warn.
async function timed<T>(
	op: "GET" | "POST",
	url: string,
	route: "gateway" | "direct",
	fn: () => Promise<T>,
): Promise<T> {
	const start = Date.now();
	const path = pathOf(url);
	try {
		const result = await fn();
		const ms = Date.now() - start;
		apiLogger.info(`op=${op} route=${route} path=${path} ms=${ms} ok=true`);
		return result;
	} catch (err) {
		const ms = Date.now() - start;
		const msg = (err as Error)?.message ?? String(err);
		apiLogger.info(
			`op=${op} route=${route} path=${path} ms=${ms} ok=false err=${msg.slice(0, 120)}`,
		);
		throw err;
	}
}

// In-process GET cache + request coalescing. Two effects per cache key:
//   1. Coalescing: concurrent callers for the same URL await one shared promise
//      instead of firing duplicate upstream requests. Critical when the guest
//      script Promise.all-s identical lookups (e.g. resolving the same chain
//      twice in different code paths within one execute).
//   2. TTL cache: identical lookups within the TTL window get the resolved
//      value without crossing the gateway hop. Layered on top of the IQ
//      Gateway's own cache — short-circuits the network entirely on hits.
// Only GET is cached; POST changes state and is never memoised.
type CacheEntry<T = unknown> = {
	expiresAt: number;
	promise: Promise<T>;
	timer: NodeJS.Timeout;
};
const getCache = new Map<string, CacheEntry>();

async function cachedGet<T>(
	url: string,
	ttlSeconds: number,
	route: "gateway" | "direct",
	fn: () => Promise<T>,
): Promise<T> {
	if (ttlSeconds <= 0) return timed("GET", url, route, fn);

	const key = url;
	const now = Date.now();
	const existing = getCache.get(key) as CacheEntry<T> | undefined;
	if (existing && existing.expiresAt > now) {
		apiLogger.info(`op=GET route=${route} path=${pathOf(url)} cache=hit`);
		return existing.promise;
	}
	// Expired entry about to be replaced — clear its pending timer to keep the
	// Node timer wheel clean on high-churn URLs.
	if (existing) clearTimeout(existing.timer);

	const promise = timed("GET", url, route, fn);
	const timer = setTimeout(() => {
		if (getCache.get(key) === entry) getCache.delete(key);
	}, ttlSeconds * 1000);
	timer.unref?.();
	const entry: CacheEntry<T> = {
		expiresAt: now + ttlSeconds * 1000,
		promise,
		timer,
	};
	getCache.set(key, entry);
	// Evict on failure so a transient error doesn't get memoised, and cancel
	// the expiry timer so it doesn't sit in the wheel until TTL just to no-op.
	// Identity-compare in case a later successful fetch already replaced us.
	promise.catch(() => {
		const current = getCache.get(key);
		if (current?.promise === promise) {
			clearTimeout(current.timer);
			getCache.delete(key);
		}
	});
	return promise;
}

/**
 * Base Service for DeBank API
 * Provides common caching and data fetching functionality
 */
export abstract class BaseService {
	protected baseUrl = config.baseUrl;

	protected readonly DEFAULT_CACHE_TTL_SECONDS = config.debankDefaultLifeTime;

	protected async fetchWithToolConfig<T>(
		url: string,
		cacheDuration = this.DEFAULT_CACHE_TTL_SECONDS,
		options?: RequestOptions,
	): Promise<T> {
		const route: "gateway" | "direct" =
			env.IQ_GATEWAY_URL && env.IQ_GATEWAY_KEY ? "gateway" : "direct";
		return cachedGet<T>(url, cacheDuration, route, () =>
			route === "gateway"
				? this.fetchViaGateway<T>(url, cacheDuration, options)
				: this.fetchDirect<T>(url, options),
		);
	}

	/**
	 * Fetch data via IQ Gateway (with caching and monitoring)
	 */
	private async fetchViaGateway<T>(
		url: string,
		cacheDuration: number,
		options?: RequestOptions,
	): Promise<T> {
		if (!env.IQ_GATEWAY_URL || !env.IQ_GATEWAY_KEY) {
			throw new Error(
				"IQ_GATEWAY_URL and IQ_GATEWAY_KEY must be configured to use gateway",
			);
		}

		const proxyUrl = new URL(env.IQ_GATEWAY_URL);
		proxyUrl.searchParams.append("url", url);
		proxyUrl.searchParams.append("projectName", "debank_mcp");
		if (cacheDuration >= 0) {
			proxyUrl.searchParams.append(
				"cacheDuration",
				Math.floor(cacheDuration).toString(),
			);
		}

		try {
			const response = await axios.get<T>(proxyUrl.href, {
				headers: {
					"Content-Type": "application/json",
					"x-api-key": env.IQ_GATEWAY_KEY,
				},
				...(options?.signal ? { signal: options.signal } : {}),
				...(options?.timeout !== undefined ? { timeout: options.timeout } : {}),
			});
			return response.data;
		} catch (error: unknown) {
			throw extractErrorMessage(error);
		}
	}

	/**
	 * Fetch data directly from DeBank API
	 */
	private async fetchDirect<T>(
		url: string,
		options?: RequestOptions,
	): Promise<T> {
		try {
			const headers: Record<string, string> = {
				"Content-Type": "application/json",
			};

			// Add DeBank API key if provided
			if (env.DEBANK_API_KEY) {
				headers.AccessKey = env.DEBANK_API_KEY;
			}

			const response = await axios.get<T>(url, {
				headers,
				...(options?.signal ? { signal: options.signal } : {}),
				...(options?.timeout !== undefined ? { timeout: options.timeout } : {}),
			});
			return response.data;
		} catch (error: unknown) {
			throw extractErrorMessage(error);
		}
	}

	protected async postWithToolConfig<T>(
		url: string,
		body: unknown,
		options?: RequestOptions,
	): Promise<T> {
		if (env.IQ_GATEWAY_URL && env.IQ_GATEWAY_KEY) {
			return this.postViaGateway<T>(url, body, options);
		}
		return this.postDirect<T>(url, body, options);
	}

	private async postViaGateway<T>(
		url: string,
		body: unknown,
		options?: RequestOptions,
	): Promise<T> {
		if (!env.IQ_GATEWAY_URL || !env.IQ_GATEWAY_KEY) {
			throw new Error(
				"IQ_GATEWAY_URL and IQ_GATEWAY_KEY must be configured to use gateway",
			);
		}

		const proxyUrl = new URL(env.IQ_GATEWAY_URL);
		proxyUrl.searchParams.append("url", url);
		proxyUrl.searchParams.append("method", "POST");
		proxyUrl.searchParams.append("projectName", "debank_mcp");

		return timed("POST", url, "gateway", async () => {
			try {
				const response = await axios.post<T>(proxyUrl.href, body, {
					headers: {
						"Content-Type": "application/json",
						"x-api-key": env.IQ_GATEWAY_KEY,
					},
					...(options?.signal ? { signal: options.signal } : {}),
					...(options?.timeout !== undefined
						? { timeout: options.timeout }
						: {}),
				});
				return response.data;
			} catch (error: unknown) {
				throw extractErrorMessage(error);
			}
		});
	}

	private async postDirect<T>(
		url: string,
		body: unknown,
		options?: RequestOptions,
	): Promise<T> {
		return timed("POST", url, "direct", async () => {
			try {
				const headers: Record<string, string> = {
					"Content-Type": "application/json",
				};

				if (env.DEBANK_API_KEY) {
					headers.AccessKey = env.DEBANK_API_KEY;
				}

				const response = await axios.post<T>(url, body, {
					headers,
					...(options?.signal ? { signal: options.signal } : {}),
					...(options?.timeout !== undefined
						? { timeout: options.timeout }
						: {}),
				});
				return response.data;
			} catch (error: unknown) {
				throw extractErrorMessage(error);
			}
		});
	}

	protected toUnixSeconds(value: string | number): number {
		if (typeof value === "number") {
			return Math.floor(value);
		}

		const trimmed = value.trim();
		if (/^\d+$/.test(trimmed)) {
			return Math.floor(Number(trimmed));
		}

		const parsed = Date.parse(trimmed);
		if (Number.isNaN(parsed)) {
			throw new Error(`Invalid timestamp value: ${value}`);
		}

		return Math.floor(parsed / 1000);
	}
}
