import { describe, expect, it } from "vitest";
import { matchesTokenReference } from "./token-matcher.js";

const holding = (
	over: Partial<Parameters<typeof matchesTokenReference>[1]> = {},
) => ({
	id: "0x0000000000000000000000000000000000000001",
	name: "USD Coin",
	symbol: "USDC",
	display_symbol: null as string | null,
	optimized_symbol: "USDC",
	...over,
});

describe("matchesTokenReference", () => {
	it("matches by symbol, case-insensitively", () => {
		expect(matchesTokenReference("usdc", holding())).toBe(true);
		expect(matchesTokenReference("USDC", holding())).toBe(true);
	});
	it("matches by name with a trailing descriptor stripped", () => {
		expect(matchesTokenReference("USD Coin", holding())).toBe(true);
		expect(
			matchesTokenReference(
				"IQ token",
				holding({ name: "Everipedia IQ", symbol: "IQ" }),
			),
		).toBe(true);
	});
	it("preserves a sole-word descriptor", () => {
		expect(
			matchesTokenReference("Coin", holding({ name: "Coin", symbol: "COIN" })),
		).toBe(true);
		expect(
			matchesTokenReference("Token", holding({ name: "Token", symbol: "TKN" })),
		).toBe(true);
	});
	it("rejects substring matches", () => {
		expect(
			matchesTokenReference("IQ", holding({ name: "hiIQ", symbol: "hiIQ" })),
		).toBe(false);
	});
	it("matches via post-normalize equality, not substring", () => {
		expect(matchesTokenReference("USD", holding())).toBe(true);
	});
	it("matches display_symbol / optimized_symbol when present", () => {
		expect(
			matchesTokenReference(
				"WETH",
				holding({
					name: "Wrapped Ether",
					symbol: "ETH",
					optimized_symbol: "WETH",
				}),
			),
		).toBe(true);
	});
	it("is null-safe for display_symbol and never matches an empty reference", () => {
		expect(() =>
			matchesTokenReference("usdc", holding({ display_symbol: null })),
		).not.toThrow();
		expect(
			matchesTokenReference(
				"",
				holding({
					name: "",
					symbol: "",
					display_symbol: null,
					optimized_symbol: "",
				}),
			),
		).toBe(false);
		expect(matchesTokenReference("   ", holding())).toBe(false);
	});
	it("matches a 0x address against holding.id, case-insensitively", () => {
		expect(
			matchesTokenReference(
				"0x" + "A".repeat(40),
				holding({ id: "0x" + "a".repeat(40) }),
			),
		).toBe(true);
	});
	it("falls back to name/symbol for a malformed 0x reference", () => {
		expect(
			matchesTokenReference("0xABC", holding({ name: "0xABC", symbol: "X" })),
		).toBe(true);
		expect(matchesTokenReference("0xABC", holding())).toBe(false);
	});
});
