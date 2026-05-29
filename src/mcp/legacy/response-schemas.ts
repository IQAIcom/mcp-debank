// src/mcp/legacy/response-schemas.ts
//
// Zod response schemas for the tool-metadata entries. Derived from the
// TypeScript types in src/types.ts. These are agent-facing context — accurate
// enough for jq-filter construction, not intended as runtime validators.

import { z } from "zod";

// ============================================================================
// Shared token sub-schema (used in several response shapes)
// ============================================================================

const TokenInfoSchema = z.object({
	id: z.string().describe("Token contract address or native token ID."),
	chain: z.string().describe("Chain ID (e.g. 'eth', 'bsc')."),
	name: z.string(),
	symbol: z.string(),
	display_symbol: z.string().nullable(),
	optimized_symbol: z.string(),
	decimals: z.number().int(),
	logo_url: z.string(),
	protocol_id: z.string(),
	price: z.number().describe("Current USD price."),
	is_verified: z.boolean(),
	is_core: z.boolean(),
	is_wallet: z.boolean(),
	time_at: z.number().describe("Unix timestamp when token was deployed."),
	amount: z.number().describe("Balance amount in token units."),
});

// ============================================================================
// Chain schemas
// ============================================================================

export const ChainInfoSchema = z.object({
	id: z.string().describe("DeBank chain identifier (e.g. 'eth', 'bsc')."),
	community_id: z.number().int().describe("Numeric chain ID (EIP-155)."),
	name: z.string(),
	logo_url: z.string(),
	native_token_id: z.string().describe("Native token contract address."),
	wrapped_token_id: z
		.string()
		.describe("Wrapped native token contract address (e.g. WETH)."),
	is_support_pre_exec: z
		.boolean()
		.describe("Whether pre-execution simulation is supported."),
});

/** debank.chain.getSupportedChainList */
export const SupportedChainListSchema = z.array(ChainInfoSchema);

/** debank.chain.getChain */
export const GetChainSchema = ChainInfoSchema;

/** debank.chain.getGasPrices — returns a single object with slow/normal/fast tiers */
export const GasMarketSchema = z.object({
	slow: z.object({
		price: z.number().describe("Gas price in wei."),
		estimated_seconds: z
			.number()
			.describe("Estimated confirmation time in seconds."),
	}),
	normal: z.object({
		price: z.number().describe("Gas price in wei."),
		estimated_seconds: z.number(),
	}),
	fast: z.object({
		price: z.number().describe("Gas price in wei."),
		estimated_seconds: z.number(),
	}),
});

// ============================================================================
// Protocol schemas
// ============================================================================

export const ProtocolInfoSchema = z.object({
	id: z.string().describe("Protocol identifier (e.g. 'uniswap', 'aave')."),
	chain: z.string().describe("Chain ID the protocol lives on."),
	name: z.string(),
	logo_url: z.string(),
	site_url: z.string(),
	has_supported_portfolio: z
		.boolean()
		.describe("Whether the protocol has portfolio position tracking."),
	tvl: z.number().describe("Total value locked in USD."),
});

/** debank.protocol.getAllProtocolsOfSupportedChains */
export const AllProtocolsSchema = z.array(ProtocolInfoSchema);

/** debank.protocol.getProtocolList — same shape as the cross-chain variant. */
export const ProtocolListSchema = z.array(ProtocolInfoSchema);

/** debank.protocol.getProtocolInformation */
export const ProtocolInformationSchema = ProtocolInfoSchema;

const AppProtocolInfoSchema = z.object({
	id: z.string().describe("App-protocol identifier."),
	name: z.string(),
	site_url: z.string(),
	logo_url: z.string(),
	has_supported_portfolio: z.boolean(),
});

/** debank.protocol.getAppProtocolList */
export const AppProtocolListSchema = z.array(AppProtocolInfoSchema);

export const ProtocolHolderSchema = z.object({
	address: z.string().describe("Wallet address of the holder."),
	value: z.number().describe("USD value of holdings."),
});

/** debank.protocol.getTopHoldersOfProtocol */
export const TopHoldersOfProtocolSchema = z.array(ProtocolHolderSchema);

export const PoolInfoSchema = z.object({
	id: z.string().describe("Pool identifier (usually a contract address)."),
	chain: z.string(),
	protocol_id: z.string(),
	contract_id: z.array(z.string()),
	name: z.string(),
	usd_value: z.number().describe("Total USD value deposited in the pool."),
	user_count: z.number().int(),
	valuable_user_count: z
		.number()
		.int()
		.describe("Users with > $100 USD value in the pool."),
});

/** debank.protocol.getPoolInformation */
export const PoolInformationSchema = PoolInfoSchema;

// ============================================================================
// Token schemas
// ============================================================================

/** debank.token.getTokenInformation */
export const TokenInformationSchema = TokenInfoSchema;

/** debank.token.getListTokenInformation */
export const ListTokenInformationSchema = z.array(TokenInfoSchema);

export const TokenHolderSchema = z.object({
	address: z.string().describe("Wallet address of the holder."),
	amount: z.number().describe("Token amount held."),
	usd_value: z.number().describe("USD value of the holding."),
});

/** debank.token.getTopHoldersOfToken */
export const TopHoldersOfTokenSchema = z.array(TokenHolderSchema);

export const TokenHistoricalPriceSchema = z.object({
	id: z.string(),
	chain: z.string(),
	price: z.number().describe("Historical USD price on the requested date."),
	date: z.string().describe("Date string matching the requested date_at."),
});

/** debank.token.getTokenHistoryPrice */
export const TokenHistoryPriceSchema = TokenHistoricalPriceSchema;

// ============================================================================
// User schemas
// ============================================================================

/**
 * getUserUsedChainListRaw returns a minimal shape — only chain_id per entry,
 * not the full ChainInfo object.
 */
export const UserUsedChainListSchema = z.array(
	z.object({
		chain_id: z.string().describe("DeBank chain ID the user has used."),
	}),
);

/** debank.user.getUserChainBalance */
export const UserChainBalanceSchema = z.object({
	usd_value: z
		.number()
		.describe("Total USD value of the user's assets on this chain."),
});

const PortfolioItemSchema = z.object({
	stats: z.object({
		asset_usd_value: z.number(),
		debt_usd_value: z.number(),
		net_usd_value: z.number(),
	}),
	asset_token_list: z.array(TokenInfoSchema),
	asset_dict: z.record(z.string(), z.number()),
	detail: z.object({
		supply_token_list: z.array(TokenInfoSchema),
		borrow_token_list: z.array(TokenInfoSchema).optional(),
		reward_token_list: z.array(TokenInfoSchema).optional(),
	}),
	detail_types: z.array(z.string()),
	name: z.string(),
	pool: z.object({
		id: z.string(),
		chain: z.string(),
		project_id: z.string(),
		adapter_id: z.string(),
		controller: z.string(),
		index: z.string().nullable(),
		time_at: z.number().nullable(),
	}),
	proxy_detail: z.record(z.string(), z.unknown()),
});

const UserProtocolPositionSchema = z.object({
	id: z.string(),
	chain: z.string(),
	name: z.string(),
	logo_url: z.string(),
	site_url: z.string(),
	has_supported_portfolio: z.boolean(),
	portfolio_item_list: z.array(PortfolioItemSchema),
});

/** debank.user.getUserProtocol */
export const UserProtocolSchema = UserProtocolPositionSchema;

/** debank.user.getUserComplexProtocolList */
export const UserComplexProtocolListSchema = z.array(
	UserProtocolPositionSchema,
);

/** debank.user.getUserAllComplexProtocolList */
export const UserAllComplexProtocolListSchema = z.array(
	UserProtocolPositionSchema,
);

/** debank.user.getUserAllSimpleProtocolList */
export const UserAllSimpleProtocolListSchema = z.array(
	UserProtocolPositionSchema,
);

const SimpleProtocolPositionSchema = z.object({
	id: z.string(),
	chain: z.string(),
	name: z.string(),
	site_url: z.string(),
	logo_url: z.string(),
	has_supported_portfolio: z.boolean(),
	tvl: z.number().describe("Total value locked in USD."),
	net_usd_value: z
		.number()
		.describe("User's net USD position in the protocol."),
	asset_usd_value: z.number(),
	debt_usd_value: z.number(),
});

/** debank.user.getUserSimpleProtocolList — per-chain aggregates (no portfolio items). */
export const UserSimpleProtocolListSchema = z.array(
	SimpleProtocolPositionSchema,
);

const AppProtocolPositionSchema = z.object({
	id: z.string(),
	name: z.string(),
	site_url: z.string(),
	logo_url: z.string(),
	has_supported_portfolio: z.boolean(),
	portfolio_item_list: z.array(PortfolioItemSchema),
});

/** debank.user.getUserComplexAppList */
export const UserComplexAppListSchema = z.array(AppProtocolPositionSchema);

const UserTokenBalanceSchema = z.object({
	id: z.string(),
	chain: z.string(),
	name: z.string(),
	symbol: z.string(),
	display_symbol: z.string().nullable(),
	optimized_symbol: z.string(),
	decimals: z.number().int(),
	logo_url: z.string(),
	protocol_id: z.string(),
	price: z.number(),
	is_verified: z.boolean(),
	is_core: z.boolean(),
	is_wallet: z.boolean(),
	time_at: z.number(),
	amount: z.number(),
	raw_amount: z.number(),
	raw_amount_hex_str: z.string(),
});

/** debank.user.getUserTokenBalance */
export const UserTokenBalanceResponseSchema = UserTokenBalanceSchema;

/** debank.user.getUserTokenList */
export const UserTokenListSchema = z.array(UserTokenBalanceSchema);

/** debank.user.getUserAllTokenList */
export const UserAllTokenListSchema = z.array(UserTokenBalanceSchema);

const UserNFTSchema = z.object({
	id: z.string(),
	contract_id: z.string(),
	inner_id: z.string(),
	chain: z.string(),
	name: z.string(),
	description: z.string(),
	content_type: z.string(),
	content: z.string(),
	thumbnail_url: z.string(),
	total_supply: z.number(),
	attributes: z.array(
		z.object({
			trait_type: z.string(),
			value: z.string(),
		}),
	),
});

/** debank.user.getUserNftList */
export const UserNftListSchema = z.array(UserNFTSchema);

/** debank.user.getUserAllNftList */
export const UserAllNftListSchema = z.array(UserNFTSchema);

const UserHistoryItemSchema = z.object({
	id: z.string(),
	chain: z.string(),
	name: z.string().describe("Human-readable transaction type/name."),
	project_id: z.string(),
	time_at: z.number().describe("Unix timestamp of the transaction."),
	tx: z.object({
		name: z.string(),
		status: z.number().int().describe("0 = failed, 1 = success."),
		eth_gas_fee: z.number(),
		usd_gas_fee: z.number(),
		value: z.number(),
		from_addr: z.string(),
		to_addr: z.string(),
	}),
	sends: z.array(TokenInfoSchema),
	receives: z.array(TokenInfoSchema),
});

/** debank.user.getUserHistoryList */
export const UserHistoryListSchema = z.array(UserHistoryItemSchema);

/** debank.user.getUserAllHistoryList */
export const UserAllHistoryListSchema = z.array(UserHistoryItemSchema);

const TokenAuthorizationSchema = z.object({
	spender: z.object({
		id: z.string().describe("Spender contract address."),
		protocol: z.object({
			id: z.string(),
			chain: z.string(),
			name: z.string(),
			logo_url: z.string(),
		}),
	}),
	value: z.number().describe("Approved token amount."),
	token: TokenInfoSchema,
});

/** debank.user.getUserTokenAuthorizedList */
export const UserTokenAuthorizedListSchema = z.array(TokenAuthorizationSchema);

const NFTAuthorizationSchema = z.object({
	contract_id: z.string(),
	contract_name: z.string(),
	contract_protocol_id: z.string(),
	contract_protocol_logo_url: z.string(),
	spender: z.string().describe("Spender contract address."),
	spender_protocol_id: z.string(),
	spender_protocol_name: z.string(),
	spender_protocol_logo_url: z.string(),
	is_erc721: z.boolean(),
	amount: z.number().optional().describe("Amount approved (ERC1155 only)."),
	nft_list: z.array(UserNFTSchema).optional(),
});

/** debank.user.getUserNftAuthorizedList */
export const UserNftAuthorizedListSchema = z.array(NFTAuthorizationSchema);

/** debank.user.getUserTotalBalance */
export const UserTotalBalanceSchema = z.object({
	total_usd_value: z
		.number()
		.describe("Total USD value across all chains and positions."),
	chain_list: z.array(
		z.object({
			id: z.string(),
			community_id: z.number().int(),
			name: z.string(),
			logo_url: z.string(),
			native_token_id: z.string(),
			wrapped_token_id: z.string(),
			usd_value: z.number().describe("USD value on this chain."),
		}),
	),
});

const NetCurvePointSchema = z.object({
	timestamp: z.number().describe("Unix timestamp of this data point."),
	usd_value: z.number().describe("USD value at this timestamp."),
});

/** debank.user.getUserChainNetCurve */
export const UserChainNetCurveSchema = z.array(NetCurvePointSchema);

/**
 * debank.user.getUserTotalNetCurve
 * The Raw method returns a wrapper object — NOT a bare array.
 */
export const UserTotalNetCurveSchema = z.object({
	usd_value_list: z
		.array(NetCurvePointSchema)
		.describe("Array of 24-hour data points for total portfolio value."),
});

// ============================================================================
// Transaction schemas
// ============================================================================

/**
 * debank.transaction.preExecTransaction
 * The `balance_change` and `gas` objects are well-structured; `proxy_detail`
 * can vary by protocol so it stays as record<string, unknown>.
 */
export const PreExecResultSchema = z.object({
	balance_change: z.object({
		success: z.boolean(),
		send_token_list: z.array(TokenInfoSchema),
		receive_token_list: z.array(TokenInfoSchema),
		send_nft_list: z.array(UserNFTSchema),
		receive_nft_list: z.array(UserNFTSchema),
		usd_value_change: z.number().describe("Net USD value change."),
	}),
	gas: z.object({
		success: z.boolean(),
		gas_used: z.number(),
		gas_limit: z.number(),
		gas_price: z.number(),
	}),
	pre_exec_version: z.string(),
});

/**
 * debank.transaction.explainTransaction
 * `actions[].data` varies by action type so it stays as record<string, unknown>.
 */
export const TransactionExplanationSchema = z.object({
	action_type: z.string(),
	contract_protocol_name: z.string(),
	contract_protocol_logo_url: z.string(),
	actions: z.array(
		z.object({
			type: z.string(),
			data: z
				.record(z.string(), z.unknown())
				.describe("Action-specific data; shape varies by action type."),
		}),
	),
});
