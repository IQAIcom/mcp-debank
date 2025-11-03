import { config } from "../config.js";
import { createChildLogger } from "../lib/utils/index.js";
import type { PoolInfo, ProtocolHolder, ProtocolInfo } from "../types.js";
import { BaseService } from "./base.service.js";

const logger = createChildLogger("DeBank Protocol Service");

const logAndWrapError = (context: string, error: unknown): Error => {
	if (error instanceof Error) {
		logger.error(context, error);
		return error;
	}

	const wrappedError = new Error(String(error));
	logger.error(context, wrappedError);
	return wrappedError;
};

export class ProtocolService extends BaseService {
	async getProtocolInformation(args: { id: string }): Promise<string> {
		try {
			const data = await this.fetchWithToolConfig<ProtocolInfo>(
				`${this.baseUrl}/protocol?id=${args.id}`,
			);
			return await this.formatResponse(data, {
				title: `Protocol Information: ${data.name || args.id}`,
				currencyFields: ["tvl"],
			});
		} catch (error) {
			throw logAndWrapError(`Failed to fetch protocol ${args.id}`, error);
		}
	}

	async getAllProtocolsOfSupportedChains(args: {
		chain_ids?: string;
	}): Promise<string> {
		try {
			const url = args.chain_ids
				? `${this.baseUrl}/protocol/all_list?chain_ids=${args.chain_ids}`
				: `${this.baseUrl}/protocol/all_list`;

			const data = await this.fetchWithToolConfig<ProtocolInfo[]>(
				url,
				config.protocolsListLifeTime,
			);
			return await this.formatResponse(data, {
				title: args.chain_ids
					? `Protocols on Chains: ${args.chain_ids}`
					: "All Supported Protocols",
				currencyFields: ["tvl"],
			});
		} catch (error) {
			const context = args.chain_ids
				? `Failed to fetch protocols for chains ${args.chain_ids}`
				: "Failed to fetch protocols list";
			throw logAndWrapError(context, error);
		}
	}

	async getTopHoldersOfProtocol(args: {
		id: string;
		start?: number;
		limit?: number;
	}): Promise<string> {
		try {
			const params = new URLSearchParams({
				id: args.id,
				...(args.start !== undefined && { start: args.start.toString() }),
				...(args.limit !== undefined && { limit: args.limit.toString() }),
			});

			const data = await this.fetchWithToolConfig<ProtocolHolder[]>(
				`${this.baseUrl}/protocol/top_holders?${params}`,
			);
			return await this.formatResponse(data, {
				title: `Top Holders of Protocol: ${args.id}`,
				currencyFields: ["usd_value"],
			});
		} catch (error) {
			throw logAndWrapError(
				`Failed to fetch top holders for protocol ${args.id}`,
				error,
			);
		}
	}

	async getPoolInformation(args: {
		id: string;
		chain_id: string;
	}): Promise<string> {
		try {
			const data = await this.fetchWithToolConfig<PoolInfo>(
				`${this.baseUrl}/pool?id=${args.id}&chain_id=${args.chain_id}`,
				config.poolDataLifeTime,
			);
			return await this.formatResponse(data, {
				title: `Pool Information: ${data.name || args.id}`,
				currencyFields: ["tvl"],
			});
		} catch (error) {
			throw logAndWrapError(
				`Failed to fetch pool ${args.id} on chain ${args.chain_id}`,
				error,
			);
		}
	}
}
