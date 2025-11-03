/**
 * Base Service Class
 * Provides common functionality for all DeBank services
 */

import type { LanguageModel } from "ai";
import axios from "axios";
import { Tiktoken } from "js-tiktoken/lite";
import cl100k_base from "js-tiktoken/ranks/cl100k_base";
import { config } from "../config.js";
import { env } from "../env.js";
import { LLMDataFilter } from "../lib/utils/data-filter.js";
import { createChildLogger } from "../lib/utils/index.js";
import { toMarkdown } from "../lib/utils/markdown-formatter.js";

const logger = createChildLogger("DeBank Base Service");

// Initialize tiktoken encoder for token counting
const encoder = new Tiktoken(cl100k_base);

export abstract class BaseService {
	protected baseUrl = config.baseUrl;
	protected aiModel?: LanguageModel;
	protected dataFilter?: LLMDataFilter;
	protected currentQuery?: string;

	/**
	 * Set the AI model for data filtering
	 * Call this method to enable automatic filtering of large responses
	 */
	setAIModel(model: LanguageModel) {
		this.aiModel = model;
		this.dataFilter = new LLMDataFilter({ model });
	}

	/**
	 * Set the current user query for context-aware filtering
	 * This should be called before making service requests
	 */
	setQuery(query: string) {
		this.currentQuery = query;
	}

	protected async fetchWithToolConfig<T>(
		url: string,
		cacheDuration = config.debankDefaultLifeTime,
	): Promise<T> {
		const proxyUrl = new URL(env.IQ_GATEWAY_URL);
		proxyUrl.searchParams.append("url", url);
		proxyUrl.searchParams.append("projectName", "debank_mcp");
		proxyUrl.searchParams.append("cacheDuration", cacheDuration.toString());

		const gatewayUrl = proxyUrl.href;

		try {
			const response = await axios.get<T>(gatewayUrl, {
				headers: {
					"Content-Type": "application/json",
					"x-api-key": env.IQ_GATEWAY_KEY,
				},
			});

			return response.data;
		} catch (error: unknown) {
			if (axios.isAxiosError(error)) {
				const errorPayload = error.response?.data ?? error.message;
				const errorMessage =
					typeof errorPayload === "string"
						? errorPayload
						: JSON.stringify(errorPayload);
				throw new Error(errorMessage);
			}
			throw error instanceof Error ? error : new Error(String(error));
		}
	}

	protected async postWithToolConfig<T>(
		url: string,
		body: unknown,
	): Promise<T> {
		const proxyUrl = new URL(env.IQ_GATEWAY_URL);
		proxyUrl.searchParams.append("url", url);
		proxyUrl.searchParams.append("method", "POST");

		const gatewayUrl = proxyUrl.href;

		const response = await fetch(gatewayUrl, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": env.IQ_GATEWAY_KEY,
			},
			body: JSON.stringify(body),
		});

		if (!response.ok) {
			throw new Error(await response.text());
		}

		return (await response.json()) as T;
	}

	/**
	 * Format response for LLM consumption
	 * Returns MCP-compliant JSON string
	 * Automatically filters large responses if AI model is configured
	 * Uses currentQuery set via setQuery() for filtering context
	 */
	protected async formatResponse(
		data: unknown,
		options?: {
			title?: string;
			currencyFields?: string[];
			numberFields?: string[];
		},
	): Promise<string> {
		const markdownOutput = toMarkdown(data, options);

		// Check token count and filter if necessary
		const tokenLength = encoder.encode(markdownOutput).length;

		logger.info(`Response token length: ${tokenLength}`);
		logger.info(
			`Need to filter: ${this.dataFilter && this.currentQuery && tokenLength > config.maxTokens ? "yes" : "no"}`,
		);

		if (
			tokenLength > config.maxTokens &&
			this.dataFilter &&
			this.currentQuery
		) {
			try {
				// Convert data to JSON string for filtering
				const jsonData = JSON.stringify(data);
				const filteredJson = await this.dataFilter.filter(
					jsonData,
					this.currentQuery,
				);

				logger.info("Successfully filtered response data");
				logger.info(`New token length: ${encoder.encode(filteredJson).length}`);

				// Format the filtered data
				return toMarkdown(JSON.parse(filteredJson), {
					title: options?.title,
					currencyFields: options?.currencyFields,
					numberFields: options?.numberFields,
				});
			} catch (error) {
				console.error("Error filtering response:", error);
				// Return original if filtering fails
				return markdownOutput;
			}
		}

		return markdownOutput;
	}
}
