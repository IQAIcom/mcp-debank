// tests/fixtures/invocations.ts
//
// Single source of truth for the 31 service-method invocations exercised
// by both the snapshot baseline script (one-shot capture) and the vitest
// regression test in tests/integration/service-snapshots.test.ts.
//
// Each entry carries `expect` metadata describing the request the method
// SHOULD produce (method, URL fragment, optional body). The fixture stub
// in service-snapshots.test.ts asserts these before returning the fixture,
// so a refactor that drops a query param (e.g. date_at), uses the wrong
// endpoint, or mutates a POST body still gets caught — markdown parity
// alone wouldn't have surfaced those.

import type {
	chainService,
	protocolService,
	tokenService,
	transactionService,
	userService,
} from "../../src/services/index.js";

export type Services = {
	chainService: typeof chainService;
	protocolService: typeof protocolService;
	tokenService: typeof tokenService;
	transactionService: typeof transactionService;
	userService: typeof userService;
};

export type ExpectedRequest = {
	method: "GET" | "POST";
	/**
	 * Exact pathname the method should hit (e.g. "/v1/chain"). The base URL is
	 * `${config.baseUrl}` = "https://pro-openapi.debank.com/v1" — pathnames
	 * therefore include the "/v1" prefix.
	 */
	pathname: string;
	/** Exact query params. Deep-equal compared, not substring. */
	searchParams: Record<string, string>;
	/**
	 * Expected cacheDuration (seconds) passed to fetchWithToolConfig. Catches
	 * TTL regressions — a refactor that swaps `chainDataLifeTime` for
	 * `debankDefaultLifeTime` is a behavior change even if both happen to be
	 * 300 today. Omit only when v0.1 itself used the default.
	 */
	cacheDurationSeconds?: number;
	/** For POST: the exact body object the method should pass. */
	body?: unknown;
};

export type Invocation = {
	name: string;
	call: (s: Services) => Promise<string>;
	expect: ExpectedRequest;
};

/**
 * Cache TTL constants — must match config.ts. Sourced literally from
 * src/config.ts; do NOT compute or import to avoid coupling test fixtures
 * to runtime config.
 */
const TTL = {
	default: 300, // config.debankDefaultLifeTime
	chainData: 300, // config.chainDataLifeTime
	gasPrice: 60, // config.gasPriceLifeTime
	poolData: 600, // config.poolDataLifeTime
	supportedChainList: 604800, // config.supportedChainListLifeTime
	protocolsList: 604800, // config.protocolsListLifeTime
} as const;

export const INVOCATIONS: Invocation[] = [
	// Chain (3)
	{
		name: "get_supported_chain_list",
		call: (s) => s.chainService.getSupportedChainList(),
		expect: {
			method: "GET",
			pathname: "/v1/chain/list",
			searchParams: {},
			cacheDurationSeconds: TTL.supportedChainList,
		},
	},
	{
		name: "get_chain",
		call: (s) => s.chainService.getChain({ id: "eth" }),
		expect: {
			method: "GET",
			pathname: "/v1/chain",
			searchParams: { id: "eth" },
			cacheDurationSeconds: TTL.chainData,
		},
	},
	{
		name: "get_gas_prices",
		call: (s) => s.chainService.getGasPrices({ chain_id: "eth" }),
		expect: {
			method: "GET",
			pathname: "/v1/wallet/gas_market",
			searchParams: { chain_id: "eth" },
			cacheDurationSeconds: TTL.gasPrice,
		},
	},
	// Protocol (4)
	{
		name: "get_all_protocols_of_supported_chains",
		call: (s) => s.protocolService.getAllProtocolsOfSupportedChains({}),
		expect: {
			method: "GET",
			pathname: "/v1/protocol/all_list",
			searchParams: {},
			cacheDurationSeconds: TTL.protocolsList,
		},
	},
	{
		name: "get_protocol_information",
		call: (s) => s.protocolService.getProtocolInformation({ id: "uniswap" }),
		expect: {
			method: "GET",
			pathname: "/v1/protocol",
			searchParams: { id: "uniswap" },
			cacheDurationSeconds: TTL.default,
		},
	},
	{
		name: "get_top_holders_of_protocol",
		call: (s) => s.protocolService.getTopHoldersOfProtocol({ id: "uniswap" }),
		expect: {
			method: "GET",
			pathname: "/v1/protocol/top_holders",
			searchParams: { id: "uniswap" },
			cacheDurationSeconds: TTL.default,
		},
	},
	{
		name: "get_pool_information",
		call: (s) =>
			s.protocolService.getPoolInformation({
				id: "0x00000000219ab540356cbb839cbe05303d7705fa",
				chain_id: "eth",
			}),
		expect: {
			method: "GET",
			pathname: "/v1/pool",
			searchParams: {
				id: "0x00000000219ab540356cbb839cbe05303d7705fa",
				chain_id: "eth",
			},
			cacheDurationSeconds: TTL.poolData,
		},
	},
	// Token (4)
	{
		name: "get_token_information",
		call: (s) =>
			s.tokenService.getTokenInformation({
				id: "0xdac17f958d2ee523a2206206994597c13d831ec7",
				chain_id: "eth",
			}),
		expect: {
			method: "GET",
			pathname: "/v1/token",
			searchParams: {
				id: "0xdac17f958d2ee523a2206206994597c13d831ec7",
				chain_id: "eth",
			},
			cacheDurationSeconds: TTL.default,
		},
	},
	{
		name: "get_list_token_information",
		call: (s) =>
			s.tokenService.getListTokenInformation({
				chain_id: "eth",
				ids: "0xdac17f958d2ee523a2206206994597c13d831ec7",
			}),
		expect: {
			method: "GET",
			pathname: "/v1/token/list",
			searchParams: {
				chain_id: "eth",
				ids: "0xdac17f958d2ee523a2206206994597c13d831ec7",
			},
			cacheDurationSeconds: TTL.default,
		},
	},
	{
		name: "get_top_holders_of_token",
		call: (s) =>
			s.tokenService.getTopHoldersOfToken({
				id: "0xdac17f958d2ee523a2206206994597c13d831ec7",
				chain_id: "eth",
			}),
		expect: {
			method: "GET",
			pathname: "/v1/token/top_holders",
			searchParams: {
				id: "0xdac17f958d2ee523a2206206994597c13d831ec7",
				chain_id: "eth",
			},
			cacheDurationSeconds: TTL.default,
		},
	},
	{
		name: "get_token_history_price",
		call: (s) =>
			s.tokenService.getTokenHistoryPrice({
				id: "0xdac17f958d2ee523a2206206994597c13d831ec7",
				chain_id: "eth",
				date_at: "2024-01-01",
			}),
		expect: {
			method: "GET",
			pathname: "/v1/token/history_price",
			searchParams: {
				id: "0xdac17f958d2ee523a2206206994597c13d831ec7",
				chain_id: "eth",
				date_at: "2024-01-01",
			},
			cacheDurationSeconds: TTL.default,
		},
	},
	// User (18)
	{
		name: "get_user_used_chain_list",
		call: (s) => s.userService.getUserUsedChainList({ id: "0xabc" }),
		expect: {
			method: "GET",
			pathname: "/v1/user/used_chain_list",
			searchParams: { id: "0xabc" },
			cacheDurationSeconds: TTL.default,
		},
	},
	{
		name: "get_user_chain_balance",
		call: (s) =>
			s.userService.getUserChainBalance({ id: "0xabc", chain_id: "eth" }),
		expect: {
			method: "GET",
			pathname: "/v1/user/chain_balance",
			searchParams: { id: "0xabc", chain_id: "eth" },
			cacheDurationSeconds: TTL.default,
		},
	},
	{
		name: "get_user_protocol",
		call: (s) =>
			s.userService.getUserProtocol({ id: "0xabc", protocol_id: "uniswap" }),
		expect: {
			method: "GET",
			pathname: "/v1/user/protocol",
			searchParams: { id: "0xabc", protocol_id: "uniswap" },
			cacheDurationSeconds: TTL.default,
		},
	},
	{
		name: "get_user_complex_protocol_list",
		call: (s) =>
			s.userService.getUserComplexProtocolList({
				id: "0xabc",
				chain_id: "eth",
			}),
		expect: {
			method: "GET",
			pathname: "/v1/user/complex_protocol_list",
			searchParams: { id: "0xabc", chain_id: "eth" },
			cacheDurationSeconds: TTL.default,
		},
	},
	{
		name: "get_user_all_complex_protocol_list",
		call: (s) => s.userService.getUserAllComplexProtocolList({ id: "0xabc" }),
		expect: {
			method: "GET",
			pathname: "/v1/user/all_complex_protocol_list",
			searchParams: { id: "0xabc" },
			cacheDurationSeconds: TTL.default,
		},
	},
	{
		name: "get_user_all_simple_protocol_list",
		call: (s) => s.userService.getUserAllSimpleProtocolList({ id: "0xabc" }),
		expect: {
			method: "GET",
			pathname: "/v1/user/all_simple_protocol_list",
			searchParams: { id: "0xabc" },
			cacheDurationSeconds: TTL.default,
		},
	},
	{
		name: "get_user_token_balance",
		call: (s) =>
			s.userService.getUserTokenBalance({
				id: "0xabc",
				chain_id: "eth",
				token_id: "0xdac17f958d2ee523a2206206994597c13d831ec7",
			}),
		expect: {
			method: "GET",
			pathname: "/v1/user/token",
			searchParams: {
				id: "0xabc",
				chain_id: "eth",
				token_id: "0xdac17f958d2ee523a2206206994597c13d831ec7",
			},
			cacheDurationSeconds: TTL.default,
		},
	},
	{
		name: "get_user_token_list",
		call: (s) =>
			s.userService.getUserTokenList({ id: "0xabc", chain_id: "eth" }),
		expect: {
			method: "GET",
			pathname: "/v1/user/token_list",
			searchParams: { id: "0xabc", chain_id: "eth" },
			cacheDurationSeconds: TTL.default,
		},
	},
	{
		name: "get_user_all_token_list",
		call: (s) => s.userService.getUserAllTokenList({ id: "0xabc" }),
		expect: {
			method: "GET",
			pathname: "/v1/user/all_token_list",
			searchParams: { id: "0xabc" },
			cacheDurationSeconds: TTL.default,
		},
	},
	{
		name: "get_user_nft_list",
		call: (s) => s.userService.getUserNftList({ id: "0xabc", chain_id: "eth" }),
		expect: {
			method: "GET",
			pathname: "/v1/user/nft_list",
			searchParams: { id: "0xabc", chain_id: "eth" },
			cacheDurationSeconds: TTL.default,
		},
	},
	{
		name: "get_user_all_nft_list",
		call: (s) => s.userService.getUserAllNftList({ id: "0xabc" }),
		expect: {
			method: "GET",
			pathname: "/v1/user/all_nft_list",
			searchParams: { id: "0xabc" },
			cacheDurationSeconds: TTL.default,
		},
	},
	{
		name: "get_user_history_list",
		call: (s) =>
			s.userService.getUserHistoryList({ id: "0xabc", chain_id: "eth" }),
		expect: {
			method: "GET",
			pathname: "/v1/user/history_list",
			searchParams: { id: "0xabc", chain_id: "eth" },
			cacheDurationSeconds: TTL.default,
		},
	},
	{
		name: "get_user_all_history_list",
		call: (s) => s.userService.getUserAllHistoryList({ id: "0xabc" }),
		expect: {
			method: "GET",
			pathname: "/v1/user/all_history_list",
			searchParams: { id: "0xabc" },
			cacheDurationSeconds: TTL.default,
		},
	},
	// v0.1: token_authorized_list and nft_authorized_list take {id} only — no chain_id (cross-chain query).
	{
		name: "get_user_token_authorized_list",
		call: (s) => s.userService.getUserTokenAuthorizedList({ id: "0xabc" }),
		expect: {
			method: "GET",
			pathname: "/v1/user/token_authorized_list",
			searchParams: { id: "0xabc" },
			cacheDurationSeconds: TTL.default,
		},
	},
	{
		name: "get_user_nft_authorized_list",
		call: (s) => s.userService.getUserNftAuthorizedList({ id: "0xabc" }),
		expect: {
			method: "GET",
			pathname: "/v1/user/nft_authorized_list",
			searchParams: { id: "0xabc" },
			cacheDurationSeconds: TTL.default,
		},
	},
	{
		name: "get_user_total_balance",
		call: (s) => s.userService.getUserTotalBalance({ id: "0xabc" }),
		expect: {
			method: "GET",
			pathname: "/v1/user/total_balance",
			searchParams: { id: "0xabc" },
			cacheDurationSeconds: TTL.default,
		},
	},
	{
		name: "get_user_chain_net_curve",
		call: (s) =>
			s.userService.getUserChainNetCurve({ id: "0xabc", chain_id: "eth" }),
		expect: {
			method: "GET",
			pathname: "/v1/user/chain_net_curve",
			searchParams: { id: "0xabc", chain_id: "eth" },
			cacheDurationSeconds: TTL.default,
		},
	},
	{
		name: "get_user_total_net_curve",
		call: (s) => s.userService.getUserTotalNetCurve({ id: "0xabc" }),
		expect: {
			method: "GET",
			pathname: "/v1/user/total_net_curve",
			searchParams: { id: "0xabc" },
			cacheDurationSeconds: TTL.default,
		},
	},
	// Transaction (2) — POST body assertions catch silent body-shape regressions.
	{
		name: "pre_exec_transaction",
		call: (s) =>
			s.transactionService.preExecTransaction({ tx: '{"from":"0xabc"}' }),
		expect: {
			method: "POST",
			pathname: "/v1/wallet/pre_exec_tx",
			searchParams: {},
			body: { tx: { from: "0xabc" } },
		},
	},
	{
		name: "explain_transaction",
		call: (s) =>
			s.transactionService.explainTransaction({ tx: '{"data":"0x"}' }),
		expect: {
			method: "POST",
			pathname: "/v1/wallet/explain_tx",
			searchParams: {},
			body: { tx: { data: "0x" } },
		},
	},
];
