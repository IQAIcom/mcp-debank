/**
 * Base Service Class
 * Provides common functionality for all DeBank services
 */

import axios from "axios";
import { config } from "../config.js";
import { env } from "../env.js";
import { extractErrorMessage } from "../lib/utils/index.js";

export type RequestOptions = { signal?: AbortSignal; timeout?: number };

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
		// Use IQ Gateway if configured, otherwise make direct API calls
		if (env.IQ_GATEWAY_URL && env.IQ_GATEWAY_KEY) {
			return this.fetchViaGateway<T>(url, cacheDuration, options);
		}
		return this.fetchDirect<T>(url, options);
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

		try {
			const response = await axios.post<T>(proxyUrl.href, body, {
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

	private async postDirect<T>(
		url: string,
		body: unknown,
		options?: RequestOptions,
	): Promise<T> {
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
				...(options?.timeout !== undefined ? { timeout: options.timeout } : {}),
			});
			return response.data;
		} catch (error: unknown) {
			throw extractErrorMessage(error);
		}
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
