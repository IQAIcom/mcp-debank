// src/mcp/execute/client.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Partial mock so resolveWrappedToken keeps its real chains.ts lookup.
// .js extension matches the runtime import string (NodeNext project).
vi.mock("../../lib/entity-resolver.js", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("../../lib/entity-resolver.js")>();
	return {
		...actual,
		resolveChain: vi.fn(async (n: string) => (n === "BSC" ? "bsc" : null)),
		resolveChains: vi.fn(async (cs: string) =>
			cs === "Ethereum, Polygon" ? "eth,matic" : null,
		),
	};
});

describe("execute/client.ts proxy forwarding", () => {
	let isolate: import("isolated-vm").Isolate | undefined;

	beforeEach(async () => {
		vi.resetModules();
	});

	afterEach(() => {
		try {
			isolate?.dispose();
		} catch {
			/* idempotent */
		}
		isolate = undefined;
		vi.restoreAllMocks();
	});

	it("naming asymmetry: guest debank.user.getUserChainBalance dispatches to userService.getUserChainBalanceRaw", async () => {
		const servicesMod = await import("../../services/index.js");
		const rawSpy = vi
			.spyOn(
				servicesMod.userService as unknown as {
					getUserChainBalanceRaw: (...a: unknown[]) => Promise<unknown>;
				},
				"getUserChainBalanceRaw",
			)
			.mockResolvedValue({ usd_value: 42 } as never);

		const mod = await import("isolated-vm");
		const ivm =
			(mod as { default?: typeof import("isolated-vm") }).default ?? mod;
		isolate = new ivm.Isolate({ memoryLimit: 64 });
		const ctx = await isolate.createContext();
		await ctx.global.set(
			"debank",
			new ivm.ExternalCopy({}).copyInto({ release: true }),
		);

		const { installDebankClient } = await import("./client.js");
		await installDebankClient(ctx);

		const script = await isolate.compileScript(
			`(async () => { return await debank.user.getUserChainBalance({chain_id:"eth", id:"0xabc"}); })()`,
		);
		const result = await script.run(ctx, {
			timeout: 5_000,
			promise: true,
			copy: true,
		});

		expect(rawSpy).toHaveBeenCalledTimes(1);
		expect(rawSpy).toHaveBeenCalledWith(
			{ chain_id: "eth", id: "0xabc" },
			expect.objectContaining({
				signal: expect.any(AbortSignal),
				timeout: 6_000,
			}),
		);
		expect(result).toEqual({ usd_value: 42 });
	});

	it("guest cannot see the Raw suffix — debank.user.getUserChainBalanceRaw is undefined", async () => {
		const mod = await import("isolated-vm");
		const ivm =
			(mod as { default?: typeof import("isolated-vm") }).default ?? mod;
		isolate = new ivm.Isolate({ memoryLimit: 64 });
		const ctx = await isolate.createContext();
		await ctx.global.set(
			"debank",
			new ivm.ExternalCopy({}).copyInto({ release: true }),
		);

		const { installDebankClient } = await import("./client.js");
		await installDebankClient(ctx);

		const script = await isolate.compileScript(
			`(async () => { return typeof debank.user.getUserChainBalanceRaw; })()`,
		);
		const t = await script.run(ctx, {
			timeout: 5_000,
			promise: true,
			copy: true,
		});
		expect(t).toBe("undefined");
	});

	it("debank.resolveChain forwards to the mocked resolver", async () => {
		const mod = await import("isolated-vm");
		const ivm =
			(mod as { default?: typeof import("isolated-vm") }).default ?? mod;
		isolate = new ivm.Isolate({ memoryLimit: 64 });
		const ctx = await isolate.createContext();
		await ctx.global.set(
			"debank",
			new ivm.ExternalCopy({}).copyInto({ release: true }),
		);

		const { installDebankClient } = await import("./client.js");
		await installDebankClient(ctx);

		const script = await isolate.compileScript(
			`(async () => { return await debank.resolveChain("BSC"); })()`,
		);
		expect(
			await script.run(ctx, { timeout: 5_000, promise: true, copy: true }),
		).toBe("bsc");
	});

	it("debank.resolveChains forwards and returns the joined string", async () => {
		const mod = await import("isolated-vm");
		const ivm =
			(mod as { default?: typeof import("isolated-vm") }).default ?? mod;
		isolate = new ivm.Isolate({ memoryLimit: 64 });
		const ctx = await isolate.createContext();
		await ctx.global.set(
			"debank",
			new ivm.ExternalCopy({}).copyInto({ release: true }),
		);

		const { installDebankClient } = await import("./client.js");
		await installDebankClient(ctx);

		const script = await isolate.compileScript(
			`(async () => { return await debank.resolveChains("Ethereum, Polygon"); })()`,
		);
		expect(
			await script.run(ctx, { timeout: 5_000, promise: true, copy: true }),
		).toBe("eth,matic");
	});

	it("debank.resolveWrappedToken uses the REAL chains.ts lookup (no mock)", async () => {
		const mod = await import("isolated-vm");
		const ivm =
			(mod as { default?: typeof import("isolated-vm") }).default ?? mod;
		isolate = new ivm.Isolate({ memoryLimit: 64 });
		const ctx = await isolate.createContext();
		await ctx.global.set(
			"debank",
			new ivm.ExternalCopy({}).copyInto({ release: true }),
		);

		const { installDebankClient } = await import("./client.js");
		await installDebankClient(ctx);

		const script = await isolate.compileScript(
			`(async () => { return debank.resolveWrappedToken("WETH", "eth"); })()`,
		);
		const wethAddr = await script.run(ctx, {
			timeout: 5_000,
			promise: true,
			copy: true,
		});
		expect(typeof wethAddr).toBe("string");
		expect(wethAddr).toMatch(/^0x[a-f0-9]{40}$/i);

		const script2 = await isolate.compileScript(
			`(async () => { return debank.resolveWrappedToken("WETH", "definitely_not_a_chain"); })()`,
		);
		expect(
			await script2.run(ctx, { timeout: 5_000, promise: true, copy: true }),
		).toBeNull();
	});

	it("errors from *Raw propagate through the Callback boundary", async () => {
		const servicesMod = await import("../../services/index.js");
		vi.spyOn(
			servicesMod.userService as unknown as {
				getUserChainBalanceRaw: (...a: unknown[]) => Promise<unknown>;
			},
			"getUserChainBalanceRaw",
		).mockRejectedValue(new Error("upstream 503") as never);

		const mod = await import("isolated-vm");
		const ivm =
			(mod as { default?: typeof import("isolated-vm") }).default ?? mod;
		isolate = new ivm.Isolate({ memoryLimit: 64 });
		const ctx = await isolate.createContext();
		await ctx.global.set(
			"debank",
			new ivm.ExternalCopy({}).copyInto({ release: true }),
		);

		const { installDebankClient } = await import("./client.js");
		await installDebankClient(ctx);

		const script = await isolate.compileScript(
			`(async () => {
				try { await debank.user.getUserChainBalance({chain_id:"eth", id:"0xabc"}); return "no-error"; }
				catch (e) { return e.message; }
			})()`,
		);
		const msg = await script.run(ctx, {
			timeout: 5_000,
			promise: true,
			copy: true,
		});
		expect(msg).toBe("upstream 503");
	});
});
