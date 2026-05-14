// src/services/base.service.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * IMPORTANT: do NOT statically import axios at the top of this file. With
 * `vi.resetModules()` in beforeEach, BaseService gets a fresh axios module
 * instance when re-imported. A stale top-level `import axios from "axios"`
 * would refer to a DIFFERENT module record than the one BaseService sees —
 * the spy would attach to the stale instance and never see the calls. Both
 * describe blocks below import axios dynamically AFTER resetModules so the
 * spy and BaseService share the same instance.
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
			(axiosMod as { default?: typeof import("axios").default }).default ??
			axiosMod;
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

	it("fetchWithToolConfig forwards signal + timeout to axios.get when default TTL is used", async () => {
		const controller = new AbortController();
		await svc.fetchDefaultTTL("https://example.test/x", {
			signal: controller.signal,
			timeout: 6_000,
		});
		expect(getSpy).toHaveBeenCalledTimes(1);
		const callOpts = getSpy.mock.calls[0]![1] as {
			signal?: AbortSignal;
			timeout?: number;
		};
		expect(callOpts.signal).toBe(controller.signal);
		expect(callOpts.timeout).toBe(6_000);
	});

	it("fetchWithToolConfig with explicit TTL still forwards signal + timeout", async () => {
		const controller = new AbortController();
		await svc.fetchCustomTTL("https://example.test/x", 60, {
			signal: controller.signal,
			timeout: 6_000,
		});
		expect(getSpy).toHaveBeenCalledTimes(1);
		const callOpts = getSpy.mock.calls[0]![1] as {
			signal?: AbortSignal;
			timeout?: number;
		};
		expect(callOpts.signal).toBe(controller.signal);
		expect(callOpts.timeout).toBe(6_000);
	});

	it("postWithToolConfig forwards signal + timeout to axios.post", async () => {
		const controller = new AbortController();
		await svc.postDefaults(
			"https://example.test/x",
			{ a: 1 },
			{ signal: controller.signal, timeout: 6_000 },
		);
		expect(postSpy).toHaveBeenCalledTimes(1);
		const callOpts = postSpy.mock.calls[0]![2] as {
			signal?: AbortSignal;
			timeout?: number;
		};
		expect(callOpts.signal).toBe(controller.signal);
		expect(callOpts.timeout).toBe(6_000);
	});

	it("no options ⇒ no signal/timeout on the axios call (legacy parity)", async () => {
		await svc.fetchDefaultTTL("https://example.test/x");
		expect(getSpy).toHaveBeenCalledTimes(1);
		const callOpts = getSpy.mock.calls[0]![1] as Record<string, unknown>;
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
			(axiosMod as { default?: typeof import("axios").default }).default ??
			axiosMod;
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

	it("fetchViaGateway forwards signal + timeout to axios.get", async () => {
		const controller = new AbortController();
		await svc.fetchDefaultTTL("https://pro-openapi.debank.com/v1/x", {
			signal: controller.signal,
			timeout: 6_000,
		});
		expect(getSpy).toHaveBeenCalledTimes(1);
		/**
		 * We don't assert the URL shape here — that's gateway-routing behavior and
		 * unchanged from v0.1. We assert the OPTIONS object.
		 */
		const callOpts = getSpy.mock.calls[0]![1] as {
			signal?: AbortSignal;
			timeout?: number;
		};
		expect(callOpts.signal).toBe(controller.signal);
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
		const callOpts = postSpy.mock.calls[0]![2] as {
			signal?: AbortSignal;
			timeout?: number;
		};
		expect(callOpts.signal).toBe(controller.signal);
		expect(callOpts.timeout).toBe(6_000);
	});
});
