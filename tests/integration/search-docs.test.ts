// tests/integration/search-docs.test.ts
import { describe, expect, it } from "vitest";
import { searchDocsTool } from "../../src/mcp/search-docs/tool.js";

describe("search_docs integration", () => {
	it("'get token balance' surfaces getUserTokenBalance", async () => {
		const res = await searchDocsTool.execute({ query: "get token balance" });
		const inner = JSON.parse(res.content[0]!.text);
		const names = inner.results
			.map((r: { name?: string }) => r.name)
			.filter(Boolean);
		expect(names).toContain("debank_get_user_token_balance");
	});

	it("'explain tx' surfaces explain_transaction", async () => {
		const res = await searchDocsTool.execute({ query: "explain tx" });
		const inner = JSON.parse(res.content[0]!.text);
		const names = inner.results
			.map((r: { name?: string }) => r.name)
			.filter(Boolean);
		expect(names).toContain("debank_explain_transaction");
	});

	it("'polygon nfts' surfaces at least one NFT method", async () => {
		const res = await searchDocsTool.execute({ query: "polygon nfts" });
		const inner = JSON.parse(res.content[0]!.text);
		const names = inner.results
			.map((r: { name?: string }) => r.name)
			.filter(Boolean);
		expect(names.some((n: string) => n.includes("nft"))).toBe(true);
	});

	it("verbose mode includes full content", async () => {
		const res = await searchDocsTool.execute({
			query: "net curve",
			detail: "verbose",
		});
		const inner = JSON.parse(res.content[0]!.text);
		expect(inner.results.length).toBeGreaterThan(0);
	});
});
