/**
 * User Service
 * Handles all user-related operations including portfolios, balances, and history
 */

import { createChildLogger } from "../lib/utils/index.js";
import type {
	AppProtocolPosition,
	NetCurvePoint,
	NFTAuthorization,
	TokenAuthorization,
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
	async getUserTokensAcrossChainsRaw(
		args: { id: string; min_usd_value?: number; is_all?: boolean },
		options?: RequestOptions,
	): Promise<UserTokenBalance[]> {
		const throwIfAborted = () => {
			if (options?.signal?.aborted) {
				// Preserve the caller's reason (or fall back to a standard
				// AbortError) so downstream `error.name === "AbortError"` checks
				// in axios/fetch/retry libs still discriminate.
				throw (
					options.signal.reason ??
					new DOMException("This operation was aborted", "AbortError")
				);
			}
		};
		// Check at entry — skip the cache lookup, the first upstream call, and
		// the fan-out if the caller already cancelled.
		throwIfAborted();
		const minUsdValue = args.min_usd_value ?? 1;
		try {
			const portfolio = await this.getUserTotalBalanceRaw(
				{ id: args.id },
				options,
			);
			// Re-check between calls — avoids firing N parallel token_list
			// requests when the caller aborted while we were waiting on the
			// portfolio breakdown.
			throwIfAborted();
			// Defensive optional chaining at the API boundary — the typed
			// signature promises non-null UserTotalBalance, but axios will
			// hand us whatever the upstream actually returned. Also require
			// `c.id` so we never feed `chain_id: undefined` into a wasted
			// per-chain fetch.
			const targetChains = (portfolio?.chain_list ?? [])
				.filter((c) => c?.id && c.usd_value >= minUsdValue)
				.map((c) => c.id);
			if (targetChains.length === 0) return [];
			// Per-chain `.catch` so a single chain's transient failure (rate
			// limit, 5xx, axios timeout, etc.) doesn't fail the whole aggregate
			// — the user gets the chains that succeeded. Abort errors are still
			// propagated so cancellation is honoured for the whole batch.
			const lists = await Promise.all(
				targetChains.map((chain_id) =>
					this.getUserTokenListRaw(
						{ id: args.id, chain_id, is_all: args.is_all },
						options,
					).catch((err) => {
						if (options?.signal?.aborted) throw err;
						logger.warn(
							`Skipping chain ${chain_id} for user ${args.id} due to upstream error`,
							err as Error,
						);
						return [] as UserTokenBalance[];
					}),
				),
			);
			// Final check: if the signal aborted after all per-chain calls
			// settled but before we return, honour the abort contract instead
			// of leaking data the caller already cancelled.
			throwIfAborted();
			return lists.flat();
		} catch (error) {
			// When the signal is aborted, always surface the canonical
			// AbortError (signal.reason or DOMException). A concurrent
			// network error that bubbled into the catch shouldn't mask the
			// fact that the caller cancelled — downstream
			// `error.name === "AbortError"` checks rely on this.
			throwIfAborted();
			throw logAndWrapError(
				`Failed to fetch tokens across chains for user ${args.id}`,
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
