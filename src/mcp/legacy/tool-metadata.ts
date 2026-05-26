// src/mcp/legacy/tool-metadata.ts
//
// Side-effect-free metadata for the 31 legacy `debank_*` tools. Used by:
//   - scripts/build-docs-index.ts (build-time docs index generation)
//   - src/mcp/legacy/tool-handlers.ts (server-start tool registration)
//
// DO NOT IMPORT from src/services/ or src/lib/entity-resolver.ts — those
// modules have load-time side effects (singleton construction, openrouter
// initialization, Gemini cache priming). Importing them here would defeat
// the spec's "side-effect-free" guarantee.

import { z } from "zod";
// Type-only import — erased at compile time, preserves the
// "tool-metadata.ts must be side-effect-free at module load" invariant
// (enforced by tool-metadata.import.test.ts). The dynamic import inside
// lazyMethod's returned closure runs only when the thunk is invoked,
// never at module load.
import type * as Services from "../../services/index.js";

type ServicesShape = typeof Services;

type ServiceKey =
	| "chainService"
	| "protocolService"
	| "tokenService"
	| "transactionService"
	| "userService";

/**
 * Lazily resolves an instance method on one of the five service singletons
 * and returns it bound to that singleton. The generic constraints make
 * typos in either argument a compile error:
 *   - `serviceKey` must be one of the five named services
 *   - `methodKey` must be `keyof typeof <that service>`
 *
 * Returns an async thunk — services/index.ts loads only when the thunk
 * is invoked at dispatch time, not when tool-metadata.ts loads.
 */
function lazyMethod<K extends ServiceKey, M extends keyof ServicesShape[K]>(
	serviceKey: K,
	methodKey: M,
): () => Promise<(...args: unknown[]) => unknown> {
	return async () => {
		const services = await import("../../services/index.js");
		const svc = services[serviceKey] as unknown as Record<string, unknown>;
		const fn = svc[methodKey as string];
		if (typeof fn !== "function") {
			throw new Error(
				`${serviceKey}.${String(methodKey)} is not a function (this should be unreachable — TypeScript should have caught it)`,
			);
		}
		return (fn as (...a: unknown[]) => unknown).bind(svc);
	};
}

export type ToolMetadata = {
	/** Legacy MCP tool name, e.g. "debank_get_user_chain_balance". */
	name: string;
	/** Agent-facing sandbox call path, e.g. "debank.user.getUserChainBalance". */
	qualified: string;
	/** Lazy reference to the markdown-returning service method. Bound to its singleton. */
	legacyImpl: () => Promise<(...args: unknown[]) => unknown>;
	/** Lazy reference to the JSON-returning *Raw method. Bound to its singleton. */
	sandboxImpl: () => Promise<(...args: unknown[]) => unknown>;
	/** Tool description (matches the legacy tool definition's description verbatim). */
	description: string;
	/** Zod schema for input parameters. */
	parameters: z.ZodTypeAny;
	/** Example agent code snippet (one line). */
	exampleCall: string;
};

export const TOOL_METADATA: ToolMetadata[] = [
	// Chain Endpoints
	{
		name: "debank_get_supported_chain_list",
		qualified: "debank.chain.getSupportedChainList",
		legacyImpl: lazyMethod("chainService", "getSupportedChainList"),
		sandboxImpl: lazyMethod("chainService", "getSupportedChainListRaw"),
		description:
			"Retrieve a comprehensive list of all blockchain chains supported by the DeBank API. Returns information about each chain including their IDs, names, logo URLs, native token IDs, wrapped token IDs, and pre-execution support status. Use this to discover available chains before calling other chain-specific endpoints.",
		parameters: z.object({}),
		exampleCall: "await debank.chain.getSupportedChainList()",
	},
	{
		name: "debank_get_chain",
		qualified: "debank.chain.getChain",
		legacyImpl: lazyMethod("chainService", "getChain"),
		sandboxImpl: lazyMethod("chainService", "getChainRaw"),
		description:
			"Retrieve detailed information about a specific blockchain chain supported by DeBank. Returns chain details including ID, name, logo URL, native token ID, wrapped token ID, and whether it supports pre-execution of transactions.",
		parameters: z.object({
			id: z
				.string()
				.describe(
					"Chain ID (e.g. 'eth', 'bsc', 'matic', 'arb', 'op', 'base', 'avax').",
				),
		}),
		exampleCall: "await debank.chain.getChain({id: 'eth'})",
	},
	// Protocol Endpoints
	{
		name: "debank_get_all_protocols_of_supported_chains",
		qualified: "debank.protocol.getAllProtocolsOfSupportedChains",
		legacyImpl: lazyMethod(
			"protocolService",
			"getAllProtocolsOfSupportedChains",
		),
		sandboxImpl: lazyMethod(
			"protocolService",
			"getAllProtocolsOfSupportedChainsRaw",
		),
		description:
			"Retrieve a list of all DeFi protocols across specified or all supported blockchain chains. Returns essential information about each protocol including ID, chain ID, name, logo URL, site URL, portfolio support status, and TVL. Returns top 20 protocols by default. Filter by specific chains using chain_ids parameter.",
		parameters: z.object({
			chain_ids: z
				.string()
				.optional()
				.describe(
					"Comma-separated chain IDs (e.g. 'eth,bsc,matic'). If omitted, returns protocols across all supported chains.",
				),
		}),
		exampleCall:
			"await debank.protocol.getAllProtocolsOfSupportedChains({chain_ids: 'eth,bsc'})",
	},
	{
		name: "debank_get_protocol_information",
		qualified: "debank.protocol.getProtocolInformation",
		legacyImpl: lazyMethod("protocolService", "getProtocolInformation"),
		sandboxImpl: lazyMethod("protocolService", "getProtocolInformationRaw"),
		description:
			"Fetch detailed information about a specific DeFi protocol. Returns protocol details including ID, associated chain, name, logo URL, site URL, portfolio support status, and total value locked (TVL). Useful for analyzing individual protocols across different chains.",
		parameters: z.object({
			id: z
				.string()
				.describe(
					"The unique identifier of the protocol (e.g., 'bsc_pancakeswap' for PancakeSwap on BSC, 'uniswap', 'aave', 'curve'). Use debank_get_all_protocols_of_supported_chains to discover protocol IDs.",
				),
		}),
		exampleCall:
			"await debank.protocol.getProtocolInformation({id: 'uniswap'})",
	},
	{
		name: "debank_get_top_holders_of_protocol",
		qualified: "debank.protocol.getTopHoldersOfProtocol",
		legacyImpl: lazyMethod("protocolService", "getTopHoldersOfProtocol"),
		sandboxImpl: lazyMethod("protocolService", "getTopHoldersOfProtocolRaw"),
		description:
			"Retrieve a list of top holders within a specified DeFi protocol, ranked by their holdings. Provides insights into the distribution and concentration of holdings among participants. Supports pagination for large result sets.",
		parameters: z.object({
			id: z
				.string()
				.describe(
					"The unique identifier of the protocol (e.g., 'uniswap', 'aave', 'compound'). Use debank_get_all_protocols_of_supported_chains to find protocol IDs.",
				),
			start: z
				.number()
				.int()
				.nonnegative()
				.max(1000)
				.optional()
				.describe(
					"Pagination offset to specify where to start in the list. Default is 0, maximum is 1000.",
				),
			limit: z
				.number()
				.int()
				.positive()
				.max(100)
				.optional()
				.describe(
					"Maximum number of top holders to retrieve. Default and maximum is 100.",
				),
		}),
		exampleCall:
			"await debank.protocol.getTopHoldersOfProtocol({id: 'uniswap', limit: 10})",
	},
	{
		name: "debank_get_pool_information",
		qualified: "debank.protocol.getPoolInformation",
		legacyImpl: lazyMethod("protocolService", "getPoolInformation"),
		sandboxImpl: lazyMethod("protocolService", "getPoolInformationRaw"),
		description:
			"Retrieve detailed information about a specific liquidity pool. Returns pool details including ID, chain, protocol ID, contract IDs, name, USD value of deposited assets, total user count, and count of valuable users (>$100 USD value). Essential for analyzing specific pools for investment or research.",
		parameters: z.object({
			id: z
				.string()
				.describe(
					"The unique identifier of the pool (typically a contract address, e.g., '0x00000000219ab540356cbb839cbe05303d7705fa').",
				),
			chain_id: z
				.string()
				.describe(
					"Chain ID (e.g. 'eth', 'bsc', 'matic', 'arb', 'op', 'base', 'avax').",
				),
		}),
		exampleCall:
			"await debank.protocol.getPoolInformation({id: '0x...', chain_id: 'eth'})",
	},
	// Token Endpoints
	{
		name: "debank_get_token_information",
		qualified: "debank.token.getTokenInformation",
		legacyImpl: lazyMethod("tokenService", "getTokenInformation"),
		sandboxImpl: lazyMethod("tokenService", "getTokenInformationRaw"),
		description:
			"Fetch comprehensive details about a specific token on a blockchain. Returns token information including contract address, chain, name, symbol, decimals, logo URL, associated protocol ID, USD price, verification status, and deployment timestamp. Essential for token analysis and display.",
		parameters: z.object({
			chain_id: z
				.string()
				.describe(
					"Chain ID (e.g. 'eth', 'bsc', 'matic', 'arb', 'op', 'base', 'avax').",
				),
			id: z
				.string()
				.describe(
					"Token contract address or native token ID (e.g., '0xdac17f958d2ee523a2206206994597c13d831ec7' for USDT). Use debank.resolveWrappedToken() in execute() to resolve wrapped token keywords to addresses before passing here.",
				),
		}),
		exampleCall:
			"await debank.token.getTokenInformation({chain_id: 'eth', id: '0xdac17f958d2ee523a2206206994597c13d831ec7'})",
	},
	{
		name: "debank_get_list_token_information",
		qualified: "debank.token.getListTokenInformation",
		legacyImpl: lazyMethod("tokenService", "getListTokenInformation"),
		sandboxImpl: lazyMethod("tokenService", "getListTokenInformationRaw"),
		description:
			"Retrieve detailed information for multiple tokens at once on a specific chain. Returns an array of token objects with comprehensive details. Useful for bulk token data retrieval, with support for up to 100 token addresses per request.",
		parameters: z.object({
			chain_id: z
				.string()
				.describe(
					"Chain ID (e.g. 'eth', 'bsc', 'matic', 'arb', 'op', 'base', 'avax').",
				),
			ids: z
				.string()
				.describe(
					"Comma-separated list of token addresses (up to 100). Example: '0xdac17f958d2ee523a2206206994597c13d831ec7,0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'",
				),
		}),
		exampleCall:
			"await debank.token.getListTokenInformation({chain_id: 'eth', ids: '0xdac17f958d2ee523a2206206994597c13d831ec7'})",
	},
	{
		name: "debank_get_top_holders_of_token",
		qualified: "debank.token.getTopHoldersOfToken",
		legacyImpl: lazyMethod("tokenService", "getTopHoldersOfToken"),
		sandboxImpl: lazyMethod("tokenService", "getTopHoldersOfTokenRaw"),
		description:
			"Fetch the top holders of a specified token, showing the largest token holders ranked by their holdings. Supports both contract addresses and native token IDs. Useful for analyzing token distribution and ownership concentration. Supports pagination for detailed analysis.",
		parameters: z.object({
			id: z
				.string()
				.describe(
					"Token contract address or native token ID (e.g., '0xdac17f958d2ee523a2206206994597c13d831ec7'). Use debank.resolveWrappedToken() in execute() to resolve wrapped token keywords to addresses before passing here.",
				),
			chain_id: z
				.string()
				.describe(
					"Chain ID (e.g. 'eth', 'bsc', 'matic', 'arb', 'op', 'base', 'avax').",
				),
			start: z
				.number()
				.int()
				.nonnegative()
				.max(10000)
				.optional()
				.describe("Pagination offset. Default is 0, maximum is 10000."),
			limit: z
				.number()
				.int()
				.positive()
				.max(100)
				.optional()
				.describe("Maximum number of holders to return. Default is 100."),
		}),
		exampleCall:
			"await debank.token.getTopHoldersOfToken({id: '0xdac17f958d2ee523a2206206994597c13d831ec7', chain_id: 'eth', limit: 10})",
	},
	{
		name: "debank_get_token_history_price",
		qualified: "debank.token.getTokenHistoryPrice",
		legacyImpl: lazyMethod("tokenService", "getTokenHistoryPrice"),
		sandboxImpl: lazyMethod("tokenService", "getTokenHistoryPriceRaw"),
		description:
			"Retrieve the historical price of a specified token for a given date. Essential for financial analysis, historical comparison, and tracking price movements over time. Returns price data for the UTC time zone on the specified date.",
		parameters: z.object({
			id: z
				.string()
				.describe(
					"Token contract address or native token ID (e.g., '0xdac17f958d2ee523a2206206994597c13d831ec7'). Use debank.resolveWrappedToken() in execute() to resolve wrapped token keywords to addresses before passing here.",
				),
			chain_id: z
				.string()
				.describe(
					"Chain ID (e.g. 'eth', 'bsc', 'matic', 'arb', 'op', 'base', 'avax').",
				),
			date_at: z
				.string()
				.describe(
					"The date for historical price data in UTC time zone. Format: YYYY-MM-DD (e.g., '2023-05-18').",
				),
		}),
		exampleCall:
			"await debank.token.getTokenHistoryPrice({id: '0xdac17f958d2ee523a2206206994597c13d831ec7', chain_id: 'eth', date_at: '2023-05-18'})",
	},
	// User Endpoints
	{
		name: "debank_get_user_used_chain_list",
		qualified: "debank.user.getUserUsedChainList",
		legacyImpl: lazyMethod("userService", "getUserUsedChainList"),
		sandboxImpl: lazyMethod("userService", "getUserUsedChainListRaw"),
		description:
			"Retrieve a list of blockchain chains that a specific user has interacted with. Returns details about each chain including ID, name, logo URL, native token ID, wrapped token ID, and the birth time of the user's address on each chain.",
		parameters: z.object({
			id: z.string().describe("The user's wallet address."),
		}),
		exampleCall: "await debank.user.getUserUsedChainList({id: '0x...'})",
	},
	{
		name: "debank_get_user_chain_balance",
		qualified: "debank.user.getUserChainBalance",
		legacyImpl: lazyMethod("userService", "getUserChainBalance"),
		sandboxImpl: lazyMethod("userService", "getUserChainBalanceRaw"),
		description:
			"Fetch the current balance of a user's account on a specified blockchain chain. Returns the balance in USD value, providing a snapshot of the user's holdings on that chain.",
		parameters: z.object({
			chain_id: z
				.string()
				.describe(
					"Chain ID (e.g. 'eth', 'bsc', 'matic', 'arb', 'op', 'base', 'avax').",
				),
			id: z.string().describe("The user's wallet address."),
		}),
		exampleCall:
			"await debank.user.getUserChainBalance({id: '0x...', chain_id: 'eth'})",
	},
	{
		name: "debank_get_user_protocol",
		qualified: "debank.user.getUserProtocol",
		legacyImpl: lazyMethod("userService", "getUserProtocol"),
		sandboxImpl: lazyMethod("userService", "getUserProtocolRaw"),
		description:
			"Get detailed information about a user's positions within a specified DeFi protocol. Returns protocol details and the user's portfolio items including assets, debts, and rewards in that protocol.",
		parameters: z.object({
			protocol_id: z
				.string()
				.describe(
					"The protocol ID (e.g., 'bsc_pancakeswap', 'uniswap', 'aave')Use debank_get_all_protocols_of_supported_chains to discover protocol IDs..",
				),
			id: z.string().describe("The user's wallet address."),
		}),
		exampleCall:
			"await debank.user.getUserProtocol({id: '0x...', protocol_id: 'uniswap'})",
	},
	{
		name: "debank_get_user_complex_protocol_list",
		qualified: "debank.user.getUserComplexProtocolList",
		legacyImpl: lazyMethod("userService", "getUserComplexProtocolList"),
		sandboxImpl: lazyMethod("userService", "getUserComplexProtocolListRaw"),
		description:
			"Retrieve detailed portfolios of a user on a specific chain across multiple protocols. Returns comprehensive information about the user's engagements including protocol details and portfolio items with assets, debts, and positions.",
		parameters: z.object({
			chain_id: z
				.string()
				.describe(
					"Chain ID (e.g. 'eth', 'bsc', 'matic', 'arb', 'op', 'base', 'avax').",
				),
			id: z.string().describe("The user's wallet address."),
		}),
		exampleCall:
			"await debank.user.getUserComplexProtocolList({id: '0x...', chain_id: 'eth'})",
	},
	{
		name: "debank_get_user_all_complex_protocol_list",
		qualified: "debank.user.getUserAllComplexProtocolList",
		legacyImpl: lazyMethod("userService", "getUserAllComplexProtocolList"),
		sandboxImpl: lazyMethod("userService", "getUserAllComplexProtocolListRaw"),
		description:
			"Retrieve a user's detailed portfolios across all supported chains within multiple protocols. Provides a comprehensive overview of investments and positions across the entire DeFi ecosystem. Can be filtered by specific chains.",
		parameters: z.object({
			id: z.string().describe("The user's wallet address."),
			chain_ids: z
				.string()
				.optional()
				.describe(
					"Comma-separated chain IDs (e.g. 'eth,bsc,matic'). If omitted, includes all supported chains.",
				),
		}),
		exampleCall:
			"await debank.user.getUserAllComplexProtocolList({id: '0x...'})",
	},
	{
		name: "debank_get_user_all_simple_protocol_list",
		qualified: "debank.user.getUserAllSimpleProtocolList",
		legacyImpl: lazyMethod("userService", "getUserAllSimpleProtocolList"),
		sandboxImpl: lazyMethod("userService", "getUserAllSimpleProtocolListRaw"),
		description:
			"Fetch a user's balances in protocols across all supported chains. Returns simplified protocol information including TVL and basic details. Useful for getting a quick overview of a user's protocol engagements.",
		parameters: z.object({
			id: z.string().describe("The user's wallet address."),
			chain_ids: z
				.string()
				.optional()
				.describe(
					"Comma-separated chain IDs (e.g. 'eth,bsc,matic'). If omitted, includes all supported chains.",
				),
		}),
		exampleCall:
			"await debank.user.getUserAllSimpleProtocolList({id: '0x...'})",
	},
	{
		name: "debank_get_user_token_balance",
		qualified: "debank.user.getUserTokenBalance",
		legacyImpl: lazyMethod("userService", "getUserTokenBalance"),
		sandboxImpl: lazyMethod("userService", "getUserTokenBalanceRaw"),
		description:
			"Retrieve a user's balance for a specific token. Returns detailed token information including name, symbol, decimals, USD price, and the user's balance amount.",
		parameters: z.object({
			chain_id: z
				.string()
				.describe(
					"Chain ID (e.g. 'eth', 'bsc', 'matic', 'arb', 'op', 'base', 'avax').",
				),
			id: z.string().describe("The user's wallet address."),
			token_id: z
				.string()
				.describe(
					"Token contract address or native token ID (e.g., '0xdac17f958d2ee523a2206206994597c13d831ec7'). Use debank.resolveWrappedToken() in execute() to resolve wrapped token keywords to addresses before passing here.",
				),
		}),
		exampleCall:
			"await debank.user.getUserTokenBalance({id: '0x...', chain_id: 'eth', token_id: '0xdac17f958d2ee523a2206206994597c13d831ec7'})",
	},
	{
		name: "debank_get_user_token_list",
		qualified: "debank.user.getUserTokenList",
		legacyImpl: lazyMethod("userService", "getUserTokenList"),
		sandboxImpl: lazyMethod("userService", "getUserTokenListRaw"),
		description:
			"Retrieve a list of tokens held by a user on a specific chain. Returns token details including symbol, decimals, USD price, and balance amounts. Can filter for core/verified tokens or include all tokens.",
		parameters: z.object({
			id: z.string().describe("The user's wallet address."),
			chain_id: z
				.string()
				.describe(
					"Chain ID (e.g. 'eth', 'bsc', 'matic', 'arb', 'op', 'base', 'avax').",
				),
			is_all: z
				.boolean()
				.optional()
				.describe(
					"If true, returns all tokens including non-core tokens. Default is true.",
				),
		}),
		exampleCall:
			"await debank.user.getUserTokenList({id: '0x...', chain_id: 'eth'})",
	},
	{
		name: "debank_get_user_all_token_list",
		qualified: "debank.user.getUserAllTokenList",
		legacyImpl: lazyMethod("userService", "getUserAllTokenList"),
		sandboxImpl: lazyMethod("userService", "getUserAllTokenListRaw"),
		description:
			"Retrieve a user's token balances across all supported chains. Provides a comprehensive list of all tokens held by the user, offering insights into their wider cryptocurrency portfolio.",
		parameters: z.object({
			id: z.string().describe("The user's wallet address."),
			is_all: z
				.boolean()
				.optional()
				.describe(
					"If true, includes all tokens in the response. Default is true.",
				),
		}),
		exampleCall: "await debank.user.getUserAllTokenList({id: '0x...'})",
	},
	{
		name: "debank_get_user_nft_list",
		qualified: "debank.user.getUserNftList",
		legacyImpl: lazyMethod("userService", "getUserNftList"),
		sandboxImpl: lazyMethod("userService", "getUserNftListRaw"),
		description:
			"Fetch a list of NFTs owned by a user on a specific chain. Returns NFT details including contract ID, name, description, content type, and attributes. Can filter for verified collections only.",
		parameters: z.object({
			id: z.string().describe("The user's wallet address."),
			chain_id: z
				.string()
				.describe(
					"Chain ID (e.g. 'eth', 'bsc', 'matic', 'arb', 'op', 'base', 'avax').",
				),
			is_all: z
				.boolean()
				.optional()
				.describe(
					"If false, only returns NFTs from verified collections. Default is true.",
				),
		}),
		exampleCall:
			"await debank.user.getUserNftList({id: '0x...', chain_id: 'eth'})",
	},
	{
		name: "debank_get_user_all_nft_list",
		qualified: "debank.user.getUserAllNftList",
		legacyImpl: lazyMethod("userService", "getUserAllNftList"),
		sandboxImpl: lazyMethod("userService", "getUserAllNftListRaw"),
		description:
			"Retrieve a user's NFT holdings across all supported chains. Provides an aggregate list of NFTs held by the user with details including contract ID, name, and content type. Can be filtered by specific chains.",
		parameters: z.object({
			id: z.string().describe("The user's wallet address."),
			is_all: z
				.boolean()
				.optional()
				.describe("If true, includes all NFTs. Default is true."),
			chain_ids: z
				.string()
				.optional()
				.describe(
					"Comma-separated chain IDs (e.g. 'eth,bsc,matic'). If omitted, includes all supported chains.",
				),
		}),
		exampleCall: "await debank.user.getUserAllNftList({id: '0x...'})",
	},
	{
		name: "debank_get_user_history_list",
		qualified: "debank.user.getUserHistoryList",
		legacyImpl: lazyMethod("userService", "getUserHistoryList"),
		sandboxImpl: lazyMethod("userService", "getUserHistoryListRaw"),
		description:
			"Fetch a user's transaction history on a specified chain. Returns a list of past transactions with details including transaction type, tokens involved, values, and timestamps. Supports filtering by token and pagination.",
		parameters: z.object({
			id: z.string().describe("The user's wallet address."),
			chain_id: z
				.string()
				.describe(
					"Chain ID (e.g. 'eth', 'bsc', 'matic', 'arb', 'op', 'base', 'avax').",
				),
			token_id: z
				.string()
				.optional()
				.describe(
					"Optional token contract address or native token ID to filter history. Use debank.resolveWrappedToken() in execute() to resolve wrapped token keywords to addresses before passing here.",
				),
			start_time: z
				.number()
				.int()
				.optional()
				.describe(
					"Optional timestamp to return history earlier than this time (Unix timestamp).",
				),
			page_count: z
				.number()
				.int()
				.positive()
				.max(20)
				.optional()
				.describe("Number of entries to return. Maximum is 20."),
		}),
		exampleCall:
			"await debank.user.getUserHistoryList({id: '0x...', chain_id: 'eth'})",
	},
	{
		name: "debank_get_user_all_history_list",
		qualified: "debank.user.getUserAllHistoryList",
		legacyImpl: lazyMethod("userService", "getUserAllHistoryList"),
		sandboxImpl: lazyMethod("userService", "getUserAllHistoryListRaw"),
		description:
			"Retrieve a user's transaction history across all supported chains. Provides a comprehensive overview of DeFi activities across the entire blockchain ecosystem. Supports pagination and chain filtering.",
		parameters: z.object({
			id: z.string().describe("The user's wallet address."),
			start_time: z
				.number()
				.int()
				.optional()
				.describe(
					"Optional timestamp to return history earlier than this time.",
				),
			page_count: z
				.number()
				.int()
				.positive()
				.max(20)
				.optional()
				.describe("Number of entries to return. Maximum is 20."),
			chain_ids: z
				.string()
				.optional()
				.describe(
					"Comma-separated chain IDs (e.g. 'eth,bsc,matic'). If omitted, includes all supported chains.",
				),
		}),
		exampleCall: "await debank.user.getUserAllHistoryList({id: '0x...'})",
	},
	{
		name: "debank_get_user_token_authorized_list",
		qualified: "debank.user.getUserTokenAuthorizedList",
		legacyImpl: lazyMethod("userService", "getUserTokenAuthorizedList"),
		sandboxImpl: lazyMethod("userService", "getUserTokenAuthorizedListRaw"),
		description:
			"Fetch a list of tokens for which a user has granted spending approvals on a specified chain. Returns details about each approval including amount, spender address, and associated protocol information. Useful for security audits.",
		parameters: z.object({
			id: z.string().describe("The user's wallet address."),
			chain_id: z
				.string()
				.describe(
					"Chain ID (e.g. 'eth', 'bsc', 'matic', 'arb', 'op', 'base', 'avax').",
				),
		}),
		exampleCall:
			"await debank.user.getUserTokenAuthorizedList({id: '0x...', chain_id: 'eth'})",
	},
	{
		name: "debank_get_user_nft_authorized_list",
		qualified: "debank.user.getUserNftAuthorizedList",
		legacyImpl: lazyMethod("userService", "getUserNftAuthorizedList"),
		sandboxImpl: lazyMethod("userService", "getUserNftAuthorizedListRaw"),
		description:
			"Retrieve a list of NFTs for which a user has given spending permissions on a specified chain. Returns details including contract IDs, names, symbols, spender addresses, and approved amounts for ERC1155 tokens. Important for security reviews.",
		parameters: z.object({
			id: z.string().describe("The user's wallet address."),
			chain_id: z
				.string()
				.describe(
					"Chain ID (e.g. 'eth', 'bsc', 'matic', 'arb', 'op', 'base', 'avax').",
				),
		}),
		exampleCall:
			"await debank.user.getUserNftAuthorizedList({id: '0x...', chain_id: 'eth'})",
	},
	{
		name: "debank_get_user_total_balance",
		qualified: "debank.user.getUserTotalBalance",
		legacyImpl: lazyMethod("userService", "getUserTotalBalance"),
		sandboxImpl: lazyMethod("userService", "getUserTotalBalanceRaw"),
		description:
			"Retrieve a user's total net assets across all supported chains. Calculates and returns the total USD value of assets including both tokens and protocol positions. Provides a complete snapshot of the user's DeFi portfolio.",
		parameters: z.object({
			id: z.string().describe("The user's wallet address."),
		}),
		exampleCall: "await debank.user.getUserTotalBalance({id: '0x...'})",
	},
	{
		name: "debank_get_user_chain_net_curve",
		qualified: "debank.user.getUserChainNetCurve",
		legacyImpl: lazyMethod("userService", "getUserChainNetCurve"),
		sandboxImpl: lazyMethod("userService", "getUserChainNetCurveRaw"),
		description:
			"Retrieve a user's 24-hour net asset value curve on a single chain. Shows the changes in total USD value of assets over the last 24 hours, providing insights into portfolio fluctuations on that specific chain.",
		parameters: z.object({
			id: z.string().describe("The user's wallet address."),
			chain_id: z
				.string()
				.describe(
					"Chain ID (e.g. 'eth', 'bsc', 'matic', 'arb', 'op', 'base', 'avax').",
				),
		}),
		exampleCall:
			"await debank.user.getUserChainNetCurve({id: '0x...', chain_id: 'eth'})",
	},
	{
		name: "debank_get_user_total_net_curve",
		qualified: "debank.user.getUserTotalNetCurve",
		legacyImpl: lazyMethod("userService", "getUserTotalNetCurve"),
		sandboxImpl: lazyMethod("userService", "getUserTotalNetCurveRaw"),
		description:
			"Retrieve a user's 24-hour net asset value curve across all chains. Provides a comprehensive view of total USD value changes over the last 24 hours, helping track overall portfolio performance. Can be filtered by specific chains.",
		parameters: z.object({
			id: z.string().describe("The user's wallet address."),
			chain_ids: z
				.string()
				.optional()
				.describe(
					"Comma-separated chain IDs (e.g. 'eth,bsc,matic'). If omitted, includes all supported chains.",
				),
		}),
		exampleCall: "await debank.user.getUserTotalNetCurve({id: '0x...'})",
	},
	// Wallet Endpoints
	{
		name: "debank_get_gas_prices",
		qualified: "debank.chain.getGasPrices",
		legacyImpl: lazyMethod("chainService", "getGasPrices"),
		sandboxImpl: lazyMethod("chainService", "getGasPricesRaw"),
		description:
			"Fetch current gas prices for different transaction speed levels on a specified chain. Returns prices for slow, normal, and fast transaction speeds with estimated confirmation times. Crucial for transaction cost estimation.",
		parameters: z.object({
			chain_id: z
				.string()
				.describe(
					"Chain ID (e.g. 'eth', 'bsc', 'matic', 'arb', 'op', 'base', 'avax').",
				),
		}),
		exampleCall: "await debank.chain.getGasPrices({chain_id: 'eth'})",
	},
	// Transaction Endpoints
	{
		name: "debank_pre_exec_transaction",
		qualified: "debank.transaction.preExecTransaction",
		legacyImpl: lazyMethod("transactionService", "preExecTransaction"),
		sandboxImpl: lazyMethod("transactionService", "preExecTransactionRaw"),
		description:
			"Simulate the execution of a transaction or sequence of transactions before submitting them on-chain. Returns detailed information about balance changes, gas estimates, and success status. Useful for DEX swaps requiring token approvals or complex transaction sequences.",
		parameters: z.object({
			tx: z
				.string()
				.describe(
					"The main transaction object as a JSON string. Must include fields like from, to, data, value, etc.",
				),
			pending_tx_list: z
				.string()
				.optional()
				.describe(
					"Optional JSON string array of transactions to execute before the main transaction (e.g., approval transactions).",
				),
		}),
		exampleCall:
			'await debank.transaction.preExecTransaction({tx: \'{"from":"0x...","to":"0x...","data":"0x...","value":"0x0"}\'})',
	},
	{
		name: "debank_explain_transaction",
		qualified: "debank.transaction.explainTransaction",
		legacyImpl: lazyMethod("transactionService", "explainTransaction"),
		sandboxImpl: lazyMethod("transactionService", "explainTransactionRaw"),
		description:
			"Decode and explain a given transaction in human-readable terms. Returns details about function calls, parameters, and actions derived from the transaction data. Supports complex transactions across multiple protocols.",
		parameters: z.object({
			tx: z
				.string()
				.describe(
					"The transaction object as a JSON string to be explained. Must include transaction data field.",
				),
		}),
		exampleCall:
			'await debank.transaction.explainTransaction({tx: \'{"from":"0x...","to":"0x...","data":"0x..."}\'})',
	},
];
