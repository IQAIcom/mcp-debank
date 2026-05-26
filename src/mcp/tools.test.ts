import { afterEach, describe, expect, it, vi } from "vitest";
import type * as EntityResolver from "../lib/entity-resolver.js";

vi.mock("../lib/entity-resolver.js", async (importOriginal) => {
	const actual = await importOriginal<typeof EntityResolver>();
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
		const inner = JSON.parse(res.content[0]?.text);
		expect(inner).toEqual({ resolved: "bsc" });
	});

	it("ETH → eth", async () => {
		const { resolveTool } = await import("./tools.js");
		const res = await resolveTool.execute({ name: "ETH", type: "chain" });
		const inner = JSON.parse(res.content[0]?.text);
		expect(inner).toEqual({ resolved: "eth" });
	});

	it("unknown → resolved:null with canonical error", async () => {
		const { resolveTool } = await import("./tools.js");
		const res = await resolveTool.execute({
			name: "MadeUpChain",
			type: "chain",
		});
		const inner = JSON.parse(res.content[0]?.text);
		expect(inner.resolved).toBeNull();
		expect(inner.error).toBe(
			"Could not resolve 'MadeUpChain' as a chain. Try the exact chain ID (eth, bsc, matic, arb, …).",
		);
	});
});

describe("debank_get_supported_chain_list (default surface)", () => {
	it("returns chainService.getSupportedChainList markdown verbatim", async () => {
		const servicesMod = await import("../services/index.js");
		const getList = vi
			.spyOn(servicesMod.chainService, "getSupportedChainList")
			.mockResolvedValue("# Supported Chains\n\n* eth\n* bsc");

		const { supportedChainListTool } = await import("./tools.js");
		const res = await supportedChainListTool.execute({});

		expect(getList).toHaveBeenCalledTimes(1);
		expect(res.isError).toBe(false);
		expect(res.content[0]?.text).toBe("# Supported Chains\n\n* eth\n* bsc");
	});

	it("description matches v0.1 verbatim and parameters schema is empty", async () => {
		const { supportedChainListTool } = await import("./tools.js");
		expect(supportedChainListTool.description).toBe(
			"Retrieve a comprehensive list of all blockchain chains supported by the DeBank API. Returns information about each chain including their IDs, names, logo URLs, native token IDs, wrapped token IDs, and pre-execution support status. Use this to discover available chains before calling other chain-specific endpoints.",
		);
		const shape = (
			supportedChainListTool.parameters as unknown as {
				shape?: Record<string, unknown>;
			}
		).shape;
		expect(Object.keys(shape ?? {})).toEqual([]);
	});
});
