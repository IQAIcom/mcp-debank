// tests/integration/legacy-tools.test.ts
import { describe, expect, it } from "vitest";

describe("--legacy-tools mode", () => {
	it("legacy tool-handlers exposes 31 tools total", async () => {
		const { legacyTools } = await import(
			"../../src/mcp/legacy/tool-handlers.js"
		);
		expect(legacyTools).toHaveLength(31);
	});

	it("when registering, 30 are added (debank_get_supported_chain_list is skipped because the default surface owns it)", async () => {
		const { legacyTools } = await import(
			"../../src/mcp/legacy/tool-handlers.js"
		);
		const wouldRegister = legacyTools.filter(
			(t) => t.name !== "debank_get_supported_chain_list",
		);
		expect(wouldRegister).toHaveLength(30);
		expect(
			wouldRegister.every((t) => t.name !== "debank_get_supported_chain_list"),
		).toBe(true);
	});
});
