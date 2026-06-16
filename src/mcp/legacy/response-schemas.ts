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

/** debank.user.getUserTokensAcrossChains — host-side fan-out replacement for the deprecated all_token_list endpoint. */
export const UserTokensAcrossChainsSchema = z.array(UserTokenBalanceSchema);

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

// All of the approval-related schemas use `.passthrough()` so they match the
// open-shape contract on the corresponding TS types (`[key: string]: unknown`).
// Without passthrough, Zod's default strip mode would silently drop new fields
// DeBank adds over time — exactly the kind of drift this PR exists to surface.
const TokenSpenderSchema = z
	.object({
		id: z.string().describe("Spender contract address."),
		value: z
			.number()
			.describe(
				"Approved amount in token units (already scaled by the parent token's `decimals`). Unlimited approvals appear as ~1.16e(77 − decimals).",
			),
		exposure_usd: z
			.number()
			.describe("USD value currently exposed to this spender."),
		last_approve_at: z
			.number()
			.describe("Unix timestamp of the most recent approve transaction."),
		protocol: z
			.object({
				id: z.string(),
				name: z.string(),
				logo_url: z.string(),
				chain: z.string(),
			})
			.nullable()
			.describe(
				"Protocol metadata if the spender is a known DeFi contract; null for raw EOAs / unknown spenders.",
			),
		spend_usd_value: z.number(),
		exposure_usd_value: z.number(),
		approve_user_count: z.number().int(),
		revoke_user_count: z.number().int(),
		is_contract: z.boolean(),
		is_hacked: z.boolean().nullable(),
		is_abandoned: z.boolean().nullable(),
		is_open_source: z.boolean().nullable(),
		risk_level: z
			.string()
			.describe(
				"Spender risk classification (e.g. 'safe', 'caution', 'danger').",
			),
		risk_alert: z.string(),
	})
	.passthrough();

const TokenAuthorizationSchema = z
	.object({
		id: z.string().describe("Token contract address."),
		chain: z.string(),
		name: z.string(),
		symbol: z.string(),
		display_symbol: z.string().nullable(),
		optimized_symbol: z.string(),
		decimals: z.number().int(),
		logo_url: z.string(),
		protocol_id: z.string(),
		price: z.number(),
		price_24h_change: z.number().nullable(),
		credit_score: z.number().nullable(),
		total_supply: z.number().nullable(),
		is_verified: z.boolean(),
		is_core: z.boolean(),
		is_wallet: z.boolean(),
		// Risk-classifier flags are sometimes null while DeBank's classifier
		// catches up — match the nullability of sibling fields like `is_hacked`.
		is_scam: z.boolean().nullable(),
		is_suspicious: z.boolean().nullable(),
		time_at: z.number().nullable(),
		amount: z
			.number()
			.describe("Wallet's holding of this token in token units."),
		raw_amount: z.number(),
		raw_amount_hex_str: z.string(),
		balance: z.number(),
		spenders: z
			.array(TokenSpenderSchema)
			.describe(
				"Every address authorised to spend this token. Filter on `risk_level`, `is_contract`, or the unbounded `value` (decimal-scaled — see TokenSpender.value) to surface risky approvals.",
			),
		sum_exposure_usd: z.number().nullable(),
		exposure_balance: z.number(),
	})
	.passthrough();

/** debank.user.getUserTokenAuthorizedList */
export const UserTokenAuthorizedListSchema = z.array(TokenAuthorizationSchema);

const NFTSpenderSchema = z
	.object({
		id: z.string().describe("Spender contract address."),
		protocol: z
			.object({
				id: z.string(),
				name: z.string(),
				logo_url: z.string(),
				chain: z.string(),
			})
			.nullable(),
		last_approve_at: z.number(),
		risk_level: z.string(),
		risk_alert: z.string(),
		exposure_nft_usd_value: z.number().nullable(),
		spend_nft_usd_value: z.number().nullable(),
		approve_user_count: z.number().int(),
		revoke_user_count: z.number().int(),
	})
	.passthrough();

const NFTApprovalCollectionSchema = z
	.object({
		id: z.string(),
		chain: z.string().optional(),
		chain_id: z.string().optional(),
		name: z.string(),
		description: z.string().nullable(),
		logo_url: z.string(),
		is_verified: z.boolean().nullable(),
		is_suspicious: z.boolean().nullable(),
		is_core: z.boolean(),
		is_scam: z.boolean(),
		floor_price: z.number().nullable(),
		credit_score: z.number().nullable(),
	})
	.passthrough()
	.describe(
		"Collection metadata. DeBank adds many ranking/pricing fields that vary by collection — passthrough preserves them.",
	);

const NFTContractApprovalSchema = z
	.object({
		chain: z.string(),
		contract_name: z.string(),
		contract_id: z.string(),
		is_erc721: z.boolean(),
		collection: NFTApprovalCollectionSchema,
		amount: z
			.string()
			.describe(
				"Approved amount as a string (use BigInt parsing for ERC1155).",
			),
		spender: NFTSpenderSchema,
	})
	.passthrough();

const NFTTokenApprovalSchema = z
	.object({
		id: z.string(),
		contract_id: z.string(),
		inner_id: z.string(),
		chain: z.string(),
		symbol: z.string(),
		name: z.string(),
		description: z.string().nullable(),
		content_type: z.string().nullable(),
		content: z.string(),
		thumbnail_url: z.string(),
		total_supply: z.number(),
		attributes: z.array(z.unknown()),
		detail_url: z.string(),
		collection_id: z.string(),
		is_erc1155: z.boolean(),
		is_erc721: z.boolean(),
		// `z.unknown()` already admits null/undefined; no need for `.nullable()`.
		pay_token: z.unknown(),
		collection: NFTApprovalCollectionSchema,
		contract_name: z.string(),
		amount: z.string(),
		spender: NFTSpenderSchema,
	})
	.passthrough();

/**
 * debank.user.getUserNftAuthorizedList
 * The endpoint returns a wrapper with two distinct arrays:
 *  - `contracts[]`: collection-wide approvals (one entry per collection × spender pair).
 *  - `tokens[]`: per-NFT approvals (one entry per individual token × spender).
 * `total` is a stringified count.
 */
export const UserNftAuthorizedListSchema = z.object({
	total: z
		.string()
		.describe("Total approval count, returned as a string by DeBank."),
	contracts: z.array(NFTContractApprovalSchema),
	tokens: z.array(NFTTokenApprovalSchema),
});

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
 * Returns a bare array of NetCurvePoint, same shape as the per-chain variant.
 * (The old wrapper-around-array typing was incorrect — DeBank's response is
 * a flat `[{ timestamp, usd_value }, …]`.)
 */
export const UserTotalNetCurveSchema = z.array(NetCurvePointSchema);

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
