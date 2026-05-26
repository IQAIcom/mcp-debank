/**
 * User Service
 * Handles all user-related operations including portfolios, balances, and history
 */

import { createChildLogger } from "../lib/utils/index.js";
import { toMarkdown } from "../lib/utils/markdown-formatter.js";
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
import { BaseService, type RequestOptions } from "./base.service.js";

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
	async getUserUsedChainListRaw(
		args: { id: string },
		options?: RequestOptions,
	): Promise<{ chain_id: string }[]> {
		try {
			return await this.fetchWithToolConfig<{ chain_id: string }[]>(
				`${this.baseUrl}/user/used_chain_list?id=${args.id}`,
				this.DEFAULT_CACHE_TTL_SECONDS,
				options,
			);
		} catch (error) {
			throw logAndWrapError(
				`Failed to fetch used chain list for user ${args.id}`,
				error,
			);
		}
	}

	async getUserUsedChainList(args: { id: string }): Promise<string> {
		const data = await this.getUserUsedChainListRaw(args);
		try {
			return toMarkdown(data, {
				title: `Chains Used by ${args.id}`,
			});
		} catch (error) {
			throw logAndWrapError(
				`Failed to format used chain list for user ${args.id} response`,
				error,
			);
		}
	}

	async getUserChainBalanceRaw(
		args: { id: string; chain_id: string },
		options?: RequestOptions,
	): Promise<UserChainBalance> {
		try {
			return await this.fetchWithToolConfig<UserChainBalance>(
				`${this.baseUrl}/user/chain_balance?id=${args.id}&chain_id=${args.chain_id}`,
				this.DEFAULT_CACHE_TTL_SECONDS,
				options,
			);
		} catch (error) {
			throw logAndWrapError(
				`Failed to fetch chain balance for user ${args.id} on ${args.chain_id}`,
				error,
			);
		}
	}

	async getUserChainBalance(args: {
		id: string;
		chain_id: string;
	}): Promise<string> {
		const data = await this.getUserChainBalanceRaw(args);
		try {
			return toMarkdown(data, {
				title: `Balance on ${args.chain_id}`,
				currencyFields: ["usd_value"],
			});
		} catch (error) {
			throw logAndWrapError(
				`Failed to format chain balance for user ${args.id} on ${args.chain_id} response`,
				error,
			);
		}
	}

	async getUserProtocolRaw(
		args: { id: string; protocol_id: string },
		options?: RequestOptions,
	): Promise<UserProtocolPosition> {
		try {
			return await this.fetchWithToolConfig<UserProtocolPosition>(
				`${this.baseUrl}/user/protocol?id=${args.id}&protocol_id=${args.protocol_id}`,
				this.DEFAULT_CACHE_TTL_SECONDS,
				options,
			);
		} catch (error) {
			throw logAndWrapError(
				`Failed to fetch protocol ${args.protocol_id} for user ${args.id}`,
				error,
			);
		}
	}

	async getUserProtocol(args: {
		id: string;
		protocol_id: string;
	}): Promise<string> {
		const data = await this.getUserProtocolRaw(args);
		try {
			return toMarkdown(data, {
				title: "Protocol Position",
				currencyFields: ["usd_value"],
			});
		} catch (error) {
			throw logAndWrapError(
				`Failed to format protocol ${args.protocol_id} for user ${args.id} response`,
				error,
			);
		}
	}

	async getUserComplexProtocolListRaw(
		args: { id: string; chain_id: string },
		options?: RequestOptions,
	): Promise<UserProtocolPosition[]> {
		try {
			return await this.fetchWithToolConfig<UserProtocolPosition[]>(
				`${this.baseUrl}/user/complex_protocol_list?id=${args.id}&chain_id=${args.chain_id}`,
				this.DEFAULT_CACHE_TTL_SECONDS,
				options,
			);
		} catch (error) {
			throw logAndWrapError(
				`Failed to fetch complex protocol list for user ${args.id} on ${args.chain_id}`,
				error,
			);
		}
	}

	async getUserComplexProtocolList(args: {
		id: string;
		chain_id: string;
	}): Promise<string> {
		const data = await this.getUserComplexProtocolListRaw(args);
		try {
			return toMarkdown(data, {
				title: `Complex Protocol Positions on ${args.chain_id}`,
				currencyFields: ["usd_value"],
			});
		} catch (error) {
			throw logAndWrapError(
				`Failed to format complex protocol list for user ${args.id} on ${args.chain_id} response`,
				error,
			);
		}
	}

	async getUserAllComplexProtocolListRaw(
		args: { id: string; chain_ids?: string },
		options?: RequestOptions,
	): Promise<UserProtocolPosition[]> {
		try {
			const url = args.chain_ids
				? `${this.baseUrl}/user/all_complex_protocol_list?id=${args.id}&chain_ids=${args.chain_ids}`
				: `${this.baseUrl}/user/all_complex_protocol_list?id=${args.id}`;

			return await this.fetchWithToolConfig<UserProtocolPosition[]>(
				url,
				this.DEFAULT_CACHE_TTL_SECONDS,
				options,
			);
		} catch (error) {
			const context = args.chain_ids
				? `Failed to fetch all complex protocols for user ${args.id} on chains ${args.chain_ids}`
				: `Failed to fetch all complex protocols for user ${args.id}`;
			throw logAndWrapError(context, error);
		}
	}

	async getUserAllComplexProtocolList(args: {
		id: string;
		chain_ids?: string;
	}): Promise<string> {
		const data = await this.getUserAllComplexProtocolListRaw(args);
		try {
			return toMarkdown(data, {
				title: "All Complex Protocol Positions",
				currencyFields: ["usd_value"],
			});
		} catch (error) {
			const context = args.chain_ids
				? `Failed to format all complex protocols for user ${args.id} on chains ${args.chain_ids} response`
				: `Failed to format all complex protocols for user ${args.id} response`;
			throw logAndWrapError(context, error);
		}
	}

	async getUserAllSimpleProtocolListRaw(
		args: { id: string; chain_ids?: string },
		options?: RequestOptions,
	): Promise<UserProtocolPosition[]> {
		try {
			const url = args.chain_ids
				? `${this.baseUrl}/user/all_simple_protocol_list?id=${args.id}&chain_ids=${args.chain_ids}`
				: `${this.baseUrl}/user/all_simple_protocol_list?id=${args.id}`;

			return await this.fetchWithToolConfig<UserProtocolPosition[]>(
				url,
				this.DEFAULT_CACHE_TTL_SECONDS,
				options,
			);
		} catch (error) {
			const context = args.chain_ids
				? `Failed to fetch all simple protocols for user ${args.id} on chains ${args.chain_ids}`
				: `Failed to fetch all simple protocols for user ${args.id}`;
			throw logAndWrapError(context, error);
		}
	}

	async getUserAllSimpleProtocolList(args: {
		id: string;
		chain_ids?: string;
	}): Promise<string> {
		const data = await this.getUserAllSimpleProtocolListRaw(args);
		try {
			return toMarkdown(data, {
				title: "Simple Protocol Positions",
				currencyFields: ["usd_value"],
			});
		} catch (error) {
			const context = args.chain_ids
				? `Failed to format all simple protocols for user ${args.id} on chains ${args.chain_ids} response`
				: `Failed to format all simple protocols for user ${args.id} response`;
			throw logAndWrapError(context, error);
		}
	}

	async getUserTokenBalanceRaw(
		args: { id: string; chain_id: string; token_id: string },
		options?: RequestOptions,
	): Promise<UserTokenBalance> {
		try {
			return await this.fetchWithToolConfig<UserTokenBalance>(
				`${this.baseUrl}/user/token?id=${args.id}&chain_id=${args.chain_id}&token_id=${args.token_id}`,
				this.DEFAULT_CACHE_TTL_SECONDS,
				options,
			);
		} catch (error) {
			throw logAndWrapError(
				`Failed to fetch token balance for user ${args.id}, token ${args.token_id} on ${args.chain_id}`,
				error,
			);
		}
	}

	async getUserTokenBalance(args: {
		id: string;
		chain_id: string;
		token_id: string;
	}): Promise<string> {
		const data = await this.getUserTokenBalanceRaw(args);
		try {
			return toMarkdown(data, {
				title: `Token Balance: ${args.token_id}`,
				currencyFields: ["price", "usd_value"],
				numberFields: ["amount"],
			});
		} catch (error) {
			throw logAndWrapError(
				`Failed to format token balance for user ${args.id}, token ${args.token_id} on ${args.chain_id} response`,
				error,
			);
		}
	}

	async getUserTokenListRaw(
		args: {
			id: string;
			chain_id: string;
			is_all?: boolean;
			has_balance?: boolean;
		},
		options?: RequestOptions,
	): Promise<UserTokenBalance[]> {
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

			return await this.fetchWithToolConfig<UserTokenBalance[]>(
				`${this.baseUrl}/user/token_list?${params}`,
				this.DEFAULT_CACHE_TTL_SECONDS,
				options,
			);
		} catch (error) {
			throw logAndWrapError(
				`Failed to fetch token list for user ${args.id} on chain ${args.chain_id}`,
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
		const data = await this.getUserTokenListRaw(args);
		try {
			return toMarkdown(data, {
				title: `Token Holdings on ${args.chain_id}`,
				currencyFields: ["price", "usd_value"],
				numberFields: ["amount"],
			});
		} catch (error) {
			throw logAndWrapError(
				`Failed to format token list for user ${args.id} on chain ${args.chain_id} response`,
				error,
			);
		}
	}

	async getUserAllTokenListRaw(
		args: {
			id: string;
			is_all?: boolean;
			has_balance?: boolean;
		},
		options?: RequestOptions,
	): Promise<UserTokenBalance[]> {
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

			return await this.fetchWithToolConfig<UserTokenBalance[]>(
				`${this.baseUrl}/user/all_token_list?${params}`,
				this.DEFAULT_CACHE_TTL_SECONDS,
				options,
			);
		} catch (error) {
			throw logAndWrapError(
				`Failed to fetch all token list for user ${args.id}`,
				error,
			);
		}
	}

	async getUserAllTokenList(args: {
		id: string;
		is_all?: boolean;
		has_balance?: boolean;
	}): Promise<string> {
		const data = await this.getUserAllTokenListRaw(args);
		try {
			return toMarkdown(data, {
				title: "All Token Holdings",
				currencyFields: ["price", "usd_value"],
				numberFields: ["amount"],
			});
		} catch (error) {
			throw logAndWrapError(
				`Failed to format all token list for user ${args.id} response`,
				error,
			);
		}
	}

	async getUserNftListRaw(
		args: {
			id: string;
			chain_id: string;
			is_all?: boolean;
		},
		options?: RequestOptions,
	): Promise<UserNFT[]> {
		try {
			const params = new URLSearchParams({
				id: args.id,
				chain_id: args.chain_id,
				...(args.is_all !== undefined && {
					is_all: args.is_all.toString(),
				}),
			});

			return await this.fetchWithToolConfig<UserNFT[]>(
				`${this.baseUrl}/user/nft_list?${params}`,
				this.DEFAULT_CACHE_TTL_SECONDS,
				options,
			);
		} catch (error) {
			throw logAndWrapError(
				`Failed to fetch NFT list for user ${args.id} on chain ${args.chain_id}`,
				error,
			);
		}
	}

	async getUserNftList(args: {
		id: string;
		chain_id: string;
		is_all?: boolean;
	}): Promise<string> {
		const data = await this.getUserNftListRaw(args);
		try {
			return toMarkdown(data, {
				title: `NFT Collection on ${args.chain_id}`,
				numberFields: ["amount"],
			});
		} catch (error) {
			throw logAndWrapError(
				`Failed to format NFT list for user ${args.id} on chain ${args.chain_id} response`,
				error,
			);
		}
	}

	async getUserAllNftListRaw(
		args: {
			id: string;
			is_all?: boolean;
			chain_ids?: string;
		},
		options?: RequestOptions,
	): Promise<UserNFT[]> {
		try {
			const params = new URLSearchParams({
				id: args.id,
				...(args.is_all !== undefined && {
					is_all: args.is_all.toString(),
				}),
				...(args.chain_ids !== undefined && { chain_ids: args.chain_ids }),
			});

			return await this.fetchWithToolConfig<UserNFT[]>(
				`${this.baseUrl}/user/all_nft_list?${params}`,
				this.DEFAULT_CACHE_TTL_SECONDS,
				options,
			);
		} catch (error) {
			throw logAndWrapError(
				`Failed to fetch all NFT list for user ${args.id}`,
				error,
			);
		}
	}

	async getUserAllNftList(args: {
		id: string;
		is_all?: boolean;
		chain_ids?: string;
	}): Promise<string> {
		const data = await this.getUserAllNftListRaw(args);
		try {
			return toMarkdown(data, {
				title: "All NFT Holdings",
				numberFields: ["amount"],
			});
		} catch (error) {
			throw logAndWrapError(
				`Failed to format all NFT list for user ${args.id} response`,
				error,
			);
		}
	}

	async getUserHistoryListRaw(
		args: {
			id: string;
			chain_id: string;
			start_time?: number;
			end_time?: number;
			page_count?: number;
		},
		options?: RequestOptions,
	): Promise<UserHistoryItem[]> {
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

			return await this.fetchWithToolConfig<UserHistoryItem[]>(
				`${this.baseUrl}/user/history_list?${params}`,
				this.DEFAULT_CACHE_TTL_SECONDS,
				options,
			);
		} catch (error) {
			throw logAndWrapError(
				`Failed to fetch transaction history for user ${args.id} on ${args.chain_id}`,
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
		const data = await this.getUserHistoryListRaw(args);
		try {
			return toMarkdown(data, {
				title: `Transaction History on ${args.chain_id}`,
			});
		} catch (error) {
			throw logAndWrapError(
				`Failed to format transaction history for user ${args.id} on ${args.chain_id} response`,
				error,
			);
		}
	}

	async getUserAllHistoryListRaw(
		args: {
			id: string;
			start_time?: number;
			end_time?: number;
			page_count?: number;
		},
		options?: RequestOptions,
	): Promise<UserHistoryItem[]> {
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

			return await this.fetchWithToolConfig<UserHistoryItem[]>(
				`${this.baseUrl}/user/all_history_list?${params}`,
				this.DEFAULT_CACHE_TTL_SECONDS,
				options,
			);
		} catch (error) {
			throw logAndWrapError(
				`Failed to fetch complete transaction history for user ${args.id}`,
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
		const data = await this.getUserAllHistoryListRaw(args);
		try {
			return toMarkdown(data, {
				title: "Complete Transaction History",
			});
		} catch (error) {
			throw logAndWrapError(
				`Failed to format complete transaction history for user ${args.id} response`,
				error,
			);
		}
	}

	async getUserTokenAuthorizedListRaw(
		args: { id: string },
		options?: RequestOptions,
	): Promise<TokenAuthorization[]> {
		try {
			return await this.fetchWithToolConfig<TokenAuthorization[]>(
				`${this.baseUrl}/user/token_authorized_list?id=${args.id}`,
				this.DEFAULT_CACHE_TTL_SECONDS,
				options,
			);
		} catch (error) {
			throw logAndWrapError(
				`Failed to fetch token authorizations for user ${args.id}`,
				error,
			);
		}
	}

	async getUserTokenAuthorizedList(args: { id: string }): Promise<string> {
		const data = await this.getUserTokenAuthorizedListRaw(args);
		try {
			return toMarkdown(data, {
				title: "Token Authorizations",
			});
		} catch (error) {
			throw logAndWrapError(
				`Failed to format token authorizations for user ${args.id} response`,
				error,
			);
		}
	}

	async getUserNftAuthorizedListRaw(
		args: { id: string },
		options?: RequestOptions,
	): Promise<NFTAuthorization[]> {
		try {
			return await this.fetchWithToolConfig<NFTAuthorization[]>(
				`${this.baseUrl}/user/nft_authorized_list?id=${args.id}`,
				this.DEFAULT_CACHE_TTL_SECONDS,
				options,
			);
		} catch (error) {
			throw logAndWrapError(
				`Failed to fetch NFT authorizations for user ${args.id}`,
				error,
			);
		}
	}

	async getUserNftAuthorizedList(args: { id: string }): Promise<string> {
		const data = await this.getUserNftAuthorizedListRaw(args);
		try {
			return toMarkdown(data, {
				title: "NFT Authorizations",
			});
		} catch (error) {
			throw logAndWrapError(
				`Failed to format NFT authorizations for user ${args.id} response`,
				error,
			);
		}
	}

	async getUserTotalBalanceRaw(
		args: { id: string },
		options?: RequestOptions,
	): Promise<UserTotalBalance> {
		try {
			return await this.fetchWithToolConfig<UserTotalBalance>(
				`${this.baseUrl}/user/total_balance?id=${args.id}`,
				this.DEFAULT_CACHE_TTL_SECONDS,
				options,
			);
		} catch (error) {
			throw logAndWrapError(
				`Failed to fetch total balance for user ${args.id}`,
				error,
			);
		}
	}

	async getUserTotalBalance(args: { id: string }): Promise<string> {
		const data = await this.getUserTotalBalanceRaw(args);
		try {
			return toMarkdown(data, {
				title: "Total Portfolio Balance",
				currencyFields: ["total_usd_value"],
			});
		} catch (error) {
			throw logAndWrapError(
				`Failed to format total balance for user ${args.id} response`,
				error,
			);
		}
	}

	async getUserChainNetCurveRaw(
		args: { id: string; chain_id: string },
		options?: RequestOptions,
	): Promise<NetCurvePoint[]> {
		try {
			return await this.fetchWithToolConfig<NetCurvePoint[]>(
				`${this.baseUrl}/user/chain_net_curve?id=${args.id}&chain_id=${args.chain_id}`,
				this.DEFAULT_CACHE_TTL_SECONDS,
				options,
			);
		} catch (error) {
			throw logAndWrapError(
				`Failed to fetch chain net curve for user ${args.id} on ${args.chain_id}`,
				error,
			);
		}
	}

	async getUserChainNetCurve(args: {
		id: string;
		chain_id: string;
	}): Promise<string> {
		const data = await this.getUserChainNetCurveRaw(args);
		try {
			return toMarkdown(data, {
				title: `Portfolio Value Over Time (${args.chain_id})`,
				currencyFields: ["usd_value"],
			});
		} catch (error) {
			throw logAndWrapError(
				`Failed to format chain net curve for user ${args.id} on ${args.chain_id} response`,
				error,
			);
		}
	}

	async getUserTotalNetCurveRaw(
		args: { id: string; chain_ids?: string },
		options?: RequestOptions,
	): Promise<{ usd_value_list: NetCurvePoint[] }> {
		try {
			const url = args.chain_ids
				? `${this.baseUrl}/user/total_net_curve?id=${args.id}&chain_ids=${args.chain_ids}`
				: `${this.baseUrl}/user/total_net_curve?id=${args.id}`;
			return await this.fetchWithToolConfig<{
				usd_value_list: NetCurvePoint[];
			}>(url, this.DEFAULT_CACHE_TTL_SECONDS, options);
		} catch (error) {
			const context = args.chain_ids
				? `Failed to fetch total net curve for user ${args.id} on chains ${args.chain_ids}`
				: `Failed to fetch total net curve for user ${args.id}`;
			throw logAndWrapError(context, error);
		}
	}

	async getUserTotalNetCurve(args: {
		id: string;
		chain_ids?: string;
	}): Promise<string> {
		const data = await this.getUserTotalNetCurveRaw(args);
		try {
			return toMarkdown(data.usd_value_list, {
				title: "Total Portfolio Value Over Time",
				currencyFields: ["usd_value"],
			});
		} catch (error) {
			throw logAndWrapError(
				`Failed to format total net curve for user ${args.id} response`,
				error,
			);
		}
	}
}
