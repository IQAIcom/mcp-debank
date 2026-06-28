/**
 * User Service
 * Handles all user-related operations including portfolios, balances, and history
 */

import { resolveChain } from "../lib/entity-resolver.js";
import { matchesTokenReference } from "../lib/token-matcher.js";
import { createChildLogger } from "../lib/utils/index.js";
import type {
	AppProtocolPosition,
	NetCurvePoint,
	NFTAuthorization,
	TokenAuthorization,
	TokenBalanceAcrossChains,
	UserChainBalance,
	UserHistoryItem,
	UserNFT,
	UserProtocolPosition,
	UserSimpleProtocolPosition,
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

	async getUserSimpleProtocolListRaw(
		args: { id: string; chain_id: string },
		options?: RequestOptions,
	): Promise<UserSimpleProtocolPosition[]> {
		try {
			return await this.fetchWithToolConfig<UserSimpleProtocolPosition[]>(
				`${this.baseUrl}/user/simple_protocol_list?id=${args.id}&chain_id=${args.chain_id}`,
				this.DEFAULT_CACHE_TTL_SECONDS,
				options,
			);
		} catch (error) {
			throw logAndWrapError(
				`Failed to fetch simple protocol list for user ${args.id} on ${args.chain_id}`,
				error,
			);
		}
	}

	async getUserComplexAppListRaw(
		args: { id: string },
		options?: RequestOptions,
	): Promise<AppProtocolPosition[]> {
		try {
			return await this.fetchWithToolConfig<AppProtocolPosition[]>(
				`${this.baseUrl}/user/complex_app_list?id=${args.id}`,
				this.DEFAULT_CACHE_TTL_SECONDS,
				options,
			);
		} catch (error) {
			throw logAndWrapError(
				`Failed to fetch complex app list for user ${args.id}`,
				error,
			);
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

	/**
	 * Aggregate token holdings across every chain that holds value for the
	 * wallet. Replaces the deprecated `/user/all_token_list` endpoint, which
	 * DeBank's upstream cannot serve within our 5 s per-call wrapper timeout
	 * for any active wallet (every attempt cancels at exactly 5000 ms).
	 *
	 * Algorithm:
	 *   1. `getUserTotalBalanceRaw` returns `chain_list` with per-chain usd_value.
	 *   2. Filter to chains with `usd_value >= min_usd_value` (default 1) so we
	 *      skip the long tail of dust chains.
	 *   3. `Promise.all(getUserTokenListRaw per filtered chain)` — runs against
	 *      base.service's cache + coalescing layer, with each axios call carrying
	 *      the same abort signal.
	 *   4. Flatten. Each `UserTokenBalance` already carries its `chain` field.
	 *
	 * Wall-time for a whale with ~20 active chains is typically 3-6 s (concurrency
	 * is bounded by axios + DeBank). The execute wrapper grants this method a
	 * 30 s budget via the `timeoutMs` override in tool-metadata.
	 */
	async _getUserTokensWithSkippedChains(
		args: { id: string; min_usd_value?: number; is_all?: boolean },
		options?: RequestOptions,
	): Promise<{ tokens: UserTokenBalance[]; skipped: string[] }> {
		const throwIfAborted = () => {
			if (options?.signal?.aborted) {
				throw (
					options.signal.reason ??
					new DOMException("This operation was aborted", "AbortError")
				);
			}
		};
		throwIfAborted();
		const minUsdValue = args.min_usd_value ?? 1;
		const skipped: string[] = [];
		try {
			const portfolio = await this.getUserTotalBalanceRaw(
				{ id: args.id },
				options,
			);
			throwIfAborted();
			const targetChains = (portfolio?.chain_list ?? [])
				.filter((c) => c?.id && c.usd_value >= minUsdValue)
				.map((c) => c.id);
			if (targetChains.length === 0) return { tokens: [], skipped: [] };
			const lists = await Promise.all(
				targetChains.map((chain_id) =>
					this.getUserTokenListRaw(
						{ id: args.id, chain_id, is_all: args.is_all },
						options,
					).catch((err) => {
						if (options?.signal?.aborted) throw err; // cancellation is NOT a skip
						logger.warn(
							`Skipping chain ${chain_id} for user ${args.id} due to upstream error`,
							err as Error,
						);
						skipped.push(chain_id);
						return [] as UserTokenBalance[];
					}),
				),
			);
			throwIfAborted();
			return { tokens: lists.flat(), skipped };
		} catch (error) {
			throwIfAborted();
			throw logAndWrapError(
				`Failed to fetch tokens across chains for user ${args.id}`,
				error,
			);
		}
	}

	async getUserTokensAcrossChainsRaw(
		args: { id: string; min_usd_value?: number; is_all?: boolean },
		options?: RequestOptions,
	): Promise<UserTokenBalance[]> {
		return (await this._getUserTokensWithSkippedChains(args, options)).tokens;
	}

	async getTokenBalanceAcrossChainsRaw(
		args: { id: string; token: string; chain?: string },
		options?: RequestOptions,
	): Promise<TokenBalanceAcrossChains> {
		const { id, token, chain } = args;
		const empty = (error?: string): TokenBalanceAcrossChains => ({
			wallet: id,
			token,
			matches: [],
			total: 0,
			total_usd: 0,
			mixed_representations: false,
			chains: [],
			partial: false,
			chains_skipped: [],
			...(error ? { error } : {}),
		});

		let holdings: UserTokenBalance[];
		let skipped: string[] = [];
		if (chain) {
			const chain_id = await resolveChain(chain);
			if (!chain_id) return empty(`Could not resolve chain '${chain}'.`);
			holdings = await this.getUserTokenListRaw(
				{ id, chain_id, is_all: true },
				options,
			);
		} else {
			const r = await this._getUserTokensWithSkippedChains(
				{ id, min_usd_value: 0, is_all: true },
				options,
			);
			holdings = r.tokens;
			skipped = r.skipped;
		}

		const matched = holdings.filter((h) => matchesTokenReference(token, h));
		// DeBank response objects occasionally have null/missing `name` or
		// `symbol` fields on custom/newly-deployed tokens (cookbook precedent —
		// see commit b0b12f1's defensive `p && p.name` guard). The TS types
		// claim non-null, but `fetchWithToolConfig` does not validate the
		// response, so the runtime can hand us nulls. Coalesce to "" here so
		// downstream string ops (and the agent's render) don't trip on them.
		const safeName = (h: UserTokenBalance) => h.name ?? "";
		const safeSymbol = (h: UserTokenBalance) => h.symbol ?? "";
		const matches = matched.map((h) => {
			const amount = Number.isFinite(h.amount) ? h.amount : null;
			const price = Number.isFinite(h.price) ? h.price : 0;
			const usd = amount !== null ? amount * price : 0;
			return {
				chain: h.chain,
				name: safeName(h),
				symbol: safeSymbol(h),
				amount,
				price,
				usd,
			};
		});
		const total = matches.reduce(
			(s, m) => (m.amount !== null ? s + m.amount : s),
			0,
		);
		const total_usd = matches.reduce(
			(s, m) => (m.amount !== null ? s + m.usd : s),
			0,
		);
		return {
			wallet: id,
			token,
			matches,
			total,
			total_usd,
			mixed_representations:
				new Set(matched.map((h) => safeName(h).trim().toLowerCase())).size > 1,
			chains: [...new Set(matched.map((h) => h.chain))],
			partial: skipped.length > 0,
			chains_skipped: skipped,
		};
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

	async getUserTokenAuthorizedListRaw(
		args: { id: string; chain_id: string },
		options?: RequestOptions,
	): Promise<TokenAuthorization[]> {
		try {
			return await this.fetchWithToolConfig<TokenAuthorization[]>(
				`${this.baseUrl}/user/token_authorized_list?id=${args.id}&chain_id=${args.chain_id}`,
				this.DEFAULT_CACHE_TTL_SECONDS,
				options,
			);
		} catch (error) {
			throw logAndWrapError(
				`Failed to fetch token authorizations for user ${args.id} on chain ${args.chain_id}`,
				error,
			);
		}
	}

	async getUserNftAuthorizedListRaw(
		args: { id: string; chain_id: string },
		options?: RequestOptions,
	): Promise<NFTAuthorization> {
		try {
			return await this.fetchWithToolConfig<NFTAuthorization>(
				`${this.baseUrl}/user/nft_authorized_list?id=${args.id}&chain_id=${args.chain_id}`,
				this.DEFAULT_CACHE_TTL_SECONDS,
				options,
			);
		} catch (error) {
			throw logAndWrapError(
				`Failed to fetch NFT authorizations for user ${args.id} on chain ${args.chain_id}`,
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

	async getUserTotalNetCurveRaw(
		args: { id: string; chain_ids?: string },
		options?: RequestOptions,
	): Promise<NetCurvePoint[]> {
		try {
			const url = args.chain_ids
				? `${this.baseUrl}/user/total_net_curve?id=${args.id}&chain_ids=${args.chain_ids}`
				: `${this.baseUrl}/user/total_net_curve?id=${args.id}`;
			return await this.fetchWithToolConfig<NetCurvePoint[]>(
				url,
				this.DEFAULT_CACHE_TTL_SECONDS,
				options,
			);
		} catch (error) {
			const context = args.chain_ids
				? `Failed to fetch total net curve for user ${args.id} on chains ${args.chain_ids}`
				: `Failed to fetch total net curve for user ${args.id}`;
			throw logAndWrapError(context, error);
		}
	}
}
