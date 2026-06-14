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
	// Pass a placeholder base so relative URLs still parse — without it, a
	// future caller passing a relative URL would hit the catch and log the
	// raw string, including any query params (e.g. ?id=0xWALLET).
	try {
		return new URL(url, "https://placeholder.invalid").pathname;
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
//
// AbortSignal semantics: the shared underlying fetch runs against an internal
// AbortController that's decoupled from any caller's signal. Each caller gets
// a per-caller race wrapper, so:
//   - Caller B aborting rejects B's returned promise immediately, but the
//     underlying fetch keeps running for any coalesced peers.
//   - Caller A aborting only affects A's wrapper; B's promise still resolves
//     from the shared fetch.
// We never abort the internal controller in the current implementation, so
// even if all callers abort, the underlying fetch runs to completion (or
// hits its axios timeout). That trades a small amount of wasted upstream
// work for full correctness under coalescing.
type CacheEntry<T = unknown> = {
	expiresAt: number;
	promise: Promise<T>;
	timer: NodeJS.Timeout;
};
const getCache = new Map<string, CacheEntry>();

// Match the standard AbortController contract: prefer signal.reason
// (set when the caller invokes controller.abort(reason)), and fall back to a
// DOMException named "AbortError" so downstream checks like
// `error.name === "AbortError"` (axios, fetch, retry libs) still discriminate.
function abortedReason(signal: AbortSignal): unknown {
	return (
		signal.reason ??
		new DOMException("This operation was aborted", "AbortError")
	);
}

// Wrap a shared promise so a per-caller AbortSignal can reject the caller's
// view without disturbing the shared promise or any other coalesced peer.
function raceWithSignal<T>(
	shared: Promise<T>,
	signal: AbortSignal | undefined,
): Promise<T> {
	if (!signal) return shared;
	if (signal.aborted) return Promise.reject(abortedReason(signal));
	return new Promise<T>((resolve, reject) => {
		const onAbort = () => reject(abortedReason(signal));
		signal.addEventListener("abort", onAbort, { once: true });
		shared.then(
			(v) => {
				signal.removeEventListener("abort", onAbort);
				resolve(v);
			},
			(e) => {
				signal.removeEventListener("abort", onAbort);
				reject(e);
			},
		);
	});
}

async function cachedGet<T>(
	url: string,
	ttlSeconds: number,
	route: "gateway" | "direct",
	fn: (internalSignal: AbortSignal) => Promise<T>,
	callerSignal?: AbortSignal,
): Promise<T> {
	if (ttlSeconds <= 0) {
		// Bypass cache + coalescing entirely. Use the caller's signal directly
		// since there's no sharing — 1:1 caller→fetch.
		return timed("GET", url, route, () =>
			fn(callerSignal ?? new AbortController().signal),
		);
	}

	const key = url;
	const now = Date.now();
	const existing = getCache.get(key) as CacheEntry<T> | undefined;
	if (existing && existing.expiresAt > now) {
		apiLogger.info(`op=GET route=${route} path=${pathOf(url)} cache=hit`);
		return raceWithSignal(existing.promise, callerSignal);
	}
	// Expired entry about to be replaced — clear its pending timer to keep the
	// Node timer wheel clean on high-churn URLs.
	if (existing) clearTimeout(existing.timer);

	// Internal controller for the shared fetch — decoupled from every caller
	// so one caller's abort never cascades to coalesced peers.
	const internalController = new AbortController();
	const promise = timed("GET", url, route, () => fn(internalController.signal));
	// Compare by `promise` identity inside the timer callback (not by entry
	// reference) so we don't need a forward declaration. Functionally
	// equivalent: a replaced entry has a different promise; a deleted entry
	// has no promise at all; both cases return false and skip the delete.
	const timer = setTimeout(() => {
		if (getCache.get(key)?.promise === promise) getCache.delete(key);
	}, ttlSeconds * 1000);
	timer.unref?.();
	getCache.set(key, {
		expiresAt: now + ttlSeconds * 1000,
		promise,
		timer,
	});
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
	return raceWithSignal(promise, callerSignal);
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
		return cachedGet<T>(
			url,
			cacheDuration,
			route,
			(internalSignal) => {
				// Decouple the caller's signal from the underlying fetch so cross-
				// caller abort interference is impossible under coalescing. Only
				// override the signal if the caller had one, so unsignaled callers
				// keep their "no signal at axios" behaviour (matches v0.1 parity).
				const merged: RequestOptions = { ...(options ?? {}) };
				if (options?.signal) merged.signal = internalSignal;
				return route === "gateway"
					? this.fetchViaGateway<T>(url, cacheDuration, merged)
					: this.fetchDirect<T>(url, merged);
			},
			options?.signal,
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
