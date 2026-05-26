// src/mcp/execute/client.ts
//
// Two bridges: installServiceCall (dual-timeout, JSON args) for *Raw() methods;
// installResolver (spread args, optional sync) for in-memory helpers.

import dedent from "dedent";
import type * as IVM from "isolated-vm";
import {
	resolveChain,
	resolveChains,
	resolveWrappedToken,
} from "../../lib/entity-resolver.js";
import { TOOL_METADATA } from "../legacy/tool-metadata.js";

const ABORT_MS = 5_000;
const AXIOS_MS = 6_000;

type Envelope = { ok: true; data: unknown } | { ok: false; error: string };

/** Wraps a success value into an ExternalCopy envelope crossing the isolate boundary. */
function envelopeOk(ivm: typeof IVM, data: unknown): unknown {
	return new ivm.ExternalCopy({ ok: true, data } satisfies Envelope).copyInto({
		release: true,
	});
}

/** Wraps an error string into an ExternalCopy envelope crossing the isolate boundary. */
function envelopeFail(ivm: typeof IVM, error: string): unknown {
	return new ivm.ExternalCopy({ ok: false, error } satisfies Envelope).copyInto(
		{ release: true },
	);
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

/**
 * Guest-side wrapper template for service calls: receives a Reference $0 and
 * installs an async function that JSON-serialises args, calls the host, and
 * unpacks the envelope.
 */
const SERVICE_CALL_WRAPPER = dedent`
	(function(ref, group, method) {
		globalThis.debank[group][method] = async function(args) {
			var env = await ref.apply(undefined, [JSON.stringify(args ?? {})], { result: { promise: true } });
			if (env.ok) return env.data;
			throw new Error(env.error);
		};
	})($0, $1, $2)
`;

/**
 * Guest-side wrapper template for async resolvers: spreads positional args and
 * awaits the host reference result.
 */
const ASYNC_RESOLVER_WRAPPER = dedent`
	(function(ref, prop) {
		globalThis.debank[prop] = async function() {
			var a = Array.prototype.slice.call(arguments);
			var env = await ref.apply(undefined, a, { result: { promise: true } });
			if (env.ok) return env.data;
			throw new Error(env.error);
		};
	})($0, $1)
`;

/**
 * Sync variant for resolveWrappedToken — uses applySync so the guest sees a
 * plain function that returns the value directly (not a Promise). The host
 * function must be synchronous; resolveWrappedToken is a pure in-memory
 * lookup (no I/O), so applySync is safe.
 */
const SYNC_RESOLVER_WRAPPER = dedent`
	(function(ref, prop) {
		globalThis.debank[prop] = function() {
			var a = Array.prototype.slice.call(arguments);
			var env = ref.applySync(undefined, a);
			if (env.ok) return env.data;
			throw new Error(env.error);
		};
	})($0, $1)
`;

/**
 * Installs a single service method on the guest context. The host-side body:
 *   1. Deserialises JSON args from the guest string,
 *   2. Races a *Raw() call against an AbortController timer,
 *   3. Returns an ExternalCopy({ ok, data | error }) envelope — never throws,
 *      so errors route back to the guest as catchable exceptions.
 */
async function installServiceCall(
	ctx: IVM.Context,
	ivm: typeof IVM,
	spec: {
		qualified: string;
		rawFn: (
			args: unknown,
			options: { signal: AbortSignal; timeout: number },
		) => Promise<unknown>;
	},
): Promise<void> {
	const [group, method] = parseQualified(spec.qualified);
	const ref = new ivm.Reference(async (argsJson: string) => {
		const controller = new AbortController();
		let timer: NodeJS.Timeout | undefined;
		const abortPromise = new Promise<never>((_, reject) => {
			timer = setTimeout(() => {
				controller.abort();
				reject(new Error(`DeBank call timed out after 5s: ${spec.qualified}`));
			}, ABORT_MS);
			timer.unref?.();
		});
		try {
			const args: unknown = argsJson === undefined ? {} : JSON.parse(argsJson);
			const result = await Promise.race([
				spec.rawFn(args, { signal: controller.signal, timeout: AXIOS_MS }),
				abortPromise,
			]);
			return envelopeOk(ivm, result);
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
					message = `DeBank call timed out after 5s: ${spec.qualified}`;
				} else {
					message = e.message || String(err);
				}
			}
			return envelopeFail(ivm, message);
		} finally {
			if (timer) clearTimeout(timer);
		}
	});
	await ctx.evalClosure(SERVICE_CALL_WRAPPER, [ref, group, method]);
}

/**
 * Installs a resolver function on the guest context. Async resolvers (default)
 * use ASYNC_RESOLVER_WRAPPER with ref.apply; the sync variant (sync: true)
 * uses SYNC_RESOLVER_WRAPPER with ref.applySync. The host-side Reference body
 * is sync when sync=true (so applySync works) and async otherwise.
 */
async function installResolver(
	ctx: IVM.Context,
	ivm: typeof IVM,
	spec: { name: string; fn: (...args: unknown[]) => unknown; sync?: boolean },
): Promise<void> {
	const { name, fn, sync = false } = spec;
	const ref = sync
		? new ivm.Reference((...args: unknown[]) => {
				try {
					return envelopeOk(ivm, (fn as (...a: unknown[]) => unknown)(...args));
				} catch (err) {
					return envelopeFail(ivm, (err as Error).message || String(err));
				}
			})
		: new ivm.Reference(async (...args: unknown[]) => {
				try {
					return envelopeOk(
						ivm,
						await (fn as (...a: unknown[]) => unknown)(...args),
					);
				} catch (err) {
					return envelopeFail(ivm, (err as Error).message || String(err));
				}
			});
	const wrapper = sync ? SYNC_RESOLVER_WRAPPER : ASYNC_RESOLVER_WRAPPER;
	await ctx.evalClosure(wrapper, [ref, name]);
}

export async function installDebankClient(ctx: IVM.Context): Promise<void> {
	const mod = await import("isolated-vm");
	const ivm = ((mod as unknown as { default?: typeof IVM }).default ??
		mod) as typeof IVM;

	// Ensure namespace objects exist
	const groups = new Set(
		TOOL_METADATA.map((m) => parseQualified(m.qualified)[0]),
	);
	for (const g of groups) {
		await ctx.evalClosure(
			`globalThis.debank[$0] = globalThis.debank[$0] || {};`,
			[g],
		);
	}

	// 31 service calls
	for (const m of TOOL_METADATA) {
		const rawFn = (await m.sandboxImpl()) as (
			args: unknown,
			options: { signal: AbortSignal; timeout: number },
		) => Promise<unknown>;
		await installServiceCall(ctx, ivm, {
			qualified: m.qualified,
			rawFn,
		});
	}

	// 3 resolvers (2 async + 1 sync)
	await installResolver(ctx, ivm, {
		name: "resolveChain",
		fn: (n: unknown) => resolveChain(n as string),
	});
	await installResolver(ctx, ivm, {
		name: "resolveChains",
		fn: (cs: unknown) => resolveChains(cs as string),
	});
	await installResolver(ctx, ivm, {
		name: "resolveWrappedToken",
		fn: (kw: unknown, c: unknown) =>
			resolveWrappedToken(kw as string, c as string),
		sync: true,
	});
}
