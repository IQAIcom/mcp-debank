import { describe, expect, it, vi } from "vitest";

vi.mock("./sandbox.js", () => ({
	runInSandbox: vi.fn(async () => {
		const err = new Error("Cannot find module 'isolated-vm'") as Error & {
			code?: string;
		};
		err.code = "ERR_MODULE_NOT_FOUND";
		throw err;
	}),
}));

describe("executeTool error envelope", () => {
	it("isolated-vm load failure → canonical message in {ok:false}", async () => {
		const { executeTool } = await import("./tool.js");
		const res = await executeTool.execute({ code: "async function run(){}" });
		const inner = JSON.parse(res.content[0]!.text);
		expect(res.isError).toBe(true);
		expect(inner.ok).toBe(false);
		expect(inner.error).toContain("isolated-vm native module failed to load");
		expect(inner.error).toContain("pnpm rebuild isolated-vm");
	});
});
