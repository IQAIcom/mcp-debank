// src/mcp/execute/client.ts
//
// Installs the agent-facing `debank.*` API on an isolated-vm Context. Each
// method is backed by an ivm.Reference — the guest sees a plain async
// function built by evalClosure. Host body dispatches to the service
// singleton's *Raw() method with an end-to-end AbortController + axios
// timeout. Results cross the isolate boundary as ExternalCopy envelopes.

import {
	resolveChain,
	resolveChains,
	resolveWrappedToken,
} from "../../lib/entity-resolver.js";
import {
	chainService,
	protocolService,
	tokenService,
	transactionService,
	userService,
} from "../../services/index.js";
import { TOOL_METADATA } from "../legacy/tool-metadata.js";

const SERVICE_MAP: Record<string, Record<string, unknown>> = {
	chainService: chainService as unknown as Record<string, unknown>,
	protocolService: protocolService as unknown as Record<string, unknown>,
	tokenService: tokenService as unknown as Record<string, unknown>,
	transactionService: transactionService as unknown as Record<string, unknown>,
	userService: userService as unknown as Record<string, unknown>,
};

const ABORT_MS = 5_000;
const AXIOS_MS = 6_000;

type Envelope = { ok: true; data: unknown } | { ok: false; error: string };

function resolveRaw(
	methodPath: string,
): (
	args: unknown,
	options: { signal: AbortSignal; timeout: number },
) => Promise<unknown> {
	const [singletonName, methodName] = methodPath.split(".");
	if (!singletonName || !methodName)
		throw new Error(`Invalid sandboxMethodPath: ${methodPath}`);
	const singleton = SERVICE_MAP[singletonName];
	if (!singleton)
		throw new Error(`Unknown service singleton: ${singletonName}`);
	const fn = singleton[methodName] as
		| ((args: unknown, options: unknown) => Promise<unknown>)
		| undefined;
	if (typeof fn !== "function")
		throw new Error(`Method ${methodName} not found on ${singletonName}`);
	return (args, options) => fn.call(singleton, args, options);
}

// Builds a host-side Reference whose async body:
//   1. Deserialises JSON args from the guest string,
//   2. Races a *Raw() call against an AbortController timer,
//   3. Returns an ExternalCopy({ ok, data | error }) envelope — never throws,
//      so errors route back to the guest as catchable exceptions.
function makeHostRef(
	ivm: typeof import("isolated-vm"),
	rawFn: (
		args: unknown,
		options: { signal: AbortSignal; timeout: number },
	) => Promise<unknown>,
	agentFacingName: string,
): import("isolated-vm").Reference {
	return new ivm.Reference(async (argsJson: string) => {
		const controller = new AbortController();
		let timer: NodeJS.Timeout | undefined;
		const abortPromise = new Promise<never>((_, reject) => {
			timer = setTimeout(() => {
				controller.abort();
				reject(new Error(`DeBank call timed out after 5s: ${agentFacingName}`));
			}, ABORT_MS);
			timer.unref?.();
		});
		try {
			const args: unknown = argsJson === undefined ? {} : JSON.parse(argsJson);
			const result = await Promise.race([
				rawFn(args, { signal: controller.signal, timeout: AXIOS_MS }),
				abortPromise,
			]);
			const envelope: Envelope = { ok: true, data: result };
			return new ivm.ExternalCopy(envelope).copyInto({ release: true });
		} catch (err) {
			const e = err as Error & { code?: string };
			let message: string;
			if (
				typeof e.message === "string" &&
				e.message.startsWith("DeBank call timed out after 5s")
			) {
				message = e.message;
			} else {
				const isAbort = controller.signal.aborted;
				const isAxiosTimeout =
					e.code === "ECONNABORTED" || e.code === "ETIMEDOUT";
				if (isAbort || isAxiosTimeout) {
					message = `DeBank call timed out after 5s: ${agentFacingName}`;
				} else {
					message = e.message || String(err);
				}
			}
			const envelope: Envelope = { ok: false, error: message };
			return new ivm.ExternalCopy(envelope).copyInto({ release: true });
		} finally {
			if (timer) clearTimeout(timer);
		}
	});
}

// Wraps a sync or async host fn in a Reference that returns an envelope.
// For async resolvers (resolveChain, resolveChains) pass async:true.
// For sync resolvers (resolveWrappedToken) pass async:false.
function makeResolverRef(
	ivm: typeof import("isolated-vm"),
	fn: (...args: unknown[]) => unknown,
): import("isolated-vm").Reference {
	return new ivm.Reference(async (...args: unknown[]) => {
		try {
			const result = await fn(...args);
			const envelope: Envelope = { ok: true, data: result };
			return new ivm.ExternalCopy(envelope).copyInto({ release: true });
		} catch (err) {
			const e = err as Error;
			const envelope: Envelope = { ok: false, error: e.message || String(err) };
			return new ivm.ExternalCopy(envelope).copyInto({ release: true });
		}
	});
}

function parseQualified(qualified: string): [string, string] {
	const parts = qualified.split(".");
	if (parts.length !== 3 || parts[0] !== "debank")
		throw new Error(`Invalid qualified: ${qualified}`);
	const group = parts[1];
	const method = parts[2];
	if (!group || !method) throw new Error(`Invalid qualified: ${qualified}`);
	return [group, method];
}

// Guest-side wrapper template: receives a Reference $0 and installs an async
// function that JSON-serialises args, calls the host, and unpacks the envelope.
const ASYNC_WRAPPER = `
(function(ref, group, method) {
	globalThis.debank[group][method] = async function(args) {
		var env = await ref.apply(undefined, [JSON.stringify(args ?? {})], { result: { promise: true } });
		if (env.ok) return env.data;
		throw new Error(env.error);
	};
})($0, $1, $2)
`.trim();

const RESOLVER_WRAPPER = `
(function(ref, prop) {
	globalThis.debank[prop] = async function() {
		var a = Array.prototype.slice.call(arguments);
		var env = await ref.apply(undefined, a, { result: { promise: true } });
		if (env.ok) return env.data;
		throw new Error(env.error);
	};
})($0, $1)
`.trim();

// Sync variant for resolveWrappedToken — uses applySync so the guest sees a
// plain function that returns the value directly (not a Promise). The host
// function must be synchronous; resolveWrappedToken is a pure in-memory
// lookup (no I/O), so applySync is safe.
const SYNC_RESOLVER_WRAPPER = `
(function(ref, prop) {
	globalThis.debank[prop] = function() {
		var a = Array.prototype.slice.call(arguments);
		var env = ref.applySync(undefined, a);
		if (env.ok) return env.data;
		throw new Error(env.error);
	};
})($0, $1)
`.trim();

export async function installDebankClient(
	ctx: import("isolated-vm").Context,
): Promise<void> {
	const mod = await import("isolated-vm");
	const ivm = ((mod as { default?: typeof import("isolated-vm") }).default ??
		mod) as typeof import("isolated-vm");

	const groups = new Set(
		TOOL_METADATA.map((m) => parseQualified(m.qualified)[0]),
	);
	for (const g of groups) {
		await ctx.evalClosure(
			`globalThis.debank[$0] = globalThis.debank[$0] || {};`,
			[g],
		);
	}

	for (const m of TOOL_METADATA) {
		const [group, method] = parseQualified(m.qualified);
		const raw = resolveRaw(m.sandboxMethodPath);
		const ref = makeHostRef(ivm, raw, m.qualified);
		await ctx.evalClosure(ASYNC_WRAPPER, [ref, group, method]);
	}

	await ctx.evalClosure(RESOLVER_WRAPPER, [
		makeResolverRef(ivm, async (name: unknown) => resolveChain(name as string)),
		"resolveChain",
	]);

	await ctx.evalClosure(RESOLVER_WRAPPER, [
		makeResolverRef(ivm, async (cs: unknown) => resolveChains(cs as string)),
		"resolveChains",
	]);

	await ctx.evalClosure(SYNC_RESOLVER_WRAPPER, [
		new ivm.Reference((kw: unknown, chainId: unknown) => {
			try {
				const result = resolveWrappedToken(kw as string, chainId as string);
				return new ivm.ExternalCopy({ ok: true, data: result }).copyInto({
					release: true,
				});
			} catch (err) {
				return new ivm.ExternalCopy({
					ok: false,
					error: (err as Error).message || String(err),
				}).copyInto({ release: true });
			}
		}),
		"resolveWrappedToken",
	]);
}
