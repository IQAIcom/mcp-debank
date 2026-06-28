// src/services/user.service.test.ts
//
// Focused unit tests for the host-side aggregate method
// getUserTokensAcrossChainsRaw. Mocks the two underlying *Raw calls so
// we test the orchestration (chain filter + Promise.all + flatten) without
// crossing the network.

import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveChain } from "../lib/entity-resolver.js";
import {
	UserNftAuthorizedListSchema,
	UserTokenAuthorizedListSchema,
	UserTotalNetCurveSchema,
} from "../mcp/legacy/response-schemas.js";
import { userService } from "./index.js";

vi.mock("../lib/entity-resolver.js", () => ({ resolveChain: vi.fn() }));

const T = (over: any = {}) => ({
	chain: "eth",
	name: "Everipedia IQ",
	symbol: "IQ",
	display_symbol: null,
	optimized_symbol: "IQ",
	id: "0x1",
	amount: 1,
	price: 2,
	...over,
});

const WALLET = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

function token(symbol: string, chain: string, amount: number, price: number) {
	// Pad to UserTokenBalance shape; only the fields the aggregate touches matter.
	return {
		id: `${chain}_${symbol}`,
		chain,
		name: symbol,
		symbol,
		display_symbol: null,
		optimized_symbol: symbol,
		decimals: 18,
		logo_url: "",
		protocol_id: "",
		price,
		is_verified: true,
		is_core: true,
		is_wallet: true,
		time_at: 0,
		amount,
		raw_amount: amount,
		raw_amount_hex_str: "0x0",
	};
}

describe("userService.getUserTokensAcrossChainsRaw", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("filters chains below min_usd_value and fans out per-chain calls in parallel", async () => {
		const totalBalanceSpy = vi
			.spyOn(userService, "getUserTotalBalanceRaw")
			.mockResolvedValue({
				total_usd_value: 100,
				chain_list: [
					{
						id: "eth",
						community_id: 1,
						name: "Ethereum",
						logo_url: "",
						native_token_id: "eth",
						wrapped_token_id: "",
						usd_value: 80,
					},
					{
						id: "bsc",
						community_id: 56,
						name: "BNB",
						logo_url: "",
						native_token_id: "bnb",
						wrapped_token_id: "",
						usd_value: 19,
					},
					{
						id: "dust-chain",
						community_id: 999,
						name: "Dust",
						logo_url: "",
						native_token_id: "x",
						wrapped_token_id: "",
						usd_value: 0.5, // below default min_usd_value=1, must be skipped
					},
				],
			});
		const tokenListSpy = vi
			.spyOn(userService, "getUserTokenListRaw")
			.mockImplementation(async (args) => {
				if (args.chain_id === "eth") return [token("USDC", "eth", 50, 1)];
				if (args.chain_id === "bsc") return [token("BNB", "bsc", 0.5, 38)];
				throw new Error(`unexpected chain ${args.chain_id}`);
			});

		const result = await userService.getUserTokensAcrossChainsRaw({
			id: WALLET,
		});

		expect(totalBalanceSpy).toHaveBeenCalledTimes(1);
		expect(tokenListSpy).toHaveBeenCalledTimes(2);
		// Order doesn't matter; assert both chains were queried, dust-chain wasn't.
		const calledChains = tokenListSpy.mock.calls
			.map((c) => (c[0] as { chain_id: string }).chain_id)
			.sort();
		expect(calledChains).toEqual(["bsc", "eth"]);
		// Flattened result includes tokens from both queried chains.
		expect(result.map((t) => t.symbol).sort()).toEqual(["BNB", "USDC"]);
	});

	it("honors custom min_usd_value (0 includes dust chains)", async () => {
		vi.spyOn(userService, "getUserTotalBalanceRaw").mockResolvedValue({
			total_usd_value: 0.5,
			chain_list: [
				{
					id: "dust",
					community_id: 1,
					name: "Dust",
					logo_url: "",
					native_token_id: "x",
					wrapped_token_id: "",
					usd_value: 0.5,
				},
			],
		});
		const tokenListSpy = vi
			.spyOn(userService, "getUserTokenListRaw")
			.mockResolvedValue([token("DUST", "dust", 1, 0.5)]);

		const result = await userService.getUserTokensAcrossChainsRaw({
			id: WALLET,
			min_usd_value: 0,
		});

		expect(tokenListSpy).toHaveBeenCalledTimes(1);
		expect(result).toHaveLength(1);
	});

	it("returns [] without firing per-chain calls when no chain meets the threshold", async () => {
		vi.spyOn(userService, "getUserTotalBalanceRaw").mockResolvedValue({
			total_usd_value: 0,
			chain_list: [],
		});
		const tokenListSpy = vi
			.spyOn(userService, "getUserTokenListRaw")
			.mockResolvedValue([]);

		const result = await userService.getUserTokensAcrossChainsRaw({
			id: WALLET,
		});

		expect(result).toEqual([]);
		expect(tokenListSpy).not.toHaveBeenCalled();
	});

	it("returns partial results when a single chain's fetch fails", async () => {
		vi.spyOn(userService, "getUserTotalBalanceRaw").mockResolvedValue({
			total_usd_value: 100,
			chain_list: [
				{
					id: "eth",
					community_id: 1,
					name: "Ethereum",
					logo_url: "",
					native_token_id: "eth",
					wrapped_token_id: "",
					usd_value: 60,
				},
				{
					id: "bsc",
					community_id: 56,
					name: "BNB",
					logo_url: "",
					native_token_id: "bnb",
					wrapped_token_id: "",
					usd_value: 40,
				},
			],
		});
		vi.spyOn(userService, "getUserTokenListRaw").mockImplementation(
			async (args) => {
				if (args.chain_id === "eth") return [token("USDC", "eth", 50, 1)];
				throw new Error("DeBank 503 on bsc");
			},
		);

		const result = await userService.getUserTokensAcrossChainsRaw({
			id: WALLET,
		});

		// The eth tokens still come back even though bsc threw; the aggregate
		// degrades to "best effort" rather than rejecting the whole call.
		expect(result.map((t) => t.symbol)).toEqual(["USDC"]);
	});

	it("rejects with AbortError if signal aborts after fan-out resolves but before return", async () => {
		const controller = new AbortController();
		vi.spyOn(userService, "getUserTotalBalanceRaw").mockResolvedValue({
			total_usd_value: 10,
			chain_list: [
				{
					id: "eth",
					community_id: 1,
					name: "Ethereum",
					logo_url: "",
					native_token_id: "eth",
					wrapped_token_id: "",
					usd_value: 10,
				},
			],
		});
		// All per-chain calls resolve normally — abort happens between
		// Promise.all settling and the function returning.
		vi.spyOn(userService, "getUserTokenListRaw").mockImplementation(
			async () => {
				controller.abort();
				return [token("USDC", "eth", 1, 1)];
			},
		);

		await expect(
			userService.getUserTokensAcrossChainsRaw(
				{ id: WALLET },
				{ signal: controller.signal },
			),
		).rejects.toMatchObject({ name: "AbortError" });
	});

	it("surfaces AbortError (not the network error) when signal aborts concurrent with an upstream failure", async () => {
		const controller = new AbortController();
		vi.spyOn(userService, "getUserTotalBalanceRaw").mockImplementation(
			async () => {
				// Abort first, then throw a non-abort error — caller should see
				// the AbortError, not the 503.
				controller.abort();
				throw Object.assign(new Error("DeBank 503"), { code: "ESERVERERR" });
			},
		);

		await expect(
			userService.getUserTokensAcrossChainsRaw(
				{ id: WALLET },
				{ signal: controller.signal },
			),
		).rejects.toMatchObject({ name: "AbortError" });
	});

	it("propagates abort even when a per-chain rejection happens after the signal aborts", async () => {
		const controller = new AbortController();
		vi.spyOn(userService, "getUserTotalBalanceRaw").mockResolvedValue({
			total_usd_value: 100,
			chain_list: [
				{
					id: "eth",
					community_id: 1,
					name: "Ethereum",
					logo_url: "",
					native_token_id: "eth",
					wrapped_token_id: "",
					usd_value: 100,
				},
			],
		});
		vi.spyOn(userService, "getUserTokenListRaw").mockImplementation(
			async () => {
				// Simulate the abort firing mid-chain-call.
				controller.abort();
				throw new DOMException("Aborted", "AbortError");
			},
		);

		await expect(
			userService.getUserTokensAcrossChainsRaw(
				{ id: WALLET },
				{ signal: controller.signal },
			),
		).rejects.toMatchObject({ name: "AbortError" });
	});

	it("rejects with AbortError without firing any upstream call when signal is pre-aborted", async () => {
		const balanceSpy = vi.spyOn(userService, "getUserTotalBalanceRaw");
		const tokenListSpy = vi.spyOn(userService, "getUserTokenListRaw");

		const controller = new AbortController();
		controller.abort();

		await expect(
			userService.getUserTokensAcrossChainsRaw(
				{ id: WALLET },
				{ signal: controller.signal },
			),
		).rejects.toMatchObject({ name: "AbortError" });

		expect(balanceSpy).not.toHaveBeenCalled();
		expect(tokenListSpy).not.toHaveBeenCalled();
	});

	it("rejects mid-flight if the signal aborts between the balance call and the fan-out", async () => {
		const controller = new AbortController();
		// Simulate the abort firing the moment getUserTotalBalanceRaw resolves.
		vi.spyOn(userService, "getUserTotalBalanceRaw").mockImplementation(
			async () => {
				controller.abort();
				return {
					total_usd_value: 10,
					chain_list: [
						{
							id: "eth",
							community_id: 1,
							name: "Ethereum",
							logo_url: "",
							native_token_id: "eth",
							wrapped_token_id: "",
							usd_value: 10,
						},
					],
				};
			},
		);
		const tokenListSpy = vi.spyOn(userService, "getUserTokenListRaw");

		await expect(
			userService.getUserTokensAcrossChainsRaw(
				{ id: WALLET },
				{ signal: controller.signal },
			),
		).rejects.toMatchObject({ name: "AbortError" });

		// The mid-flight check must skip the parallel fan-out.
		expect(tokenListSpy).not.toHaveBeenCalled();
	});

	it("survives a missing chain_list (treats as empty wallet)", async () => {
		vi.spyOn(userService, "getUserTotalBalanceRaw").mockResolvedValue({
			total_usd_value: 0,
		} as never);
		const tokenListSpy = vi.spyOn(userService, "getUserTokenListRaw");

		const result = await userService.getUserTokensAcrossChainsRaw({
			id: WALLET,
		});

		expect(result).toEqual([]);
		expect(tokenListSpy).not.toHaveBeenCalled();
	});
});

/**
 * Regression tests for endpoint contract drift:
 *   1. /user/total_net_curve returns a bare array (not the previously-typed wrapper).
 *   2. /user/token_authorized_list & /user/nft_authorized_list require chain_id —
 *      previously the service dropped it and DeBank rejected with "ChainID Missing".
 *   3. /user/nft_authorized_list returns a { total, contracts, tokens } wrapper,
 *      not a bare array as the old schema claimed.
 *
 * These tests spy on the protected `fetchWithToolConfig` to assert (a) the
 * exact URL string the service constructs and (b) that the upstream payload
 * passes through without unwrapping.
 */
describe("userService — endpoint contract regression tests", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	function spyFetch<T>(response: T) {
		return vi
			.spyOn(
				userService as unknown as {
					fetchWithToolConfig: (...a: unknown[]) => Promise<unknown>;
				},
				"fetchWithToolConfig",
			)
			.mockResolvedValue(response as never);
	}

	it("getUserTotalNetCurve returns the upstream array as-is (no .usd_value_list unwrap)", async () => {
		const upstream = [
			{ timestamp: 1781520900, usd_value: 428753.72 },
			{ timestamp: 1781521200, usd_value: 428901.5 },
		];
		const spy = spyFetch(upstream);

		const result = await userService.getUserTotalNetCurveRaw({ id: WALLET });

		expect(Array.isArray(result)).toBe(true);
		expect(result).toHaveLength(2);
		expect(result[0]).toEqual({
			timestamp: 1781520900,
			usd_value: 428753.72,
		});
		const url = spy.mock.calls[0]?.[0] as string;
		expect(url).toContain("/user/total_net_curve");
		expect(url).toContain(`id=${WALLET}`);
		// Without chain_ids, the query string must not contain a chain_ids param —
		// guards against a refactor that always forwards it as an empty string.
		expect(url).not.toContain("chain_ids");
	});

	it("getUserTotalNetCurve forwards chain_ids when provided and still returns a bare array", async () => {
		const upstream = [{ timestamp: 1781520900, usd_value: 356847.41 }];
		const spy = spyFetch(upstream);

		const result = await userService.getUserTotalNetCurveRaw({
			id: WALLET,
			chain_ids: "eth,arb",
		});

		const url = spy.mock.calls[0]?.[0] as string;
		expect(url).toContain("/user/total_net_curve");
		expect(url).toContain(`id=${WALLET}`);
		expect(url).toContain("chain_ids=eth,arb");
		// DeBank returns the same bare-array shape for the chain_ids-filtered
		// variant; verified live against the gateway with chain_ids=eth,arb.
		expect(Array.isArray(result)).toBe(true);
	});

	it("getUserTokenAuthorizedList forwards chain_id into the URL query string", async () => {
		const spy = spyFetch([]);

		await userService.getUserTokenAuthorizedListRaw({
			id: WALLET,
			chain_id: "eth",
		});

		const url = spy.mock.calls[0]?.[0] as string;
		expect(url).toContain("/user/token_authorized_list");
		expect(url).toContain(`id=${WALLET}`);
		// Previous bug dropped chain_id → DeBank rejected with
		// "ChainID Missing required parameter".
		expect(url).toContain("chain_id=eth");
	});

	it("getUserNftAuthorizedList forwards chain_id and passes the wrapper through unchanged", async () => {
		const upstream = {
			total: "8",
			contracts: [
				{
					chain: "eth",
					contract_name: "Test Collection",
					contract_id: "0xabc",
					is_erc721: true,
					collection: {
						id: "0xabc",
						chain: "eth",
						name: "Test Collection",
						description: null,
						logo_url: "",
						is_verified: null,
						is_suspicious: null,
						is_core: true,
						is_scam: false,
						floor_price: 0.01,
						credit_score: null,
					},
					amount: "1",
					spender: {
						id: "0xdef",
						protocol: null,
						last_approve_at: 1700000000,
						risk_level: "safe",
						risk_alert: "",
						exposure_nft_usd_value: null,
						spend_nft_usd_value: null,
						approve_user_count: 1,
						revoke_user_count: 0,
					},
				},
			],
			tokens: [],
		};
		const spy = spyFetch(upstream);

		const result = await userService.getUserNftAuthorizedListRaw({
			id: WALLET,
			chain_id: "eth",
		});

		const url = spy.mock.calls[0]?.[0] as string;
		expect(url).toContain("/user/nft_authorized_list");
		expect(url).toContain("chain_id=eth");
		// Wrapper shape: { total, contracts, tokens } — not a bare array.
		expect(Array.isArray(result)).toBe(false);
		expect(result.total).toBe("8");
		expect(result.contracts).toHaveLength(1);
		expect(result.tokens).toEqual([]);
	});
});

/**
 * Schema validation against representative payloads captured from the live IQ
 * Gateway. The premise of this PR is "schemas drifted silently for months" —
 * these tests close the loop by exercising the schemas against realistic
 * fixtures so a future drift fails in CI, not just in someone's manual curl.
 *
 * All fixtures were pulled from production endpoints with real wallets:
 *   - curve: 0xd8dA…6045 (Vitalik) via /user/total_net_curve
 *   - token approvals: 0xd8dA…6045 via /user/token_authorized_list?chain_id=eth
 *   - NFT approvals: 0xd387…c459 (Pranksy) via /user/nft_authorized_list?chain_id=eth
 *
 * Each schema has `.passthrough()` so extra DeBank-added fields don't fail
 * the parse, but missing required fields or type mismatches still do.
 */
describe("response schemas validate against realistic fixtures", () => {
	it("UserTotalNetCurveSchema parses a bare-array curve response", () => {
		// Two-point fixture (real responses are 288 points; shape per point is
		// what we assert).
		const fixture = [
			{ timestamp: 1781520900, usd_value: 428753.72163113294 },
			{ timestamp: 1781521200, usd_value: 428901.5 },
		];
		const result = UserTotalNetCurveSchema.safeParse(fixture);
		expect(result.success).toBe(true);
	});

	it("UserTokenAuthorizedListSchema parses a token-approval entry with full spender metadata", () => {
		const fixture = [
			{
				id: "0x28561b8a2360f463011c16b6cc0b0cbef8dbbcad",
				chain: "eth",
				name: "MOO DENG",
				symbol: "MOODENG",
				display_symbol: null,
				optimized_symbol: "MOODENG",
				decimals: 9,
				logo_url: "https://example.invalid/logo.png",
				protocol_id: "",
				price: 0.000004808052747803027,
				price_24h_change: -0.016599990539484702,
				credit_score: 54753.23544720913,
				total_supply: 414508096868.6426,
				is_verified: true,
				is_core: true,
				is_wallet: true,
				is_scam: false,
				is_suspicious: false,
				time_at: 1726430855.0,
				amount: 30002291391.968834,
				// Real `raw_amount` values exceed Number.MAX_SAFE_INTEGER and lose
				// precision — that's a pre-existing concern, not introduced here.
				// For the fixture we use a safe-int value so biome doesn't reject
				// the literal; the schema's z.number() accepts either.
				raw_amount: 30002291391,
				raw_amount_hex_str: "0x1a05d8d0fe20ff3ca",
				balance: 30002291391.968834,
				spenders: [
					{
						id: "0xc92e8bdf79f0507f65a392b0ab4667716bfe0110",
						value: 1.157920892373162e68,
						exposure_usd: 144252.59956754284,
						last_approve_at: 1728301007.0,
						protocol: {
							id: "cowswap",
							name: "CoW Swap",
							logo_url: "https://example.invalid/cowswap.png",
							chain: "eth",
						},
						spend_usd_value: 20000000000,
						exposure_usd_value: 541574823.4333035,
						approve_user_count: 1014,
						revoke_user_count: 85,
						is_contract: true,
						is_hacked: null,
						is_abandoned: null,
						is_open_source: null,
						risk_level: "safe",
						risk_alert: "",
					},
				],
				sum_exposure_usd: 144252.59956754284,
				exposure_balance: 30002291391.968834,
			},
		];
		const result = UserTokenAuthorizedListSchema.safeParse(fixture);
		if (!result.success) {
			throw new Error(
				`Token authorization schema failed: ${JSON.stringify(result.error.issues, null, 2)}`,
			);
		}
		expect(result.success).toBe(true);
	});

	it("UserTokenAuthorizedListSchema accepts nullable risk flags (is_scam, is_suspicious null)", () => {
		// The previous non-nullable boolean typing on `is_scam`/`is_suspicious`
		// would have rejected this fixture. Widened to `boolean | null` for
		// consistency with sibling risk fields (`is_hacked`, `is_abandoned`,
		// `is_open_source`, `is_verified`).
		const fixture = [
			{
				id: "0xtest",
				chain: "eth",
				name: "Test",
				symbol: "TST",
				display_symbol: null,
				optimized_symbol: "TST",
				decimals: 18,
				logo_url: "",
				protocol_id: "",
				price: 0,
				price_24h_change: null,
				credit_score: null,
				total_supply: null,
				is_verified: false,
				is_core: false,
				is_wallet: false,
				is_scam: null,
				is_suspicious: null,
				time_at: null,
				amount: 0,
				raw_amount: 0,
				raw_amount_hex_str: "0x0",
				balance: 0,
				spenders: [],
				sum_exposure_usd: null,
				exposure_balance: 0,
			},
		];
		const result = UserTokenAuthorizedListSchema.safeParse(fixture);
		expect(result.success).toBe(true);
	});

	it("UserNftAuthorizedListSchema parses the { total, contracts, tokens } wrapper", () => {
		const fixture = {
			total: "103122",
			contracts: [
				{
					chain: "eth",
					contract_name: "Gods Unchained Cards",
					contract_id: "0x0e3a2a1f2146d86a604adc220b4967a898d7fe07",
					is_erc721: true,
					collection: {
						chain_id: "eth",
						id: "0x0e3a2a1f2146d86a604adc220b4967a898d7fe07",
						name: "Gods Unchained",
						description: null,
						logo_url: "https://example.invalid/godsunchained.png",
						is_verified: null,
						is_suspicious: null,
						is_core: false,
						floor_price: 0.005,
						credit_score: null,
						is_scam: true,
					},
					amount: "16791",
					spender: {
						id: "0xefc70a1b18c432bdc64b596838b4d138f6bc6cad",
						protocol: null,
						last_approve_at: 1574409024.0,
						risk_level: "safe",
						risk_alert: "",
						exposure_nft_usd_value: 1709467.1759048854,
						spend_nft_usd_value: 26329.84801897069,
						approve_user_count: 0,
						revoke_user_count: 0,
					},
				},
			],
			tokens: [
				{
					id: "12a3845db56a46c6c5e94ca7930da5bc",
					contract_id: "0x959e104e1a4db6317fa58f8295f586e1a978c297",
					inner_id: "3896",
					chain: "eth",
					symbol: "EST",
					name: "#3896",
					description: null,
					content_type: null,
					content: "",
					thumbnail_url: "",
					total_supply: 1,
					attributes: [],
					detail_url: "https://example.invalid/opensea/3896",
					collection_id: "eth:0x959e104e1a4db6317fa58f8295f586e1a978c297",
					is_erc1155: false,
					is_erc721: true,
					pay_token: null,
					collection: {
						id: "eth:0x959e104e1a4db6317fa58f8295f586e1a978c297",
						chain: "eth",
						name: "Decentraland",
						description: null,
						logo_url: "https://example.invalid/decentraland.png",
						is_verified: null,
						credit_score: 628.2977286525003,
						is_suspicious: null,
						is_scam: false,
						is_core: true,
						floor_price: 0.03,
					},
					contract_name: "Estate",
					amount: "1",
					spender: {
						id: "0x4fee7b061c97c9c496b01dbce9cdb10c02f0a0be",
						protocol: {
							id: "rarible",
							name: "Rarible",
							logo_url: "https://example.invalid/rarible.png",
							chain: "eth",
						},
						last_approve_at: 1606804431.0,
						risk_level: "safe",
						risk_alert: "",
						exposure_nft_usd_value: 1458784.0700031216,
						spend_nft_usd_value: 582.2740973165915,
						approve_user_count: 1,
						revoke_user_count: 2,
					},
				},
			],
		};
		const result = UserNftAuthorizedListSchema.safeParse(fixture);
		if (!result.success) {
			throw new Error(
				`NFT authorization schema failed: ${JSON.stringify(result.error.issues, null, 2)}`,
			);
		}
		expect(result.success).toBe(true);
	});

	it("passthrough preserves unknown fields in the parsed output (not just no-rejection)", () => {
		// A future field DeBank might add to a spender entry — must not fail.
		const fixture = [
			{
				id: "0xtest",
				chain: "eth",
				name: "Test",
				symbol: "TST",
				display_symbol: null,
				optimized_symbol: "TST",
				decimals: 18,
				logo_url: "",
				protocol_id: "",
				price: 0,
				price_24h_change: null,
				credit_score: null,
				total_supply: null,
				is_verified: false,
				is_core: false,
				is_wallet: false,
				is_scam: null,
				is_suspicious: null,
				time_at: null,
				amount: 0,
				raw_amount: 0,
				raw_amount_hex_str: "0x0",
				balance: 0,
				spenders: [
					{
						id: "0xspender",
						value: 0,
						exposure_usd: 0,
						last_approve_at: 0,
						protocol: null,
						spend_usd_value: 0,
						exposure_usd_value: 0,
						approve_user_count: 0,
						revoke_user_count: 0,
						is_contract: false,
						is_hacked: null,
						is_abandoned: null,
						is_open_source: null,
						risk_level: "safe",
						risk_alert: "",
						// Hypothetical new field DeBank could add tomorrow:
						future_field_we_dont_know_about: { nested: 42 },
					},
				],
				sum_exposure_usd: null,
				exposure_balance: 0,
				// Future top-level field on the token entry too:
				newly_added_pricing_field: "anything",
			},
		];
		const result = UserTokenAuthorizedListSchema.safeParse(fixture);
		expect(result.success).toBe(true);
		// Strip mode would still produce success=true here, but the unknown
		// fields would be dropped from `result.data`. Asserting their presence
		// in the output is what actually guards against a future revert to
		// strip mode — that's the regression this test exists to catch.
		if (result.success) {
			const entry = result.data[0] as Record<string, unknown> & {
				spenders: Array<Record<string, unknown>>;
			};
			expect(entry.newly_added_pricing_field).toBe("anything");
			expect(entry.spenders[0]?.future_field_we_dont_know_about).toEqual({
				nested: 42,
			});
		}
	});
});

describe("_getUserTokensWithSkippedChains", () => {
	it("returns skipped chain ids for chains whose token_list rejected", async () => {
		vi.spyOn(userService, "getUserTotalBalanceRaw").mockResolvedValue({
			total_usd_value: 5,
			chain_list: [
				{ id: "eth", usd_value: 5 },
				{ id: "bsc", usd_value: 3 },
			],
		} as any);
		vi.spyOn(userService, "getUserTokenListRaw").mockImplementation(
			async ({ chain_id }: any) => {
				if (chain_id === "bsc") throw new Error("503");
				return [
					{
						chain: "eth",
						name: "IQ",
						symbol: "IQ",
						amount: 1,
						price: 1,
					} as any,
				];
			},
		);
		const { tokens, skipped } =
			await userService._getUserTokensWithSkippedChains({
				id: WALLET,
				min_usd_value: 0,
			});
		expect(tokens).toHaveLength(1);
		expect(skipped).toEqual(["bsc"]);
	});
});

describe("getUserTokensAcrossChainsRaw (contract preserved)", () => {
	it("still returns a flat token array", async () => {
		vi.spyOn(userService, "getUserTotalBalanceRaw").mockResolvedValue({
			total_usd_value: 5,
			chain_list: [{ id: "eth", usd_value: 5 }],
		} as any);
		vi.spyOn(userService, "getUserTokenListRaw").mockResolvedValue([
			{ chain: "eth", name: "IQ", symbol: "IQ", amount: 1, price: 1 } as any,
		]);
		const tokens = await userService.getUserTokensAcrossChainsRaw({
			id: WALLET,
		});
		expect(Array.isArray(tokens)).toBe(true);
		expect(tokens).toHaveLength(1);
	});
});

describe("getTokenBalanceAcrossChainsRaw", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});
	it("aggregates matches across chains with total, usd, and dedup", async () => {
		vi.spyOn(userService, "_getUserTokensWithSkippedChains").mockResolvedValue({
			tokens: [
				T({ chain: "eth", amount: 1, price: 2 }),
				T({ chain: "base", name: "pTokens IQ", amount: 10, price: 2 }),
				T({
					chain: "eth",
					symbol: "DAI",
					name: "Dai",
					optimized_symbol: "DAI",
					amount: 999,
				}),
			],
			skipped: [],
		});
		const r = await userService.getTokenBalanceAcrossChainsRaw({
			id: WALLET,
			token: "IQ",
		});
		expect(r.matches.map((m) => m.chain).sort()).toEqual(["base", "eth"]);
		expect(r.total).toBe(11);
		expect(r.total_usd).toBe(22);
		expect(r.mixed_representations).toBe(true);
		expect(r.chains.sort()).toEqual(["base", "eth"]);
		expect(r.partial).toBe(false);
		expect(r.error).toBeUndefined();
	});
	it("surfaces partial + chains_skipped", async () => {
		vi.spyOn(userService, "_getUserTokensWithSkippedChains").mockResolvedValue({
			tokens: [T()],
			skipped: ["bsc"],
		});
		const r = await userService.getTokenBalanceAcrossChainsRaw({
			id: WALLET,
			token: "IQ",
		});
		expect(r.partial).toBe(true);
		expect(r.chains_skipped).toEqual(["bsc"]);
	});
	it("uses a single-chain fetch when chain is given", async () => {
		(resolveChain as any).mockResolvedValue("eth");
		const list = vi
			.spyOn(userService, "getUserTokenListRaw")
			.mockResolvedValue([T()]);
		const agg = vi.spyOn(userService, "_getUserTokensWithSkippedChains");
		const r = await userService.getTokenBalanceAcrossChainsRaw({
			id: WALLET,
			token: "IQ",
			chain: "ethereum",
		});
		expect(resolveChain).toHaveBeenCalledWith("ethereum");
		expect(list).toHaveBeenCalledWith(
			{ id: WALLET, chain_id: "eth", is_all: true },
			undefined,
		);
		expect(agg).not.toHaveBeenCalled();
		expect(r.total).toBe(1);
	});
	it("returns an error (fields zeroed) when the chain cannot be resolved", async () => {
		(resolveChain as any).mockResolvedValue(null);
		const r = await userService.getTokenBalanceAcrossChainsRaw({
			id: WALLET,
			token: "IQ",
			chain: "nope",
		});
		expect(r.error).toMatch(/nope/);
		expect(r.matches).toEqual([]);
		expect(r.total).toBe(0);
		expect(r.partial).toBe(false);
	});
	it("returns empty (no error) when nothing matches", async () => {
		vi.spyOn(userService, "_getUserTokensWithSkippedChains").mockResolvedValue({
			tokens: [T({ symbol: "DAI", name: "Dai", optimized_symbol: "DAI" })],
			skipped: [],
		});
		const r = await userService.getTokenBalanceAcrossChainsRaw({
			id: WALLET,
			token: "IQ",
		});
		expect(r.matches).toEqual([]);
		expect(r.error).toBeUndefined();
	});
	it("marks a non-finite amount null and excludes it from totals", async () => {
		vi.spyOn(userService, "_getUserTokensWithSkippedChains").mockResolvedValue({
			tokens: [
				T({ chain: "eth", amount: 5, price: 1 }),
				T({ chain: "base", amount: Number.NaN, price: 1 }),
			],
			skipped: [],
		});
		const r = await userService.getTokenBalanceAcrossChainsRaw({
			id: WALLET,
			token: "IQ",
		});
		expect(r.matches.find((m) => m.chain === "base")?.amount).toBeNull();
		expect(r.total).toBe(5);
	});
	it("survives a null name on a matched holding (defensive nullish coalesce)", async () => {
		// DeBank occasionally returns null `name` for custom/newly-deployed
		// tokens — the matcher matches via symbol, but downstream string ops
		// must not crash. Mirrors the cookbook's `p && p.name` precedent.
		vi.spyOn(userService, "_getUserTokensWithSkippedChains").mockResolvedValue({
			tokens: [
				T({ chain: "eth", name: null as unknown as string, symbol: "IQ" }),
				T({ chain: "base", name: "Everipedia IQ", symbol: "IQ" }),
			],
			skipped: [],
		});
		const r = await userService.getTokenBalanceAcrossChainsRaw({
			id: WALLET,
			token: "IQ",
		});
		expect(r.matches.find((m) => m.chain === "eth")?.name).toBe("");
		// Null name coalesces to "" — distinct from "everipedia iq" — so the
		// flag still surfaces. Without the guard the .trim() above would throw.
		expect(r.mixed_representations).toBe(true);
	});
});
