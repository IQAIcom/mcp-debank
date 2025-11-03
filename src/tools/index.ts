import { type BaseTool, createTool } from "@iqai/adk";
import { z } from "zod";
import {
	needsResolution,
	resolveChain,
	resolveEntities,
} from "../lib/entity-resolver.js";
import { createChildLogger } from "../lib/utils/index.js";
import {
	chainService,
	protocolService,
	tokenService,
	transactionService,
	userService,
} from "../services/index.js";

const logger = createChildLogger("DeBank MCP Tools");

/**
 * Helper to set query on all services when _userQuery is provided in args
 * This is called from MCP tool execute functions to enable context-aware filtering
 */
function setQueryFromArgs(args: Record<string, unknown>) {
	const query = args._userQuery as string | undefined;
	if (query) {
		chainService.setQuery(query);
		protocolService.setQuery(query);
		tokenService.setQuery(query);
		transactionService.setQuery(query);
		userService.setQuery(query);
	}
}

/**
 * Auto-resolves entity parameters in args object
 * Handles chain_id, chain_ids, and id (for chain context) parameters
 * Converts human-friendly names to DeBank IDs (e.g., "Ethereum" → "eth")
 */
async function autoResolveEntities(
	args: Record<string, unknown>,
): Promise<void> {
	await resolveEntities(args);
}

/**
 * Tool definitions for FastMCP (MCP Server usage)
 * These are exported as plain objects with Zod schemas for FastMCP compatibility
 */
export const debankTools = [
	// Chain Endpoints
	{
		name: "debank_get_supported_chain_list",
		description:
			"Retrieve a comprehensive list of all blockchain chains supported by the DeBank API. Returns information about each chain including their IDs, names, logo URLs, native token IDs, wrapped token IDs, and pre-execution support status. Use this to discover available chains before calling other chain-specific endpoints.",
		parameters: z.object({
			_userQuery: z.string().optional(),
		}),
		execute: async (args: Record<string, unknown>) => {
			setQueryFromArgs(args);
			return await chainService.getSupportedChainList();
		},
	},
	{
		name: "debank_get_chain",
		description:
			"Retrieve detailed information about a specific blockchain chain supported by DeBank. Returns chain details including ID, name, logo URL, native token ID, wrapped token ID, and whether it supports pre-execution of transactions. **AUTO-RESOLUTION ENABLED:** Pass chain names as users mention them (e.g., 'Ethereum', 'BSC', 'Binance Smart Chain') - automatically resolved to chain IDs ('eth', 'bsc').",
		parameters: z.object({
			id: z
				.string()
				.describe(
					"Chain name or ID - auto-resolved (e.g., 'Ethereum'→'eth', 'BSC'→'bsc', 'Polygon'→'matic', 'Arbitrum'→'arb'). Existing chain IDs like 'eth', 'bsc' also work.",
				),
			_userQuery: z.string().optional(),
		}),
		execute: async (args: { id: string; _userQuery?: string }) => {
			if (args.id && needsResolution(args.id, "chain")) {
				const resolved = await resolveChain(args.id);
				if (resolved) {
					args.id = resolved;
				}
			}
			setQueryFromArgs(args);
			return await chainService.getChain(args);
		},
	},

	// Protocol Endpoints
	{
		name: "debank_get_all_protocols_of_supported_chains",
		description:
			"Retrieve a list of all DeFi protocols across specified or all supported blockchain chains. Returns essential information about each protocol including ID, chain ID, name, logo URL, site URL, portfolio support status, and TVL. Returns top 20 protocols by default. Filter by specific chains using chain_ids parameter. **AUTO-RESOLUTION ENABLED:** Pass chain names as users mention them (e.g., 'Ethereum, BSC, Polygon') - automatically resolved to chain IDs ('eth,bsc,matic').",
		parameters: z.object({
			chain_ids: z
				.string()
				.optional()
				.describe(
					"Comma-separated chain names or IDs - auto-resolved (e.g., 'Ethereum, BSC'→'eth,bsc', 'Polygon'→'matic'). If omitted, returns protocols across all supported chains. Existing chain IDs like 'eth,bsc,matic' also work.",
				),
			_userQuery: z.string().optional(),
		}),
		execute: async (args: { chain_ids?: string; _userQuery?: string }) => {
			await autoResolveEntities(args);
			setQueryFromArgs(args);
			return await protocolService.getAllProtocolsOfSupportedChains(args);
		},
	},
	{
		name: "debank_get_protocol_information",
		description:
			"Fetch detailed information about a specific DeFi protocol. Returns protocol details including ID, associated chain, name, logo URL, site URL, portfolio support status, and total value locked (TVL). Useful for analyzing individual protocols across different chains.",
		parameters: z.object({
			id: z
				.string()
				.describe(
					"The unique identifier of the protocol (e.g., 'bsc_pancakeswap' for PancakeSwap on BSC, 'uniswap', 'aave', 'curve'). Use debank_get_all_protocols_of_supported_chains to discover protocol IDs.",
				),
			_userQuery: z.string().optional(),
		}),
		execute: async (args: { id: string; _userQuery?: string }) => {
			setQueryFromArgs(args);
			return await protocolService.getProtocolInformation(args);
		},
	},

	{
		name: "debank_get_top_holders_of_protocol",
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
			_userQuery: z.string().optional(),
		}),
		execute: async (args: {
			id: string;
			start?: number;
			limit?: number;
			_userQuery?: string;
		}) => {
			setQueryFromArgs(args);
			return await protocolService.getTopHoldersOfProtocol(args);
		},
	},

	// Pool Endpoints
	{
		name: "debank_get_pool_information",
		description:
			"Retrieve detailed information about a specific liquidity pool. Returns pool details including ID, chain, protocol ID, contract IDs, name, USD value of deposited assets, total user count, and count of valuable users (>$100 USD value). Essential for analyzing specific pools for investment or research. **AUTO-RESOLUTION ENABLED:** Pass chain names as users mention them (e.g., 'Ethereum', 'BSC', 'Binance Smart Chain') - automatically resolved to chain IDs ('eth', 'bsc').",
		parameters: z.object({
			id: z
				.string()
				.describe(
					"The unique identifier of the pool (typically a contract address, e.g., '0x00000000219ab540356cbb839cbe05303d7705fa').",
				),
			chain_id: z
				.string()
				.describe(
					"Chain name or ID - auto-resolved (e.g., 'Ethereum'→'eth', 'BSC'→'bsc', 'Polygon'→'matic', 'Arbitrum'→'arb'). Existing chain IDs like 'eth', 'bsc' also work.",
				),
			_userQuery: z.string().optional(),
		}),
		execute: async (args: {
			id: string;
			chain_id: string;
			_userQuery?: string;
		}) => {
			await autoResolveEntities(args);
			setQueryFromArgs(args);
			return await protocolService.getPoolInformation(args);
		},
	},

	// Token Endpoints
	{
		name: "debank_get_token_information",
		description:
			"Fetch comprehensive details about a specific token on a blockchain. Returns token information including contract address, chain, name, symbol, decimals, logo URL, associated protocol ID, USD price, verification status, and deployment timestamp. Essential for token analysis and display. **AUTO-RESOLUTION ENABLED:** Pass chain names as users mention them (e.g., 'Ethereum', 'BSC', 'Binance Smart Chain') - automatically resolved to chain IDs ('eth', 'bsc'). **WRAPPED TOKEN RESOLUTION:** Keywords like 'WETH', 'wrapped native', or 'native token' automatically resolve to the chain's wrapped token address.",
		parameters: z.object({
			chain_id: z
				.string()
				.describe(
					"Chain name or ID - auto-resolved (e.g., 'Ethereum'→'eth', 'BSC'→'bsc', 'Polygon'→'matic', 'Arbitrum'→'arb'). Existing chain IDs like 'eth', 'bsc' also work.",
				),
			id: z
				.string()
				.describe(
					"Token contract address, native token ID, or wrapped token keyword. Auto-resolves: 'WETH'→WETH address, 'wrapped native'→chain's wrapped token, 'native token'→chain's wrapped token. Examples: 'WETH', 'wrapped ETH', 'native token', '0xdac17f958d2ee523a2206206994597c13d831ec7' (USDT).",
				),
			_userQuery: z.string().optional(),
		}),
		execute: async (args: {
			chain_id: string;
			id: string;
			_userQuery?: string;
		}) => {
			await autoResolveEntities(args);
			setQueryFromArgs(args);
			return await tokenService.getTokenInformation(args);
		},
	},

	{
		name: "debank_get_list_token_information",
		description:
			"Retrieve detailed information for multiple tokens at once on a specific chain. Returns an array of token objects with comprehensive details. Useful for bulk token data retrieval, with support for up to 100 token addresses per request. **AUTO-RESOLUTION ENABLED:** Pass chain names as users mention them (e.g., 'Ethereum', 'BSC', 'Binance Smart Chain') - automatically resolved to chain IDs ('eth', 'bsc').",
		parameters: z.object({
			chain_id: z
				.string()
				.describe(
					"Chain name or ID - auto-resolved (e.g., 'Ethereum'→'eth', 'BSC'→'bsc', 'Polygon'→'matic', 'Arbitrum'→'arb'). Existing chain IDs like 'eth', 'bsc' also work.",
				),
			ids: z
				.string()
				.describe(
					"Comma-separated list of token addresses (up to 100). Example: '0xdac17f958d2ee523a2206206994597c13d831ec7,0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'",
				),
			_userQuery: z.string().optional(),
		}),
		execute: async (args: {
			chain_id: string;
			ids: string;
			_userQuery?: string;
		}) => {
			await autoResolveEntities(args);
			setQueryFromArgs(args);
			return await tokenService.getListTokenInformation(args);
		},
	},

	{
		name: "debank_get_top_holders_of_token",
		description:
			"Fetch the top holders of a specified token, showing the largest token holders ranked by their holdings. Supports both contract addresses and native token IDs. Useful for analyzing token distribution and ownership concentration. Supports pagination for detailed analysis. **AUTO-RESOLUTION ENABLED:** Pass chain names as users mention them (e.g., 'Ethereum', 'BSC', 'Binance Smart Chain') - automatically resolved to chain IDs ('eth', 'bsc'). **WRAPPED TOKEN RESOLUTION:** Keywords like 'WETH', 'wrapped native', or 'native token' automatically resolve to the chain's wrapped token address.",
		parameters: z.object({
			id: z
				.string()
				.describe(
					"Token contract address, native token ID, or wrapped token keyword. Auto-resolves: 'WETH'→WETH address, 'wrapped native'→chain's wrapped token, 'native token'→chain's wrapped token. Examples: 'WETH', 'wrapped BNB', '0xdac17f958d2ee523a2206206994597c13d831ec7'.",
				),
			chain_id: z
				.string()
				.describe(
					"Chain name or ID - auto-resolved (e.g., 'Ethereum'→'eth', 'BSC'→'bsc', 'Polygon'→'matic', 'Arbitrum'→'arb'). Existing chain IDs like 'eth', 'bsc' also work.",
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
			_userQuery: z.string().optional(),
		}),
		execute: async (args: {
			id: string;
			chain_id: string;
			start?: number;
			limit?: number;
		}) => {
			await autoResolveEntities(args);
			setQueryFromArgs(args);
			return await tokenService.getTopHoldersOfToken(args);
		},
	},

	{
		name: "debank_get_token_history_price",
		description:
			"Retrieve the historical price of a specified token for a given date. Essential for financial analysis, historical comparison, and tracking price movements over time. Returns price data for the UTC time zone on the specified date. **AUTO-RESOLUTION ENABLED:** Pass chain names as users mention them (e.g., 'Ethereum', 'BSC', 'Binance Smart Chain') - automatically resolved to chain IDs ('eth', 'bsc'). **WRAPPED TOKEN RESOLUTION:** Keywords like 'WETH', 'wrapped native', or 'native token' automatically resolve to the chain's wrapped token address.",
		parameters: z.object({
			id: z
				.string()
				.describe(
					"Token contract address, native token ID, or wrapped token keyword. Auto-resolves: 'WETH'→WETH address, 'wrapped native'→chain's wrapped token, 'native token'→chain's wrapped token. Examples: 'WETH', 'wrapped MATIC', '0xdac17f958d2ee523a2206206994597c13d831ec7'.",
				),
			chain_id: z
				.string()
				.describe(
					"Chain name or ID - auto-resolved (e.g., 'Ethereum'→'eth', 'BSC'→'bsc', 'Polygon'→'matic', 'Arbitrum'→'arb'). Existing chain IDs like 'eth', 'bsc' also work.",
				),
			date_at: z
				.string()
				.describe(
					"The date for historical price data in UTC time zone. Format: YYYY-MM-DD (e.g., '2023-05-18').",
				),
			_userQuery: z.string().optional(),
		}),
		execute: async (args: {
			id: string;
			chain_id: string;
			date_at: string;
			_userQuery?: string;
		}) => {
			await autoResolveEntities(args);
			setQueryFromArgs(args);
			return await tokenService.getTokenHistoryPrice(args);
		},
	},

	// User Endpoints
	{
		name: "debank_get_user_used_chain_list",
		description:
			"Retrieve a list of blockchain chains that a specific user has interacted with. Returns details about each chain including ID, name, logo URL, native token ID, wrapped token ID, and the birth time of the user's address on each chain.",
		parameters: z.object({
			id: z.string().describe("The user's wallet address."),
			_userQuery: z.string().optional(),
		}),
		execute: async (args: { id: string; _userQuery?: string }) => {
			setQueryFromArgs(args);
			return await userService.getUserUsedChainList(args);
		},
	},

	{
		name: "debank_get_user_chain_balance",
		description:
			"Fetch the current balance of a user's account on a specified blockchain chain. Returns the balance in USD value, providing a snapshot of the user's holdings on that chain. **AUTO-RESOLUTION ENABLED:** Pass chain names as users mention them (e.g., 'Ethereum', 'BSC', 'Binance Smart Chain') - automatically resolved to chain IDs ('eth', 'bsc').",
		parameters: z.object({
			chain_id: z
				.string()
				.describe(
					"Chain name or ID - auto-resolved (e.g., 'Ethereum'→'eth', 'BSC'→'bsc', 'Polygon'→'matic', 'Arbitrum'→'arb'). Existing chain IDs like 'eth', 'bsc' also work.",
				),
			id: z.string().describe("The user's wallet address."),
			_userQuery: z.string().optional(),
		}),
		execute: async (args: {
			chain_id: string;
			id: string;
			_userQuery?: string;
		}) => {
			await autoResolveEntities(args);
			setQueryFromArgs(args);
			return await userService.getUserChainBalance(args);
		},
	},

	{
		name: "debank_get_user_protocol",
		description:
			"Get detailed information about a user's positions within a specified DeFi protocol. Returns protocol details and the user's portfolio items including assets, debts, and rewards in that protocol.",
		parameters: z.object({
			protocol_id: z
				.string()
				.describe(
					"The protocol ID (e.g., 'bsc_pancakeswap', 'uniswap', 'aave')Use debank_get_all_protocols_of_supported_chains to discover protocol IDs..",
				),
			id: z.string().describe("The user's wallet address."),
			_userQuery: z.string().optional(),
		}),
		execute: async (args: {
			protocol_id: string;
			id: string;
			_userQuery?: string;
		}) => {
			setQueryFromArgs(args);
			return await userService.getUserProtocol(args);
		},
	},

	{
		name: "debank_get_user_complex_protocol_list",
		description:
			"Retrieve detailed portfolios of a user on a specific chain across multiple protocols. Returns comprehensive information about the user's engagements including protocol details and portfolio items with assets, debts, and positions. **AUTO-RESOLUTION ENABLED:** Pass chain names as users mention them (e.g., 'Ethereum', 'BSC', 'Binance Smart Chain') - automatically resolved to chain IDs ('eth', 'bsc').",
		parameters: z.object({
			chain_id: z
				.string()
				.describe(
					"Chain name or ID - auto-resolved (e.g., 'Ethereum'→'eth', 'BSC'→'bsc', 'Polygon'→'matic', 'Arbitrum'→'arb'). Existing chain IDs like 'eth', 'bsc' also work.",
				),
			id: z.string().describe("The user's wallet address."),
			_userQuery: z.string().optional(),
		}),
		execute: async (args: {
			chain_id: string;
			id: string;
			_userQuery?: string;
		}) => {
			await autoResolveEntities(args);
			setQueryFromArgs(args);
			return await userService.getUserComplexProtocolList(args);
		},
	},

	{
		name: "debank_get_user_all_complex_protocol_list",
		description:
			"Retrieve a user's detailed portfolios across all supported chains within multiple protocols. Provides a comprehensive overview of investments and positions across the entire DeFi ecosystem. Can be filtered by specific chains. **AUTO-RESOLUTION ENABLED:** Pass chain names as users mention them (e.g., 'Ethereum, BSC, Polygon') - automatically resolved to chain IDs ('eth,bsc,matic').",
		parameters: z.object({
			id: z.string().describe("The user's wallet address."),
			chain_ids: z
				.string()
				.optional()
				.describe(
					"Comma-separated chain names or IDs - auto-resolved (e.g., 'Ethereum, BSC'→'eth,bsc', 'Polygon'→'matic'). If omitted, includes all supported chains. Existing chain IDs like 'eth,bsc,matic' also work.",
				),
			_userQuery: z.string().optional(),
		}),
		execute: async (args: {
			id: string;
			chain_ids?: string;
			_userQuery?: string;
		}) => {
			await autoResolveEntities(args);
			setQueryFromArgs(args);
			return await userService.getUserAllComplexProtocolList(args);
		},
	},

	{
		name: "debank_get_user_all_simple_protocol_list",
		description:
			"Fetch a user's balances in protocols across all supported chains. Returns simplified protocol information including TVL and basic details. Useful for getting a quick overview of a user's protocol engagements. **AUTO-RESOLUTION ENABLED:** Pass chain names as users mention them (e.g., 'Ethereum, BSC, Polygon') - automatically resolved to chain IDs ('eth,bsc,matic').",
		parameters: z.object({
			id: z.string().describe("The user's wallet address."),
			chain_ids: z
				.string()
				.optional()
				.describe(
					"Comma-separated chain names or IDs - auto-resolved (e.g., 'Ethereum, BSC, Polygon'→'eth,bsc,matic', 'Arbitrum'→'arb'). If omitted, includes all supported chains. Existing chain IDs like 'eth,bsc,polygon' also work.",
				),
			_userQuery: z.string().optional(),
		}),
		execute: async (args: {
			id: string;
			chain_ids?: string;
			_userQuery?: string;
		}) => {
			await autoResolveEntities(args);
			setQueryFromArgs(args);
			return await userService.getUserAllSimpleProtocolList(args);
		},
	},

	{
		name: "debank_get_user_token_balance",
		description:
			"Retrieve a user's balance for a specific token. Returns detailed token information including name, symbol, decimals, USD price, and the user's balance amount. **AUTO-RESOLUTION ENABLED:** Pass chain names as users mention them (e.g., 'Ethereum', 'BSC', 'Binance Smart Chain') - automatically resolved to chain IDs ('eth', 'bsc'). **WRAPPED TOKEN RESOLUTION:** Keywords like 'WETH', 'wrapped native', or 'native token' automatically resolve to the chain's wrapped token address.",
		parameters: z.object({
			chain_id: z
				.string()
				.describe(
					"Chain name or ID - auto-resolved (e.g., 'Ethereum'→'eth', 'BSC'→'bsc', 'Polygon'→'matic', 'Arbitrum'→'arb'). Existing chain IDs like 'eth', 'bsc' also work.",
				),
			id: z.string().describe("The user's wallet address."),
			token_id: z
				.string()
				.describe(
					"Token contract address, native token ID, or wrapped token keyword. Auto-resolves: 'WETH'→WETH address, 'wrapped native'→chain's wrapped token, 'native token'→chain's wrapped token. Examples: 'WETH', 'wrapped token', '0xdac17f958d2ee523a2206206994597c13d831ec7'.",
				),
			_userQuery: z.string().optional(),
		}),
		execute: async (args: {
			chain_id: string;
			id: string;
			token_id: string;
			_userQuery?: string;
		}) => {
			await autoResolveEntities(args);
			setQueryFromArgs(args);
			return await userService.getUserTokenBalance(args);
		},
	},

	{
		name: "debank_get_user_token_list",
		description:
			"Retrieve a list of tokens held by a user on a specific chain. Returns token details including symbol, decimals, USD price, and balance amounts. Can filter for core/verified tokens or include all tokens. **AUTO-RESOLUTION ENABLED:** Pass chain names as users mention them (e.g., 'Ethereum', 'BSC', 'Binance Smart Chain') - automatically resolved to chain IDs ('eth', 'bsc').",
		parameters: z.object({
			id: z.string().describe("The user's wallet address."),
			chain_id: z
				.string()
				.describe(
					"Chain name or ID - auto-resolved (e.g., 'Ethereum'→'eth', 'BSC'→'bsc', 'Polygon'→'matic', 'Arbitrum'→'arb'). Existing chain IDs like 'eth', 'bsc' also work.",
				),
			is_all: z
				.boolean()
				.optional()
				.describe(
					"If true, returns all tokens including non-core tokens. Default is true.",
				),
			_userQuery: z.string().optional(),
		}),
		execute: async (args: {
			id: string;
			chain_id: string;
			is_all?: boolean;
			_userQuery?: string;
		}) => {
			await autoResolveEntities(args);
			setQueryFromArgs(args);
			return await userService.getUserTokenList(args);
		},
	},

	{
		name: "debank_get_user_all_token_list",
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
			_userQuery: z.string().optional(),
		}),
		execute: async (args: {
			id: string;
			is_all?: boolean;
			_userQuery?: string;
		}) => {
			setQueryFromArgs(args);
			return await userService.getUserAllTokenList(args);
		},
	},

	{
		name: "debank_get_user_nft_list",
		description:
			"Fetch a list of NFTs owned by a user on a specific chain. Returns NFT details including contract ID, name, description, content type, and attributes. Can filter for verified collections only. **AUTO-RESOLUTION ENABLED:** Pass chain names as users mention them (e.g., 'Ethereum', 'BSC', 'Binance Smart Chain') - automatically resolved to chain IDs ('eth', 'bsc').",
		parameters: z.object({
			id: z.string().describe("The user's wallet address."),
			chain_id: z
				.string()
				.describe(
					"Chain name or ID - auto-resolved (e.g., 'Ethereum'→'eth', 'BSC'→'bsc', 'Polygon'→'matic', 'Arbitrum'→'arb'). Existing chain IDs like 'eth', 'bsc' also work.",
				),
			is_all: z
				.boolean()
				.optional()
				.describe(
					"If false, only returns NFTs from verified collections. Default is true.",
				),
			_userQuery: z.string().optional(),
		}),
		execute: async (args: {
			id: string;
			chain_id: string;
			is_all?: boolean;
			_userQuery?: string;
		}) => {
			await autoResolveEntities(args);
			setQueryFromArgs(args);
			return await userService.getUserNftList(args);
		},
	},

	{
		name: "debank_get_user_all_nft_list",
		description:
			"Retrieve a user's NFT holdings across all supported chains. Provides an aggregate list of NFTs held by the user with details including contract ID, name, and content type. Can be filtered by specific chains. **AUTO-RESOLUTION ENABLED:** Pass chain names as users mention them (e.g., 'Ethereum, BSC, Polygon') - automatically resolved to chain IDs ('eth,bsc,matic').",
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
					"Comma-separated chain names or IDs - auto-resolved (e.g., 'Ethereum, BSC, Polygon'→'eth,bsc,matic', 'Arbitrum'→'arb'). If omitted, includes all supported chains. Existing chain IDs like 'eth,bsc,polygon' also work.",
				),
			_userQuery: z.string().optional(),
		}),
		execute: async (args: {
			id: string;
			is_all?: boolean;
			chain_ids?: string;
		}) => {
			await autoResolveEntities(args);
			setQueryFromArgs(args);
			return await userService.getUserAllNftList(args);
		},
	},

	{
		name: "debank_get_user_history_list",
		description:
			"Fetch a user's transaction history on a specified chain. Returns a list of past transactions with details including transaction type, tokens involved, values, and timestamps. Supports filtering by token and pagination. **AUTO-RESOLUTION ENABLED:** Pass chain names as users mention them (e.g., 'Ethereum', 'BSC', 'Binance Smart Chain') - automatically resolved to chain IDs ('eth', 'bsc'). **WRAPPED TOKEN RESOLUTION:** Keywords like 'WETH', 'wrapped native', or 'native token' automatically resolve to the chain's wrapped token address.",
		parameters: z.object({
			id: z.string().describe("The user's wallet address."),
			chain_id: z
				.string()
				.describe(
					"Chain name or ID - auto-resolved (e.g., 'Ethereum'→'eth', 'BSC'→'bsc', 'Polygon'→'matic', 'Arbitrum'→'arb'). Existing chain IDs like 'eth', 'bsc' also work.",
				),
			token_id: z
				.string()
				.optional()
				.describe(
					"Optional token contract address, native token ID, or wrapped token keyword to filter history. Auto-resolves: 'WETH'→WETH address, 'wrapped native'→chain's wrapped token, 'native token'→chain's wrapped token.",
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
			_userQuery: z.string().optional(),
		}),
		execute: async (args: {
			id: string;
			chain_id: string;
			token_id?: string;
			start_time?: number;
			page_count?: number;
		}) => {
			await autoResolveEntities(args);
			setQueryFromArgs(args);
			return await userService.getUserHistoryList(args);
		},
	},

	{
		name: "debank_get_user_all_history_list",
		description:
			"Retrieve a user's transaction history across all supported chains. Provides a comprehensive overview of DeFi activities across the entire blockchain ecosystem. Supports pagination and chain filtering. **AUTO-RESOLUTION ENABLED:** Pass chain names as users mention them (e.g., 'Ethereum, BSC, Polygon') - automatically resolved to chain IDs ('eth,bsc,matic').",
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
					"Comma-separated chain names or IDs - auto-resolved (e.g., 'Ethereum, BSC, Polygon'→'eth,bsc,matic', 'Arbitrum'→'arb'). If omitted, includes all supported chains. Existing chain IDs like 'eth,bsc,polygon' also work.",
				),
			_userQuery: z.string().optional(),
		}),
		execute: async (args: {
			id: string;
			start_time?: number;
			page_count?: number;
			chain_ids?: string;
		}) => {
			await autoResolveEntities(args);
			setQueryFromArgs(args);
			return await userService.getUserAllHistoryList(args);
		},
	},

	{
		name: "debank_get_user_token_authorized_list",
		description:
			"Fetch a list of tokens for which a user has granted spending approvals on a specified chain. Returns details about each approval including amount, spender address, and associated protocol information. Useful for security audits. **AUTO-RESOLUTION ENABLED:** Pass chain names as users mention them (e.g., 'Ethereum', 'BSC', 'Binance Smart Chain') - automatically resolved to chain IDs ('eth', 'bsc').",
		parameters: z.object({
			id: z.string().describe("The user's wallet address."),
			chain_id: z
				.string()
				.describe(
					"Chain name or ID - auto-resolved (e.g., 'Ethereum'→'eth', 'BSC'→'bsc', 'Polygon'→'matic', 'Arbitrum'→'arb'). Existing chain IDs like 'eth', 'bsc' also work.",
				),
			_userQuery: z.string().optional(),
		}),
		execute: async (args: {
			id: string;
			chain_id: string;
			_userQuery?: string;
		}) => {
			await autoResolveEntities(args);
			setQueryFromArgs(args);
			return await userService.getUserTokenAuthorizedList(args);
		},
	},

	{
		name: "debank_get_user_nft_authorized_list",
		description:
			"Retrieve a list of NFTs for which a user has given spending permissions on a specified chain. Returns details including contract IDs, names, symbols, spender addresses, and approved amounts for ERC1155 tokens. Important for security reviews. **AUTO-RESOLUTION ENABLED:** Pass chain names as users mention them (e.g., 'Ethereum', 'BSC', 'Binance Smart Chain') - automatically resolved to chain IDs ('eth', 'bsc').",
		parameters: z.object({
			id: z.string().describe("The user's wallet address."),
			chain_id: z
				.string()
				.describe(
					"Chain name or ID - auto-resolved (e.g., 'Ethereum'→'eth', 'BSC'→'bsc', 'Polygon'→'matic', 'Arbitrum'→'arb'). Existing chain IDs like 'eth', 'bsc' also work.",
				),
			_userQuery: z.string().optional(),
		}),
		execute: async (args: {
			id: string;
			chain_id: string;
			_userQuery?: string;
		}) => {
			await autoResolveEntities(args);
			setQueryFromArgs(args);
			return await userService.getUserNftAuthorizedList(args);
		},
	},

	{
		name: "debank_get_user_total_balance",
		description:
			"Retrieve a user's total net assets across all supported chains. Calculates and returns the total USD value of assets including both tokens and protocol positions. Provides a complete snapshot of the user's DeFi portfolio.",
		parameters: z.object({
			id: z.string().describe("The user's wallet address."),
			_userQuery: z.string().optional(),
		}),
		execute: async (args: { id: string; _userQuery?: string }) => {
			setQueryFromArgs(args);
			return await userService.getUserTotalBalance(args);
		},
	},

	{
		name: "debank_get_user_chain_net_curve",
		description:
			"Retrieve a user's 24-hour net asset value curve on a single chain. Shows the changes in total USD value of assets over the last 24 hours, providing insights into portfolio fluctuations on that specific chain. **AUTO-RESOLUTION ENABLED:** Pass chain names as users mention them (e.g., 'Ethereum', 'BSC', 'Binance Smart Chain') - automatically resolved to chain IDs ('eth', 'bsc').",
		parameters: z.object({
			id: z.string().describe("The user's wallet address."),
			chain_id: z
				.string()
				.describe(
					"Chain name or ID - auto-resolved (e.g., 'Ethereum'→'eth', 'BSC'→'bsc', 'Polygon'→'matic', 'Arbitrum'→'arb'). Existing chain IDs like 'eth', 'bsc' also work.",
				),
			_userQuery: z.string().optional(),
		}),
		execute: async (args: {
			id: string;
			chain_id: string;
			_userQuery?: string;
		}) => {
			await autoResolveEntities(args);
			setQueryFromArgs(args);
			return await userService.getUserChainNetCurve(args);
		},
	},

	{
		name: "debank_get_user_total_net_curve",
		description:
			"Retrieve a user's 24-hour net asset value curve across all chains. Provides a comprehensive view of total USD value changes over the last 24 hours, helping track overall portfolio performance. Can be filtered by specific chains. **AUTO-RESOLUTION ENABLED:** Pass chain names as users mention them (e.g., 'Ethereum, BSC, Polygon') - automatically resolved to chain IDs ('eth,bsc,matic').",
		parameters: z.object({
			id: z.string().describe("The user's wallet address."),
			chain_ids: z
				.string()
				.optional()
				.describe(
					"Comma-separated chain names or IDs - auto-resolved (e.g., 'Ethereum, BSC, Polygon'→'eth,bsc,matic', 'Arbitrum'→'arb'). If omitted, includes all supported chains. Existing chain IDs like 'eth,bsc,polygon' also work.",
				),
			_userQuery: z.string().optional(),
		}),
		execute: async (args: {
			id: string;
			chain_ids?: string;
			_userQuery?: string;
		}) => {
			await autoResolveEntities(args);
			setQueryFromArgs(args);
			return await userService.getUserTotalNetCurve(args);
		},
	},

	// Wallet Endpoints
	{
		name: "debank_get_gas_prices",
		description:
			"Fetch current gas prices for different transaction speed levels on a specified chain. Returns prices for slow, normal, and fast transaction speeds with estimated confirmation times. Crucial for transaction cost estimation. **AUTO-RESOLUTION ENABLED:** Pass chain names as users mention them (e.g., 'Ethereum', 'BSC', 'Binance Smart Chain') - automatically resolved to chain IDs ('eth', 'bsc').",
		parameters: z.object({
			chain_id: z
				.string()
				.describe(
					"Chain name or ID - auto-resolved (e.g., 'Ethereum'→'eth', 'BSC'→'bsc', 'Polygon'→'matic', 'Arbitrum'→'arb'). Existing chain IDs like 'eth', 'bsc' also work.",
				),
			_userQuery: z.string().optional(),
		}),
		execute: async (args: { chain_id: string; _userQuery?: string }) => {
			await autoResolveEntities(args);
			setQueryFromArgs(args);
			return await chainService.getGasPrices(args);
		},
	},

	{
		name: "debank_pre_exec_transaction",
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
			_userQuery: z.string().optional(),
		}),
		execute: async (args: {
			tx: string;
			pending_tx_list?: string;
			_userQuery?: string;
		}) => {
			setQueryFromArgs(args);
			return await transactionService.preExecTransaction(args);
		},
	},

	{
		name: "debank_explain_transaction",
		description:
			"Decode and explain a given transaction in human-readable terms. Returns details about function calls, parameters, and actions derived from the transaction data. Supports complex transactions across multiple protocols.",
		parameters: z.object({
			tx: z
				.string()
				.describe(
					"The transaction object as a JSON string to be explained. Must include transaction data field.",
				),
			_userQuery: z.string().optional(),
		}),
		execute: async (args: { tx: string; _userQuery?: string }) => {
			await autoResolveEntities(args);
			setQueryFromArgs(args);
			return await transactionService.explainTransaction(args);
		},
	},
] as const;

/**
 * Helper to extract user query from context.userContent
 * The userContent contains the original user message that started the invocation
 */
function extractQueryFromContext(context?: {
	userContent?: { parts?: Array<{ text?: string }> };
}): string | null {
	if (!context?.userContent?.parts) return null;
	const firstPart = context.userContent.parts[0];
	return firstPart?.text || null;
}

/**
 * Get all DeBank tools as ADK BaseTool instances
 * Use this function when integrating with ADK agents (direct import, not MCP)
 */
export const getDebankTools = (): BaseTool[] => {
	return debankTools.map((tool) =>
		createTool({
			name: tool.name,
			description: tool.description,
			schema: tool.parameters as z.ZodSchema<Record<string, unknown>>,
			fn: async (args, context) => {
				// Extract and inject user query from context.userContent into all services
				const query = extractQueryFromContext(context);
				logger.info(
					`Debank Tool ${tool.name} - extracted user query: ${query}`,
				);
				if (query) {
					chainService.setQuery(query);
					protocolService.setQuery(query);
					tokenService.setQuery(query);
					transactionService.setQuery(query);
					userService.setQuery(query);
				}
				return await tool.execute(args as never);
			},
		}),
	);
};
