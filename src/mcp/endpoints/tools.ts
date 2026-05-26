// src/mcp/endpoints/tools.ts
//
// Dynamic-tools triad: list_endpoints + get_endpoint_schema + invoke_endpoint.
// Mirrors CoinGecko Stainless's --tools=dynamic mode. Together they replace
// the per-endpoint legacy debank_* tools (deleted in Stage 2 of this refactor).

import dedent from "dedent";
import jq from "node-jq";
import { z } from "zod";
import { TOOL_METADATA } from "../legacy/tool-metadata.js";

const LIST_PARAMS = z.object({
	filter: z
		.string()
		.optional()
		.describe(
			"Optional case-insensitive keyword filter. Returns only endpoints whose qualified name or description contains the keyword.",
		),
});

export const listEndpointsTool = {
	name: "list_endpoints",
	description: dedent`
		List DeBank API endpoints available via \`invoke_endpoint\`. Returns an array of
		\`{ qualified, description }\` objects. Use the \`filter\` parameter to narrow by
		keyword (e.g. "nft", "balance", "transaction").

		Typical workflow:
		1. list_endpoints({ filter: "nft" }) to discover relevant endpoints.
		2. get_endpoint_schema({ name: "debank.user.getUserNftList" }) to see params + response shape.
		3. invoke_endpoint({ name: "...", params: {...}, jq_filter: "..." }) to call it.

		For multi-step workflows (loops, joins, conditional logic), prefer \`execute\`.
	`,
	parameters: LIST_PARAMS,
	annotations: { readOnlyHint: true },
	execute: async (args: z.infer<typeof LIST_PARAMS>) => {
		const filter = args.filter?.toLowerCase().trim();
		const endpoints = TOOL_METADATA.filter(
			(m) =>
				!filter ||
				m.qualified.toLowerCase().includes(filter) ||
				m.description.toLowerCase().includes(filter),
		).map((m) => ({
			qualified: m.qualified,
			description: `${m.description.split(".")[0]}.`,
		}));
		return {
			content: [{ type: "text" as const, text: JSON.stringify({ endpoints }) }],
			isError: false,
		};
	},
};

const SCHEMA_PARAMS = z.object({
	name: z
		.string()
		.describe(
			"Qualified endpoint name from list_endpoints (e.g. 'debank.user.getUserChainBalance').",
		),
});

export const getEndpointSchemaTool = {
	name: "get_endpoint_schema",
	description: dedent`
		Return the full schema for one endpoint: parameters (JSON Schema), response shape
		(JSON Schema), description, and an example agent call. Use before \`invoke_endpoint\`
		to construct correct params and a useful \`jq_filter\`.
	`,
	parameters: SCHEMA_PARAMS,
	annotations: { readOnlyHint: true },
	execute: async (args: z.infer<typeof SCHEMA_PARAMS>) => {
		const m = TOOL_METADATA.find((t) => t.qualified === args.name);
		if (!m) {
			return {
				content: [
					{
						type: "text" as const,
						text: JSON.stringify({
							error: `Unknown endpoint: ${args.name}. Use list_endpoints to discover available endpoints.`,
						}),
					},
				],
				isError: true,
			};
		}
		return {
			content: [
				{
					type: "text" as const,
					text: JSON.stringify({
						qualified: m.qualified,
						description: m.description,
						params: z.toJSONSchema(m.parameters),
						response: z.toJSONSchema(m.responseSchema),
						exampleCall: m.exampleCall,
					}),
				},
			],
			isError: false,
		};
	},
};

const INVOKE_PARAMS = z.object({
	name: z
		.string()
		.describe(
			"Qualified endpoint name from list_endpoints (e.g. 'debank.user.getUserChainBalance').",
		),
	params: z
		.record(z.string(), z.unknown())
		.describe(
			"Endpoint parameters. Use get_endpoint_schema to discover the exact shape.",
		),
	jq_filter: z
		.string()
		.optional()
		.describe(
			'A jq filter to apply to the response to include certain fields. Use get_endpoint_schema to see the response shape. For example: to include only the `name` field in every object of a results array, provide ".results[].name". When omitted, the full response is returned. See https://jqlang.org/manual/.',
		),
});

export const invokeEndpointTool = {
	name: "invoke_endpoint",
	description: dedent`
		Invoke one DeBank endpoint by qualified name. Returns the JSON response, optionally
		projected through a jq filter.

		**When using this tool, always use the \`jq_filter\` parameter to reduce the response
		size and improve performance.** Only omit if you're sure you don't need the data.

		Workflow:
		1. Call \`get_endpoint_schema\` to see params + response shape.
		2. Construct \`params\` matching the schema.
		3. Provide \`jq_filter\` to project only the fields you need.

		For multi-call workflows (joining, looping, conditional logic), prefer \`execute\`
		(sandboxed JS) which gives full programmatic control.
	`,
	parameters: INVOKE_PARAMS,
	annotations: { readOnlyHint: false },
	execute: async (args: z.infer<typeof INVOKE_PARAMS>) => {
		const m = TOOL_METADATA.find((t) => t.qualified === args.name);
		if (!m) {
			return {
				content: [
					{
						type: "text" as const,
						text: JSON.stringify({
							error: `Unknown endpoint: ${args.name}. Use list_endpoints to discover available endpoints.`,
						}),
					},
				],
				isError: true,
			};
		}

		const parseResult = m.parameters.safeParse(args.params);
		if (!parseResult.success) {
			return {
				content: [
					{
						type: "text" as const,
						text: JSON.stringify({
							error: `Invalid params for ${args.name}: ${parseResult.error.message}`,
							expectedSchema: z.toJSONSchema(m.parameters),
						}),
					},
				],
				isError: true,
			};
		}

		try {
			const rawFn = await m.sandboxImpl();
			const response = await rawFn(parseResult.data);

			if (args.jq_filter) {
				const filtered = await jq.run(
					args.jq_filter,
					JSON.stringify(response),
					{ input: "string", output: "json" },
				);
				return {
					content: [{ type: "text" as const, text: JSON.stringify(filtered) }],
					isError: false,
				};
			}

			return {
				content: [{ type: "text" as const, text: JSON.stringify(response) }],
				isError: false,
			};
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			return {
				content: [
					{
						type: "text" as const,
						text: JSON.stringify({
							error: `${args.name} failed: ${msg}`,
						}),
					},
				],
				isError: true,
			};
		}
	},
};

export const endpointTools = [
	listEndpointsTool,
	getEndpointSchemaTool,
	invokeEndpointTool,
];
