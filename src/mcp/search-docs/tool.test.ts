import { describe, expect, it } from "vitest";
import { searchDocsTool } from "./tool.js";

describe("search_docs", () => {
	it("returns getUserNftList for 'get NFTs for wallet'", async () => {
		const res = await searchDocsTool.execute({ query: "get NFTs for wallet" });
		const inner = JSON.parse(res.content[0]?.text);
		expect(inner.results[0].qualified).toMatch(/getUserNftList/i);
	});

	it("returns empty results + hint for blank query", async () => {
		const res = await searchDocsTool.execute({ query: "" });
		const inner = JSON.parse(res.content[0]?.text);
		expect(inner.results).toEqual([]);
		expect(inner.hint).toMatch(/Provide a query/i);
	});

	it("returns empty results + hint when no match", async () => {
		const res = await searchDocsTool.execute({
			query: "xyzzyplugh_no_match_term_42",
		});
		const inner = JSON.parse(res.content[0]?.text);
		expect(inner.results).toEqual([]);
		expect(inner.hint).toMatch(
			/debank_resolve|debank_get_supported_chain_list/,
		);
	});
});
