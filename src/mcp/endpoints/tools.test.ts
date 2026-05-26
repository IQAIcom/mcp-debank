// src/mcp/endpoints/tools.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../legacy/tool-metadata.js", () => {
	const { z } = require("zod");
	const fakeRawFn = vi.fn();
	return {
		TOOL_METADATA: [
			{
				name: "debank_get_chain",
				qualified: "debank.chain.getChain",
				description: "Get chain info.",
				parameters: z.object({ id: z.string() }),
				responseSchema: z.object({ id: z.string(), name: z.string() }),
				exampleCall: "await debank.chain.getChain({id: 'eth'})",
				legacyImpl: vi.fn(),
				sandboxImpl: vi.fn(async () => fakeRawFn),
			},
			{
				name: "debank_get_user_chain_balance",
				qualified: "debank.user.getUserChainBalance",
				description: "Get user chain balance.",
				parameters: z.object({ id: z.string(), chain_id: z.string() }),
				responseSchema: z.object({ usd_value: z.number() }),
				exampleCall: "await debank.user.getUserChainBalance({...})",
				legacyImpl: vi.fn(),
				sandboxImpl: vi.fn(async () => fakeRawFn),
			},
		],
		// also re-export the spy so tests can manipulate
		__fakeRawFn: fakeRawFn,
	};
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("list_endpoints", () => {
	it("returns all endpoints when no filter is provided", async () => {
		const { listEndpointsTool } = await import("./tools.js");
		const res = await listEndpointsTool.execute({});
		const inner = JSON.parse(res.content[0]?.text);
		expect(inner.endpoints).toHaveLength(2);
		expect(inner.endpoints[0]).toHaveProperty("qualified");
		expect(inner.endpoints[0]).toHaveProperty("description");
	});

	it("narrows results when a filter is provided", async () => {
		const { listEndpointsTool } = await import("./tools.js");
		const res = await listEndpointsTool.execute({ filter: "user" });
		const inner = JSON.parse(res.content[0]?.text);
		expect(inner.endpoints).toHaveLength(1);
		expect(inner.endpoints[0].qualified).toBe(
			"debank.user.getUserChainBalance",
		);
	});
});

describe("get_endpoint_schema", () => {
	it("returns schema for a known endpoint", async () => {
		const { getEndpointSchemaTool } = await import("./tools.js");
		const res = await getEndpointSchemaTool.execute({
			name: "debank.chain.getChain",
		});
		const inner = JSON.parse(res.content[0]?.text);
		expect(res.isError).toBe(false);
		expect(inner.qualified).toBe("debank.chain.getChain");
		expect(inner.params).toBeDefined();
		expect(inner.response).toBeDefined();
		expect(inner.exampleCall).toContain("debank.chain.getChain");
	});

	it("returns an error for an unknown endpoint", async () => {
		const { getEndpointSchemaTool } = await import("./tools.js");
		const res = await getEndpointSchemaTool.execute({
			name: "debank.unknown.method",
		});
		const inner = JSON.parse(res.content[0]?.text);
		expect(res.isError).toBe(true);
		expect(inner.error).toContain("Unknown endpoint");
	});
});

describe("invoke_endpoint", () => {
	it("happy path: dispatches the raw fn and returns its result", async () => {
		const metadataMod = await import("../legacy/tool-metadata.js");
		const fakeRawFn = (
			metadataMod as unknown as { __fakeRawFn: ReturnType<typeof vi.fn> }
		).__fakeRawFn;
		fakeRawFn.mockResolvedValueOnce({ id: "eth", name: "Ethereum" });

		const { invokeEndpointTool } = await import("./tools.js");
		const res = await invokeEndpointTool.execute({
			name: "debank.chain.getChain",
			params: { id: "eth" },
		});
		const inner = JSON.parse(res.content[0]?.text);
		expect(res.isError).toBe(false);
		expect(inner).toEqual({ id: "eth", name: "Ethereum" });
		expect(fakeRawFn).toHaveBeenCalledWith({ id: "eth" });
	});

	it("applies jq_filter to the response", async () => {
		const metadataMod = await import("../legacy/tool-metadata.js");
		const fakeRawFn = (
			metadataMod as unknown as { __fakeRawFn: ReturnType<typeof vi.fn> }
		).__fakeRawFn;
		fakeRawFn.mockResolvedValueOnce({ id: "eth", name: "Ethereum" });

		const { invokeEndpointTool } = await import("./tools.js");
		const res = await invokeEndpointTool.execute({
			name: "debank.chain.getChain",
			params: { id: "eth" },
			jq_filter: ".name",
		});
		const inner = JSON.parse(res.content[0]?.text);
		expect(res.isError).toBe(false);
		expect(inner).toBe("Ethereum");
	});

	it("returns an error for unknown endpoint", async () => {
		const { invokeEndpointTool } = await import("./tools.js");
		const res = await invokeEndpointTool.execute({
			name: "debank.unknown.method",
			params: {},
		});
		const inner = JSON.parse(res.content[0]?.text);
		expect(res.isError).toBe(true);
		expect(inner.error).toContain("Unknown endpoint");
	});

	it("returns a validation error for invalid params", async () => {
		const { invokeEndpointTool } = await import("./tools.js");
		const res = await invokeEndpointTool.execute({
			name: "debank.chain.getChain",
			params: {}, // missing required `id`
		});
		const inner = JSON.parse(res.content[0]?.text);
		expect(res.isError).toBe(true);
		expect(inner.error).toContain("Invalid params");
		expect(inner.expectedSchema).toBeDefined();
	});

	it("propagates errors from the raw fn as a tool error", async () => {
		const metadataMod = await import("../legacy/tool-metadata.js");
		const fakeRawFn = (
			metadataMod as unknown as { __fakeRawFn: ReturnType<typeof vi.fn> }
		).__fakeRawFn;
		fakeRawFn.mockRejectedValueOnce(new Error("upstream 503"));

		const { invokeEndpointTool } = await import("./tools.js");
		const res = await invokeEndpointTool.execute({
			name: "debank.chain.getChain",
			params: { id: "eth" },
		});
		const inner = JSON.parse(res.content[0]?.text);
		expect(res.isError).toBe(true);
		expect(inner.error).toContain("debank.chain.getChain failed");
		expect(inner.error).toContain("upstream 503");
	});
});
