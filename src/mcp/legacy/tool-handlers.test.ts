import { describe, expect, it, vi } from "vitest";
import type * as EntityResolver from "../../lib/entity-resolver.js";
import { legacyTools } from "./tool-handlers.js";

vi.mock("../../services/index.js", () => ({
	chainService: {
		getSupportedChainList: vi.fn(async () => "# chains"),
	},
	protocolService: {},
	tokenService: {},
	transactionService: {},
	userService: {},
}));

vi.mock("../../lib/entity-resolver.js", async (importOriginal) => ({
	...(await importOriginal<typeof EntityResolver>()),
	resolveEntities: vi.fn(async () => {}),
	resolveChain: vi.fn(async () => null),
	looksLikeChainName: vi.fn(() => true),
}));

describe("tool-handlers.legacyTools", () => {
	it("exposes 31 tools", () => {
		expect(legacyTools).toHaveLength(31);
	});

	it("each entry has name, description, parameters, execute", () => {
		for (const t of legacyTools) {
			expect(t.name).toMatch(/^debank_/);
			expect(typeof t.execute).toBe("function");
			expect(t.parameters).toBeDefined();
		}
	});

	it("execute() dispatches via the typed legacyImpl thunk", async () => {
		const tool = legacyTools.find(
			(t) => t.name === "debank_get_supported_chain_list",
		);
		expect(tool).toBeDefined();
		const result = await tool?.execute({});
		expect(result).toBe("# chains");
	});

	it("debank_get_chain resolves args.id as a chain name (v0.1 quirk)", async () => {
		const resolverMod = await import("../../lib/entity-resolver.js");
		vi.mocked(resolverMod.resolveChain).mockResolvedValueOnce("eth");
		const servicesMod = await import("../../services/index.js");
		const getChain = vi.fn(async () => "# eth markdown");
		(servicesMod.chainService as unknown as Record<string, unknown>).getChain =
			getChain;

		const tool = legacyTools.find((t) => t.name === "debank_get_chain");
		expect(tool).toBeDefined();
		await tool?.execute({ id: "Ethereum" });
		expect(getChain).toHaveBeenCalledWith(
			expect.objectContaining({ id: "eth" }),
		);
	});
});
