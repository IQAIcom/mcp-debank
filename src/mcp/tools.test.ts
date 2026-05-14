import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/entity-resolver.js", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("../lib/entity-resolver.js")>();
	return {
		...actual,
		resolveChain: vi.fn(async (n: string) => {
			if (n === "Binance Smart Chain") return "bsc";
			if (n === "ETH") return "eth";
			return null;
		}),
	};
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("debank_resolve", () => {
	it("Binance Smart Chain → bsc", async () => {
		const { resolveTool } = await import("./tools.js");
		const res = await resolveTool.execute({
			name: "Binance Smart Chain",
			type: "chain",
		});
		const inner = JSON.parse(res.content[0]!.text);
		expect(inner).toEqual({ resolved: "bsc" });
	});

	it("ETH → eth", async () => {
		const { resolveTool } = await import("./tools.js");
		const res = await resolveTool.execute({ name: "ETH", type: "chain" });
		const inner = JSON.parse(res.content[0]!.text);
		expect(inner).toEqual({ resolved: "eth" });
	});

	it("unknown → resolved:null with canonical error", async () => {
		const { resolveTool } = await import("./tools.js");
		const res = await resolveTool.execute({
			name: "MadeUpChain",
			type: "chain",
		});
		const inner = JSON.parse(res.content[0]!.text);
		expect(inner.resolved).toBeNull();
		expect(inner.error).toBe(
			"Could not resolve 'MadeUpChain' as a chain. Try the exact chain ID (eth, bsc, matic, arb, …).",
		);
	});
});

describe("debank_get_supported_chain_list (default surface)", () => {
	it("accepts _userQuery and pipes setQuery into ALL services before the call", async () => {
		const servicesMod = await import("../services/index.js");
		const setQueryChain = vi.spyOn(servicesMod.chainService, "setQuery");
		const setQueryProtocol = vi.spyOn(servicesMod.protocolService, "setQuery");
		const setQueryToken = vi.spyOn(servicesMod.tokenService, "setQuery");
		const setQueryTransaction = vi.spyOn(
			servicesMod.transactionService,
			"setQuery",
		);
		const setQueryUser = vi.spyOn(servicesMod.userService, "setQuery");
		const getList = vi
			.spyOn(servicesMod.chainService, "getSupportedChainList")
			.mockResolvedValue("# Supported Chains\n\n* eth\n* bsc");

		const { supportedChainListTool } = await import("./tools.js");
		const res = await supportedChainListTool.execute({
			_userQuery: "my query",
		});

		expect(setQueryChain).toHaveBeenCalledWith("my query");
		expect(setQueryProtocol).toHaveBeenCalledWith("my query");
		expect(setQueryToken).toHaveBeenCalledWith("my query");
		expect(setQueryTransaction).toHaveBeenCalledWith("my query");
		expect(setQueryUser).toHaveBeenCalledWith("my query");

		expect(getList).toHaveBeenCalledTimes(1);
		expect(res.isError).toBe(false);
		expect(res.content[0]!.text).toBe("# Supported Chains\n\n* eth\n* bsc");
	});

	it("without _userQuery, setQuery is still called with empty string to clear prior state", async () => {
		const servicesMod = await import("../services/index.js");
		const setQueryChain = vi
			.spyOn(servicesMod.chainService, "setQuery")
			.mockClear();
		const setQueryProtocol = vi
			.spyOn(servicesMod.protocolService, "setQuery")
			.mockClear();
		const setQueryToken = vi
			.spyOn(servicesMod.tokenService, "setQuery")
			.mockClear();
		const setQueryTransaction = vi
			.spyOn(servicesMod.transactionService, "setQuery")
			.mockClear();
		const setQueryUser = vi
			.spyOn(servicesMod.userService, "setQuery")
			.mockClear();
		vi.spyOn(
			servicesMod.chainService,
			"getSupportedChainList",
		).mockResolvedValue("# Chains");

		const { supportedChainListTool } = await import("./tools.js");
		const res = await supportedChainListTool.execute({});

		// Empty string clears any leaked query from a prior call (services are singletons).
		expect(setQueryChain).toHaveBeenCalledWith("");
		expect(setQueryProtocol).toHaveBeenCalledWith("");
		expect(setQueryToken).toHaveBeenCalledWith("");
		expect(setQueryTransaction).toHaveBeenCalledWith("");
		expect(setQueryUser).toHaveBeenCalledWith("");
		expect(res.content[0]!.text).toBe("# Chains");
	});

	it("description and schema match v0.1 verbatim", async () => {
		const { supportedChainListTool } = await import("./tools.js");
		expect(supportedChainListTool.description).toBe(
			"Retrieve a comprehensive list of all blockchain chains supported by the DeBank API. Returns information about each chain including their IDs, names, logo URLs, native token IDs, wrapped token IDs, and pre-execution support status. Use this to discover available chains before calling other chain-specific endpoints.",
		);
		const shape = (
			supportedChainListTool.parameters as unknown as {
				shape?: Record<string, unknown>;
			}
		).shape;
		expect(Object.keys(shape ?? {})).toEqual(["_userQuery"]);
	});
});
