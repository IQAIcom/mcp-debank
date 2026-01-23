import { config } from "../config.js";
import { createChildLogger } from "../lib/utils/index.js";
import type { ChainInfo, GasMarket } from "../types.js";
import { BaseService } from "./base.service.js";

const logger = createChildLogger("DeBank Chain Service");

const logAndWrapError = (context: string, error: unknown): Error => {
	if (error instanceof Error) {
		logger.error(context, error);
		return error;
	}

	const wrappedError = new Error(String(error));
	logger.error(context, wrappedError);
	return wrappedError;
};

export class ChainService extends BaseService {
	async getChain(args: { id: string }): Promise<string> {
		try {
			const data = await this.fetchWithToolConfig<ChainInfo>(
				`${this.baseUrl}/chain?id=${args.id}`,
				config.chainDataLifeTime,
			);
			return await this.formatResponse(data, {
				title: `Chain Information: ${data.name}`,
			});
		} catch (error) {
			throw logAndWrapError(`Failed to fetch chain ${args.id}`, error);
		}
	}

	async getSupportedChainList(): Promise<string> {
		try {
			const data = await this.fetchWithToolConfig<ChainInfo[]>(
				`${this.baseUrl}/chain/list`,
				config.supportedChainListLifeTime,
			);
			return await this.formatResponse(data, {
				title: "Supported Chains",
			});
		} catch (error) {
			throw logAndWrapError("Failed to fetch supported chain list", error);
		}
	}

	async getGasPrices(args: { chain_id: string }): Promise<string> {
		try {
			const data = await this.fetchWithToolConfig<GasMarket>(
				`${this.baseUrl}/wallet/gas_market?chain_id=${args.chain_id}`,
				config.gasPriceLifeTime,
			);
			return await this.formatResponse(data, {
				title: `Gas Prices for Chain: ${args.chain_id}`,
				numberFields: ["price", "front_tx_count", "estimated_seconds"],
			});
		} catch (error) {
			throw logAndWrapError(
				`Failed to fetch gas prices for chain ${args.chain_id}`,
				error,
			);
		}
	}
}
