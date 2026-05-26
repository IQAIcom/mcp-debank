import { describe, expect, it, vi } from "vitest";
import type * as EntityResolver from "../../lib/entity-resolver.js";
import type * as Services from "../../services/index.js";
import { legacyTools } from "./tool-handlers.js";
import type * as ToolMetadata from "./tool-metadata.js";

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
	needsResolution: vi.fn(() => true),
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

	it("execute() dispatches via the legacyMethodPath", async () => {
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

describe("TOOL_METADATA method-path resolution", () => {
	it("every legacyMethodPath and sandboxMethodPath resolves to a callable on its singleton", async () => {
		const realServices = await vi.importActual<typeof Services>(
			"../../services/index.js",
		);
		const { TOOL_METADATA } =
			await vi.importActual<typeof ToolMetadata>("./tool-metadata.js");

		const SERVICE_MAP: Record<string, Record<string, unknown>> = {
			chainService: realServices.chainService as unknown as Record<
				string,
				unknown
			>,
			protocolService: realServices.protocolService as unknown as Record<
				string,
				unknown
			>,
			tokenService: realServices.tokenService as unknown as Record<
				string,
				unknown
			>,
			transactionService: realServices.transactionService as unknown as Record<
				string,
				unknown
			>,
			userService: realServices.userService as unknown as Record<
				string,
				unknown
			>,
		};

		const resolve = (path: string): unknown => {
			const [singletonName, methodName] = path.split(".");
			if (!singletonName || !methodName) return undefined;
			return SERVICE_MAP[singletonName]?.[methodName];
		};

		for (const m of TOOL_METADATA) {
			const legacyFn = resolve(m.legacyMethodPath);
			const rawFn = resolve(m.sandboxMethodPath);
			expect(
				typeof legacyFn,
				`legacyMethodPath ${m.legacyMethodPath} (tool ${m.name})`,
			).toBe("function");
			expect(
				typeof rawFn,
				`sandboxMethodPath ${m.sandboxMethodPath} (tool ${m.name})`,
			).toBe("function");
		}
	});
});
