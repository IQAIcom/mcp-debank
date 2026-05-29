import { config } from "../config.js";
import { createChildLogger } from "../lib/utils/index.js";
import type {
	AppProtocolInfo,
	PoolInfo,
	ProtocolHolder,
	ProtocolInfo,
} from "../types.js";
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

	async getProtocolListRaw(
		args: { chain_id: string },
		options?: RequestOptions,
	): Promise<ProtocolInfo[]> {
		try {
			return await this.fetchWithToolConfig<ProtocolInfo[]>(
				`${this.baseUrl}/protocol/list?chain_id=${args.chain_id}`,
				config.protocolsListLifeTime,
				options,
			);
		} catch (error) {
			throw logAndWrapError(
				`Failed to fetch protocols on chain ${args.chain_id}`,
				error,
			);
		}
	}

	async getAppProtocolListRaw(
		_args?: Record<string, never>,
		options?: RequestOptions,
	): Promise<AppProtocolInfo[]> {
		try {
			return await this.fetchWithToolConfig<AppProtocolInfo[]>(
				`${this.baseUrl}/app_protocol/list`,
				config.protocolsListLifeTime,
				options,
			);
		} catch (error) {
			throw logAndWrapError("Failed to fetch app-protocol list", error);
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
}
