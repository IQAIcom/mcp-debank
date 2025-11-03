/**
 * User Service
 * Handles all user-related operations including portfolios, balances, and history
 */

import { createChildLogger } from "../lib/utils/index.js";
import type {
	NetCurvePoint,
	NFTAuthorization,
	TokenAuthorization,
	UserChainBalance,
	UserHistoryItem,
	UserNFT,
	UserProtocolPosition,
	UserTokenBalance,
	UserTotalBalance,
} from "../types.js";
import { BaseService } from "./base.service.js";

const logger = createChildLogger("DeBank User Service");

const logAndWrapError = (context: string, error: unknown): Error => {
	if (error instanceof Error) {
		logger.error(context, error);
		return error;
	}

	const wrappedError = new Error(String(error));
	logger.error(context, wrappedError);
	return wrappedError;
};

export class UserService extends BaseService {
	async getUserUsedChainList(args: { id: string }): Promise<string> {
		try {
			const data = await this.fetchWithToolConfig<{ chain_id: string }[]>(
				`${this.baseUrl}/user/used_chain_list?id=${args.id}`,
			);
			return await this.formatResponse(data, {
				title: `Chains Used by ${args.id}`,
			});
		} catch (error) {
			throw logAndWrapError(
				`Failed to fetch used chain list for user ${args.id}`,
				error,
			);
		}
	}

	async getUserChainBalance(args: {
		id: string;
		chain_id: string;
	}): Promise<string> {
		try {
			const data = await this.fetchWithToolConfig<UserChainBalance>(
				`${this.baseUrl}/user/chain_balance?id=${args.id}&chain_id=${args.chain_id}`,
			);
			return await this.formatResponse(data, {
				title: `Balance on ${args.chain_id}`,
				currencyFields: ["usd_value"],
			});
		} catch (error) {
			throw logAndWrapError(
				`Failed to fetch chain balance for user ${args.id} on ${args.chain_id}`,
				error,
			);
		}
	}

	async getUserProtocol(args: {
		id: string;
		protocol_id: string;
	}): Promise<string> {
		try {
			const data = await this.fetchWithToolConfig<UserProtocolPosition>(
				`${this.baseUrl}/user/protocol?id=${args.id}&protocol_id=${args.protocol_id}`,
			);
			return await this.formatResponse(data, {
				title: "Protocol Position",
				currencyFields: ["usd_value"],
			});
		} catch (error) {
			throw logAndWrapError(
				`Failed to fetch protocol ${args.protocol_id} for user ${args.id}`,
				error,
			);
		}
	}

	async getUserComplexProtocolList(args: {
		id: string;
		chain_id: string;
	}): Promise<string> {
		try {
			const data = await this.fetchWithToolConfig<UserProtocolPosition[]>(
				`${this.baseUrl}/user/complex_protocol_list?id=${args.id}&chain_id=${args.chain_id}`,
			);
			return await this.formatResponse(data, {
				title: `Complex Protocol Positions on ${args.chain_id}`,
				currencyFields: ["usd_value"],
			});
		} catch (error) {
			throw logAndWrapError(
				`Failed to fetch complex protocol list for user ${args.id} on ${args.chain_id}`,
				error,
			);
		}
	}

	async getUserAllComplexProtocolList(args: {
		id: string;
		chain_ids?: string;
	}): Promise<string> {
		try {
			const url = args.chain_ids
				? `${this.baseUrl}/user/all_complex_protocol_list?id=${args.id}&chain_ids=${args.chain_ids}`
				: `${this.baseUrl}/user/all_complex_protocol_list?id=${args.id}`;

			const data = await this.fetchWithToolConfig<UserProtocolPosition[]>(url);
			return await this.formatResponse(data, {
				title: "All Complex Protocol Positions",
				currencyFields: ["usd_value"],
			});
		} catch (error) {
			const context = args.chain_ids
				? `Failed to fetch all complex protocols for user ${args.id} on chains ${args.chain_ids}`
				: `Failed to fetch all complex protocols for user ${args.id}`;
			throw logAndWrapError(context, error);
		}
	}

	async getUserAllSimpleProtocolList(args: {
		id: string;
		chain_ids?: string;
	}): Promise<string> {
		try {
			const url = args.chain_ids
				? `${this.baseUrl}/user/all_simple_protocol_list?id=${args.id}&chain_ids=${args.chain_ids}`
				: `${this.baseUrl}/user/all_simple_protocol_list?id=${args.id}`;

			const data = await this.fetchWithToolConfig<UserProtocolPosition[]>(url);
			return await this.formatResponse(data, {
				title: "Simple Protocol Positions",
				currencyFields: ["usd_value"],
			});
		} catch (error) {
			const context = args.chain_ids
				? `Failed to fetch all simple protocols for user ${args.id} on chains ${args.chain_ids}`
				: `Failed to fetch all simple protocols for user ${args.id}`;
			throw logAndWrapError(context, error);
		}
	}

	async getUserTokenBalance(args: {
		id: string;
		chain_id: string;
		token_id: string;
	}): Promise<string> {
		try {
			const data = await this.fetchWithToolConfig<UserTokenBalance>(
				`${this.baseUrl}/user/token?id=${args.id}&chain_id=${args.chain_id}&token_id=${args.token_id}`,
			);
			return await this.formatResponse(data, {
				title: `Token Balance: ${args.token_id}`,
				currencyFields: ["price", "usd_value"],
				numberFields: ["amount"],
			});
		} catch (error) {
			throw logAndWrapError(
				`Failed to fetch token balance for user ${args.id}, token ${args.token_id} on ${args.chain_id}`,
				error,
			);
		}
	}

	async getUserTokenList(args: {
		id: string;
		chain_id: string;
		is_all?: boolean;
		has_balance?: boolean;
	}): Promise<string> {
		try {
			const params = new URLSearchParams({
				id: args.id,
				chain_id: args.chain_id,
				...(args.is_all !== undefined && {
					is_all: args.is_all.toString(),
				}),
				...(args.has_balance !== undefined && {
					has_balance: args.has_balance.toString(),
				}),
			});

			const data = await this.fetchWithToolConfig<UserTokenBalance[]>(
				`${this.baseUrl}/user/token_list?${params}`,
			);
			return await this.formatResponse(data, {
				title: `Token Holdings on ${args.chain_id}`,
				currencyFields: ["price", "usd_value"],
				numberFields: ["amount"],
			});
		} catch (error) {
			throw logAndWrapError(
				`Failed to fetch token list for user ${args.id} on chain ${args.chain_id}`,
				error,
			);
		}
	}

	async getUserAllTokenList(args: {
		id: string;
		is_all?: boolean;
		has_balance?: boolean;
	}): Promise<string> {
		try {
			const params = new URLSearchParams({
				id: args.id,
				...(args.is_all !== undefined && {
					is_all: args.is_all.toString(),
				}),
				...(args.has_balance !== undefined && {
					has_balance: args.has_balance.toString(),
				}),
			});

			const data = await this.fetchWithToolConfig<UserTokenBalance[]>(
				`${this.baseUrl}/user/all_token_list?${params}`,
			);
			return await this.formatResponse(data, {
				title: "All Token Holdings",
				currencyFields: ["price", "usd_value"],
				numberFields: ["amount"],
			});
		} catch (error) {
			throw logAndWrapError(
				`Failed to fetch all token list for user ${args.id}`,
				error,
			);
		}
	}

	async getUserNftList(args: {
		id: string;
		chain_id: string;
		is_all?: boolean;
	}): Promise<string> {
		try {
			const params = new URLSearchParams({
				id: args.id,
				chain_id: args.chain_id,
				...(args.is_all !== undefined && {
					is_all: args.is_all.toString(),
				}),
			});

			const data = await this.fetchWithToolConfig<UserNFT[]>(
				`${this.baseUrl}/user/nft_list?${params}`,
			);
			return await this.formatResponse(data, {
				title: `NFT Collection on ${args.chain_id}`,
				numberFields: ["amount"],
			});
		} catch (error) {
			throw logAndWrapError(
				`Failed to fetch NFT list for user ${args.id} on chain ${args.chain_id}`,
				error,
			);
		}
	}

	async getUserAllNftList(args: {
		id: string;
		is_all?: boolean;
		chain_ids?: string;
	}): Promise<string> {
		try {
			const params = new URLSearchParams({
				id: args.id,
				...(args.is_all !== undefined && {
					is_all: args.is_all.toString(),
				}),
				...(args.chain_ids !== undefined && { chain_ids: args.chain_ids }),
			});

			const data = await this.fetchWithToolConfig<UserNFT[]>(
				`${this.baseUrl}/user/all_nft_list?${params}`,
			);
			return await this.formatResponse(data, {
				title: "All NFT Holdings",
				numberFields: ["amount"],
			});
		} catch (error) {
			throw logAndWrapError(
				`Failed to fetch all NFT list for user ${args.id}`,
				error,
			);
		}
	}

	async getUserHistoryList(args: {
		id: string;
		chain_id: string;
		start_time?: number;
		end_time?: number;
		page_count?: number;
	}): Promise<string> {
		try {
			const params = new URLSearchParams({
				id: args.id,
				chain_id: args.chain_id,
				...(args.start_time !== undefined && {
					start_time: args.start_time.toString(),
				}),
				...(args.end_time !== undefined && {
					end_time: args.end_time.toString(),
				}),
				...(args.page_count !== undefined && {
					page_count: args.page_count.toString(),
				}),
			});

			const data = await this.fetchWithToolConfig<UserHistoryItem[]>(
				`${this.baseUrl}/user/history_list?${params}`,
			);
			return await this.formatResponse(data, {
				title: `Transaction History on ${args.chain_id}`,
			});
		} catch (error) {
			throw logAndWrapError(
				`Failed to fetch transaction history for user ${args.id} on ${args.chain_id}`,
				error,
			);
		}
	}

	async getUserAllHistoryList(args: {
		id: string;
		start_time?: number;
		end_time?: number;
		page_count?: number;
	}): Promise<string> {
		try {
			const params = new URLSearchParams({
				id: args.id,
				...(args.start_time !== undefined && {
					start_time: args.start_time.toString(),
				}),
				...(args.end_time !== undefined && {
					end_time: args.end_time.toString(),
				}),
				...(args.page_count !== undefined && {
					page_count: args.page_count.toString(),
				}),
			});

			const data = await this.fetchWithToolConfig<UserHistoryItem[]>(
				`${this.baseUrl}/user/all_history_list?${params}`,
			);
			return await this.formatResponse(data, {
				title: "Complete Transaction History",
			});
		} catch (error) {
			throw logAndWrapError(
				`Failed to fetch complete transaction history for user ${args.id}`,
				error,
			);
		}
	}

	async getUserTokenAuthorizedList(args: { id: string }): Promise<string> {
		try {
			const data = await this.fetchWithToolConfig<TokenAuthorization[]>(
				`${this.baseUrl}/user/token_authorized_list?id=${args.id}`,
			);
			return await this.formatResponse(data, {
				title: "Token Authorizations",
			});
		} catch (error) {
			throw logAndWrapError(
				`Failed to fetch token authorizations for user ${args.id}`,
				error,
			);
		}
	}

	async getUserNftAuthorizedList(args: { id: string }): Promise<string> {
		try {
			const data = await this.fetchWithToolConfig<NFTAuthorization[]>(
				`${this.baseUrl}/user/nft_authorized_list?id=${args.id}`,
			);
			return await this.formatResponse(data, {
				title: "NFT Authorizations",
			});
		} catch (error) {
			throw logAndWrapError(
				`Failed to fetch NFT authorizations for user ${args.id}`,
				error,
			);
		}
	}

	async getUserTotalBalance(args: { id: string }): Promise<string> {
		try {
			const data = await this.fetchWithToolConfig<UserTotalBalance>(
				`${this.baseUrl}/user/total_balance?id=${args.id}`,
			);
			return await this.formatResponse(data, {
				title: "Total Portfolio Balance",
				currencyFields: ["total_usd_value"],
			});
		} catch (error) {
			throw logAndWrapError(
				`Failed to fetch total balance for user ${args.id}`,
				error,
			);
		}
	}

	async getUserChainNetCurve(args: {
		id: string;
		chain_id: string;
	}): Promise<string> {
		try {
			const data = await this.fetchWithToolConfig<NetCurvePoint[]>(
				`${this.baseUrl}/user/chain_net_curve?id=${args.id}&chain_id=${args.chain_id}`,
			);
			return await this.formatResponse(data, {
				title: `Portfolio Value Over Time (${args.chain_id})`,
				currencyFields: ["usd_value"],
			});
		} catch (error) {
			throw logAndWrapError(
				`Failed to fetch chain net curve for user ${args.id} on ${args.chain_id}`,
				error,
			);
		}
	}

	async getUserTotalNetCurve(args: {
		id: string;
		chain_ids?: string;
	}): Promise<string> {
		try {
			const url = args.chain_ids
				? `${this.baseUrl}/user/total_net_curve?id=${args.id}&chain_ids=${args.chain_ids}`
				: `${this.baseUrl}/user/total_net_curve?id=${args.id}`;

			const data = await this.fetchWithToolConfig<{
				usd_value_list: NetCurvePoint[];
			}>(url);
			return await this.formatResponse(data.usd_value_list, {
				title: "Total Portfolio Value Over Time",
				currencyFields: ["usd_value"],
			});
		} catch (error) {
			const context = args.chain_ids
				? `Failed to fetch total net curve for user ${args.id} on chains ${args.chain_ids}`
				: `Failed to fetch total net curve for user ${args.id}`;
			throw logAndWrapError(context, error);
		}
	}
}
