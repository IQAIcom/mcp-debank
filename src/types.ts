/**
 * DeBank API Response Types
 * Type definitions for all DeBank API endpoints
 */

// ============================================================================
// Chain Data
// ============================================================================

/**
 * Chain data response from /chain endpoint
 */
export type ChainInfo = {
	id: string;
	community_id: number;
	name: string;
	logo_url: string;
	native_token_id: string;
	wrapped_token_id: string;
	is_support_pre_exec: boolean;
};

// ============================================================================
// Protocol Data
// ============================================================================

/**
 * Protocol information from /protocol endpoint
 */
export type ProtocolInfo = {
	id: string;
	chain: string;
	name: string;
	logo_url: string;
	site_url: string;
	has_supported_portfolio: boolean;
	tvl: number;
};

/**
 * Protocol holder information
 */
export type ProtocolHolder = {
	address: string;
	value: number;
	[key: string]: unknown;
};

// ============================================================================
// Pool Data
// ============================================================================

/**
 * Pool information from /pool endpoint
 */
export type PoolInfo = {
	id: string;
	chain: string;
	protocol_id: string;
	contract_id: string[];
	name: string;
	usd_value: number;
	user_count: number;
	valuable_user_count: number;
	[key: string]: unknown;
};

// ============================================================================
// Token Data
// ============================================================================

/**
 * Token information from /token endpoint
 */
export type TokenInfo = {
	id: string;
	chain: string;
	name: string;
	symbol: string;
	display_symbol: string | null;
	optimized_symbol: string;
	decimals: number;
	logo_url: string;
	protocol_id: string;
	price: number;
	is_verified: boolean;
	is_core: boolean;
	is_wallet: boolean;
	time_at: number;
	amount: number;
};

/**
 * Token holder information
 */
export type TokenHolder = {
	address: string;
	amount: number;
	usd_value: number;
	[key: string]: unknown;
};

/**
 * Token historical price data
 */
export type TokenHistoricalPrice = {
	id: string;
	chain: string;
	price: number;
	date: string;
};

// ============================================================================
// User Data
// ============================================================================

/**
 * User chain balance
 */
export type UserChainBalance = {
	usd_value: number;
};

/**
 * User protocol position
 */
export type UserProtocolPosition = {
	id: string;
	chain: string;
	name: string;
	logo_url: string;
	site_url: string;
	has_supported_portfolio: boolean;
	portfolio_item_list: PortfolioItem[];
};

/**
 * Portfolio item within a protocol
 */
export type PortfolioItem = {
	stats: {
		asset_usd_value: number;
		debt_usd_value: number;
		net_usd_value: number;
	};
	asset_token_list: TokenInfo[];
	asset_dict: Record<string, number>;
	detail: {
		supply_token_list: TokenInfo[];
		borrow_token_list?: TokenInfo[];
		reward_token_list?: TokenInfo[];
	};
	detail_types: string[];
	name: string;
	pool: {
		id: string;
		chain: string;
		project_id: string;
		adapter_id: string;
		controller: string;
		index: string | null;
		time_at: number | null;
	};
	proxy_detail: Record<string, unknown>;
	[key: string]: unknown;
};

/**
 * User token balance
 */
export type UserTokenBalance = {
	id: string;
	chain: string;
	name: string;
	symbol: string;
	display_symbol: string | null;
	optimized_symbol: string;
	decimals: number;
	logo_url: string;
	protocol_id: string;
	price: number;
	is_verified: boolean;
	is_core: boolean;
	is_wallet: boolean;
	time_at: number;
	amount: number;
	raw_amount: number;
	raw_amount_hex_str: string;
};

/**
 * User NFT item
 */
export type UserNFT = {
	id: string;
	contract_id: string;
	inner_id: string;
	chain: string;
	name: string;
	description: string;
	content_type: string;
	content: string;
	thumbnail_url: string;
	total_supply: number;
	attributes: Array<{
		trait_type: string;
		value: string;
	}>;
	[key: string]: unknown;
};

/**
 * User transaction history item
 */
export type UserHistoryItem = {
	id: string;
	chain: string;
	name: string;
	project_id: string;
	time_at: number;
	tx: {
		name: string;
		status: number;
		eth_gas_fee: number;
		usd_gas_fee: number;
		value: number;
		from_addr: string;
		to_addr: string;
	};
	sends: TokenInfo[];
	receives: TokenInfo[];
	[key: string]: unknown;
};

/**
 * User token authorization
 */
export type TokenAuthorization = {
	spender: {
		id: string;
		protocol: {
			id: string;
			chain: string;
			name: string;
			logo_url: string;
		};
	};
	value: number;
	token: TokenInfo;
	[key: string]: unknown;
};

/**
 * User NFT authorization
 */
export type NFTAuthorization = {
	contract_id: string;
	contract_name: string;
	contract_protocol_id: string;
	contract_protocol_logo_url: string;
	spender: string;
	spender_protocol_id: string;
	spender_protocol_name: string;
	spender_protocol_logo_url: string;
	is_erc721: boolean;
	amount?: number;
	nft_list?: UserNFT[];
	[key: string]: unknown;
};

/**
 * User total balance
 */
export type UserTotalBalance = {
	total_usd_value: number;
	chain_list: Array<{
		id: string;
		community_id: number;
		name: string;
		logo_url: string;
		native_token_id: string;
		wrapped_token_id: string;
		usd_value: number;
	}>;
};

/**
 * Net curve data point
 */
export type NetCurvePoint = {
	timestamp: number;
	usd_value: number;
};

// ============================================================================
// Wallet Data
// ============================================================================

/**
 * Gas market data
 */
export type GasMarket = {
	slow: {
		price: number;
		estimated_seconds: number;
	};
	normal: {
		price: number;
		estimated_seconds: number;
	};
	fast: {
		price: number;
		estimated_seconds: number;
	};
};

/**
 * Transaction pre-execution result
 */
export type PreExecResult = {
	balance_change: {
		success: boolean;
		send_token_list: TokenInfo[];
		receive_token_list: TokenInfo[];
		send_nft_list: UserNFT[];
		receive_nft_list: UserNFT[];
		usd_value_change: number;
	};
	gas: {
		success: boolean;
		gas_used: number;
		gas_limit: number;
		gas_price: number;
	};
	pre_exec_version: string;
	[key: string]: unknown;
};

/**
 * Transaction explanation
 */
export type TransactionExplanation = {
	action_type: string;
	contract_protocol_name: string;
	contract_protocol_logo_url: string;
	actions: Array<{
		type: string;
		data: Record<string, unknown>;
	}>;
	[key: string]: unknown;
};

// ============================================================================
// Generic API Response Types
// ============================================================================

/**
 * Cache entry type
 */
export type CacheEntry = {
	data: unknown;
	expiresAt: number;
};
