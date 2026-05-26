// src/mcp/tools.ts
//
// Two default convenience tools registered alongside execute and search_docs.

import { z } from "zod";
import { resolveChain } from "../lib/entity-resolver.js";
import { chainService } from "../services/index.js";

const RESOLVE_PARAMS = z.object({
	name: z
		.string()
		.describe("Free-text chain name like 'BSC' or 'Binance Smart Chain'."),
	type: z
		.enum(["chain"])
		.describe("Entity type to resolve. Currently only 'chain' is supported."),
});

export const resolveTool = {
	name: "debank_resolve",
	description:
		"Resolve a human-readable chain name (e.g. 'BSC', 'Binance Smart Chain', 'Polygon') to a DeBank chain ID. Returns { resolved: '<id>' } on success or { resolved: null, error: '...' } on miss.",
	parameters: RESOLVE_PARAMS,
	annotations: { readOnlyHint: true },
	execute: async (args: z.infer<typeof RESOLVE_PARAMS>) => {
		const resolved = await resolveChain(args.name);
		if (resolved) {
			return {
				content: [
					{ type: "text" as const, text: JSON.stringify({ resolved }) },
				],
				isError: false,
			};
		}
		return {
			content: [
				{
					type: "text" as const,
					text: JSON.stringify({
						resolved: null,
						error: `Could not resolve '${args.name}' as a chain. Try the exact chain ID (eth, bsc, matic, arb, …).`,
					}),
				},
			],
			isError: false,
		};
	},
};

const CHAIN_LIST_PARAMS = z.object({});

export const supportedChainListTool = {
	name: "debank_get_supported_chain_list",
	description:
		"Retrieve a comprehensive list of all blockchain chains supported by the DeBank API. Returns information about each chain including their IDs, names, logo URLs, native token IDs, wrapped token IDs, and pre-execution support status. Use this to discover available chains before calling other chain-specific endpoints.",
	parameters: CHAIN_LIST_PARAMS,
	annotations: { readOnlyHint: true },
	execute: async (_args: z.infer<typeof CHAIN_LIST_PARAMS>) => {
		const md = await chainService.getSupportedChainList();
		return { content: [{ type: "text" as const, text: md }], isError: false };
	},
};

export const defaultConvenienceTools = [resolveTool, supportedChainListTool];
