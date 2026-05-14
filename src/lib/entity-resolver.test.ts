import { describe, expect, it } from "vitest";
import { resolveWrappedToken } from "./entity-resolver.js";

describe("resolveWrappedToken", () => {
	it("returns the wrapped-native address for the keyword 'WETH' on eth", () => {
		const r = resolveWrappedToken("WETH", "eth");
		expect(typeof r).toBe("string");
		expect(r).toMatch(/^0x[a-f0-9]{40}$/i);
	});

	it("is case-insensitive: 'weth' / 'WETH' / ' Weth ' all match", () => {
		const a = resolveWrappedToken("weth", "eth");
		const b = resolveWrappedToken("WETH", "eth");
		const c = resolveWrappedToken(" Weth ", "eth");
		expect(a).toBe(b);
		expect(b).toBe(c);
	});

	it("recognises 'wrapped native' and 'native token' aliases", () => {
		const a = resolveWrappedToken("wrapped native", "eth");
		const b = resolveWrappedToken("native token", "eth");
		expect(typeof a).toBe("string");
		expect(typeof b).toBe("string");
	});

	it("returns null for unrelated tokens (e.g., 'USDT')", () => {
		// Prior bug: function ignored the keyword and returned WETH for any input.
		expect(resolveWrappedToken("USDT", "eth")).toBeNull();
		expect(resolveWrappedToken("DAI", "eth")).toBeNull();
		expect(resolveWrappedToken("", "eth")).toBeNull();
	});

	it("returns null for unknown chains regardless of keyword", () => {
		expect(resolveWrappedToken("WETH", "definitely_not_a_chain")).toBeNull();
	});

	it("accepts chain-specific wrapped-native symbols like WBNB / WMATIC / WAVAX (parity with v0.1 needsResolution)", async () => {
		// These wrap-symbols were handled by v0.1 legacy auto-resolution via
		// needsResolution(..., "token") returning true. The Code Mode public
		// helper must accept them too.
		const wbnb = resolveWrappedToken("WBNB", "bsc");
		const wmatic = resolveWrappedToken("WMATIC", "matic");
		const wavax = resolveWrappedToken("WAVAX", "avax");
		expect(wbnb).toMatch(/^0x[a-f0-9]{40}$/i);
		expect(wmatic).toMatch(/^0x[a-f0-9]{40}$/i);
		expect(wavax).toMatch(/^0x[a-f0-9]{40}$/i);
	});

	it("returns null for 0x addresses (no resolution needed)", async () => {
		// needsResolution short-circuits on 0x...40-char inputs, so resolveWrappedToken
		// returns null and callers know to use the address as-is.
		expect(resolveWrappedToken(`0x${"a".repeat(40)}`, "eth")).toBeNull();
	});
});
