import { config } from "../config.js";
import { createChildLogger } from "../lib/utils/index.js";
import { toMarkdown } from "../lib/utils/markdown-formatter.js";
import type { PoolInfo, ProtocolHolder, ProtocolInfo } from "../types.js";
import { BaseService, type RequestOptions } from "./base.service.js";

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
	async getProtocolInformationRaw(
		args: { id: string },
		options?: RequestOptions,
	): Promise<ProtocolInfo> {
		try {
			return await this.fetchWithToolConfig<ProtocolInfo>(
				`${this.baseUrl}/protocol?id=${args.id}`,
				this.DEFAULT_CACHE_TTL_SECONDS,
				options,
			);
		} catch (error) {
			throw logAndWrapError(`Failed to fetch protocol ${args.id}`, error);
		}
	}

	async getProtocolInformation(args: { id: string }): Promise<string> {
		const data = await this.getProtocolInformationRaw(args);
		try {
			return toMarkdown(data, {
				title: `Protocol Information: ${data.name || args.id}`,
				currencyFields: ["tvl"],
			});
		} catch (error) {
			throw logAndWrapError(
				`Failed to format protocol ${args.id} response`,
				error,
			);
		}
	}

	async getAllProtocolsOfSupportedChainsRaw(
		args: { chain_ids?: string },
		options?: RequestOptions,
	): Promise<ProtocolInfo[]> {
		try {
			const url = args.chain_ids
				? `${this.baseUrl}/protocol/all_list?chain_ids=${args.chain_ids}`
				: `${this.baseUrl}/protocol/all_list`;

			return await this.fetchWithToolConfig<ProtocolInfo[]>(
				url,
				config.protocolsListLifeTime,
				options,
			);
		} catch (error) {
			const context = args.chain_ids
				? `Failed to fetch protocols for chains ${args.chain_ids}`
				: "Failed to fetch protocols list";
			throw logAndWrapError(context, error);
		}
	}

	async getAllProtocolsOfSupportedChains(args: {
		chain_ids?: string;
	}): Promise<string> {
		const data = await this.getAllProtocolsOfSupportedChainsRaw(args);
		try {
			return toMarkdown(data, {
				title: args.chain_ids
					? `Protocols on Chains: ${args.chain_ids}`
					: "All Supported Protocols",
				currencyFields: ["tvl"],
			});
		} catch (error) {
			const context = args.chain_ids
				? `Failed to format protocols for chains ${args.chain_ids} response`
				: "Failed to format protocols list response";
			throw logAndWrapError(context, error);
		}
	}

	async getTopHoldersOfProtocolRaw(
		args: {
			id: string;
			start?: number;
			limit?: number;
		},
		options?: RequestOptions,
	): Promise<ProtocolHolder[]> {
		try {
			const params = new URLSearchParams({
				id: args.id,
				...(args.start !== undefined && { start: args.start.toString() }),
				...(args.limit !== undefined && { limit: args.limit.toString() }),
			});

			return await this.fetchWithToolConfig<ProtocolHolder[]>(
				`${this.baseUrl}/protocol/top_holders?${params}`,
				this.DEFAULT_CACHE_TTL_SECONDS,
				options,
			);
		} catch (error) {
			throw logAndWrapError(
				`Failed to fetch top holders for protocol ${args.id}`,
				error,
			);
		}
	}

	async getTopHoldersOfProtocol(args: {
		id: string;
		start?: number;
		limit?: number;
	}): Promise<string> {
		const data = await this.getTopHoldersOfProtocolRaw(args);
		try {
			return toMarkdown(data, {
				title: `Top Holders of Protocol: ${args.id}`,
				currencyFields: ["usd_value"],
			});
		} catch (error) {
			throw logAndWrapError(
				`Failed to format top holders for protocol ${args.id} response`,
				error,
			);
		}
	}

	async getPoolInformationRaw(
		args: {
			id: string;
			chain_id: string;
		},
		options?: RequestOptions,
	): Promise<PoolInfo> {
		try {
			return await this.fetchWithToolConfig<PoolInfo>(
				`${this.baseUrl}/pool?id=${args.id}&chain_id=${args.chain_id}`,
				config.poolDataLifeTime,
				options,
			);
		} catch (error) {
			throw logAndWrapError(
				`Failed to fetch pool ${args.id} on chain ${args.chain_id}`,
				error,
			);
		}
	}

	async getPoolInformation(args: {
		id: string;
		chain_id: string;
	}): Promise<string> {
		const data = await this.getPoolInformationRaw(args);
		try {
			return toMarkdown(data, {
				title: `Pool Information: ${data.name || args.id}`,
				currencyFields: ["tvl"],
			});
		} catch (error) {
			throw logAndWrapError(
				`Failed to format pool ${args.id} on chain ${args.chain_id} response`,
				error,
			);
		}
	}
}
