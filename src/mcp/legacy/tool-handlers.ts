// src/mcp/legacy/tool-handlers.ts
//
// Joins TOOL_METADATA entries to their service singletons and exposes them
// in the FastMCP tool shape. Importing this module triggers service
// singleton construction (via src/services/index.ts) and entity resolver
// init — that's expected. It's the same module-load behavior as the old
// src/tools/index.ts.

import { z } from "zod";
import {
	needsResolution,
	resolveChain,
	resolveEntities,
} from "../../lib/entity-resolver.js";
import {
	chainService,
	protocolService,
	tokenService,
	transactionService,
	userService,
} from "../../services/index.js";
import { TOOL_METADATA, type ToolMetadata } from "./tool-metadata.js";

const SERVICE_MAP: Record<string, unknown> = {
	chainService,
	protocolService,
	tokenService,
	transactionService,
	userService,
};

function resolveMethod(
	legacyMethodPath: string,
): (args: Record<string, unknown>) => Promise<string> {
	const [singletonName, methodName] = legacyMethodPath.split(".");
	if (!singletonName || !methodName) {
		throw new Error(`Invalid legacyMethodPath: ${legacyMethodPath}`);
	}
	const singleton = SERVICE_MAP[singletonName] as
		| Record<string, unknown>
		| undefined;
	if (!singleton)
		throw new Error(`Unknown service singleton: ${singletonName}`);
	const method = singleton[methodName] as
		| ((args: Record<string, unknown>) => Promise<string>)
		| undefined;
	if (typeof method !== "function") {
		throw new Error(`Method ${methodName} not found on ${singletonName}`);
	}
	return method.bind(singleton);
}

/** Tool surface registered with FastMCP when --legacy-tools is set. */
export const legacyTools = TOOL_METADATA.map((m: ToolMetadata) => ({
	name: m.name,
	description: m.description,
	parameters: z.object({
		...((m.parameters as unknown as { shape?: Record<string, z.ZodTypeAny> })
			.shape ?? {}),
		_userQuery: z.string().optional(),
	}),
	execute: async (args: Record<string, unknown>) => {
		// Per-tool resolve fixups (v0.1 quirks that resolveEntities doesn't cover).
		// debank_get_chain treats args.id as a CHAIN name (not a token); the
		// generic resolveEntities() only resolves id as a token when chain_id
		// is also present, so this one needs its own pre-step.
		if (m.name === "debank_get_chain") {
			const id = args.id;
			if (typeof id === "string" && needsResolution(id, "chain")) {
				const resolved = await resolveChain(id);
				if (resolved) args.id = resolved;
			}
		}
		await resolveEntities(args);
		// Always set the query, including the empty-string fallback. Services are
		// singletons — a previous call's _userQuery would leak into this one's JQ
		// filtering otherwise. formatResponse gates on truthy currentQuery so ""
		// correctly disables filtering for this call.
		const q = (args._userQuery as string | undefined) ?? "";
		chainService.setQuery(q);
		protocolService.setQuery(q);
		tokenService.setQuery(q);
		transactionService.setQuery(q);
		userService.setQuery(q);
		const method = resolveMethod(m.legacyMethodPath);
		return method(args);
	},
}));
