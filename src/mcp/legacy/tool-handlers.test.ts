import { describe, expect, it, vi } from "vitest";
import { legacyTools } from "./tool-handlers.js";

vi.mock("../../services/index.js", () => ({
	chainService: {
		setQuery: vi.fn(),
		getSupportedChainList: vi.fn(async () => "# chains"),
	},
	protocolService: { setQuery: vi.fn() },
	tokenService: { setQuery: vi.fn() },
	transactionService: { setQuery: vi.fn() },
	userService: { setQuery: vi.fn() },
}));

vi.mock("../../lib/entity-resolver.js", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../lib/entity-resolver.js")>()),
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
		const result = await tool!.execute({ _userQuery: "test" });
		expect(result).toBe("# chains");
	});

	it("calls without _userQuery clear singleton state from a prior call (no leak)", async () => {
		const servicesMod = await import("../../services/index.js");
		const setQuerySpy = vi.spyOn(servicesMod.chainService, "setQuery");
		const getList = vi
			.spyOn(servicesMod.chainService, "getSupportedChainList")
			.mockResolvedValue("# x");
		setQuerySpy.mockClear();
		getList.mockClear();

		const tool = legacyTools.find(
			(t) => t.name === "debank_get_supported_chain_list",
		);
		expect(tool).toBeDefined();

		// 1st call with a query — sets currentQuery on each service
		await tool!.execute({ _userQuery: "alice" });
		// 2nd call WITHOUT a query — must clear, not leak "alice"
		await tool!.execute({});

		// Last setQuery call should be the clear ("")
		expect(setQuerySpy).toHaveBeenLastCalledWith("");
		expect(getList).toHaveBeenCalledTimes(2);
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
		await tool!.execute({ id: "Ethereum" });
		expect(getChain).toHaveBeenCalledWith(
			expect.objectContaining({ id: "eth" }),
		);
	});
});

describe("TOOL_METADATA method-path resolution", () => {
	it("every legacyMethodPath and sandboxMethodPath resolves to a callable on its singleton", async () => {
		const realServices = await vi.importActual<
			typeof import("../../services/index.js")
		>("../../services/index.js");
		const { TOOL_METADATA } =
			await vi.importActual<typeof import("./tool-metadata.js")>(
				"./tool-metadata.js",
			);

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
			const singleton = SERVICE_MAP[singletonName!];
			return singleton?.[methodName!];
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
