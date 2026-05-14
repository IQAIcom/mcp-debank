// src/mcp/execute/tool.ts
//
// MCP tool definition for `execute`. Loaded statically by the server entry,
// but the heavy lifting (isolated-vm) is dynamic-imported on first call so
// the addon doesn't load at server startup.

import { z } from "zod";

const PARAMS = z.object({
	code: z
		.string()
		.describe(
			"JavaScript source defining async function run(debank). No type annotations.",
		),
	intent: z
		.string()
		.optional()
		.describe("Optional: what task you're trying to perform. Telemetry only."),
});

export const executeTool = {
	name: "execute",
	description:
		"Run async JavaScript against a pre-authenticated DeBank client. Define `async function run(debank) { ... }` and the return value (JSON-serializable) is sent back to you, plus any console.log output. The debank client mirrors the services: debank.chain, debank.protocol, debank.token, debank.user, debank.transaction, plus debank.resolveChain / resolveChains / resolveWrappedToken helpers. Note: this is JavaScript, not TypeScript — do not use type annotations. Variables do NOT persist between calls. No fs, no network outside the debank client.",
	parameters: PARAMS,
	annotations: { readOnlyHint: false },
	execute: async (args: z.infer<typeof PARAMS>) => {
		let sandboxResult: import("./sandbox.js").SandboxResult;
		try {
			const [{ runInSandbox }, { installDebankClient }] = await Promise.all([
				import("./sandbox.js"),
				import("./client.js"),
			]);
			sandboxResult = await runInSandbox(args.code, installDebankClient);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			const isLoadFailure =
				/isolated-vm|MODULE_NOT_FOUND|self-register|cannot find module/i.test(
					msg,
				);
			sandboxResult = {
				ok: false,
				error: isLoadFailure
					? `isolated-vm native module failed to load. On Alpine/ARM/older Node, run 'pnpm rebuild isolated-vm'. Original error: ${msg}`
					: msg,
				log_lines: [],
				err_lines: err instanceof Error && err.stack ? [err.stack] : [],
			};
		}

		const inner = JSON.stringify(sandboxResult);
		return {
			content: [{ type: "text" as const, text: inner }],
			isError: !sandboxResult.ok,
		};
	},
};
