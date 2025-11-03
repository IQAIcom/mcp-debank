/**
 * Token Service
 * Handles all token-related operations
 */

import { createChildLogger } from "../lib/utils/index.js";
import type { TokenHistoricalPrice, TokenHolder, TokenInfo } from "../types.js";
import { BaseService } from "./base.service.js";

const logger = createChildLogger("DeBank Token Service");

const logAndWrapError = (context: string, error: unknown): Error => {
	if (error instanceof Error) {
		logger.error(context, error);
		return error;
	}

	const wrappedError = new Error(String(error));
	logger.error(context, wrappedError);
	return wrappedError;
};

export class TokenService extends BaseService {
	async getTokenInformation(args: {
		id: string;
		chain_id: string;
	}): Promise<string> {
		try {
			const data = await this.fetchWithToolConfig<TokenInfo>(
				`${this.baseUrl}/token?id=${args.id}&chain_id=${args.chain_id}`,
			);
			return await this.formatResponse(data, {
				title: `Token Information: ${data.name || args.id}`,
				currencyFields: ["price"],
				numberFields: ["decimals"],
			});
		} catch (error) {
			throw logAndWrapError(
				`Failed to fetch token ${args.id} on chain ${args.chain_id}`,
				error,
			);
		}
	}

	async getListTokenInformation(args: {
		chain_id: string;
		ids: string;
	}): Promise<string> {
		try {
			const data = await this.fetchWithToolConfig<TokenInfo[]>(
				`${this.baseUrl}/token/list?chain_id=${args.chain_id}&ids=${args.ids}`,
			);
			return await this.formatResponse(data, {
				title: `Token List (${data.length} tokens)`,
				currencyFields: ["price"],
				numberFields: ["decimals"],
			});
		} catch (error) {
			throw logAndWrapError(
				`Failed to fetch token list for chain ${args.chain_id} with ids ${args.ids}`,
				error,
			);
		}
	}

	async getTopHoldersOfToken(args: {
		id: string;
		chain_id: string;
		start?: number;
		limit?: number;
	}): Promise<string> {
		try {
			const params = new URLSearchParams({
				id: args.id,
				chain_id: args.chain_id,
				...(args.start !== undefined && { start: args.start.toString() }),
				...(args.limit !== undefined && { limit: args.limit.toString() }),
			});

			const data = await this.fetchWithToolConfig<TokenHolder[]>(
				`${this.baseUrl}/token/top_holders?${params}`,
			);
			return await this.formatResponse(data, {
				title: `Top Holders of Token: ${args.id}`,
				currencyFields: ["usd_value"],
				numberFields: ["amount"],
			});
		} catch (error) {
			throw logAndWrapError(
				`Failed to fetch top holders for token ${args.id} on chain ${args.chain_id}`,
				error,
			);
		}
	}

	async getTokenHistoryPrice(args: {
		id: string;
		chain_id: string;
		date_at: string;
	}): Promise<string> {
		try {
			const data = await this.fetchWithToolConfig<TokenHistoricalPrice>(
				`${this.baseUrl}/token/history_price?id=${args.id}&chain_id=${args.chain_id}&date_at=${args.date_at}`,
			);
			return await this.formatResponse(data, {
				title: `Historical Price for ${args.id} on ${args.date_at}`,
				currencyFields: ["price"],
			});
		} catch (error) {
			throw logAndWrapError(
				`Failed to fetch historical price for token ${args.id} on ${args.chain_id} for ${args.date_at}`,
				error,
			);
		}
	}
}
