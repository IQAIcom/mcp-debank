// scripts/snapshot-baseline.ts
//
// One-shot capture: runs each of the 31 legacy service methods against a
// per-method JSON fixture (from tests/fixtures/services/), stubbing
// fetchWithToolConfig / postWithToolConfig on BaseService to return the
// fixture, and writes the resulting markdown to tests/snapshots/services/.
//
// Run once before the service refactor; commit the snapshots. The
// post-refactor regression test (Task 27) asserts the new code reproduces
// them byte-identical.
//
// IMPORTANT — must use tsconfig.scripts.json, NOT the default tsconfig.json:
//
//   pnpm exec tsx --tsconfig tsconfig.scripts.json scripts/snapshot-baseline.ts
//
// tsx v4 has a resolution bug where it finds the root CJS shim `lite.js` in
// js-tiktoken (type:module package) before the package exports map, causing
// "does not provide an export named 'Tiktoken'". tsconfig.scripts.json has a
// paths entry that redirects js-tiktoken/lite → dist/lite.js (the real ESM
// file). vitest is unaffected because it uses Vite's resolver, not tsx's.

// IMPORTANT: env setup MUST happen before any `src/` import. env.ts at
// module load fails the Zod parse unless DEBANK_API_KEY or both
// IQ_GATEWAY_* are set (env.ts:18-29). The vitest setupFiles doesn't
// apply to standalone tsx scripts, so we do the equivalent inline.
process.env.DEBANK_API_KEY = process.env.DEBANK_API_KEY ?? "snapshot-script";
delete process.env.IQ_GATEWAY_URL;
delete process.env.IQ_GATEWAY_KEY;
delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
delete process.env.OPENROUTER_API_KEY;

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { INVOCATIONS, type Services } from "../tests/fixtures/invocations.js";

const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);
const fixturesDir = path.join(repoRoot, "tests/fixtures/services");
const snapshotsDir = path.join(repoRoot, "tests/snapshots/services");

type RequestLog = {
	method: "GET" | "POST";
	url: string;
	cacheDuration?: number;
	body?: unknown;
};
const lastRequest: { value: RequestLog | undefined } = { value: undefined };

async function stubFetchers() {
	const { BaseService } = await import("../src/services/base.service.js");
	const proto = BaseService.prototype as unknown as Record<string, unknown>;
	const loadFixture = async () => {
		const key = (globalThis as Record<string, unknown>)
			.__SNAPSHOT_KEY as string;
		const raw = await fs.readFile(
			path.join(fixturesDir, `${key}.json`),
			"utf-8",
		);
		return JSON.parse(raw);
	};
	proto.fetchWithToolConfig = async (url: string, cacheDuration?: unknown) => {
		/**
		 * v0.1 default-TTL methods call fetchWithToolConfig(url) with one arg.
		 * The real method has `cacheDuration = this.DEFAULT_CACHE_TTL_SECONDS`
		 * as a parameter default, but stubbing bypasses that. Coerce ONLY
		 * undefined → 300 so INVOCATIONS' `cacheDurationSeconds: TTL.default`
		 * lines up for v0.1 one-arg callers.
		 *
		 * Refuse anything else (object, string, etc.). The dangerous refactor
		 * bug — passing `options` as the 2nd positional arg — is exactly the
		 * "non-undefined, non-number" case. Throwing here makes it impossible
		 * to mask: the baseline / regression run fails with a pointed message
		 * instead of silently defaulting to 300 and looking like everything's
		 * fine.
		 */
		if (cacheDuration !== undefined && typeof cacheDuration !== "number") {
			throw new Error(
				`fetchWithToolConfig received non-number cacheDuration (${typeof cacheDuration}); ` +
					`did you pass options as the second positional arg? Use ` +
					`fetchWithToolConfig(url, DEFAULT_CACHE_TTL_SECONDS, options).`,
			);
		}
		const ttl = (cacheDuration as number | undefined) ?? 300;
		lastRequest.value = { method: "GET", url, cacheDuration: ttl };
		return loadFixture();
	};
	proto.postWithToolConfig = async (url: string, body: unknown) => {
		lastRequest.value = { method: "POST", url, body };
		return loadFixture();
	};
}

/** Compare the recorded request against the expected metadata. Throws on mismatch. */
function assertRequestMatches(
	name: string,
	expected: import("../tests/fixtures/invocations.js").ExpectedRequest,
	got: RequestLog | undefined,
): void {
	if (!got) throw new Error(`${name}: no request was recorded`);
	if (got.method !== expected.method) {
		throw new Error(
			`${name}: expected method ${expected.method}, got ${got.method}`,
		);
	}
	const parsed = new URL(got.url);
	if (parsed.pathname !== expected.pathname) {
		throw new Error(
			`${name}: expected pathname ${expected.pathname}, got ${parsed.pathname}`,
		);
	}
	const actualParams: Record<string, string> = {};
	parsed.searchParams.forEach((v, k) => {
		actualParams[k] = v;
	});
	const expectedKeys = Object.keys(expected.searchParams).sort();
	const actualKeys = Object.keys(actualParams).sort();
	if (JSON.stringify(expectedKeys) !== JSON.stringify(actualKeys)) {
		throw new Error(
			`${name}: searchParams keys mismatch — expected ${expectedKeys.join(",")}, got ${actualKeys.join(",")}`,
		);
	}
	for (const k of expectedKeys) {
		if (actualParams[k] !== expected.searchParams[k]) {
			throw new Error(
				`${name}: searchParams.${k} expected ${JSON.stringify(expected.searchParams[k])}, got ${JSON.stringify(actualParams[k])}`,
			);
		}
	}
	if (
		expected.cacheDurationSeconds !== undefined &&
		got.cacheDuration !== expected.cacheDurationSeconds
	) {
		throw new Error(
			`${name}: expected cacheDuration ${expected.cacheDurationSeconds}, got ${got.cacheDuration}`,
		);
	}
	if (
		expected.body !== undefined &&
		JSON.stringify(got.body) !== JSON.stringify(expected.body)
	) {
		throw new Error(
			`${name}: body mismatch — expected ${JSON.stringify(expected.body)}, got ${JSON.stringify(got.body)}`,
		);
	}
}

async function main() {
	await stubFetchers();
	const mod = await import("../src/services/index.js");
	const services: Services = {
		chainService: mod.chainService,
		protocolService: mod.protocolService,
		tokenService: mod.tokenService,
		transactionService: mod.transactionService,
		userService: mod.userService,
	};
	await fs.mkdir(snapshotsDir, { recursive: true });
	let count = 0;
	for (const inv of INVOCATIONS) {
		(globalThis as Record<string, unknown>).__SNAPSHOT_KEY = inv.name;
		lastRequest.value = undefined;
		try {
			const md = await inv.call(services);
			/**
			 * Validate the recorded request matches the expected metadata. This
			 * confirms the v0.1 contract before we freeze the markdown snapshots —
			 * mistakes (wrong path, missing query param, dropped cache TTL) fail
			 * here instead of slipping into the baseline and surfacing later in
			 * the Task 27 regression.
			 */
			assertRequestMatches(inv.name, inv.expect, lastRequest.value);
			/**
			 * Strip trailing whitespace per line. toMarkdown emits `**Key:** ` with a
			 * trailing space for empty values; committing those tickles `git diff --check`
			 * in CI. The regression test in service-snapshots.test.ts applies the same
			 * transform on the live output so byte-identity is preserved.
			 */
			const cleaned = md.replace(/[ \t]+$/gm, "");
			await fs.writeFile(path.join(snapshotsDir, `${inv.name}.md`), cleaned);
			count++;
			console.log(`✓ ${inv.name}`);
		} catch (err) {
			console.error(`✗ ${inv.name}:`, err);
			process.exit(1);
		}
	}
	console.log(
		`\nWrote ${count}/${INVOCATIONS.length} snapshots to ${snapshotsDir}`,
	);
}

void main();
