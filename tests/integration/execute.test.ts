// tests/integration/execute.test.ts

import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import type * as EntityResolver from "../../src/lib/entity-resolver.js";
import { executeTool } from "../../src/mcp/execute/tool.js";

const server = setupServer(
	http.get("https://pro-openapi.debank.com/v1/user/chain_balance", () =>
		HttpResponse.json({ usd_value: 1234.56 }),
	),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("execute integration", () => {
	it("happy path: returns JSON with ok:true", async () => {
		const res = await executeTool.execute({
			code: `async function run(d) { return await d.user.getUserChainBalance({ id: "0xabc", chain_id: "eth" }); }`,
		});
		const inner = JSON.parse(res.content[0]?.text);
		expect(res.isError).toBe(false);
		expect(inner.ok).toBe(true);
		expect(inner.result).toEqual({ usd_value: 1234.56 });
	});

	it("rejects TypeScript syntax with a helpful message", async () => {
		const res = await executeTool.execute({
			code: `async function run(d: any) { return null; }`,
		});
		const inner = JSON.parse(res.content[0]?.text);
		expect(res.isError).toBe(true);
		expect(inner.ok).toBe(false);
		expect(inner.error.toLowerCase()).toMatch(/unexpected|syntax/);
	});

	it("intentional throw → ok:false", async () => {
		const res = await executeTool.execute({
			code: `async function run(){ throw new Error("boom"); }`,
		});
		const inner = JSON.parse(res.content[0]?.text);
		expect(res.isError).toBe(true);
		expect(inner.ok).toBe(false);
		expect(inner.error).toBe("boom");
	});

	it("never-settling promise → outer race fires with canonical message", async () => {
		const prev = process.env.DEBANK_MCP_SANDBOX_DEADLINE_MS;
		process.env.DEBANK_MCP_SANDBOX_DEADLINE_MS = "1000";
		vi.resetModules();
		try {
			const { executeTool: fast } = await import(
				"../../src/mcp/execute/tool.js"
			);
			const res = await fast.execute({
				code: `async function run(){ await new Promise(() => {}); }`,
			});
			const inner = JSON.parse(res.content[0]?.text);
			expect(res.isError).toBe(true);
			expect(inner.error).toContain("Execute timed out after");
			expect(inner.error.toLowerCase()).toMatch(
				/no call to settle|non-yielding/,
			);
		} finally {
			if (prev === undefined) delete process.env.DEBANK_MCP_SANDBOX_DEADLINE_MS;
			else process.env.DEBANK_MCP_SANDBOX_DEADLINE_MS = prev;
			vi.resetModules();
		}
	}, 5_000);

	it("DeBank request that hangs >5s → canonical per-call timeout error", async () => {
		server.use(
			http.get("https://pro-openapi.debank.com/v1/chain", async () => {
				await new Promise((r) => setTimeout(r, 7_000));
				return HttpResponse.json({ id: "eth" });
			}),
		);
		const res = await executeTool.execute({
			code: `async function run(d) { return await d.chain.getChain({ id: "eth" }); }`,
		});
		const inner = JSON.parse(res.content[0]?.text);
		expect(res.isError).toBe(true);
		expect(inner.error).toContain("DeBank call timed out after 5s");
	}, 15_000);

	it("execute with debank.resolveChain inside (mocked resolver)", async () => {
		vi.resetModules();
		vi.doMock("../../src/lib/entity-resolver.js", async (importOriginal) => {
			const actual = await importOriginal<typeof EntityResolver>();
			return {
				...actual,
				resolveChain: vi.fn(async (n: string) =>
					n === "Polygon" ? "matic" : null,
				),
			};
		});
		server.use(
			http.get("https://pro-openapi.debank.com/v1/user/chain_balance", () =>
				HttpResponse.json({ usd_value: 99.9 }),
			),
		);

		try {
			const { executeTool: executeFresh } = await import(
				"../../src/mcp/execute/tool.js"
			);
			const res = await executeFresh.execute({
				code: `async function run(d) { const id = await d.resolveChain("Polygon"); return await d.user.getUserChainBalance({ id: "0xabc", chain_id: id }); }`,
			});
			const inner = JSON.parse(res.content[0]?.text);
			expect(inner.ok).toBe(true);
			expect(inner.result).toEqual({ usd_value: 99.9 });
		} finally {
			vi.doUnmock("../../src/lib/entity-resolver.js");
			vi.resetModules();
		}
	});
});
