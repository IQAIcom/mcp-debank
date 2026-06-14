// src/services/base.service.test.ts
import type Axios from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * IMPORTANT: do NOT statically import axios at the top of this file. With
 * `vi.resetModules()` in beforeEach, BaseService gets a fresh axios module
 * instance when re-imported. A stale top-level `import axios from "axios"`
 * would refer to a DIFFERENT module record than the one BaseService sees —
 * the spy would attach to the stale instance and never see the calls. Both
 * describe blocks below import axios dynamically AFTER resetModules so the
 * spy and BaseService share the same instance.
 *
 * Note: `import type` (above) is type-only and erased at compile time, so it
 * does NOT create a runtime axios reference. Safe to use here.
 */

/**
 * Direct-path tests use the env already pruned by tests/integration/setup.ts —
 * IQ_GATEWAY_URL/KEY are deleted there, so fetchWithToolConfig routes to
 * fetchDirect.
 */
describe("BaseService RequestOptions forwarding — direct path", () => {
	let svc: {
		fetchDefaultTTL: (...a: unknown[]) => Promise<unknown>;
		fetchCustomTTL: (...a: unknown[]) => Promise<unknown>;
		postDefaults: (...a: unknown[]) => Promise<unknown>;
	};
	let getSpy: ReturnType<typeof vi.spyOn>;
	let postSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(async () => {
		vi.resetModules();
		const axiosMod = await import("axios");
		const axios =
			(axiosMod as unknown as { default?: typeof Axios }).default ?? axiosMod;
		const { BaseService } = await import("./base.service.js");
		class TestService extends BaseService {
			async fetchDefaultTTL(
				url: string,
				opts?: { signal?: AbortSignal; timeout?: number },
			) {
				return this.fetchWithToolConfig<unknown>(
					url,
					this.DEFAULT_CACHE_TTL_SECONDS,
					opts,
				);
			}
			async fetchCustomTTL(
				url: string,
				ttl: number,
				opts?: { signal?: AbortSignal; timeout?: number },
			) {
				return this.fetchWithToolConfig<unknown>(url, ttl, opts);
			}
			async postDefaults(
				url: string,
				body: unknown,
				opts?: { signal?: AbortSignal; timeout?: number },
			) {
				return this.postWithToolConfig<unknown>(url, body, opts);
			}
		}
		svc = new TestService() as never;
		// Same axios module instance BaseService imported on the line above.
		getSpy = vi
			.spyOn(axios, "get")
			.mockResolvedValue({ data: { ok: true } } as never);
		postSpy = vi
			.spyOn(axios, "post")
			.mockResolvedValue({ data: { ok: true } } as never);
	});

	afterEach(() => {
		/**
		 * Restore axios spies so call history / mock state cannot leak between
		 * tests (the toHaveBeenCalledTimes(1) assertions are brittle otherwise).
		 */
		vi.restoreAllMocks();
	});

	it("fetchWithToolConfig forwards timeout + decoupled signal to axios.get (default TTL)", async () => {
		const controller = new AbortController();
		await svc.fetchDefaultTTL("https://example.test/x", {
			signal: controller.signal,
			timeout: 6_000,
		});
		expect(getSpy).toHaveBeenCalledTimes(1);
		const callOpts = getSpy.mock.calls[0]?.[1] as {
			signal?: AbortSignal;
			timeout?: number;
		};
		// The underlying axios call runs with an internal signal — decoupled
		// from the caller's so coalesced peers don't interfere with each other.
		// The caller's signal still controls the returned promise (see the
		// dedicated abort-behaviour test below).
		expect(callOpts.signal).toBeDefined();
		expect(callOpts.signal).not.toBe(controller.signal);
		expect(callOpts.timeout).toBe(6_000);
	});

	it("fetchWithToolConfig forwards timeout + decoupled signal (explicit TTL)", async () => {
		const controller = new AbortController();
		await svc.fetchCustomTTL("https://example.test/x", 60, {
			signal: controller.signal,
			timeout: 6_000,
		});
		expect(getSpy).toHaveBeenCalledTimes(1);
		const callOpts = getSpy.mock.calls[0]?.[1] as {
			signal?: AbortSignal;
			timeout?: number;
		};
		expect(callOpts.signal).toBeDefined();
		expect(callOpts.signal).not.toBe(controller.signal);
		expect(callOpts.timeout).toBe(6_000);
	});

	it("caller abort rejects the returned promise even though axios sees a decoupled signal", async () => {
		const controller = new AbortController();
		// Make axios hang so the abort path is the only way the promise settles.
		getSpy.mockReturnValueOnce(new Promise(() => {}) as never);
		const p = svc.fetchDefaultTTL("https://example.test/abort", {
			signal: controller.signal,
		});
		controller.abort();
		// Default reason for a bare controller.abort() is a DOMException
		// whose name is "AbortError" — what axios/fetch/retry libs check.
		await expect(p).rejects.toMatchObject({ name: "AbortError" });
	});

	it("caller abort preserves signal.reason when provided", async () => {
		const controller = new AbortController();
		getSpy.mockReturnValueOnce(new Promise(() => {}) as never);
		const customReason = new Error("custom reason from caller");
		const p = svc.fetchDefaultTTL("https://example.test/abort-reason", {
			signal: controller.signal,
		});
		controller.abort(customReason);
		await expect(p).rejects.toBe(customReason);
	});

	it("postWithToolConfig forwards signal + timeout to axios.post", async () => {
		const controller = new AbortController();
		await svc.postDefaults(
			"https://example.test/x",
			{ a: 1 },
			{ signal: controller.signal, timeout: 6_000 },
		);
		expect(postSpy).toHaveBeenCalledTimes(1);
		const callOpts = postSpy.mock.calls[0]?.[2] as {
			signal?: AbortSignal;
			timeout?: number;
		};
		expect(callOpts.signal).toBe(controller.signal);
		expect(callOpts.timeout).toBe(6_000);
	});

	it("no options ⇒ no signal/timeout on the axios call (legacy parity)", async () => {
		await svc.fetchDefaultTTL("https://example.test/x");
		expect(getSpy).toHaveBeenCalledTimes(1);
		const callOpts = getSpy.mock.calls[0]?.[1] as Record<string, unknown>;
		expect(callOpts.signal).toBeUndefined();
		expect(callOpts.timeout).toBeUndefined();
	});
});

/**
 * Gateway-path tests: set IQ_GATEWAY_URL + IQ_GATEWAY_KEY before re-importing
 * BaseService so env.ts re-parses and base.service.ts routes through
 * fetchViaGateway / postViaGateway. The signal+timeout contract applies on
 * both paths — a missed spread in the gateway functions would otherwise pass
 * the direct-path tests above.
 */
describe("BaseService RequestOptions forwarding — IQ Gateway path", () => {
	let svc: {
		fetchDefaultTTL: (...a: unknown[]) => Promise<unknown>;
		postDefaults: (...a: unknown[]) => Promise<unknown>;
	};
	let getSpy: ReturnType<typeof vi.spyOn>;
	let postSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(async () => {
		process.env.IQ_GATEWAY_URL = "https://gateway.test/proxy";
		process.env.IQ_GATEWAY_KEY = "gw-test-key";
		vi.resetModules();
		/**
		 * Dynamic-import axios AFTER resetModules so we get the same module
		 * instance BaseService sees. See top-of-file comment.
		 */
		const axiosMod = await import("axios");
		const axios =
			(axiosMod as unknown as { default?: typeof Axios }).default ?? axiosMod;
		const { BaseService } = await import("./base.service.js");
		class TestService extends BaseService {
			async fetchDefaultTTL(
				url: string,
				opts?: { signal?: AbortSignal; timeout?: number },
			) {
				return this.fetchWithToolConfig<unknown>(
					url,
					this.DEFAULT_CACHE_TTL_SECONDS,
					opts,
				);
			}
			async postDefaults(
				url: string,
				body: unknown,
				opts?: { signal?: AbortSignal; timeout?: number },
			) {
				return this.postWithToolConfig<unknown>(url, body, opts);
			}
		}
		svc = new TestService() as never;
		getSpy = vi
			.spyOn(axios, "get")
			.mockResolvedValue({ data: { ok: true } } as never);
		postSpy = vi
			.spyOn(axios, "post")
			.mockResolvedValue({ data: { ok: true } } as never);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		delete process.env.IQ_GATEWAY_URL;
		delete process.env.IQ_GATEWAY_KEY;
	});

	it("fetchViaGateway forwards timeout + decoupled signal to axios.get", async () => {
		const controller = new AbortController();
		await svc.fetchDefaultTTL("https://pro-openapi.debank.com/v1/x", {
			signal: controller.signal,
			timeout: 6_000,
		});
		expect(getSpy).toHaveBeenCalledTimes(1);
		/**
		 * We don't assert the URL shape here — that's gateway-routing behavior and
		 * unchanged from v0.1. We assert the OPTIONS object. Signal is now the
		 * internal decoupled signal (see direct-path tests for rationale).
		 */
		const callOpts = getSpy.mock.calls[0]?.[1] as {
			signal?: AbortSignal;
			timeout?: number;
		};
		expect(callOpts.signal).toBeDefined();
		expect(callOpts.signal).not.toBe(controller.signal);
		expect(callOpts.timeout).toBe(6_000);
	});

	it("postViaGateway forwards signal + timeout to axios.post", async () => {
		const controller = new AbortController();
		await svc.postDefaults(
			"https://pro-openapi.debank.com/v1/x",
			{ a: 1 },
			{ signal: controller.signal, timeout: 6_000 },
		);
		expect(postSpy).toHaveBeenCalledTimes(1);
		const callOpts = postSpy.mock.calls[0]?.[2] as {
			signal?: AbortSignal;
			timeout?: number;
		};
		expect(callOpts.signal).toBe(controller.signal);
		expect(callOpts.timeout).toBe(6_000);
	});
});
