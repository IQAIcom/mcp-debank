// src/services/user.service.test.ts
//
// Focused unit tests for the host-side aggregate method
// getUserTokensAcrossChainsRaw. Mocks the two underlying *Raw calls so
// we test the orchestration (chain filter + Promise.all + flatten) without
// crossing the network.

import { afterEach, describe, expect, it, vi } from "vitest";
import { userService } from "./index.js";

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
