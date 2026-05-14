// tests/integration/service-snapshots.test.ts
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INVOCATIONS, type Services } from "../fixtures/invocations.js";

const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../..",
);
const fixturesDir = path.join(repoRoot, "tests/fixtures/services");
const snapshotsDir = path.join(repoRoot, "tests/snapshots/services");

describe("service markdown snapshots", () => {
	let services: Services;
	let origFetch: unknown;
	let origPost: unknown;
	type RequestLog = {
		method: "GET" | "POST";
		url: string;
		cacheDuration?: number;
		body?: unknown;
	};
	let lastRequest: RequestLog | undefined;

	beforeAll(async () => {
		const { BaseService } = await import("../../src/services/base.service.js");
		const proto = BaseService.prototype as unknown as Record<string, unknown>;
		origFetch = proto.fetchWithToolConfig;
		origPost = proto.postWithToolConfig;
		const loadFixture = async () => {
			const key = (globalThis as Record<string, unknown>)
				.__SNAPSHOT_KEY as string;
			const raw = await fs.readFile(
				path.join(fixturesDir, `${key}.json`),
				"utf-8",
			);
			return JSON.parse(raw);
		};
		proto.fetchWithToolConfig = async (
			url: string,
			cacheDuration?: unknown,
		) => {
			if (cacheDuration !== undefined && typeof cacheDuration !== "number") {
				throw new Error(
					`fetchWithToolConfig received non-number cacheDuration (${typeof cacheDuration}); ` +
						`did you pass options as the second positional arg? Use ` +
						`fetchWithToolConfig(url, DEFAULT_CACHE_TTL_SECONDS, options).`,
				);
			}
			const ttl = (cacheDuration as number | undefined) ?? 300;
			lastRequest = { method: "GET", url, cacheDuration: ttl };
			return loadFixture();
		};
		proto.postWithToolConfig = async (url: string, body: unknown) => {
			lastRequest = { method: "POST", url, body };
			return loadFixture();
		};
		const mod = await import("../../src/services/index.js");
		services = {
			chainService: mod.chainService,
			protocolService: mod.protocolService,
			tokenService: mod.tokenService,
			transactionService: mod.transactionService,
			userService: mod.userService,
		};
	});

	afterAll(async () => {
		const { BaseService } = await import("../../src/services/base.service.js");
		const proto = BaseService.prototype as unknown as Record<string, unknown>;
		proto.fetchWithToolConfig = origFetch;
		proto.postWithToolConfig = origPost;
	});

	for (const inv of INVOCATIONS) {
		it(`${inv.name} produces the expected request AND matches committed markdown`, async () => {
			(globalThis as Record<string, unknown>).__SNAPSHOT_KEY = inv.name;
			lastRequest = undefined;
			const md = await inv.call(services);

			expect(
				lastRequest,
				`${inv.name} did not call fetchWithToolConfig / postWithToolConfig`,
			).toBeDefined();
			expect(lastRequest!.method).toBe(inv.expect.method);

			const parsed = new URL(lastRequest!.url);
			expect(parsed.pathname).toBe(inv.expect.pathname);
			const actualParams: Record<string, string> = {};
			parsed.searchParams.forEach((v, k) => {
				actualParams[k] = v;
			});
			expect(actualParams).toEqual(inv.expect.searchParams);

			if (inv.expect.cacheDurationSeconds !== undefined) {
				expect(lastRequest!.cacheDuration).toBe(
					inv.expect.cacheDurationSeconds,
				);
			}
			if (inv.expect.body !== undefined) {
				expect(lastRequest!.body).toEqual(inv.expect.body);
			}

			const expected = await fs.readFile(
				path.join(snapshotsDir, `${inv.name}.md`),
				"utf-8",
			);
			// Mirror the trailing-whitespace strip applied by scripts/snapshot-baseline.ts.
			const cleaned = md.replace(/[ \t]+$/gm, "");
			expect(cleaned).toBe(expected);
		});
	}
});
