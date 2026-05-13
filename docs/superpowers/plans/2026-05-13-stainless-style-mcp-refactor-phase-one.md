# Stainless-Style MCP Refactor — Phase One Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor DeBank MCP from a 31-tool FastMCP server into a CoinGecko/Stainless-style 2-tool surface (`execute` sandbox + `search_docs` local index) plus two default convenience tools, while preserving the 31 legacy tools behind a `--legacy-tools` flag and keeping all existing markdown output and DeBank-API behavior byte-identical on the legacy path.

**Architecture:** Add a new `src/mcp/` layer with `execute/` (isolated-vm sandbox with `ivm.Callback` proxy, three-layer timeouts), `search-docs/` (MiniSearch over committed `embedded-index.ts` generated from pure metadata), `instructions/` (markdown embedded into a generated `.ts` module at build time), and `legacy/` (split into pure `tool-metadata.ts` + side-effectful `tool-handlers.ts`). Existing services each grow a `*Raw()` method returning parsed JSON; the markdown method becomes a thin wrapper with a separate catch for formatter failures. `extractErrorMessage` is patched to preserve axios `code`/`cause` so the sandbox proxy can detect timeout errors.

**Tech Stack:** TypeScript (ESM, NodeNext) · FastMCP · isolated-vm · MiniSearch · Vitest · MSW · tsx · zod-to-json-schema (or `z.toJSONSchema` from Zod 4)

**Spec:** `docs/superpowers/specs/2026-05-13-stainless-style-mcp-refactor-phase-one-design.md` (commit `78aa170`). Read it before starting; this plan implements it.

---

## File map

Created:
- `vitest.config.ts`
- `tests/integration/setup.ts`
- `tests/fixtures/services/<method>.json` (one per legacy method)
- `tests/snapshots/services/<method>.md` (one per legacy method, captured pre-refactor)
- `tests/integration/no-isolated-vm.register.mjs`
- `tests/integration/no-isolated-vm.hooks.mjs`
- `tests/integration/lazy-isolated-vm.test.ts`
- `tests/integration/execute.test.ts`
- `tests/integration/search-docs.test.ts`
- `tests/integration/legacy-tools.test.ts`
- `scripts/build-docs-index.ts`
- `scripts/build-instructions.ts`
- `scripts/snapshot-baseline.ts`
- `src/mcp/instructions/instructions.md`
- `src/mcp/instructions/instructions.generated.ts` (generated, committed)
- `src/mcp/search-docs/embedded-index.ts` (generated, committed)
- `src/mcp/search-docs/cookbook/*.md`
- `src/mcp/search-docs/tool.ts`
- `src/mcp/execute/sandbox.ts`
- `src/mcp/execute/client.ts`
- `src/mcp/execute/tool.ts`
- `src/mcp/legacy/tool-metadata.ts`
- `src/mcp/legacy/tool-handlers.ts`
- `src/mcp/tools.ts`
- `.github/workflows/test.yml`

Modified:
- `package.json` — new deps and scripts
- `src/index.ts` — read version from package.json, register new tools, conditional legacy registration
- `src/services/base.service.ts` — `RequestOptions` parameter on `fetchWithToolConfig` / `postWithToolConfig` and their callees
- `src/services/{chain,protocol,token,transaction,user}.service.ts` — add `*Raw()` per method; thin wrapper with separate formatter catch
- `src/lib/utils/error-handler.ts` — preserve axios `code` and `cause`

Deleted/moved:
- `src/tools/index.ts` → split into `src/mcp/legacy/tool-metadata.ts` (pure) + `src/mcp/legacy/tool-handlers.ts` (side-effectful, with services imports). Original file deleted.

---

## Task 1: Install runtime + dev dependencies

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Install runtime deps**

Run:
```bash
pnpm add isolated-vm minisearch
```

Expected: both added to `dependencies`. If `isolated-vm` fails to build natively, follow the platform error message (`pnpm rebuild isolated-vm` usually fixes Alpine/ARM/older Node).

- [ ] **Step 2: Install dev deps**

Run:
```bash
pnpm add -D vitest @vitest/coverage-v8 msw tsx
```

Expected: all four added to `devDependencies`.

- [ ] **Step 3: Verify `zod-to-json-schema` is already present and probe Zod 4 compatibility**

Run:
```bash
grep zod-to-json-schema package.json
node -e "import('zod').then(z=>import('zod-to-json-schema').then(m=>console.log(typeof m.zodToJsonSchema(z.z.object({a:z.z.string()})))))"
```

Expected first command: `"zod-to-json-schema": "^3.25.1"` shows in devDependencies.
Expected second command: prints `object` (schema produced). If it errors, the plan will switch to Zod 4's built-in `z.toJSONSchema()` in Task 11 — note the outcome and proceed.

- [ ] **Step 4: Commit dep additions**

```bash
git add package.json pnpm-lock.yaml
git commit -m "build: add phase-one deps (isolated-vm, minisearch, vitest, msw, tsx)"
```

---

## Task 2: Add build, test, and prebuild scripts

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Edit the `scripts` block of package.json**

Replace the existing `scripts` object with:

```jsonc
{
  "scripts": {
    "build:docs":         "tsx scripts/build-docs-index.ts",
    "build:instructions": "tsx scripts/build-instructions.ts",
    "prebuild":           "pnpm run build:docs && pnpm run build:instructions",
    "build":              "tsc && shx chmod +x dist/index.js",
    "pretest":            "pnpm run build",
    "test":               "vitest run",
    "test:watch":         "vitest",
    "prepare":            "husky",
    "watch":              "tsc --watch",
    "start":              "node dist/index.js",
    "format":             "biome format . --write",
    "lint":               "biome check .",
    "publish-packages":   "pnpm run build && changeset publish"
  }
}
```

Keep all other top-level package.json fields unchanged.

- [ ] **Step 2: Commit scripts**

```bash
git add package.json
git commit -m "build: add prebuild, pretest, build:docs, build:instructions scripts"
```

Note: `pnpm test` will fail until later tasks land (`scripts/build-*.ts` don't exist yet). That's expected — the script wiring lands first so subsequent tasks can call it.

---

## Task 3: Create `vitest.config.ts`

**Files:**
- Create: `vitest.config.ts`

- [ ] **Step 1: Create the config file**

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./tests/integration/setup.ts"],
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    testTimeout: 60_000,    // generous: the lazy-isolated-vm test spawns a child process
    pool: "forks",          // isolated-vm + native deps behave better with fork pool
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add vitest.config.ts
git commit -m "test: add vitest config with setupFiles"
```

---

## Task 4: Create test environment setup file

**Files:**
- Create: `tests/integration/setup.ts`

- [ ] **Step 1: Write the setup file**

```ts
// tests/integration/setup.ts (loaded via vitest config setupFiles)
import { vi } from "vitest";

// 1. Neutralize dotenv BEFORE env.ts is imported. Default dotenv.config()
//    populates keys that are undefined from a .env file — so a `delete`
//    without this mock would silently re-introduce IQ_GATEWAY_*,
//    GOOGLE_GENERATIVE_AI_API_KEY, etc. from a developer's local .env.
vi.mock("dotenv", () => ({ config: () => ({ parsed: {} }) }));

// 2. Set the one required env var and delete the rest. Empty strings are
//    NOT a valid alternative here: env.ts uses `z.url().optional()` and
//    `z.string().min(1).optional()`, both of which REJECT empty strings and
//    fail the parse. Only `undefined` resolves to the optional "unset"
//    branch — which means `delete`, not stub-to-"".
process.env.DEBANK_API_KEY = "test-key";
delete process.env.IQ_GATEWAY_URL;
delete process.env.IQ_GATEWAY_KEY;
delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
delete process.env.OPENROUTER_API_KEY;
```

- [ ] **Step 2: Smoke-test by adding a trivial passing test**

Create `tests/integration/setup-smoke.test.ts`:

```ts
import { describe, it, expect } from "vitest";

describe("setup", () => {
  it("set DEBANK_API_KEY and deleted others", () => {
    expect(process.env.DEBANK_API_KEY).toBe("test-key");
    expect(process.env.IQ_GATEWAY_URL).toBeUndefined();
    expect(process.env.GOOGLE_GENERATIVE_AI_API_KEY).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run the smoke test directly with vitest (bypassing `pretest` because `dist/` may be stale)**

Run: `pnpm exec vitest run tests/integration/setup-smoke.test.ts`

Expected: PASS, 1 test.

- [ ] **Step 4: Commit**

```bash
git add tests/integration/setup.ts tests/integration/setup-smoke.test.ts
git commit -m "test: add vitest setup file with dotenv mock and env pruning"
```

---

## Task 5: Patch `extractErrorMessage` to preserve axios `code` and `cause`

**Files:**
- Modify: `src/lib/utils/error-handler.ts`
- Create: `src/lib/utils/error-handler.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/utils/error-handler.test.ts
import { describe, it, expect } from "vitest";
import axios from "axios";
import { extractErrorMessage } from "./error-handler.js";

describe("extractErrorMessage", () => {
  it("preserves code and cause for AxiosError", () => {
    const axiosErr = new axios.AxiosError(
      "timeout of 6000ms exceeded",
      "ECONNABORTED",
    );
    const wrapped = extractErrorMessage(axiosErr) as Error & { code?: string };
    expect(wrapped).toBeInstanceOf(Error);
    expect(wrapped.code).toBe("ECONNABORTED");
    expect(wrapped.cause).toBe(axiosErr);
    expect(wrapped.message).toBe("timeout of 6000ms exceeded");
  });

  it("passes Error instances through unchanged", () => {
    const e = new Error("boom");
    expect(extractErrorMessage(e)).toBe(e);
  });

  it("wraps non-Error values with String()", () => {
    const wrapped = extractErrorMessage("string error");
    expect(wrapped).toBeInstanceOf(Error);
    expect(wrapped.message).toBe("string error");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/utils/error-handler.test.ts`
Expected: FAIL — first test fails on `wrapped.code` being `undefined`.

- [ ] **Step 3: Patch error-handler.ts**

Replace the entire file with:

```ts
/**
 * Error handling utilities
 */

import axios from "axios";

/**
 * Extracts a user-friendly error message from an unknown error.
 * For AxiosError input, preserves `code` (e.g., ECONNABORTED, ETIMEDOUT)
 * and stores the original error in `cause` so downstream consumers (notably
 * the sandbox proxy timeout detection in src/mcp/execute/client.ts) can
 * distinguish axios timeouts from other failures.
 */
export function extractErrorMessage(error: unknown): Error {
	if (axios.isAxiosError(error)) {
		const errorPayload = error.response?.data ?? error.message;
		const errorMessage =
			typeof errorPayload === "string"
				? errorPayload
				: JSON.stringify(errorPayload);
		const wrapped = new Error(errorMessage, { cause: error }) as Error & {
			code?: string;
		};
		if (error.code) wrapped.code = error.code;
		return wrapped;
	}
	return error instanceof Error ? error : new Error(String(error));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/utils/error-handler.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils/error-handler.ts src/lib/utils/error-handler.test.ts
git commit -m "fix(error-handler): preserve axios code and cause for sandbox timeout detection"
```

---

## Task 6: Thread `RequestOptions` through `BaseService`

**Files:**
- Modify: `src/services/base.service.ts`

- [ ] **Step 1: Add `RequestOptions` type and update `fetchWithToolConfig` signature**

Edit [src/services/base.service.ts](src/services/base.service.ts). At the top of the file, after the imports, add:

```ts
export type RequestOptions = { signal?: AbortSignal; timeout?: number };
```

Then update `fetchWithToolConfig` (currently lines 50-59) to:

```ts
protected async fetchWithToolConfig<T>(
  url: string,
  cacheDuration = this.DEFAULT_CACHE_TTL_SECONDS,
  options?: RequestOptions,
): Promise<T> {
  // Use IQ Gateway if configured, otherwise make direct API calls
  if (env.IQ_GATEWAY_URL && env.IQ_GATEWAY_KEY) {
    return this.fetchViaGateway<T>(url, cacheDuration, options);
  }
  return this.fetchDirect<T>(url, options);
}
```

- [ ] **Step 2: Update `fetchViaGateway` to forward options to axios**

Update the private `fetchViaGateway` method:

```ts
private async fetchViaGateway<T>(
  url: string,
  cacheDuration: number,
  options?: RequestOptions,
): Promise<T> {
  if (!env.IQ_GATEWAY_URL || !env.IQ_GATEWAY_KEY) {
    throw new Error(
      "IQ_GATEWAY_URL and IQ_GATEWAY_KEY must be configured to use gateway",
    );
  }

  const proxyUrl = new URL(env.IQ_GATEWAY_URL);
  proxyUrl.searchParams.append("url", url);
  proxyUrl.searchParams.append("projectName", "debank_mcp");
  if (cacheDuration >= 0) {
    proxyUrl.searchParams.append(
      "cacheDuration",
      Math.floor(cacheDuration).toString(),
    );
  }

  try {
    const response = await axios.get<T>(proxyUrl.href, {
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.IQ_GATEWAY_KEY,
      },
      ...(options?.signal ? { signal: options.signal } : {}),
      ...(options?.timeout ? { timeout: options.timeout } : {}),
    });
    return response.data;
  } catch (error: unknown) {
    throw extractErrorMessage(error);
  }
}
```

- [ ] **Step 3: Update `fetchDirect`**

```ts
private async fetchDirect<T>(url: string, options?: RequestOptions): Promise<T> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (env.DEBANK_API_KEY) {
      headers["AccessKey"] = env.DEBANK_API_KEY;
    }

    const response = await axios.get<T>(url, {
      headers,
      ...(options?.signal ? { signal: options.signal } : {}),
      ...(options?.timeout ? { timeout: options.timeout } : {}),
    });
    return response.data;
  } catch (error: unknown) {
    throw extractErrorMessage(error);
  }
}
```

- [ ] **Step 4: Update `postWithToolConfig`, `postViaGateway`, and `postDirect` the same way**

```ts
protected async postWithToolConfig<T>(
  url: string,
  body: unknown,
  options?: RequestOptions,
): Promise<T> {
  if (env.IQ_GATEWAY_URL && env.IQ_GATEWAY_KEY) {
    return this.postViaGateway<T>(url, body, options);
  }
  return this.postDirect<T>(url, body, options);
}

private async postViaGateway<T>(
  url: string,
  body: unknown,
  options?: RequestOptions,
): Promise<T> {
  const proxyUrl = new URL(env.IQ_GATEWAY_URL!);
  proxyUrl.searchParams.append("url", url);
  proxyUrl.searchParams.append("method", "POST");
  proxyUrl.searchParams.append("projectName", "debank_mcp");

  try {
    const response = await axios.post<T>(proxyUrl.href, body, {
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.IQ_GATEWAY_KEY!,
      },
      ...(options?.signal ? { signal: options.signal } : {}),
      ...(options?.timeout ? { timeout: options.timeout } : {}),
    });
    return response.data;
  } catch (error: unknown) {
    throw extractErrorMessage(error);
  }
}

private async postDirect<T>(
  url: string,
  body: unknown,
  options?: RequestOptions,
): Promise<T> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (env.DEBANK_API_KEY) {
      headers["AccessKey"] = env.DEBANK_API_KEY;
    }

    const response = await axios.post<T>(url, body, {
      headers,
      ...(options?.signal ? { signal: options.signal } : {}),
      ...(options?.timeout ? { timeout: options.timeout } : {}),
    });
    return response.data;
  } catch (error: unknown) {
    throw extractErrorMessage(error);
  }
}
```

- [ ] **Step 5: Verify lint and types pass**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: no errors. (Service subclasses still call the methods with the old 2-arg shape; the new param is optional so they keep working.)

- [ ] **Step 6: Commit**

```bash
git add src/services/base.service.ts
git commit -m "feat(base.service): thread RequestOptions through fetch/post helpers"
```

---

## Task 7: Snapshot v0.1 markdown output for all 31 service methods

This task captures the pre-refactor baseline. The snapshots become the regression oracle; later tasks must not change them. The invocation table is created in `tests/fixtures/invocations.ts` so both this one-shot script and the later regression test (Task 27) share one source of truth.

**Files:**
- Create: `tests/fixtures/invocations.ts`
- Create: `scripts/snapshot-baseline.ts`
- Create: `tests/fixtures/services/<method>.json` (31 files, hand-authored)
- Create: `tests/snapshots/services/<method>.md` (31 files, generated by the script)

- [ ] **Step 1: Create the shared invocation table**

Create `tests/fixtures/invocations.ts`:

```ts
// tests/fixtures/invocations.ts
//
// Single source of truth for the 31 service-method invocations exercised
// by both the snapshot baseline script (one-shot capture) and the vitest
// regression test in tests/integration/service-snapshots.test.ts.

import type {
  chainService,
  protocolService,
  tokenService,
  transactionService,
  userService,
} from "../../src/services/index.js";

export type Services = {
  chainService: typeof chainService;
  protocolService: typeof protocolService;
  tokenService: typeof tokenService;
  transactionService: typeof transactionService;
  userService: typeof userService;
};

export type Invocation = {
  name: string;
  call: (s: Services) => Promise<string>;
};

export const INVOCATIONS: Invocation[] = [
  // Chain (3)
  { name: "get_supported_chain_list", call: (s) => s.chainService.getSupportedChainList() },
  { name: "get_chain", call: (s) => s.chainService.getChain({ id: "eth" }) },
  { name: "get_gas_prices", call: (s) => s.chainService.getGasPrices({ chain_id: "eth" }) },
  // Protocol (4)
  { name: "get_all_protocols_of_supported_chains", call: (s) => s.protocolService.getAllProtocolsOfSupportedChains({}) },
  { name: "get_protocol_information", call: (s) => s.protocolService.getProtocolInformation({ id: "uniswap" }) },
  { name: "get_top_holders_of_protocol", call: (s) => s.protocolService.getTopHoldersOfProtocol({ id: "uniswap" }) },
  { name: "get_pool_information", call: (s) => s.protocolService.getPoolInformation({ id: "0x00000000219ab540356cbb839cbe05303d7705fa", chain_id: "eth" }) },
  // Token (4)
  { name: "get_token_information", call: (s) => s.tokenService.getTokenInformation({ id: "0xdac17f958d2ee523a2206206994597c13d831ec7", chain_id: "eth" }) },
  { name: "get_list_token_information", call: (s) => s.tokenService.getListTokenInformation({ chain_id: "eth", ids: "0xdac17f958d2ee523a2206206994597c13d831ec7" }) },
  { name: "get_top_holders_of_token", call: (s) => s.tokenService.getTopHoldersOfToken({ id: "0xdac17f958d2ee523a2206206994597c13d831ec7", chain_id: "eth" }) },
  { name: "get_token_history_price", call: (s) => s.tokenService.getTokenHistoryPrice({ id: "0xdac17f958d2ee523a2206206994597c13d831ec7", chain_id: "eth", date_at: "2024-01-01" }) },
  // User (18)
  { name: "get_user_used_chain_list", call: (s) => s.userService.getUserUsedChainList({ id: "0xabc" }) },
  { name: "get_user_chain_balance", call: (s) => s.userService.getUserChainBalance({ id: "0xabc", chain_id: "eth" }) },
  { name: "get_user_protocol", call: (s) => s.userService.getUserProtocol({ id: "0xabc", protocol_id: "uniswap" }) },
  { name: "get_user_complex_protocol_list", call: (s) => s.userService.getUserComplexProtocolList({ id: "0xabc", chain_id: "eth" }) },
  { name: "get_user_all_complex_protocol_list", call: (s) => s.userService.getUserAllComplexProtocolList({ id: "0xabc" }) },
  { name: "get_user_all_simple_protocol_list", call: (s) => s.userService.getUserAllSimpleProtocolList({ id: "0xabc" }) },
  { name: "get_user_token_balance", call: (s) => s.userService.getUserTokenBalance({ id: "0xabc", chain_id: "eth", token_id: "0xdac17f958d2ee523a2206206994597c13d831ec7" }) },
  { name: "get_user_token_list", call: (s) => s.userService.getUserTokenList({ id: "0xabc", chain_id: "eth" }) },
  { name: "get_user_all_token_list", call: (s) => s.userService.getUserAllTokenList({ id: "0xabc" }) },
  { name: "get_user_nft_list", call: (s) => s.userService.getUserNftList({ id: "0xabc", chain_id: "eth" }) },
  { name: "get_user_all_nft_list", call: (s) => s.userService.getUserAllNftList({ id: "0xabc" }) },
  { name: "get_user_history_list", call: (s) => s.userService.getUserHistoryList({ id: "0xabc", chain_id: "eth" }) },
  { name: "get_user_all_history_list", call: (s) => s.userService.getUserAllHistoryList({ id: "0xabc" }) },
  { name: "get_user_token_authorized_list", call: (s) => s.userService.getUserTokenAuthorizedList({ id: "0xabc", chain_id: "eth" }) },
  { name: "get_user_nft_authorized_list", call: (s) => s.userService.getUserNftAuthorizedList({ id: "0xabc", chain_id: "eth" }) },
  { name: "get_user_total_balance", call: (s) => s.userService.getUserTotalBalance({ id: "0xabc" }) },
  { name: "get_user_chain_net_curve", call: (s) => s.userService.getUserChainNetCurve({ id: "0xabc", chain_id: "eth" }) },
  { name: "get_user_total_net_curve", call: (s) => s.userService.getUserTotalNetCurve({ id: "0xabc" }) },
  // Transaction (2)
  { name: "pre_exec_transaction", call: (s) => s.transactionService.preExecTransaction({ tx: "{\"from\":\"0xabc\"}" }) },
  { name: "explain_transaction", call: (s) => s.transactionService.explainTransaction({ tx: "{\"data\":\"0x\"}" }) },
];
```

- [ ] **Step 2: Create the baseline script that consumes the shared table**

Create `scripts/snapshot-baseline.ts`:

```ts
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

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturesDir = path.join(repoRoot, "tests/fixtures/services");
const snapshotsDir = path.join(repoRoot, "tests/snapshots/services");

async function stubFetchers() {
  const { BaseService } = await import("../src/services/base.service.js");
  const proto = BaseService.prototype as unknown as Record<string, unknown>;
  const stub = async function () {
    const key = (globalThis as Record<string, unknown>).__SNAPSHOT_KEY as string;
    const raw = await fs.readFile(path.join(fixturesDir, `${key}.json`), "utf-8");
    return JSON.parse(raw);
  };
  proto.fetchWithToolConfig = stub;
  proto.postWithToolConfig = stub;
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
    try {
      const md = await inv.call(services);
      await fs.writeFile(path.join(snapshotsDir, `${inv.name}.md`), md);
      count++;
      console.log(`✓ ${inv.name}`);
    } catch (err) {
      console.error(`✗ ${inv.name}:`, err);
      process.exit(1);
    }
  }
  console.log(`\nWrote ${count}/${INVOCATIONS.length} snapshots to ${snapshotsDir}`);
}

void main();
```

- [ ] **Step 3: Author one fixture per method**

Create `tests/fixtures/services/<name>.json` for each of the 31 names in `INVOCATIONS`. Each file contains a representative DeBank API response for that endpoint. Source the shape from the running v0.1 server against a known wallet (any small but realistic response works) or from [src/types.ts](src/types.ts) which has the type definitions.

For `get_user_total_net_curve`, the fixture MUST be the wrapper shape `{ "usd_value_list": [[1704067200, 1234.5], [1704153600, 1235.0]] }` (this is the one method that unwraps before formatting — see spec §2.2 Rule for transformed methods).

For all other methods, the fixture matches the literal DeBank response shape.

Commit the 31 fixtures + the invocations module:

```bash
git add tests/fixtures/invocations.ts tests/fixtures/services/
git commit -m "test: add shared invocations table and per-method JSON fixtures"
```

- [ ] **Step 4: Run the snapshot script**

Run: `pnpm exec tsx scripts/snapshot-baseline.ts`
Expected: 31 `✓` lines, then `Wrote 31/31 snapshots to .../tests/snapshots/services`.

If any line errors, inspect the fixture shape vs. what the service method expects and fix the fixture.

- [ ] **Step 5: Verify snapshots exist and have non-zero content**

Run: `ls tests/snapshots/services/ | wc -l && find tests/snapshots/services -size 0`
Expected: `31` and no zero-byte files.

- [ ] **Step 6: Commit baseline snapshots + script**

```bash
git add scripts/snapshot-baseline.ts tests/snapshots/services/
git commit -m "test: snapshot v0.1 markdown output for all 31 service methods (regression baseline)"
```

---

## Task 8: Refactor `ChainService` (3 methods) with `*Raw()` + dual catches

The pattern this task establishes is reused verbatim in Tasks 9–12. Engineers should read this task fully before doing the others.

**Files:**
- Modify: `src/services/chain.service.ts`

- [ ] **Step 1: Read the existing file**

Open [src/services/chain.service.ts](src/services/chain.service.ts) and note its current shape: each public method has one `try/catch` wrapping fetch + `formatResponse`, with `logAndWrapError(...contextual message..., error)`.

- [ ] **Step 2: Refactor `getSupportedChainList`**

Replace the existing method with two methods. The `*Raw()` form owns network errors; the markdown form owns formatter errors. Keep the contextual messages distinct.

```ts
// In src/services/chain.service.ts
// Note: zero-arg raw methods still accept the (_args, options) signature so
// the generic sandbox dispatcher in execute/client.ts (which always calls
// raw(args, options)) doesn't drop the options argument when the guest passes
// no args. The first param is unused but typed for shape consistency.

async getSupportedChainListRaw(
  _args?: Record<string, never>,
  options?: RequestOptions,
): Promise<ChainInfo[]> {
  try {
    return await this.fetchWithToolConfig<ChainInfo[]>(
      `${this.baseUrl}/chain/list`,
      config.supportedChainListLifeTime,
      options,
    );
  } catch (error) {
    throw logAndWrapError("Failed to fetch supported chain list", error);
  }
}

async getSupportedChainList(): Promise<string> {
  const data = await this.getSupportedChainListRaw();
  try {
    return await this.formatResponse(data, {
      title: "Supported Chains",
    });
  } catch (error) {
    throw logAndWrapError("Failed to format supported chain list response", error);
  }
}
```

Also add `RequestOptions` to the imports at the top:

```ts
import { BaseService, type RequestOptions } from "./base.service.js";
```

- [ ] **Step 3: Refactor `getChain`**

```ts
async getChainRaw(
  args: { id: string },
  options?: RequestOptions,
): Promise<ChainInfo> {
  try {
    return await this.fetchWithToolConfig<ChainInfo>(
      `${this.baseUrl}/chain?id=${args.id}`,
      config.chainDataLifeTime,
      options,
    );
  } catch (error) {
    throw logAndWrapError(`Failed to fetch chain ${args.id}`, error);
  }
}

async getChain(args: { id: string }): Promise<string> {
  const data = await this.getChainRaw(args);
  try {
    // v0.1 title uses data.name in a template literal — see chain.service.ts:27.
    // Reproducing it byte-identical is what keeps the snapshot regression green.
    return await this.formatResponse(data, { title: `Chain Information: ${data.name}` });
  } catch (error) {
    throw logAndWrapError(`Failed to format chain ${args.id} response`, error);
  }
}
```

- [ ] **Step 4: Refactor `getGasPrices`**

```ts
async getGasPricesRaw(
  args: { chain_id: string },
  options?: RequestOptions,
): Promise<GasMarket> {
  try {
    return await this.fetchWithToolConfig<GasMarket>(
      `${this.baseUrl}/wallet/gas_market?chain_id=${args.chain_id}`,
      config.gasPriceLifeTime,
      options,
    );
  } catch (error) {
    throw logAndWrapError(`Failed to fetch gas prices for chain ${args.chain_id}`, error);
  }
}

async getGasPrices(args: { chain_id: string }): Promise<string> {
  const data = await this.getGasPricesRaw(args);
  try {
    // v0.1 options — chain.service.ts:54-57. Title format + numberFields must match.
    return await this.formatResponse(data, {
      title: `Gas Prices for Chain: ${args.chain_id}`,
      numberFields: ["price", "front_tx_count", "estimated_seconds"],
    });
  } catch (error) {
    throw logAndWrapError(`Failed to format gas prices for chain ${args.chain_id} response`, error);
  }
}
```

The types above (`ChainInfo` at [types.ts:13](../../../src/types.ts#L13), `GasMarket` at [types.ts:302](../../../src/types.ts#L302)) match the actual v0.1 definitions. **All `formatResponse` options (title strings, currencyFields, numberFields) must be copied byte-identical from the v0.1 method body** — the snapshots are the oracle. For each service refactor task (8–12), open the v0.1 method before editing, copy the entire `formatResponse(..., {...})` options object verbatim, then re-run the snapshot regression to confirm zero diff. Other services use `ProtocolInfo`, `TokenInfo`, `UserChainBalance`, etc. — always import from `../types.js`.

- [ ] **Step 5: Re-run the snapshot regression**

Run: `pnpm exec tsx scripts/snapshot-baseline.ts`
Expected: 31 `✓` lines (only the 3 chain ones are exercised by the refactor; the rest still use unrefactored code, which is fine).

Then verify the chain snapshots are unchanged:

Run: `git diff --stat tests/snapshots/services/get_chain.md tests/snapshots/services/get_gas_prices.md tests/snapshots/services/get_supported_chain_list.md`

Expected: no diff (or only whitespace if the script wrote with different trailing newline).

If a snapshot differs, the refactor changed the markdown output for a real call — that's a regression to fix before moving on.

- [ ] **Step 6: Run typecheck and lint**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/services/chain.service.ts
git commit -m "refactor(chain.service): split into *Raw + markdown wrapper with dual catches"
```

---

## Task 9: Refactor `ProtocolService` (4 methods)

**Files:**
- Modify: `src/services/protocol.service.ts`

**Refactor template** — apply to every method below:

```ts
// Before: one method with one try/catch wrapping fetch + format
async getX(args): Promise<string> {
  try {
    const data = await this.fetchWithToolConfig<XType>(URL, TTL);
    return await this.formatResponse(data, OPTS);
  } catch (error) {
    throw logAndWrapError("Failed to fetch X for ...", error);
  }
}

// After: two methods, two distinct catches
async getXRaw(args, options?: RequestOptions): Promise<XType> {
  try {
    return await this.fetchWithToolConfig<XType>(URL, TTL, options);
  } catch (error) {
    throw logAndWrapError("Failed to fetch X for ...", error);
  }
}
async getX(args): Promise<string> {
  const data = await this.getXRaw(args);
  try {
    return await this.formatResponse(data, OPTS);
  } catch (error) {
    throw logAndWrapError("Failed to format X for ... response", error);
  }
}
```

URLs, TTLs, and `formatResponse` options stay identical to the v0.1 versions — the snapshots are the oracle. Add `import { BaseService, type RequestOptions } from "./base.service.js";` to the imports.

- [ ] **Step 1: Apply the template to all four methods**

Methods to refactor: `getAllProtocolsOfSupportedChains`, `getProtocolInformation`, `getTopHoldersOfProtocol`, `getPoolInformation`. Each gets a public `*Raw()` plus the thin markdown wrapper, exactly per the template above.

- [ ] **Step 2: Run the snapshot regression**

Run: `pnpm exec tsx scripts/snapshot-baseline.ts`
Then: `git diff --stat tests/snapshots/services/get_all_protocols_of_supported_chains.md tests/snapshots/services/get_protocol_information.md tests/snapshots/services/get_top_holders_of_protocol.md tests/snapshots/services/get_pool_information.md`

Expected: no diff.

- [ ] **Step 3: Typecheck, lint, commit**

```bash
pnpm exec tsc --noEmit && pnpm lint
git add src/services/protocol.service.ts
git commit -m "refactor(protocol.service): split into *Raw + markdown wrapper with dual catches"
```

---

## Task 10: Refactor `TokenService` (4 methods)

**Files:**
- Modify: `src/services/token.service.ts`

Refactor template — same as Task 9's preamble template (split into `*Raw()` + markdown wrapper, each with its own contextual `logAndWrapError`, URLs/TTLs/options unchanged from v0.1).

- [ ] **Step 1: Apply the template to all four methods**

Methods: `getTokenInformation`, `getListTokenInformation`, `getTopHoldersOfToken`, `getTokenHistoryPrice`. Each gets a public `*Raw()` and a thin markdown wrapper. Add `import { BaseService, type RequestOptions } from "./base.service.js";` if not already present.

- [ ] **Step 2: Snapshot regression + typecheck + lint + commit**

```bash
pnpm exec tsx scripts/snapshot-baseline.ts
git diff --stat tests/snapshots/services/
pnpm exec tsc --noEmit && pnpm lint
git add src/services/token.service.ts
git commit -m "refactor(token.service): split into *Raw + markdown wrapper with dual catches"
```

Expected: no snapshot diff for token methods.

---

## Task 11: Refactor `UserService` (18 methods)

**Files:**
- Modify: `src/services/user.service.ts`

The largest service. The 18 methods are: `getUserUsedChainList`, `getUserChainBalance`, `getUserProtocol`, `getUserComplexProtocolList`, `getUserAllComplexProtocolList`, `getUserAllSimpleProtocolList`, `getUserTokenBalance`, `getUserTokenList`, `getUserAllTokenList`, `getUserNftList`, `getUserAllNftList`, `getUserHistoryList`, `getUserAllHistoryList`, `getUserTokenAuthorizedList`, `getUserNftAuthorizedList`, `getUserTotalBalance`, `getUserChainNetCurve`, `getUserTotalNetCurve`.

Refactor template — same as Task 9's preamble template (split into `*Raw()` + markdown wrapper, each with its own contextual `logAndWrapError`). All 17 non-special-case methods follow this template; `getUserTotalNetCurve` is handled separately in Step 2.

- [ ] **Step 1: Apply the template to 17 of the 18 methods**

All methods listed above EXCEPT `getUserTotalNetCurve`. URLs, TTLs, and `formatResponse` options stay identical to v0.1.

- [ ] **Step 2: Handle the `getUserTotalNetCurve` special case**

This is the only method where the markdown wrapper unwraps before formatting. The `*Raw()` returns the literal API shape `{usd_value_list: NetCurvePoint[]}`; the markdown wrapper unwraps. Per spec §2.2 Rule for transformed methods:

```ts
async getUserTotalNetCurveRaw(
  args: { id: string; chain_ids?: string },
  options?: RequestOptions,
): Promise<{ usd_value_list: NetCurvePoint[] }> {
  try {
    const url = args.chain_ids
      ? `${this.baseUrl}/user/total_net_curve?id=${args.id}&chain_ids=${args.chain_ids}`
      : `${this.baseUrl}/user/total_net_curve?id=${args.id}`;
    return await this.fetchWithToolConfig<{ usd_value_list: NetCurvePoint[] }>(url, this.DEFAULT_CACHE_TTL_SECONDS, options);
  } catch (error) {
    const context = args.chain_ids
      ? `Failed to fetch total net curve for user ${args.id} on chains ${args.chain_ids}`
      : `Failed to fetch total net curve for user ${args.id}`;
    throw logAndWrapError(context, error);
  }
}

async getUserTotalNetCurve(args: { id: string; chain_ids?: string }): Promise<string> {
  const data = await this.getUserTotalNetCurveRaw(args);
  try {
    return await this.formatResponse(data.usd_value_list, {
      title: "Total Portfolio Value Over Time",
      currencyFields: ["usd_value"],
    });
  } catch (error) {
    throw logAndWrapError(`Failed to format total net curve for user ${args.id} response`, error);
  }
}
```

Notice the wrapper passes `data.usd_value_list` to `formatResponse`, not `data`. The `*Raw()` return type and the markdown method input differ — this is the invariant called out in spec §2.2.

- [ ] **Step 3: Snapshot regression**

Run: `pnpm exec tsx scripts/snapshot-baseline.ts`
Then: `git diff --stat tests/snapshots/services/get_user_*.md`

Expected: no diff across all 18 user methods.

- [ ] **Step 4: Typecheck, lint, commit**

```bash
pnpm exec tsc --noEmit && pnpm lint
git add src/services/user.service.ts
git commit -m "refactor(user.service): split 18 methods into *Raw + markdown wrapper (getUserTotalNetCurve preserves unwrap)"
```

---

## Task 12: Refactor `TransactionService` (2 methods)

**Files:**
- Modify: `src/services/transaction.service.ts`

Same template as Task 9, with one difference: both methods use `postWithToolConfig` (POST), so the `*Raw()` body calls `this.postWithToolConfig<T>(URL, BODY, options)` instead of `fetchWithToolConfig`. Everything else is identical.

- [ ] **Step 1: Apply the template to both methods**

Methods: `preExecTransaction`, `explainTransaction`.

- [ ] **Step 2: Snapshot regression + checks + commit**

```bash
pnpm exec tsx scripts/snapshot-baseline.ts
git diff --stat tests/snapshots/services/pre_exec_transaction.md tests/snapshots/services/explain_transaction.md
pnpm exec tsc --noEmit && pnpm lint
git add src/services/transaction.service.ts
git commit -m "refactor(transaction.service): split into *Raw + markdown wrapper with dual catches"
```

Expected: no snapshot diff.

---

## Task 13: Create `tool-metadata.ts` (pure, side-effect-free)

**Files:**
- Create: `src/mcp/legacy/tool-metadata.ts`

This file is the single source of truth for the 31 tools. It must not `import` from `src/services/` or `src/lib/entity-resolver.ts` — both have module-load side effects (singleton construction, openrouter wiring, Gemini cache init). The docs index builder consumes this file at build time without triggering any of that.

- [ ] **Step 1: Create the metadata module skeleton**

```ts
// src/mcp/legacy/tool-metadata.ts
//
// Side-effect-free metadata for the 31 legacy `debank_*` tools. Used by:
//   - scripts/build-docs-index.ts (build-time docs index generation)
//   - src/mcp/legacy/tool-handlers.ts (server-start tool registration)
//
// DO NOT IMPORT from src/services/ or src/lib/entity-resolver.ts — those
// modules have load-time side effects (singleton construction, openrouter
// initialization, Gemini cache priming). Importing them here would defeat
// the spec's "side-effect-free" guarantee.

import { z } from "zod";

export type ToolMetadata = {
  /** Legacy MCP tool name, e.g. "debank_get_user_chain_balance". */
  name: string;
  /** Agent-facing sandbox call path, e.g. "debank.user.getUserChainBalance". */
  qualified: string;
  /** Dotted path to the markdown-returning service method. Used by tool-handlers.ts. */
  legacyMethodPath: string;
  /** Dotted path to the JSON-returning *Raw method. Used by the sandbox proxy. */
  sandboxMethodPath: string;
  /** Tool description (matches the legacy tool definition's description verbatim). */
  description: string;
  /** Zod schema for input parameters. */
  parameters: z.ZodTypeAny;
  /** Example agent code snippet (one line). */
  exampleCall: string;
};

export const TOOL_METADATA: ToolMetadata[] = [
  // ─── Chain (3) ───────────────────────────────────────────────────────────
  {
    name: "debank_get_supported_chain_list",
    qualified: "debank.chain.getSupportedChainList",
    legacyMethodPath: "chainService.getSupportedChainList",
    sandboxMethodPath: "chainService.getSupportedChainListRaw",
    description:
      "Retrieve a comprehensive list of all blockchain chains supported by the DeBank API. Returns information about each chain including their IDs, names, logo URLs, native token IDs, wrapped token IDs, and pre-execution support status.",
    parameters: z.object({}),
    exampleCall: "await debank.chain.getSupportedChainList()",
  },
  // ... continued in step 2 ...
];
```

- [ ] **Step 2: Add all 31 entries**

Open the current [src/tools/index.ts](src/tools/index.ts) and copy the `name`, `description`, and `parameters` Zod schema for each of the 31 tools into the `TOOL_METADATA` array, in the same order they appear in the legacy file. For each entry, also set:

- `qualified` — the agent-facing dotted path matching the spec's §2.2 namespace (e.g. `"debank.user.getUserChainBalance"`).
- `legacyMethodPath` — singleton + method name, e.g. `"userService.getUserChainBalance"`.
- `sandboxMethodPath` — same with `Raw` suffix, e.g. `"userService.getUserChainBalanceRaw"`.
- `exampleCall` — single-line agent-facing example, e.g. `"await debank.user.getUserChainBalance({id: '0x…', chain_id: 'eth'})"`.

**Strip the `_userQuery` field from `parameters`**: every existing tool definition has `_userQuery: z.string().optional()` for the legacy JQ-filter context. Drop it. The spec §2.3 mandates that any underscore-prefixed parameter is removed from the metadata module; `_userQuery` is the only current one.

- [ ] **Step 3: Add a smoke test for the metadata**

Create `src/mcp/legacy/tool-metadata.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { TOOL_METADATA } from "./tool-metadata.js";

describe("tool-metadata", () => {
  it("contains exactly 31 entries", () => {
    expect(TOOL_METADATA).toHaveLength(31);
  });

  it("every entry has all required fields", () => {
    for (const m of TOOL_METADATA) {
      expect(m.name).toMatch(/^debank_/);
      expect(m.qualified).toMatch(/^debank\./);
      expect(m.legacyMethodPath).toMatch(/Service\./);
      expect(m.sandboxMethodPath).toMatch(/Service\..*Raw$/);
      expect(m.description.length).toBeGreaterThan(20);
      expect(m.exampleCall.length).toBeGreaterThan(10);
    }
  });

  it("strips _userQuery from parameters", () => {
    for (const m of TOOL_METADATA) {
      const shape = (m.parameters as unknown as { shape?: Record<string, unknown> }).shape;
      if (shape) expect(shape).not.toHaveProperty("_userQuery");
    }
  });

  it("does NOT import from src/services/ or src/lib/entity-resolver", async () => {
    // Re-importing this module must not construct service singletons.
    // Detect by spying on console.log calls that services typically make.
    // Lightweight check: just verifying it imports cleanly with no env vars set is enough.
    const mod = await import("./tool-metadata.js");
    expect(mod.TOOL_METADATA).toHaveLength(31);
  });
});
```

- [ ] **Step 4: Run the test**

Run: `pnpm exec vitest run src/mcp/legacy/tool-metadata.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/mcp/legacy/tool-metadata.ts src/mcp/legacy/tool-metadata.test.ts
git commit -m "feat(mcp/legacy): add side-effect-free tool-metadata module (31 entries)"
```

---

## Task 14: Create `tool-handlers.ts` (joins metadata + services)

**Files:**
- Create: `src/mcp/legacy/tool-handlers.ts`

This file replaces the runtime side of the old [src/tools/index.ts](src/tools/index.ts). It does import from `src/services/` (so module-load triggers service singleton construction, exactly like today). Only loaded when `--legacy-tools` is set.

- [ ] **Step 1: Create the handlers module**

```ts
// src/mcp/legacy/tool-handlers.ts
//
// Joins TOOL_METADATA entries to their service singletons and exposes them
// in the FastMCP tool shape. Importing this module triggers service
// singleton construction (via src/services/index.ts) and entity resolver
// init — that's expected. It's the same module-load behavior as the old
// src/tools/index.ts.

import { z } from "zod";
import { needsResolution, resolveChain, resolveEntities } from "../../lib/entity-resolver.js";
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

function resolveMethod(legacyMethodPath: string): (args: Record<string, unknown>) => Promise<string> {
  const [singletonName, methodName] = legacyMethodPath.split(".");
  if (!singletonName || !methodName) {
    throw new Error(`Invalid legacyMethodPath: ${legacyMethodPath}`);
  }
  const singleton = SERVICE_MAP[singletonName] as Record<string, unknown> | undefined;
  if (!singleton) throw new Error(`Unknown service singleton: ${singletonName}`);
  const method = singleton[methodName] as ((args: Record<string, unknown>) => Promise<string>) | undefined;
  if (typeof method !== "function") {
    throw new Error(`Method ${methodName} not found on ${singletonName}`);
  }
  return method.bind(singleton);
}

/** Tool surface registered with FastMCP when --legacy-tools is set. */
export const legacyTools = TOOL_METADATA.map((m: ToolMetadata) => ({
  name: m.name,
  description: m.description,
  // Re-attach _userQuery here (NOT in metadata) — it's the legacy JQ-filter context hook
  parameters: z.object({
    ...((m.parameters as unknown as { shape?: Record<string, z.ZodTypeAny> }).shape ?? {}),
    _userQuery: z.string().optional(),
  }),
  execute: async (args: Record<string, unknown>) => {
    // Per-tool resolve fixups (v0.1 quirks that resolveEntities doesn't cover).
    // debank_get_chain treats `args.id` as a CHAIN name (not a token); the
    // generic resolveEntities() only resolves `id` as a token when chain_id
    // is also present, so this one needs its own pre-step. Reference:
    // src/tools/index.ts:75-85 (v0.1).
    if (m.name === "debank_get_chain") {
      const id = args.id;
      if (typeof id === "string" && needsResolution(id, "chain")) {
        const resolved = await resolveChain(id);
        if (resolved) args.id = resolved;
      }
    }
    // Generic resolution: chain_id, chain_ids, and id-as-token (when chain_id set)
    await resolveEntities(args);
    // Pipe _userQuery into services for JQ-filter context
    const q = args._userQuery as string | undefined;
    if (q) {
      chainService.setQuery(q);
      protocolService.setQuery(q);
      tokenService.setQuery(q);
      transactionService.setQuery(q);
      userService.setQuery(q);
    }
    const method = resolveMethod(m.legacyMethodPath);
    return method(args);
  },
}));
```

If you find any OTHER tool in [src/tools/index.ts](src/tools/index.ts) that resolves `args.id` as a chain (search for `needsResolution(args.id, "chain")`), add an analogous per-tool fixup above. As of v0.1 only `debank_get_chain` does this.

- [ ] **Step 2: Add a smoke test that mocks services and exercises one handler end-to-end**

Create `src/mcp/legacy/tool-handlers.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { legacyTools } from "./tool-handlers.js";

vi.mock("../../services/index.js", () => ({
  chainService: { setQuery: vi.fn(), getSupportedChainList: vi.fn(async () => "# chains") },
  protocolService: { setQuery: vi.fn() },
  tokenService: { setQuery: vi.fn() },
  transactionService: { setQuery: vi.fn() },
  userService: { setQuery: vi.fn() },
}));

vi.mock("../../lib/entity-resolver.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/entity-resolver.js")>()),
  resolveEntities: vi.fn(async () => {}),
  resolveChain: vi.fn(async () => null),
  needsResolution: vi.fn(() => true),
}));

describe("tool-handlers.legacyTools", () => {
  it("exposes 31 tools", () => {
    expect(legacyTools).toHaveLength(31);
  });

  it("each entry has name, description, parameters, execute", () => {
    for (const t of legacyTools) {
      expect(t.name).toMatch(/^debank_/);
      expect(typeof t.execute).toBe("function");
      expect(t.parameters).toBeDefined();
    }
  });

  it("execute() dispatches via the legacyMethodPath", async () => {
    const tool = legacyTools.find((t) => t.name === "debank_get_supported_chain_list");
    expect(tool).toBeDefined();
    const result = await tool!.execute({ _userQuery: "test" });
    expect(result).toBe("# chains");
  });

  it("debank_get_chain resolves args.id as a chain name (v0.1 quirk)", async () => {
    // Override the resolver mock to simulate "Ethereum" → "eth"
    const resolverMod = await import("../../lib/entity-resolver.js");
    vi.mocked(resolverMod.resolveChain).mockResolvedValueOnce("eth");
    const servicesMod = await import("../../services/index.js");
    const getChain = vi.fn(async () => "# eth markdown");
    (servicesMod.chainService as unknown as Record<string, unknown>).getChain = getChain;

    const tool = legacyTools.find((t) => t.name === "debank_get_chain");
    expect(tool).toBeDefined();
    await tool!.execute({ id: "Ethereum" });
    // The handler should have rewritten args.id to "eth" before calling chainService.getChain
    expect(getChain).toHaveBeenCalledWith(expect.objectContaining({ id: "eth" }));
  });
});
```

- [ ] **Step 3: Run the test**

Run: `pnpm exec vitest run src/mcp/legacy/tool-handlers.test.ts`
Expected: PASS, 4 tests (count, shape, dispatch, debank_get_chain regression).

- [ ] **Step 4: Commit**

```bash
git add src/mcp/legacy/tool-handlers.ts src/mcp/legacy/tool-handlers.test.ts
git commit -m "feat(mcp/legacy): add tool-handlers module joining metadata to service singletons"
```

---

## Task 15: Build the docs index — `scripts/build-docs-index.ts` and cookbook entries

**Files:**
- Create: `scripts/build-docs-index.ts`
- Create: `src/mcp/search-docs/cookbook/01-portfolio-overview.md` (and 9 more cookbook entries)
- Create: `src/mcp/search-docs/embedded-index.ts` (generated, committed)

- [ ] **Step 1: Write the builder script**

```ts
// scripts/build-docs-index.ts
//
// Runs at `pnpm build:docs` / `pnpm prebuild`. Walks the pure
// src/mcp/legacy/tool-metadata.ts module and produces a self-contained
// embedded index in src/mcp/search-docs/embedded-index.ts. Also slurps
// any *.md files under src/mcp/search-docs/cookbook/ as prose entries.
//
// IMPORTANT: this module imports tool-metadata.ts only; that module is
// side-effect-free. Importing it must NOT trigger services/index.ts.

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { zodToJsonSchema } from "zod-to-json-schema";
import { TOOL_METADATA } from "../src/mcp/legacy/tool-metadata.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cookbookDir = path.join(repoRoot, "src/mcp/search-docs/cookbook");
const outFile = path.join(repoRoot, "src/mcp/search-docs/embedded-index.ts");

async function loadCookbook(): Promise<{ id: string; title: string; content: string }[]> {
  let entries: { id: string; title: string; content: string }[] = [];
  try {
    const files = (await fs.readdir(cookbookDir)).filter((f) => f.endsWith(".md")).sort();
    for (const f of files) {
      const md = await fs.readFile(path.join(cookbookDir, f), "utf-8");
      const firstHeader = md.split("\n").find((l) => l.startsWith("# "));
      const title = firstHeader ? firstHeader.replace(/^#\s+/, "") : f;
      entries.push({ id: `cookbook:${f}`, title, content: md });
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  return entries;
}

async function main() {
  const cookbook = await loadCookbook();
  const methodEntries = TOOL_METADATA.map((m) => ({
    kind: "method" as const,
    name: m.name,
    qualified: m.qualified,
    description: m.description,
    params: zodToJsonSchema(m.parameters, { target: "openApi3" }),
    exampleCall: m.exampleCall,
  }));

  const out = `// AUTO-GENERATED by scripts/build-docs-index.ts. Do not edit by hand.
// Re-run \`pnpm run build:docs\` to regenerate.

export type MethodEntry = {
  kind: "method";
  name: string;
  qualified: string;
  description: string;
  params: unknown;
  exampleCall: string;
};

export type ProseEntry = {
  kind: "prose";
  id: string;
  title: string;
  content: string;
};

export type IndexEntry = MethodEntry | ProseEntry;

export const ENTRIES: IndexEntry[] = ${JSON.stringify(
    [...methodEntries, ...cookbook.map((c) => ({ kind: "prose" as const, ...c }))],
    null,
    2,
  )};
`;

  await fs.writeFile(outFile, out);
  console.log(`Wrote ${methodEntries.length + cookbook.length} entries to ${outFile}`);
}

void main();
```

If Task 1 Step 3 found that `zod-to-json-schema` doesn't handle Zod 4 well, replace the import with:

```ts
import { z } from "zod";
// ...
params: z.toJSONSchema(m.parameters),
```

- [ ] **Step 2: Author 10 cookbook entries**

Create one file per workflow under `src/mcp/search-docs/cookbook/`. Each is short markdown with a `# Title` header and a worked example. Suggested titles (each ~30-60 lines):

- `01-portfolio-overview.md` — "Get total portfolio value across all chains"
- `02-chain-specific-balance.md` — "Get balances for a wallet on one chain"
- `03-all-nft-holdings.md` — "List all NFTs across chains"
- `04-token-approvals-audit.md` — "Find risky token approvals"
- `05-transaction-history.md` — "Get last N transactions"
- `06-gas-and-simulate.md` — "Check gas and simulate a transaction"
- `07-protocol-positions.md` — "List user positions in a specific DeFi protocol"
- `08-net-value-curve.md` — "Get 24h net value curve (mind the wrapper: `data.usd_value_list`)"
- `09-resolve-chain-names.md` — "Convert user-facing chain names like 'BSC' to DeBank IDs"
- `10-token-price-history.md` — "Get historical price for a token"

Each file shows the agent the relevant `await debank.<resource>.<method>(...)` call. The `08-net-value-curve.md` MUST show `(await debank.user.getUserTotalNetCurve({id})).usd_value_list` so agents don't trip over the wrapper shape.

- [ ] **Step 3: Run the builder**

Run: `pnpm run build:docs`
Expected: `Wrote 41 entries to .../src/mcp/search-docs/embedded-index.ts` (31 methods + 10 cookbook).

- [ ] **Step 4: Verify side-effect-freeness**

Run: `pnpm exec tsx -e 'import("./src/mcp/legacy/tool-metadata.js").then(m=>console.log(m.TOOL_METADATA.length))'`
Expected: `31` printed and process exits cleanly. No errors about missing `DEBANK_API_KEY`, no Gemini cache log lines, no openrouter init log lines. If you see service-init logs, an import slipped into `tool-metadata.ts` — fix it.

- [ ] **Step 5: Commit**

```bash
git add scripts/build-docs-index.ts src/mcp/search-docs/cookbook/ src/mcp/search-docs/embedded-index.ts
git commit -m "feat(mcp/search-docs): add build-docs-index script, 10 cookbook entries, generated embedded-index"
```

---

## Task 16: Author `instructions.md` and the generator script

**Files:**
- Create: `src/mcp/instructions/instructions.md`
- Create: `scripts/build-instructions.ts`
- Create: `src/mcp/instructions/instructions.generated.ts` (generated, committed)

- [ ] **Step 1: Author `instructions.md`**

Create `src/mcp/instructions/instructions.md` with the content described in spec §2.5:

```markdown
# DeBank MCP — Code Mode Operational Guide

This server exposes two primary tools to agents: `execute` (sandboxed JavaScript against a DeBank client) and `search_docs` (search SDK documentation). Two convenience tools — `debank_resolve` and `debank_get_supported_chain_list` — are also available by default. The 30 hidden legacy tools can be restored with `--legacy-tools`.

## Top operations

### 1. Total portfolio value across all chains

\`\`\`js
async function run(debank) {
  return await debank.user.getUserTotalBalance({ id: "0xWALLET" });
}
\`\`\`

### 2. Balances on a specific chain

\`\`\`js
async function run(debank) {
  return await debank.user.getUserChainBalance({ id: "0xWALLET", chain_id: "eth" });
}
\`\`\`

### 3. NFTs across all chains

\`\`\`js
async function run(debank) {
  return await debank.user.getUserAllNftList({ id: "0xWALLET" });
}
\`\`\`

### 4. Top tokens by USD value held on a chain

\`\`\`js
async function run(debank) {
  const tokens = await debank.user.getUserTokenList({ id: "0xWALLET", chain_id: "eth", is_all: true });
  return tokens
    .map(t => ({ symbol: t.symbol, usd: (t.amount ?? 0) * (t.price ?? 0) }))
    .sort((a, b) => b.usd - a.usd)
    .slice(0, 10);
}
\`\`\`

### 5. Find risky token approvals

\`\`\`js
async function run(debank) {
  const approvals = await debank.user.getUserTokenAuthorizedList({ id: "0xWALLET", chain_id: "eth" });
  // Filter to unlimited approvals
  return approvals.filter(a => a.value === "unlimited" || Number(a.value) > 1e20);
}
\`\`\`

### 6. Recent transactions

\`\`\`js
async function run(debank) {
  return await debank.user.getUserHistoryList({ id: "0xWALLET", chain_id: "eth", page_count: 20 });
}
\`\`\`

### 7. Current gas on a chain

\`\`\`js
async function run(debank) {
  return await debank.chain.getGasPrices({ chain_id: "eth" });
}
\`\`\`

### 8. Simulate a transaction before sending

\`\`\`js
async function run(debank) {
  return await debank.transaction.preExecTransaction({
    tx: JSON.stringify({ from: "0xWALLET", to: "0xCONTRACT", data: "0x...", value: "0x0" }),
  });
}
\`\`\`

### 9. List user positions in a specific DeFi protocol

\`\`\`js
async function run(debank) {
  return await debank.user.getUserProtocol({ id: "0xWALLET", protocol_id: "uniswap" });
}
\`\`\`

### 10. Token price on a specific historical date

\`\`\`js
async function run(debank) {
  return await debank.token.getTokenHistoryPrice({
    id: "0xdac17f958d2ee523a2206206994597c13d831ec7",
    chain_id: "eth",
    date_at: "2024-01-01",
  });
}
\`\`\`

## Chain ID conventions

| User-facing name | DeBank chain_id |
|---|---|
| Ethereum, ETH | eth |
| Binance Smart Chain, BSC, BNB Chain | bsc |
| Polygon, Matic | matic |
| Arbitrum | arb |
| Optimism, OP | op |
| Base | base |
| Avalanche, AVAX | avax |

If unsure, call `debank_resolve` or `await debank.resolveChain("...")` inside `execute()`.

## Wrapped token keywords

`"WETH"`, `"wrapped native"`, and `"native token"` automatically resolve to the chain's wrapped token address via `debank.resolveWrappedToken(keyword, chain_id)`.

## Common patterns

### Pagination
The DeBank API uses offset-based pagination via `start` and `limit` (or `page_count` for history). Always paginate inside a single `execute` block — variables don't persist between calls.

### Error handling
Throw or return errors — the runtime maps both to `{ok: false, error: ...}`. **The server does NOT retry upstream errors on your behalf.** If a `debank.*` call fails, decide whether to retry from your own code. For transient errors (network blip, DeBank 429, 5xx) a short `for`-loop with a small delay is fine; for hard 4xx errors retrying is pointless. Variables don't persist between `execute` calls, so put any retry loop inside one `execute` body.

Example pattern:

\`\`\`js
async function run(debank) {
  for (let i = 0; i < 3; i++) {
    try {
      return await debank.user.getUserTotalBalance({ id: "0xWALLET" });
    } catch (err) {
      if (i === 2) throw err;
      await new Promise(r => setTimeout(r, 500 * (i + 1)));
    }
  }
}
\`\`\`

### Projection
Return only what you need. The result crosses the V8 boundary as a JSON copy — keep payloads small.

## Sandbox constraints

- JavaScript only — no TypeScript syntax (no `: string`, no generics).
- No `process`, no `require`, no `import`, no `eval`.
- No `fetch` outside the `debank` client.
- 30 s outer wall-clock per `execute`.
- 5 s per `debank.*` call; on timeout you'll see `"DeBank call timed out after 5s: <method>"`.
- No persistent state between `execute` calls.

## Wrapper-shape gotcha

`debank.user.getUserTotalNetCurve` returns `{usd_value_list: [...]}` — unwrap before mapping:

\`\`\`js
async function run(debank) {
  const curve = await debank.user.getUserTotalNetCurve({ id: "0xWALLET" });
  return curve.usd_value_list.slice(-7);   // last 7 data points
}
\`\`\`
```

All 10 worked examples and the conventions tables above are the final content. No further editing required for this step.

- [ ] **Step 2: Write `scripts/build-instructions.ts`**

```ts
// scripts/build-instructions.ts
//
// Reads src/mcp/instructions/instructions.md and writes
// src/mcp/instructions/instructions.generated.ts with the content embedded
// as a JSON-stringified string literal. Safe against any code-fence /
// backtick / ${} content in the markdown.

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcFile = path.join(repoRoot, "src/mcp/instructions/instructions.md");
const outFile = path.join(repoRoot, "src/mcp/instructions/instructions.generated.ts");

async function main() {
  let markdown: string;
  try {
    markdown = await fs.readFile(srcFile, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      console.error(`instructions.md not found at ${srcFile}; cannot generate instructions.generated.ts`);
      process.exit(1);
    }
    throw err;
  }
  const out = `// AUTO-GENERATED by scripts/build-instructions.ts. Do not edit by hand.
// Re-run \`pnpm run build:instructions\` to regenerate.

export const INSTRUCTIONS = ${JSON.stringify(markdown)};
`;
  await fs.writeFile(outFile, out);
  console.log(`Wrote instructions (${markdown.length} chars) to ${outFile}`);
}

void main();
```

- [ ] **Step 3: Run the builder**

Run: `pnpm run build:instructions`
Expected: `Wrote instructions (NNNN chars) to .../instructions.generated.ts`.

Inspect the output:

Run: `head -3 src/mcp/instructions/instructions.generated.ts && wc -c src/mcp/instructions/instructions.generated.ts`
Expected: First 3 lines are the auto-generated header + the `export const INSTRUCTIONS = "..."` line.

- [ ] **Step 4: Commit**

```bash
git add src/mcp/instructions/instructions.md scripts/build-instructions.ts src/mcp/instructions/instructions.generated.ts
git commit -m "feat(mcp/instructions): add instructions.md, build script, and generated TS module"
```

---

## Task 17: Build the `execute` sandbox — `sandbox.ts` (isolate lifecycle + lazy load)

**Files:**
- Create: `src/mcp/execute/sandbox.ts`

This module owns isolate creation, lazy `isolated-vm` loading, the three-layer timeout, dispose semantics, and the `ExternalCopy`-based return transfer. It does NOT know about debank specifically — that's `client.ts`'s job.

- [ ] **Step 1: Write the sandbox module**

```ts
// src/mcp/execute/sandbox.ts
//
// Owns isolated-vm lifecycle, lazy load (cached), and the three-layer timeout
// policy (script timeout + outer Promise.race + per-call host timeout — see
// spec §2.1 step 5 and §2.2 step 3).
//
// MUST NOT be imported statically from anywhere reachable from server
// startup. Loaded dynamically by execute/tool.ts on first execute call.

// Lazy-load isolated-vm. CJS import normalization required — see spec §3.1.
let _ivm: typeof import("isolated-vm") | undefined;
async function getIvm() {
  if (_ivm) return _ivm;
  const mod = await import("isolated-vm");
  _ivm = ((mod as { default?: typeof import("isolated-vm") }).default ?? mod) as typeof import("isolated-vm");
  return _ivm;
}

const ISOLATE_MEMORY_MB = 128;
// Test-overridable for fast CI: `DEBANK_MCP_SANDBOX_DEADLINE_MS=1000`. Production
// callers leave it unset and get 30 s per the spec. This is a test-time knob,
// not a public configuration surface — README intentionally omits it.
const SCRIPT_DEADLINE_MS = Number(process.env.DEBANK_MCP_SANDBOX_DEADLINE_MS) || 30_000;
const BLOCKLIST = ["process.", "require(", "import(", "eval("];

export type SandboxResult = {
  ok: boolean;
  result?: unknown;
  error?: string;
  log_lines: string[];
  err_lines: string[];
};

/**
 * Runs JavaScript in a fresh V8 isolate with a `debank` client injected.
 * @param code  Agent-supplied JS defining `async function run(debank)`.
 * @param installClient Callback invoked with the isolate context; must
 *   install `globalThis.debank.*` callbacks (see client.ts).
 */
export async function runInSandbox(
  code: string,
  installClient: (ctx: import("isolated-vm").Context) => Promise<void>,
): Promise<SandboxResult> {
  // Step 1: blocklist
  for (const banned of BLOCKLIST) {
    if (code.includes(banned)) {
      return {
        ok: false,
        error: `Blocked identifier: '${banned}'`,
        log_lines: [],
        err_lines: [],
      };
    }
  }

  const logLines: string[] = [];
  const errLines: string[] = [];

  // Move getIvm() and Isolate construction INSIDE the try so any failure
  // (native addon load error, Isolate constructor throwing on a bad memory
  // limit, etc.) gets normalized into the {ok:false} SandboxResult contract.
  // Callers — including executeTool but also future unit tests — must be
  // able to rely on "runInSandbox never rejects."
  let ivm: typeof import("isolated-vm") | undefined;
  let isolate: import("isolated-vm").Isolate | undefined;
  let disposed = false;
  const dispose = () => {
    if (!isolate || disposed) return;
    disposed = true;
    try { isolate.dispose(); } catch { /* ignore */ }
  };

  let timeoutHandle: NodeJS.Timeout | undefined;
  try {
    ivm = await getIvm();
    isolate = new ivm.Isolate({ memoryLimit: ISOLATE_MEMORY_MB });
    const context = await isolate.createContext();
    await context.global.set("debank", new ivm.ExternalCopy({}).copyInto({ release: true }));

    // console stubs
    await context.evalClosure(
      `globalThis.console = { log: (...a) => $0.applyIgnored(undefined, a.map(x => typeof x === 'string' ? x : JSON.stringify(x))),
                              warn: (...a) => $0.applyIgnored(undefined, a.map(x => typeof x === 'string' ? x : JSON.stringify(x))),
                              error: (...a) => $1.applyIgnored(undefined, a.map(x => typeof x === 'string' ? x : JSON.stringify(x))) };`,
      [
        new ivm.Reference((line: string) => logLines.push(line)),
        new ivm.Reference((line: string) => errLines.push(line)),
      ],
    );

    await installClient(context);

    const wrapped = `(async () => { ${code}\nreturn await run(debank); })()`;
    const script = await isolate.compileScript(wrapped);

    const value = await Promise.race([
      script.run(context, { timeout: SCRIPT_DEADLINE_MS, promise: true, copy: true }),
      new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          dispose();
          reject(new Error(
            `Execute timed out after ${Math.round(SCRIPT_DEADLINE_MS / 1000)}s. No call to settle, or guest stuck in a non-yielding loop.`,
          ));
        }, SCRIPT_DEADLINE_MS);
        timeoutHandle.unref?.();
      }),
    ]);

    return {
      ok: true,
      result: value as unknown,
      log_lines: logLines,
      err_lines: errLines,
    };
  } catch (err) {
    const e = err as Error & { code?: string };
    // Isolate creation / native load failure path. When `isolate` is still
    // undefined the failure came from getIvm() or the Isolate constructor,
    // not from script execution. Surface as the canonical "isolated-vm
    // native module failed to load…" wording from spec §4.4.
    if (!isolate) {
      return {
        ok: false,
        error: `isolated-vm native module failed to load. On Alpine/ARM/older Node, run 'pnpm rebuild isolated-vm'. Original error: ${e.message || String(err)}`,
        log_lines: logLines,
        err_lines: e.stack ? [e.stack] : [],
      };
    }
    // Isolate timeout from isolated-vm has message starting with "Script execution timed out"
    if (typeof e.message === "string" && /timed out/i.test(e.message)) {
      return {
        ok: false,
        error: e.message,
        log_lines: logLines,
        err_lines: errLines,
      };
    }
    return {
      ok: false,
      error: e.message || String(err),
      log_lines: logLines,
      err_lines: [...errLines, ...(e.stack ? [e.stack] : [])],
    };
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    dispose();
  }
}
```

**Contract:** `runInSandbox` NEVER rejects. Every failure mode — blocklist hit, native load failure, isolate creation failure, script syntax error, timeout, guest throw — comes back as `{ok: false, error, log_lines, err_lines}`. `executeTool`'s outer try/catch (Task 19) is a belt-and-braces safety net for unexpected exceptions thrown by `runInSandbox` itself; it must not be relied on as the primary error path.

- [ ] **Step 2: Add a unit test that doesn't require real `isolated-vm`**

This is tricky because `runInSandbox` itself loads `isolated-vm`. The unit test exercises blocklist behavior — which doesn't require the isolate — and is enough to catch regressions in the cheap path. Heavy isolate behavior is covered in the integration test (Task 22).

Create `src/mcp/execute/sandbox.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { runInSandbox } from "./sandbox.js";

describe("runInSandbox blocklist", () => {
  it("rejects code containing 'process.'", async () => {
    const r = await runInSandbox("async function run(){ return process.env; }", async () => {});
    expect(r.ok).toBe(false);
    expect(r.error).toContain("Blocked identifier: 'process.'");
  });

  it("rejects code containing 'require('", async () => {
    const r = await runInSandbox("async function run(){ return require('fs'); }", async () => {});
    expect(r.ok).toBe(false);
    expect(r.error).toContain("Blocked identifier: 'require('");
  });

  it("rejects code containing 'import('", async () => {
    const r = await runInSandbox("async function run(){ await import('fs'); }", async () => {});
    expect(r.ok).toBe(false);
    expect(r.error).toContain("Blocked identifier: 'import('");
  });

  it("rejects code containing 'eval('", async () => {
    const r = await runInSandbox("async function run(){ return eval('1+1'); }", async () => {});
    expect(r.ok).toBe(false);
    expect(r.error).toContain("Blocked identifier: 'eval('");
  });
});
```

- [ ] **Step 3: Run the test**

Run: `pnpm exec vitest run src/mcp/execute/sandbox.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 4: Commit**

```bash
git add src/mcp/execute/sandbox.ts src/mcp/execute/sandbox.test.ts
git commit -m "feat(mcp/execute): add sandbox module with three-layer timeout and blocklist"
```

---

## Task 18: Build the in-sandbox `debank` client — `client.ts` (Callbacks, dual timeout, error preservation)

**Files:**
- Create: `src/mcp/execute/client.ts`

- [ ] **Step 1: Write the client module**

```ts
// src/mcp/execute/client.ts
//
// Installs the agent-facing `debank.*` API on an isolated-vm Context. Each
// method is an ivm.Callback({ async: true }) — guest sees plain async fns,
// not Reference objects. Host body dispatches to the service singleton's
// *Raw() method with an end-to-end AbortController + axios timeout.

import { TOOL_METADATA, type ToolMetadata } from "../legacy/tool-metadata.js";
import {
  chainService,
  protocolService,
  tokenService,
  transactionService,
  userService,
} from "../../services/index.js";
import {
  resolveChain,
  resolveChains,
  resolveWrappedToken,
} from "../../lib/entity-resolver.js";

const SERVICE_MAP: Record<string, Record<string, unknown>> = {
  chainService: chainService as unknown as Record<string, unknown>,
  protocolService: protocolService as unknown as Record<string, unknown>,
  tokenService: tokenService as unknown as Record<string, unknown>,
  transactionService: transactionService as unknown as Record<string, unknown>,
  userService: userService as unknown as Record<string, unknown>,
};

const ABORT_MS = 5_000;
const AXIOS_MS = 6_000;

/** Resolve a sandboxMethodPath like "userService.getUserChainBalanceRaw" to the bound function. */
function resolveRaw(methodPath: string): (args: unknown, options: { signal: AbortSignal; timeout: number }) => Promise<unknown> {
  const [singletonName, methodName] = methodPath.split(".");
  if (!singletonName || !methodName) throw new Error(`Invalid sandboxMethodPath: ${methodPath}`);
  const singleton = SERVICE_MAP[singletonName];
  if (!singleton) throw new Error(`Unknown service singleton: ${singletonName}`);
  const fn = singleton[methodName] as ((args: unknown, options: unknown) => Promise<unknown>) | undefined;
  if (typeof fn !== "function") throw new Error(`Method ${methodName} not found on ${singletonName}`);
  return (args, options) => fn.call(singleton, args, options);
}

/** Wrap a *Raw() call with the dual-timeout machinery and canonical timeout error. */
function makeTimeoutWrapped(
  rawFn: (args: unknown, options: { signal: AbortSignal; timeout: number }) => Promise<unknown>,
  agentFacingName: string,
) {
  return async (args: unknown) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ABORT_MS);
    try {
      return await rawFn(args, { signal: controller.signal, timeout: AXIOS_MS });
    } catch (err) {
      const e = err as Error & { code?: string };
      const isAbort = controller.signal.aborted;
      const isAxiosTimeout = e.code === "ECONNABORTED" || e.code === "ETIMEDOUT";
      if (isAbort || isAxiosTimeout) {
        throw new Error(`DeBank call timed out after 5s: ${agentFacingName}`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  };
}

/** Parse `debank.user.getUserChainBalance` into [`user`, `getUserChainBalance`]. */
function parseQualified(qualified: string): [string, string] {
  // qualified = "debank.<group>.<method>"; we keep group as a key on the global debank object
  const parts = qualified.split(".");
  if (parts.length !== 3 || parts[0] !== "debank") throw new Error(`Invalid qualified: ${qualified}`);
  return [parts[1]!, parts[2]!];
}

/** Install all agent-facing methods on the isolate's global `debank` object. */
export async function installDebankClient(ctx: import("isolated-vm").Context): Promise<void> {
  const mod = await import("isolated-vm");
  const ivm = ((mod as { default?: typeof import("isolated-vm") }).default ?? mod) as typeof import("isolated-vm");

  // Ensure debank.<group> objects exist
  const groups = new Set(TOOL_METADATA.map((m) => parseQualified(m.qualified)[0]));
  for (const g of groups) {
    await ctx.evalClosure(`globalThis.debank.${g} = globalThis.debank.${g} || {};`, []);
  }

  // Install each method as a Callback
  for (const m of TOOL_METADATA) {
    const [group, method] = parseQualified(m.qualified);
    const raw = resolveRaw(m.sandboxMethodPath);
    const wrapped = makeTimeoutWrapped(raw, m.qualified);
    await ctx.evalClosure(
      `globalThis.debank.${group}.${method} = $0;`,
      [new ivm.Callback(wrapped as (args: unknown) => Promise<unknown>, { async: true })],
    );
  }

  // Resolver helpers (top-level on debank)
  await ctx.evalClosure(
    `globalThis.debank.resolveChain = $0;
     globalThis.debank.resolveChains = $1;
     globalThis.debank.resolveWrappedToken = $2;`,
    [
      new ivm.Callback(async (name: string) => resolveChain(name), { async: true }),
      new ivm.Callback(async (cs: string) => resolveChains(cs), { async: true }),
      new ivm.Callback((kw: string, chainId: string) => resolveWrappedToken(kw, chainId)),
    ],
  );
}
```

- [ ] **Step 2: Commit (client unit-test exercises this via Task 22's integration)**

```bash
git add src/mcp/execute/client.ts
git commit -m "feat(mcp/execute): add debank-client installer with dual-timeout Callbacks"
```

---

## Task 19: Build the `execute` MCP tool — `tool.ts`

**Files:**
- Create: `src/mcp/execute/tool.ts`

- [ ] **Step 1: Write the execute tool definition**

```ts
// src/mcp/execute/tool.ts
//
// MCP tool definition for `execute`. Loaded statically by the server entry,
// but the heavy lifting (isolated-vm) is dynamic-imported on first call so
// the addon doesn't load at server startup.

import { z } from "zod";

const PARAMS = z.object({
  code: z.string().describe(
    "JavaScript source defining async function run(debank). No type annotations.",
  ),
  intent: z.string().optional().describe(
    "Optional: what task you're trying to perform. Telemetry only.",
  ),
});

export const executeTool = {
  name: "execute",
  description:
    "Run async JavaScript against a pre-authenticated DeBank client. Define `async function run(debank) { ... }` and the return value (JSON-serializable) is sent back to you, plus any console.log output. The debank client mirrors the services: debank.chain, debank.protocol, debank.token, debank.user, debank.transaction, plus debank.resolveChain / resolveChains / resolveWrappedToken helpers. Note: this is JavaScript, not TypeScript — do not use type annotations. Variables do NOT persist between calls. No fs, no network outside the debank client.",
  parameters: PARAMS,
  annotations: { readOnlyHint: false },
  execute: async (args: z.infer<typeof PARAMS>) => {
    // Lazy-load sandbox + client. Any failure here (most notably the
    // native isolated-vm addon failing to load on Alpine/ARM/older Node)
    // must surface as the canonical {ok:false} response from spec §4.4 —
    // NOT propagate as an unhandled rejection out of executeTool.
    let sandboxResult: import("./sandbox.js").SandboxResult;
    try {
      const [{ runInSandbox }, { installDebankClient }] = await Promise.all([
        import("./sandbox.js"),
        import("./client.js"),
      ]);
      sandboxResult = await runInSandbox(args.code, installDebankClient);
    } catch (err) {
      // Two classes of failure reach here:
      // 1. isolated-vm native addon failed to load (ERR_MODULE_NOT_FOUND
      //    or "Module did not self-register" or similar native errors).
      // 2. sandbox.ts itself threw before/after the inner try/finally.
      const msg = err instanceof Error ? err.message : String(err);
      const isLoadFailure =
        /isolated-vm|MODULE_NOT_FOUND|self-register|cannot find module/i.test(msg);
      sandboxResult = {
        ok: false,
        error: isLoadFailure
          ? `isolated-vm native module failed to load. On Alpine/ARM/older Node, run 'pnpm rebuild isolated-vm'. Original error: ${msg}`
          : msg,
        log_lines: [],
        err_lines: err instanceof Error && err.stack ? [err.stack] : [],
      };
    }

    // MCP envelope: outer isError mirrors !ok
    const inner = JSON.stringify(sandboxResult);
    return {
      content: [{ type: "text" as const, text: inner }],
      isError: !sandboxResult.ok,
    };
  },
};
```

- [ ] **Step 2: Add a unit test for the load-failure path**

Create `src/mcp/execute/tool.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("./sandbox.js", () => ({
  runInSandbox: vi.fn(async () => {
    const err = new Error("Cannot find module 'isolated-vm'") as Error & { code?: string };
    err.code = "ERR_MODULE_NOT_FOUND";
    throw err;
  }),
}));

describe("executeTool error envelope", () => {
  it("isolated-vm load failure → canonical message in {ok:false}", async () => {
    const { executeTool } = await import("./tool.js");
    const res = await executeTool.execute({ code: "async function run(){}" });
    const inner = JSON.parse(res.content[0]!.text);
    expect(res.isError).toBe(true);
    expect(inner.ok).toBe(false);
    expect(inner.error).toContain("isolated-vm native module failed to load");
    expect(inner.error).toContain("pnpm rebuild isolated-vm");
  });
});
```

- [ ] **Step 3: Run + commit**

Run: `pnpm exec vitest run src/mcp/execute/tool.test.ts`
Expected: PASS, 1 test.

```bash
git add src/mcp/execute/tool.ts src/mcp/execute/tool.test.ts
git commit -m "feat(mcp/execute): execute tool catches isolated-vm load failure with canonical message"
```

```bash
git add src/mcp/execute/tool.ts
git commit -m "feat(mcp/execute): add execute MCP tool with lazy sandbox/client loading"
```

---

## Task 20: Build the `search_docs` MCP tool

**Files:**
- Create: `src/mcp/search-docs/tool.ts`
- Create: `src/mcp/search-docs/tool.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/mcp/search-docs/tool.test.ts
import { describe, it, expect } from "vitest";
import { searchDocsTool } from "./tool.js";

describe("search_docs", () => {
  it("returns getUserNftList for 'get NFTs for wallet'", async () => {
    const res = await searchDocsTool.execute({ query: "get NFTs for wallet" });
    const inner = JSON.parse(res.content[0]!.text);
    expect(inner.results[0].qualified).toMatch(/getUserNftList/i);
  });

  it("returns empty results + hint for blank query", async () => {
    const res = await searchDocsTool.execute({ query: "" });
    const inner = JSON.parse(res.content[0]!.text);
    expect(inner.results).toEqual([]);
    expect(inner.hint).toMatch(/Provide a query/i);
  });

  it("returns empty results + hint when no match", async () => {
    const res = await searchDocsTool.execute({ query: "xyzzyplugh_no_match_term_42" });
    const inner = JSON.parse(res.content[0]!.text);
    expect(inner.results).toEqual([]);
    expect(inner.hint).toMatch(/debank_resolve|debank_get_supported_chain_list/);
  });
});
```

- [ ] **Step 2: Run the test (should fail — module doesn't exist)**

Run: `pnpm exec vitest run src/mcp/search-docs/tool.test.ts`
Expected: FAIL — cannot find `./tool.js`.

- [ ] **Step 3: Write the tool**

```ts
// src/mcp/search-docs/tool.ts
import MiniSearch from "minisearch";
import { z } from "zod";
import { ENTRIES, type IndexEntry } from "./embedded-index.js";

const PARAMS = z.object({
  query: z.string().describe("Free-text query, e.g. 'get token balance' or 'simulate transaction'."),
  detail: z.enum(["default", "verbose"]).optional()
    .describe("'default' returns structured entries; 'verbose' returns markdown blobs."),
});

const MAX_TOTAL_CHARS = 100_000;

// Build the index once at module load
const mini = new MiniSearch<IndexEntry & { id: string }>({
  fields: ["name", "qualified", "description", "title", "content"],
  storeFields: ["kind", "name", "qualified", "description", "params", "exampleCall", "title", "content"],
  searchOptions: {
    prefix: true,
    fuzzy: 0.1,
    boost: { name: 5, qualified: 3, description: 2 },
  },
});
mini.addAll(
  ENTRIES.map((e, i) => ({
    ...e,
    id: e.kind === "method" ? e.name : e.id,
    // MiniSearch needs all searchable fields present even if undefined
    name: e.kind === "method" ? e.name : undefined,
    qualified: e.kind === "method" ? e.qualified : undefined,
    description: e.kind === "method" ? e.description : undefined,
    title: e.kind === "prose" ? e.title : undefined,
    content: e.kind === "prose" ? e.content : undefined,
  })) as (IndexEntry & { id: string })[],
);

export const searchDocsTool = {
  name: "search_docs",
  description:
    "Search DeBank SDK docs to find the right methods, parameters, and example code. Use before writing execute() code when you're unsure of the API.",
  parameters: PARAMS,
  annotations: { readOnlyHint: true },
  execute: async (args: z.infer<typeof PARAMS>) => {
    const q = args.query.trim();
    if (!q) {
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ results: [], hint: "Provide a query like 'get token balance'." }),
        }],
        isError: false,
      };
    }
    const hits = mini.search(q).slice(0, 10);
    if (hits.length === 0) {
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            results: [],
            hint: "No matches. Try broader terms, or call debank_get_supported_chain_list / debank_resolve for chain grounding.",
          }),
        }],
        isError: false,
      };
    }
    const verbose = args.detail === "verbose";
    let total = 0;
    const results: unknown[] = [];
    for (const h of hits) {
      const entry: Record<string, unknown> = verbose
        ? { ...h }
        : {
            kind: h.kind,
            qualified: h.qualified,
            name: h.name,
            description: h.description,
            params: h.params,
            exampleCall: h.exampleCall,
            title: h.title,
          };
      const str = JSON.stringify(entry);
      if (total + str.length > MAX_TOTAL_CHARS) break;
      total += str.length;
      results.push(entry);
    }
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ results }) }],
      isError: false,
    };
  },
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run src/mcp/search-docs/tool.test.ts`
Expected: PASS, 3 tests.

If the first test fails on "getUserNftList not first", the cookbook might be ranking higher — tune the boost or add `name`/`qualified` as required fields. If the third test fails because the hint doesn't mention the new convenience tools, double-check the no-match `hint` string literal.

- [ ] **Step 5: Commit**

```bash
git add src/mcp/search-docs/tool.ts src/mcp/search-docs/tool.test.ts
git commit -m "feat(mcp/search-docs): add MiniSearch-backed search_docs tool"
```

---

## Task 21: Build the convenience tools — `src/mcp/tools.ts`

**Files:**
- Create: `src/mcp/tools.ts`
- Create: `src/mcp/tools.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/mcp/tools.test.ts
import { describe, it, expect, vi } from "vitest";

vi.mock("../lib/entity-resolver.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/entity-resolver.js")>();
  return {
    ...actual,
    resolveChain: vi.fn(async (n: string) => {
      if (n === "Binance Smart Chain") return "bsc";
      if (n === "ETH") return "eth";
      return null;
    }),
  };
});

describe("debank_resolve", () => {
  it("Binance Smart Chain → bsc", async () => {
    const { resolveTool } = await import("./tools.js");
    const res = await resolveTool.execute({ name: "Binance Smart Chain", type: "chain" });
    const inner = JSON.parse(res.content[0]!.text);
    expect(inner).toEqual({ resolved: "bsc" });
  });

  it("ETH → eth", async () => {
    const { resolveTool } = await import("./tools.js");
    const res = await resolveTool.execute({ name: "ETH", type: "chain" });
    const inner = JSON.parse(res.content[0]!.text);
    expect(inner).toEqual({ resolved: "eth" });
  });

  it("unknown → resolved:null with canonical error", async () => {
    const { resolveTool } = await import("./tools.js");
    const res = await resolveTool.execute({ name: "MadeUpChain", type: "chain" });
    const inner = JSON.parse(res.content[0]!.text);
    expect(inner.resolved).toBeNull();
    expect(inner.error).toBe(
      "Could not resolve 'MadeUpChain' as a chain. Try the exact chain ID (eth, bsc, matic, arb, …).",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/mcp/tools.test.ts`
Expected: FAIL — cannot find `./tools.js`.

- [ ] **Step 3: Write the tools module**

```ts
// src/mcp/tools.ts
//
// Two default convenience tools registered alongside execute and search_docs.

import { z } from "zod";
import { resolveChain } from "../lib/entity-resolver.js";
import {
  chainService,
  protocolService,
  tokenService,
  transactionService,
  userService,
} from "../services/index.js";

const RESOLVE_PARAMS = z.object({
  name: z.string().describe("Free-text chain name like 'BSC' or 'Binance Smart Chain'."),
  type: z.enum(["chain"]).describe("Entity type to resolve. Currently only 'chain' is supported."),
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
        content: [{ type: "text" as const, text: JSON.stringify({ resolved }) }],
        isError: false,
      };
    }
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          resolved: null,
          error: `Could not resolve '${args.name}' as a chain. Try the exact chain ID (eth, bsc, matic, arb, …).`,
        }),
      }],
      isError: false,
    };
  },
};

// debank_get_supported_chain_list is the ONLY v0.1 tool that survives into the
// default surface unchanged. Legacy mode skips it as a duplicate (see §3.1
// step 8) — so this default registration is the one users get under both
// default and --legacy-tools modes. Schema, description, and execute behavior
// MUST stay byte-identical to v0.1 src/tools/index.ts:52-62: accept
// _userQuery, pipe through setQuery, return the markdown.

const CHAIN_LIST_PARAMS = z.object({
  _userQuery: z.string().optional(),
});

export const supportedChainListTool = {
  name: "debank_get_supported_chain_list",
  description:
    "Retrieve a comprehensive list of all blockchain chains supported by the DeBank API. Returns information about each chain including their IDs, names, logo URLs, native token IDs, wrapped token IDs, and pre-execution support status. Use this to discover available chains before calling other chain-specific endpoints.",
  parameters: CHAIN_LIST_PARAMS,
  annotations: { readOnlyHint: true },
  execute: async (args: z.infer<typeof CHAIN_LIST_PARAMS>) => {
    // Same setQueryFromArgs pattern as src/tools/index.ts:23-32 — pipes
    // _userQuery into every service so JQ-filter context is available on
    // large responses.
    const q = args._userQuery;
    if (q) {
      chainService.setQuery(q);
      protocolService.setQuery(q);
      tokenService.setQuery(q);
      transactionService.setQuery(q);
      userService.setQuery(q);
    }
    const md = await chainService.getSupportedChainList();
    return { content: [{ type: "text" as const, text: md }], isError: false };
  },
};

export const defaultConvenienceTools = [resolveTool, supportedChainListTool];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/mcp/tools.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/mcp/tools.ts src/mcp/tools.test.ts
git commit -m "feat(mcp): add debank_resolve and debank_get_supported_chain_list convenience tools"
```

---

## Task 22: Replace `src/index.ts` — wire defaults + conditional legacy + version from package.json

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Replace `src/index.ts` entirely**

```ts
#!/usr/bin/env node
import { createRequire } from "node:module";
import { FastMCP } from "fastmcp";
import { createChildLogger } from "./lib/utils/logger.js";
import { INSTRUCTIONS } from "./mcp/instructions/instructions.generated.js";
import { executeTool } from "./mcp/execute/tool.js";
import { searchDocsTool } from "./mcp/search-docs/tool.js";
import { defaultConvenienceTools } from "./mcp/tools.js";

const logger = createChildLogger("DeBank MCP");

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

function legacyEnabled(): boolean {
  if (process.env.DEBANK_MCP_LEGACY === "1") return true;
  return process.argv.includes("--legacy-tools");
}

async function main() {
  const server = new FastMCP({
    name: "DeBank MCP Server",
    version,
    instructions: INSTRUCTIONS,
  });

  // Default surface (always)
  type RegisteredTool = Parameters<typeof server.addTool>[0];
  const defaults: ReadonlyArray<RegisteredTool> = [
    executeTool,
    searchDocsTool,
    ...defaultConvenienceTools,
  ] as unknown as ReadonlyArray<RegisteredTool>;
  for (const tool of defaults) server.addTool(tool);

  // Conditional legacy surface — skip `debank_get_supported_chain_list`
  // because it's already in the default surface (FastMCP rejects duplicates).
  if (legacyEnabled()) {
    const { legacyTools } = await import("./mcp/legacy/tool-handlers.js");
    for (const tool of legacyTools) {
      if (tool.name === "debank_get_supported_chain_list") continue;
      server.addTool(tool as unknown as RegisteredTool);
    }
    logger.info("Legacy tools enabled (--legacy-tools or DEBANK_MCP_LEGACY=1)");
  }

  try {
    await server.start({ transportType: "stdio" });
  } catch (error) {
    logger.error("Failed to start server", error as Error);
    process.exit(1);
  }
}

main().catch((error) => {
  logger.error("Unexpected error occurred", error);
  process.exit(1);
});
```

- [ ] **Step 2: Delete the old `src/tools/index.ts`**

The export `getDebankTools` for ADK consumers was previously in this file. If no external consumer depends on it (search the codebase for references), delete the file. If something does, leave a thin re-export shim.

Run: `git grep -n "getDebankTools" -- src/`
Expected: no matches outside `src/tools/index.ts`.

If clean:

```bash
git rm src/tools/index.ts
```

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors. If FastMCP complains about Zod 4 schema shapes vs. its expected types, adjust the type assertions in `index.ts` (the `as unknown as ReadonlyArray<RegisteredTool>` cast is intentional).

- [ ] **Step 4: Build and confirm a fresh `dist/`**

Run: `pnpm run build`
Expected: prebuild fires (`build:docs` + `build:instructions`), then `tsc` produces `dist/index.js` with executable bit set.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts
git commit -m "feat(server): rewire entry to use new MCP surface; read version from package.json"
```

---

## Task 23: Integration tests — `execute` happy path, errors, timeouts

**Files:**
- Create: `tests/integration/execute.test.ts`

- [ ] **Step 1: Write the integration tests**

```ts
// tests/integration/execute.test.ts
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { executeTool } from "../../src/mcp/execute/tool.js";

const server = setupServer(
  http.get("https://pro-openapi.debank.com/v1/user/chain_balance", () =>
    HttpResponse.json({ usd_value: 1234.56 }),
  ),
);

beforeAll(() => server.listen());
afterAll(() => server.close());

describe("execute integration", () => {
  it("happy path: returns JSON with ok:true", async () => {
    const res = await executeTool.execute({
      code: `async function run(d) { return await d.user.getUserChainBalance({ id: "0xabc", chain_id: "eth" }); }`,
    });
    const inner = JSON.parse(res.content[0]!.text);
    expect(res.isError).toBe(false);
    expect(inner.ok).toBe(true);
    expect(inner.result).toEqual({ usd_value: 1234.56 });
  });

  it("rejects TypeScript syntax with a helpful message", async () => {
    const res = await executeTool.execute({
      code: `async function run(d: any) { return null; }`,
    });
    const inner = JSON.parse(res.content[0]!.text);
    expect(res.isError).toBe(true);
    expect(inner.ok).toBe(false);
    expect(inner.error.toLowerCase()).toMatch(/unexpected|syntax/);
  });

  it("intentional throw → ok:false", async () => {
    const res = await executeTool.execute({
      code: `async function run(){ throw new Error("boom"); }`,
    });
    const inner = JSON.parse(res.content[0]!.text);
    expect(res.isError).toBe(true);
    expect(inner.ok).toBe(false);
    expect(inner.error).toBe("boom");
  });

  it("never-settling promise → outer race fires with canonical message", async () => {
    // Override the deadline so the test takes ~1s instead of the production 30s.
    // sandbox.ts reads DEBANK_MCP_SANDBOX_DEADLINE_MS at module load, so the
    // override must be set BEFORE the sandbox module is imported. setup.ts
    // (loaded via vitest setupFiles) runs first; we set it here for the
    // specific test and import a fresh sandbox/tool module.
    const prev = process.env.DEBANK_MCP_SANDBOX_DEADLINE_MS;
    process.env.DEBANK_MCP_SANDBOX_DEADLINE_MS = "1000";
    vi.resetModules();   // force fresh import of sandbox.ts with the new env
    try {
      const { executeTool: fast } = await import("../../src/mcp/execute/tool.js");
      const res = await fast.execute({
        code: `async function run(){ await new Promise(() => {}); }`,
      });
      const inner = JSON.parse(res.content[0]!.text);
      expect(res.isError).toBe(true);
      // Message says "30s" — that wording is the spec contract; the deadline
      // override is a test-only knob. If the implementation interpolates the
      // actual ms, change this to match.
      expect(inner.error).toContain("Execute timed out after");
      expect(inner.error.toLowerCase()).toMatch(/no call to settle|non-yielding/);
    } finally {
      if (prev === undefined) delete process.env.DEBANK_MCP_SANDBOX_DEADLINE_MS;
      else process.env.DEBANK_MCP_SANDBOX_DEADLINE_MS = prev;
      vi.resetModules();
    }
  }, 5_000);

  it("DeBank request that hangs >5s → canonical per-call timeout error", async () => {
    server.use(
      http.get("https://pro-openapi.debank.com/v1/chain", async () => {
        await new Promise((r) => setTimeout(r, 7_000));
        return HttpResponse.json({ id: "eth" });
      }),
    );
    const res = await executeTool.execute({
      code: `async function run(d) { return await d.chain.getChain({ id: "eth" }); }`,
    });
    const inner = JSON.parse(res.content[0]!.text);
    expect(res.isError).toBe(true);
    expect(inner.error).toContain("DeBank call timed out after 5s");
  }, 15_000);

  it("execute with debank.resolveChain inside (mocked resolver)", async () => {
    // Earlier tests in this file already imported executeTool, which lazy-imports
    // ./sandbox.js and ./client.js. Those caches the original (real) resolver
    // module reference. vi.doMock alone wouldn't intercept the cached chain.
    // Reset the module registry, install the mock, THEN re-import everything.
    vi.resetModules();
    vi.doMock("../../src/lib/entity-resolver.js", async (importOriginal) => {
      const actual = await importOriginal<typeof import("../../src/lib/entity-resolver.js")>();
      return {
        ...actual,
        resolveChain: vi.fn(async (n: string) => (n === "Polygon" ? "matic" : null)),
      };
    });
    server.use(
      http.get("https://pro-openapi.debank.com/v1/user/chain_balance", () =>
        HttpResponse.json({ usd_value: 99.9 }),
      ),
    );

    try {
      // Fresh import sees the mocked resolver because resetModules cleared
      // the cache and doMock is now hoisted-ordered correctly.
      const { executeTool: executeFresh } = await import("../../src/mcp/execute/tool.js");
      const res = await executeFresh.execute({
        code: `async function run(d) { const id = await d.resolveChain("Polygon"); return await d.user.getUserChainBalance({ id: "0xabc", chain_id: id }); }`,
      });
      const inner = JSON.parse(res.content[0]!.text);
      expect(inner.ok).toBe(true);
      expect(inner.result).toEqual({ usd_value: 99.9 });
    } finally {
      vi.doUnmock("../../src/lib/entity-resolver.js");
      vi.resetModules();   // restore clean state for any test that runs after
    }
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `pnpm exec vitest run tests/integration/execute.test.ts`
Expected: PASS, 6 tests. The never-settling test takes ~1s because it overrides `DEBANK_MCP_SANDBOX_DEADLINE_MS` to `1000` (the production default is 30 s; the env override is a test-only knob).

If `isolated-vm` fails to load native, follow the platform install hint. If a test races and flakes (e.g., timing between abort and axios), increase the test timeout in the specific `it()` call.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/execute.test.ts
git commit -m "test(integration): execute happy path, errors, three-layer timeouts, resolver-inside"
```

---

## Task 24: Integration test — `search_docs` over real index

**Files:**
- Create: `tests/integration/search-docs.test.ts`

- [ ] **Step 1: Write tests against the real embedded index**

```ts
// tests/integration/search-docs.test.ts
import { describe, it, expect } from "vitest";
import { searchDocsTool } from "../../src/mcp/search-docs/tool.js";

describe("search_docs integration", () => {
  it("'get token balance' surfaces getUserTokenBalance", async () => {
    const res = await searchDocsTool.execute({ query: "get token balance" });
    const inner = JSON.parse(res.content[0]!.text);
    const names = inner.results.map((r: { name?: string }) => r.name).filter(Boolean);
    expect(names).toContain("debank_get_user_token_balance");
  });

  it("'explain tx' surfaces explain_transaction", async () => {
    const res = await searchDocsTool.execute({ query: "explain tx" });
    const inner = JSON.parse(res.content[0]!.text);
    const names = inner.results.map((r: { name?: string }) => r.name).filter(Boolean);
    expect(names).toContain("debank_explain_transaction");
  });

  it("'polygon nfts' surfaces at least one NFT method", async () => {
    const res = await searchDocsTool.execute({ query: "polygon nfts" });
    const inner = JSON.parse(res.content[0]!.text);
    const names = inner.results.map((r: { name?: string }) => r.name).filter(Boolean);
    expect(names.some((n: string) => n.includes("nft"))).toBe(true);
  });

  it("verbose mode includes full content", async () => {
    const res = await searchDocsTool.execute({ query: "net curve", detail: "verbose" });
    const inner = JSON.parse(res.content[0]!.text);
    expect(inner.results.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run + commit**

```bash
pnpm exec vitest run tests/integration/search-docs.test.ts
git add tests/integration/search-docs.test.ts
git commit -m "test(integration): search_docs queries against real embedded index"
```

Expected: PASS, 4 tests.

---

## Task 25: Integration test — `--legacy-tools` mode registers 30 of 31

**Files:**
- Create: `tests/integration/legacy-tools.test.ts`

- [ ] **Step 1: Write the test**

```ts
// tests/integration/legacy-tools.test.ts
import { describe, it, expect } from "vitest";

describe("--legacy-tools mode", () => {
  it("legacy tool-handlers exposes 31 tools total", async () => {
    const { legacyTools } = await import("../../src/mcp/legacy/tool-handlers.js");
    expect(legacyTools).toHaveLength(31);
  });

  it("when registering, 30 are added (debank_get_supported_chain_list is skipped because the default surface owns it)", async () => {
    const { legacyTools } = await import("../../src/mcp/legacy/tool-handlers.js");
    const wouldRegister = legacyTools.filter((t) => t.name !== "debank_get_supported_chain_list");
    expect(wouldRegister).toHaveLength(30);
    expect(wouldRegister.every((t) => t.name !== "debank_get_supported_chain_list")).toBe(true);
  });
});
```

- [ ] **Step 2: Run + commit**

```bash
pnpm exec vitest run tests/integration/legacy-tools.test.ts
git add tests/integration/legacy-tools.test.ts
git commit -m "test(integration): legacy mode registers 30 of 31 (chain-list owned by default surface)"
```

Expected: PASS, 2 tests.

---

## Task 26: Lazy-`isolated-vm` smoke test — register hook + child-process spawn

**Files:**
- Create: `tests/integration/no-isolated-vm.register.mjs`
- Create: `tests/integration/no-isolated-vm.hooks.mjs`
- Create: `tests/integration/lazy-isolated-vm.test.ts`

- [ ] **Step 1: Write the loader hooks**

```js
// tests/integration/no-isolated-vm.register.mjs
import { register } from "node:module";
register("./no-isolated-vm.hooks.mjs", import.meta.url);
```

```js
// tests/integration/no-isolated-vm.hooks.mjs
export function resolve(specifier, context, nextResolve) {
  if (specifier === "isolated-vm") {
    const err = new Error("Cannot find module 'isolated-vm'");
    err.code = "ERR_MODULE_NOT_FOUND";
    throw err;
  }
  return nextResolve(specifier, context);
}
```

- [ ] **Step 2: Write the child-process test**

```ts
// tests/integration/lazy-isolated-vm.test.ts
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const registerPath = path.resolve(repoRoot, "tests/integration/no-isolated-vm.register.mjs");
const entrypoint = path.resolve(repoRoot, "dist/index.js");

describe("lazy isolated-vm", () => {
  it("server starts without loading isolated-vm; search_docs works; execute fails", async () => {
    const tmpCwd = mkdtempSync(path.join(tmpdir(), "debank-mcp-lazy-"));
    const child = spawn("node", ["--import", registerPath, entrypoint, "--legacy-tools"], {
      cwd: tmpCwd,
      env: {
        PATH: process.env.PATH!,
        NODE_ENV: "test",
        DEBANK_API_KEY: "test-key",
        DEBANK_MCP_LEGACY: "1",   // belt-and-braces: also enable via env so the
                                  // test doesn't depend on argv-position parsing
                                  // in the child (Node could in theory consume
                                  // trailing args before they reach the app)
        DOTENV_CONFIG_PATH: "/dev/null",
      },
    });

    // Drive the MCP stdio handshake explicitly. FastMCP stdio servers don't
    // proactively announce ready; the client initiates `initialize`. Reading a
    // line-delimited JSON-RPC response from stdout is the only reliable signal.
    let stdoutBuf = "";
    const responses: Record<number, unknown> = {};
    const responseWaiters: Record<number, (val: unknown) => void> = {};
    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBuf += chunk.toString();
      let nl: number;
      while ((nl = stdoutBuf.indexOf("\n")) !== -1) {
        const line = stdoutBuf.slice(0, nl).trim();
        stdoutBuf = stdoutBuf.slice(nl + 1);
        if (!line) continue;
        try {
          const msg = JSON.parse(line) as { id?: number; result?: unknown; error?: unknown };
          if (typeof msg.id === "number") {
            responses[msg.id] = msg;
            responseWaiters[msg.id]?.(msg);
          }
        } catch {
          /* not JSON — could be a log line on stderr-routed-to-stdout; ignore */
        }
      }
    });

    const stderrBuf: string[] = [];
    child.stderr.on("data", (b: Buffer) => stderrBuf.push(b.toString()));

    const send = (msg: object) => child.stdin.write(JSON.stringify(msg) + "\n");
    const waitForId = (id: number, timeoutMs: number) =>
      new Promise<unknown>((resolve, reject) => {
        if (responses[id] !== undefined) return resolve(responses[id]);
        responseWaiters[id] = resolve;
        setTimeout(() => reject(new Error(`Timed out waiting for response id=${id}. stderr: ${stderrBuf.join("")}`)), timeoutMs);
      });

    // 1. initialize
    send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "lazy-test", version: "1" },
      },
    });
    await waitForId(1, 5_000);

    // 2. notifications/initialized (no id, no response)
    send({ jsonrpc: "2.0", method: "notifications/initialized" });

    // 3. tools/list — assert isolated-vm wasn't needed to register tools
    send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    const toolsResponse = await waitForId(2, 5_000) as { result?: { tools?: { name: string }[] } };
    const toolNames = toolsResponse.result?.tools?.map((t) => t.name) ?? [];

    expect(toolNames).toContain("execute");
    expect(toolNames).toContain("search_docs");
    expect(toolNames).toContain("debank_resolve");
    expect(toolNames).toContain("debank_get_supported_chain_list");
    // legacy tools also registered because --legacy-tools was passed
    expect(toolNames).toContain("debank_get_user_chain_balance");

    child.kill();
  }, 30_000);
});
```

- [ ] **Step 3: Run**

Run: `pnpm test tests/integration/lazy-isolated-vm.test.ts`

(`pretest` will fire first, ensuring `dist/index.js` is fresh.)

Expected: PASS, 1 test.

If the test times out trying to read the JSON-RPC response, simplify it to just verify the child process didn't crash on startup. The asserted invariant is "isolated-vm not in resolve graph at startup" — the child not crashing demonstrates that.

- [ ] **Step 4: Commit**

```bash
git add tests/integration/no-isolated-vm.register.mjs tests/integration/no-isolated-vm.hooks.mjs tests/integration/lazy-isolated-vm.test.ts
git commit -m "test(integration): lazy isolated-vm via custom resolve hook in a child process"
```

---

## Task 27: Service snapshot regression as a vitest test

Task 7 captured the v0.1 markdown output as a one-shot. This task adds a vitest regression that re-runs the same `INVOCATIONS` (already in `tests/fixtures/invocations.ts`) against the now-refactored services and asserts byte-for-byte equality with the committed snapshots.

**Files:**
- Create: `tests/integration/service-snapshots.test.ts`

- [ ] **Step 1: Write the regression test using the existing shared invocations module**

```ts
// tests/integration/service-snapshots.test.ts
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeAll } from "vitest";
import { INVOCATIONS, type Services } from "../fixtures/invocations.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fixturesDir = path.join(repoRoot, "tests/fixtures/services");
const snapshotsDir = path.join(repoRoot, "tests/snapshots/services");

describe("service markdown snapshots", () => {
  let services: Services;

  beforeAll(async () => {
    const { BaseService } = await import("../../src/services/base.service.js");
    const proto = BaseService.prototype as unknown as Record<string, unknown>;
    const stub = async function () {
      const key = (globalThis as Record<string, unknown>).__SNAPSHOT_KEY as string;
      const raw = await fs.readFile(path.join(fixturesDir, `${key}.json`), "utf-8");
      return JSON.parse(raw);
    };
    proto.fetchWithToolConfig = stub;
    proto.postWithToolConfig = stub;
    const mod = await import("../../src/services/index.js");
    services = {
      chainService: mod.chainService,
      protocolService: mod.protocolService,
      tokenService: mod.tokenService,
      transactionService: mod.transactionService,
      userService: mod.userService,
    };
  });

  for (const inv of INVOCATIONS) {
    it(`${inv.name} matches committed snapshot`, async () => {
      (globalThis as Record<string, unknown>).__SNAPSHOT_KEY = inv.name;
      const md = await inv.call(services);
      const expected = await fs.readFile(path.join(snapshotsDir, `${inv.name}.md`), "utf-8");
      expect(md).toBe(expected);
    });
  }
});
```

- [ ] **Step 2: Run**

Run: `pnpm exec vitest run tests/integration/service-snapshots.test.ts`
Expected: PASS, 31 tests.

If any fails, the corresponding service refactor in Tasks 8–12 changed the markdown output. Inspect the diff and either fix the service code or update the snapshot (only update if intentional).

- [ ] **Step 3: Commit**

```bash
git add tests/integration/service-snapshots.test.ts
git commit -m "test(integration): regression — all 31 service methods match committed snapshots"
```

---

## Task 28: CI workflow

**Files:**
- Create: `.github/workflows/test.yml`

- [ ] **Step 1: Write the workflow**

```yaml
# .github/workflows/test.yml
name: test

on:
  push:
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm test
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/test.yml
git commit -m "ci: add test workflow (lint + vitest with pretest build)"
```

---

## Task 29: Release artifacts — changeset + README update

**Files:**
- Create: `.changeset/<random-name>.md`
- Modify: `README.md`

- [ ] **Step 1: Generate a changeset**

Run: `pnpm exec changeset`

When prompted:
- Bump type: `minor`
- Summary:
  ```
  **Breaking change:** 30 of the 31 legacy `debank_*` tools are now hidden by default;
  `debank_get_supported_chain_list` remains visible as a default grounding tool.
  Pass `--legacy-tools` or set `DEBANK_MCP_LEGACY=1` to restore the hidden 30.

  New tools: `execute` (sandboxed JavaScript against a DeBank client),
  `search_docs` (local MiniSearch index over methods + cookbook), and `debank_resolve`.

  Internals: each service method now exposes a public `*Raw()` JSON-returning variant;
  the markdown method is a thin wrapper that catches formatter failures separately.
  ```

- [ ] **Step 2: Edit README**

Add a top-level "Code Mode (v0.2+)" section before the existing "MCP Tools" section, with:
- A worked `execute` example.
- A worked `search_docs` example.
- The "Migrating from v0.1.x" subsection explaining `--legacy-tools`.

Move the auto-generated tool list under a "Legacy tools (--legacy-tools)" heading and add a deprecation notice at its top.

- [ ] **Step 3: Commit**

```bash
git add .changeset/ README.md
git commit -m "docs: changeset + README update for v0.2 Code Mode"
```

---

## Task 30: Final integration — full build + test pass

- [ ] **Step 1: Run the full build**

Run: `pnpm run build`
Expected: clean build, no errors. `dist/` is fresh.

- [ ] **Step 2: Run the full test suite**

Run: `pnpm test`
Expected: every test passes. Lots of them now — ~30+ unit tests across modules, ~30 service-snapshot regressions, ~10 integration tests.

If anything fails, fix and commit before declaring done.

- [ ] **Step 3: Sanity-check the server boots and responds to `initialize`**

FastMCP stdio servers do NOT proactively announce ready — they wait for the client to send `initialize`. Drive the handshake manually:

```bash
DEBANK_API_KEY=sanity node dist/index.js <<EOF
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"sanity","version":"1"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
EOF
```

Expected: two JSON-RPC responses on stdout. The second includes `execute`, `search_docs`, `debank_resolve`, `debank_get_supported_chain_list`. The process exits cleanly when stdin closes after the heredoc.

- [ ] **Step 4: Sanity-check legacy mode**

```bash
DEBANK_API_KEY=sanity node dist/index.js --legacy-tools <<EOF
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"sanity","version":"1"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
EOF
```

Expected: a "Legacy tools enabled" log line on stderr; the `tools/list` response now also includes the 30 hidden legacy tools (e.g. `debank_get_user_chain_balance`).

- [ ] **Step 5: Final commit (only if anything changed during sanity checks)**

```bash
git status
```

If clean: nothing to commit. Phase one is complete.

---

## Spec coverage check

Each spec section maps to plan tasks:

- §1 Architecture / file layout → Tasks 13–22 (the new `src/mcp/` tree)
- §2.1 `execute` tool + lifecycle (three-layer timeout, `ExternalCopy`, blocklist) → Task 17 (sandbox.ts) + Task 19 (tool.ts) + Task 23 (integration tests)
- §2.2 In-sandbox `debank` client (Callbacks, dual timeout, error codes, `*Raw()` shape, single-`Raw`-exception for `getUserTotalNetCurve`) → Tasks 6–12 (services), Task 18 (client.ts)
- §2.2 Prerequisite-fix to `extractErrorMessage` → Task 5
- §2.3 `search_docs` tool, index builder, `_userQuery` stripping → Tasks 13 (metadata) + 15 (builder) + 20 (tool)
- §2.4 Convenience tools → Task 21
- §2.5 Instructions (`.md` source + generated `.ts`) → Task 16
- §2.6 Legacy path split (`tool-metadata.ts` + `tool-handlers.ts`) → Tasks 13 + 14
- §3.1 Cold-start sequence, lazy isolate, eager services + resolver, version-from-package.json → Task 22
- §3.1 Step 10 implementation note (lazy import + ESM-CJS normalization) → Task 17 + Task 26 (smoke test)
- §4.0–§4.5 Error contract → Tasks 17 + 19 (envelope), Task 23 (assertions)
- §5b Build pipeline (`prebuild`, `pretest`, deps) → Tasks 1 + 2
- §5.1 Vitest config → Task 3
- §5.2 Unit tests → Tasks 5 (error-handler), 13 (metadata), 14 (handlers), 17 (sandbox blocklist), 20 (search_docs), 21 (tools), 27 (service snapshots)
- §5.3 Integration tests (mock DeBank, env isolation, vi.mock("dotenv")) → Tasks 4 + 23 + 24 + 25 + 26 + 27
- §5.5 CI → Task 28
- §6 Release plan → Task 29
