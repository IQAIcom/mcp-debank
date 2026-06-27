# Deterministic Token Balance Across Chains — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move multichain token-balance computation off LLM-authored guest code into a deterministic `@iqai/mcp-debank` method (`debank.user.getTokenBalanceAcrossChains`), exposed via `TOOL_METADATA` — no new MCP tool — then wire aiden to call it and drop the brittle instruction workarounds.

**Architecture:** A pure name/symbol matcher + a host-side aggregate method that builds on the existing `getUserTokensAcrossChains` fan-out, reads the human `amount` field (no decimals math), and returns a single structured shape (per-chain matches + total + caveat + partial-failure signal). Registered in `TOOL_METADATA` (which auto-regenerates `search_docs`' embedded index via `build:docs`). aiden's DeBank agent then calls the method instead of writing arithmetic.

**Tech Stack:** TypeScript, vitest, zod, isolated-vm sandbox (`execute` tool), changesets. Spec: `docs/superpowers/specs/2026-06-27-deterministic-token-balance-across-chains-design.md`.

**Repos / branches:**
- PR 1 — `@iqai/mcp-debank` worktree at `/Users/aliusalaudeen/Documents/GitHub/debank-mcp-feat-token-balance`, branch `feat/token-balance-across-chains` (already checked out; this plan lives here).
- PR 2 — `aiden`, branch `feat/debank-multichain-token-disambiguation` (already exists; has the #105 instruction commits to be reverted).

## File Structure

PR 1 (`debank-mcp`):
- Create `src/lib/token-matcher.ts` — pure `matchesTokenReference` (+ `normalize`). One responsibility: decide if a reference matches a holding.
- Create `src/lib/token-matcher.test.ts`.
- Modify `src/services/user.service.ts` — extract `_getUserTokensWithSkippedChains`, slim `getUserTokensAcrossChainsRaw` to a wrapper, add `getTokenBalanceAcrossChainsRaw`.
- Modify `src/services/user.service.test.ts` — add tests for the new method + the helper's `skipped` + the wrapper regression.
- Modify `src/mcp/legacy/response-schemas.ts` — add `TokenBalanceAcrossChainsSchema`.
- Modify `src/mcp/legacy/tool-metadata.ts` — add the metadata entry.
- Modify `src/mcp/legacy/tool-metadata.test.ts` — entry count 35 → 36.
- Regenerated (NOT hand-edited): `src/mcp/search-docs/embedded-index.ts`, `src/mcp/instructions/instructions.generated.ts` via `pnpm build:docs`.
- Create `.changeset/<name>.md`.

PR 2 (`aiden`):
- Modify `src/agents/sub-agents/workflow-agent/sub-agents/api-search-agent/sub-agents/debank-agent/instruction.ts`.
- Modify `package.json` — bump `@iqai/mcp-debank`.

---

## PHASE 1 — `@iqai/mcp-debank` (PR 1)

Work from `/Users/aliusalaudeen/Documents/GitHub/debank-mcp-feat-token-balance`. Run a single test file with `npx vitest run <path>`.

### Task 1: Pure token matcher

**Files:**
- Create: `src/lib/token-matcher.ts`
- Test: `src/lib/token-matcher.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/token-matcher.test.ts
import { describe, expect, it } from "vitest";
import { matchesTokenReference } from "./token-matcher.js";

const holding = (over: Partial<Parameters<typeof matchesTokenReference>[1]> = {}) => ({
	id: "0x0000000000000000000000000000000000000001",
	name: "USD Coin",
	symbol: "USDC",
	display_symbol: null as string | null,
	optimized_symbol: "USDC",
	...over,
});

describe("matchesTokenReference", () => {
	it("matches by symbol, case-insensitively", () => {
		expect(matchesTokenReference("usdc", holding())).toBe(true);
		expect(matchesTokenReference("USDC", holding())).toBe(true);
	});
	it("matches by name with a trailing descriptor stripped", () => {
		expect(matchesTokenReference("USD Coin", holding())).toBe(true); // "usd" == name "usd"
		expect(matchesTokenReference("IQ token", holding({ name: "Everipedia IQ", symbol: "IQ" }))).toBe(true);
	});
	it("preserves a sole-word descriptor", () => {
		expect(matchesTokenReference("Coin", holding({ name: "Coin", symbol: "COIN" }))).toBe(true);
		expect(matchesTokenReference("Token", holding({ name: "Token", symbol: "TKN" }))).toBe(true);
	});
	it("rejects substring matches", () => {
		expect(matchesTokenReference("IQ", holding({ name: "hiIQ", symbol: "hiIQ" }))).toBe(false);
	});
	it("matches via post-normalize equality, not substring", () => {
		// holding().name "USD Coin" normalizes to "usd", so "USD" matches by NAME
		// (exact post-normalize equality) — this is intended, not a substring match.
		expect(matchesTokenReference("USD", holding())).toBe(true);
	});
	it("matches display_symbol / optimized_symbol when present", () => {
		expect(matchesTokenReference("WETH", holding({ name: "Wrapped Ether", symbol: "ETH", optimized_symbol: "WETH" }))).toBe(true);
	});
	it("is null-safe for display_symbol and never matches an empty reference", () => {
		expect(() => matchesTokenReference("usdc", holding({ display_symbol: null }))).not.toThrow();
		expect(matchesTokenReference("", holding({ name: "", symbol: "", display_symbol: null, optimized_symbol: "" }))).toBe(false);
		expect(matchesTokenReference("   ", holding())).toBe(false);
	});
	it("matches a 0x address against holding.id, case-insensitively", () => {
		expect(matchesTokenReference("0x" + "A".repeat(40), holding({ id: "0x" + "a".repeat(40) }))).toBe(true);
	});
	it("falls back to name/symbol for a malformed 0x reference", () => {
		expect(matchesTokenReference("0xABC", holding({ name: "0xABC", symbol: "X" }))).toBe(true);
		expect(matchesTokenReference("0xABC", holding())).toBe(false);
	});
});
```

- [ ] **Step 2: Run the test, expect failure**

Run: `npx vitest run src/lib/token-matcher.test.ts`
Expected: FAIL — `matchesTokenReference` is not defined / module missing.

- [ ] **Step 3: Implement the matcher**

```typescript
// src/lib/token-matcher.ts
import type { UserTokenBalance } from "../types.js";

type MatchableHolding = Pick<
	UserTokenBalance,
	"id" | "name" | "symbol" | "display_symbol" | "optimized_symbol"
>;

// Canonical EVM address shape — mirrors entity-resolver.ts:78.
const ADDRESS_RE = /^0x[a-f0-9]{40}$/i;
// A trailing generic descriptor word, only when preceded by whitespace — so a
// sole-word "Coin"/"Token" (no leading space) is preserved.
const TRAILING_DESCRIPTOR_RE = /\s+(?:token|coin)$/i;

/** trim → lower-case → drop a trailing "token"/"coin" unless it is the only word. */
function normalize(value: string): string {
	const lowered = value.trim().toLowerCase();
	const stripped = lowered.replace(TRAILING_DESCRIPTOR_RE, "");
	return stripped.length > 0 ? stripped : lowered;
}

/**
 * True if `reference` (a user-supplied token name, symbol, or 0x address)
 * identifies `holding`. Exact match (never substring) on the normalized name,
 * symbol, display_symbol, or optimized_symbol; or a case-insensitive match of a
 * well-formed 0x address against the holding's id.
 */
export function matchesTokenReference(
	reference: string,
	holding: MatchableHolding,
): boolean {
	const ref = reference.trim();
	if (ref === "") return false;

	if (ADDRESS_RE.test(ref)) {
		return (
			typeof holding.id === "string" &&
			holding.id.toLowerCase() === ref.toLowerCase()
		);
	}

	const target = normalize(ref);
	const fields = [
		holding.name,
		holding.symbol,
		holding.display_symbol,
		holding.optimized_symbol,
	];
	return fields.some(
		(f) => typeof f === "string" && f.length > 0 && normalize(f) === target,
	);
}
```

- [ ] **Step 4: Run the test, expect pass**

Run: `npx vitest run src/lib/token-matcher.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/token-matcher.ts src/lib/token-matcher.test.ts
git commit -m "feat: pure token-reference matcher (exact name/symbol/address)"
```

---

### Task 2: Extract the fan-out into a skipped-chain-aware helper

**Files:**
- Modify: `src/services/user.service.ts` (the existing `getUserTokensAcrossChainsRaw`, currently ~lines 259-332)
- Test: `src/services/user.service.test.ts`

- [ ] **Step 1: Write the failing tests** (append to the existing describe block)

```typescript
// in src/services/user.service.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
// (userService already imported)

afterEach(() => vi.restoreAllMocks());

describe("_getUserTokensWithSkippedChains", () => {
	it("returns skipped chain ids for chains whose token_list rejected", async () => {
		vi.spyOn(userService, "getUserTotalBalanceRaw").mockResolvedValue({
			total_usd_value: 5, chain_list: [
				{ id: "eth", usd_value: 5 }, { id: "bsc", usd_value: 3 },
			],
		} as any);
		vi.spyOn(userService, "getUserTokenListRaw").mockImplementation(async ({ chain_id }: any) => {
			if (chain_id === "bsc") throw new Error("503");
			return [{ chain: "eth", name: "IQ", symbol: "IQ", amount: 1, price: 1 } as any];
		});
		const { tokens, skipped } = await userService._getUserTokensWithSkippedChains({ id: WALLET, min_usd_value: 0 });
		expect(tokens).toHaveLength(1);
		expect(skipped).toEqual(["bsc"]);
	});
});

describe("getUserTokensAcrossChainsRaw (contract preserved)", () => {
	it("still returns a flat token array", async () => {
		vi.spyOn(userService, "getUserTotalBalanceRaw").mockResolvedValue({
			total_usd_value: 5, chain_list: [{ id: "eth", usd_value: 5 }],
		} as any);
		vi.spyOn(userService, "getUserTokenListRaw").mockResolvedValue([
			{ chain: "eth", name: "IQ", symbol: "IQ", amount: 1, price: 1 } as any,
		]);
		const tokens = await userService.getUserTokensAcrossChainsRaw({ id: WALLET });
		expect(Array.isArray(tokens)).toBe(true);
		expect(tokens).toHaveLength(1);
	});
});
```

- [ ] **Step 2: Run the tests, expect failure**

Run: `npx vitest run src/services/user.service.test.ts`
Expected: FAIL — `_getUserTokensWithSkippedChains` is not a function.

- [ ] **Step 3: Refactor `getUserTokensAcrossChainsRaw` into helper + wrapper**

Rename the existing method to `_getUserTokensWithSkippedChains`, change its return type to `{ tokens; skipped }`, update the `targetChains.length === 0` early-return to the new shape, and record skipped chains in the per-chain `.catch` **after** the abort re-throw. Move the existing 18-line JSDoc onto the helper. Then add the thin wrapper. Full refactored body (replaces the current `getUserTokensAcrossChainsRaw`, ~user.service.ts:259-332):

```typescript
	/* (move the existing 18-line JSDoc here) */
	async _getUserTokensWithSkippedChains(
		args: { id: string; min_usd_value?: number; is_all?: boolean },
		options?: RequestOptions,
	): Promise<{ tokens: UserTokenBalance[]; skipped: string[] }> {
		const throwIfAborted = () => {
			if (options?.signal?.aborted) {
				throw (
					options.signal.reason ??
					new DOMException("This operation was aborted", "AbortError")
				);
			}
		};
		throwIfAborted();
		const minUsdValue = args.min_usd_value ?? 1;
		const skipped: string[] = [];
		try {
			const portfolio = await this.getUserTotalBalanceRaw({ id: args.id }, options);
			throwIfAborted();
			const targetChains = (portfolio?.chain_list ?? [])
				.filter((c) => c?.id && c.usd_value >= minUsdValue)
				.map((c) => c.id);
			if (targetChains.length === 0) return { tokens: [], skipped: [] };
			const lists = await Promise.all(
				targetChains.map((chain_id) =>
					this.getUserTokenListRaw(
						{ id: args.id, chain_id, is_all: args.is_all },
						options,
					).catch((err) => {
						if (options?.signal?.aborted) throw err; // cancellation is NOT a skip
						logger.warn(
							`Skipping chain ${chain_id} for user ${args.id} due to upstream error`,
							err as Error,
						);
						skipped.push(chain_id);
						return [] as UserTokenBalance[];
					}),
				),
			);
			throwIfAborted();
			return { tokens: lists.flat(), skipped };
		} catch (error) {
			throwIfAborted();
			throw logAndWrapError(
				`Failed to fetch tokens across chains for user ${args.id}`,
				error,
			);
		}
	}

	async getUserTokensAcrossChainsRaw(
		args: { id: string; min_usd_value?: number; is_all?: boolean },
		options?: RequestOptions,
	): Promise<UserTokenBalance[]> {
		return (await this._getUserTokensWithSkippedChains(args, options)).tokens;
	}
```

Checklist (don't miss any): (1) rename + `{ tokens, skipped }` return type, (2) the `length === 0` early-return now returns `{ tokens: [], skipped: [] }`, (3) keep the outer `try/catch` + `logAndWrapError`, (4) keep the entry and inter-phase `throwIfAborted()` calls and the `getUserTotalBalanceRaw(..., options)` thread, (5) push to `skipped` only on the non-abort branch.

- [ ] **Step 4: Run the tests, expect pass**

Run: `npx vitest run src/services/user.service.test.ts`
Expected: PASS (new tests + all pre-existing `getUserTokensAcrossChainsRaw` tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/user.service.ts src/services/user.service.test.ts
git commit -m "refactor: extract _getUserTokensWithSkippedChains (records skipped chains)"
```

---

### Task 3: `getTokenBalanceAcrossChainsRaw`

**Files:**
- Modify: `src/services/user.service.ts`
- Test: `src/services/user.service.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// in src/services/user.service.test.ts
import { resolveChain } from "../lib/entity-resolver.js";
vi.mock("../lib/entity-resolver.js", () => ({ resolveChain: vi.fn() }));

const T = (over: any = {}) => ({ chain: "eth", name: "Everipedia IQ", symbol: "IQ", display_symbol: null, optimized_symbol: "IQ", id: "0x1", amount: 1, price: 2, ...over });

describe("getTokenBalanceAcrossChainsRaw", () => {
	it("aggregates matches across chains with total, usd, and dedup", async () => {
		vi.spyOn(userService, "_getUserTokensWithSkippedChains").mockResolvedValue({
			tokens: [T({ chain: "eth", amount: 1, price: 2 }), T({ chain: "base", name: "pTokens IQ", amount: 10, price: 2 }), T({ chain: "eth", symbol: "DAI", name: "Dai", amount: 999 })],
			skipped: [],
		});
		const r = await userService.getTokenBalanceAcrossChainsRaw({ id: WALLET, token: "IQ" });
		expect(r.matches.map((m) => m.chain).sort()).toEqual(["base", "eth"]);
		expect(r.total).toBe(11);
		expect(r.total_usd).toBe(22);
		expect(r.mixed_representations).toBe(true); // "Everipedia IQ" vs "pTokens IQ"
		expect(r.chains.sort()).toEqual(["base", "eth"]);
		expect(r.partial).toBe(false);
		expect(r.error).toBeUndefined();
	});
	it("surfaces partial + chains_skipped", async () => {
		vi.spyOn(userService, "_getUserTokensWithSkippedChains").mockResolvedValue({ tokens: [T()], skipped: ["bsc"] });
		const r = await userService.getTokenBalanceAcrossChainsRaw({ id: WALLET, token: "IQ" });
		expect(r.partial).toBe(true);
		expect(r.chains_skipped).toEqual(["bsc"]);
	});
	it("uses a single-chain fetch when chain is given", async () => {
		(resolveChain as any).mockResolvedValue("eth");
		const list = vi.spyOn(userService, "getUserTokenListRaw").mockResolvedValue([T()]);
		const agg = vi.spyOn(userService, "_getUserTokensWithSkippedChains");
		const r = await userService.getTokenBalanceAcrossChainsRaw({ id: WALLET, token: "IQ", chain: "ethereum" });
		expect(resolveChain).toHaveBeenCalledWith("ethereum");
		expect(list).toHaveBeenCalledWith({ id: WALLET, chain_id: "eth", is_all: true }, undefined);
		expect(agg).not.toHaveBeenCalled();
		expect(r.total).toBe(1);
	});
	it("returns an error (fields zeroed) when the chain cannot be resolved", async () => {
		(resolveChain as any).mockResolvedValue(null);
		const r = await userService.getTokenBalanceAcrossChainsRaw({ id: WALLET, token: "IQ", chain: "nope" });
		expect(r.error).toMatch(/nope/);
		expect(r.matches).toEqual([]);
		expect(r.total).toBe(0);
		expect(r.partial).toBe(false);
	});
	it("returns empty (no error) when nothing matches", async () => {
		vi.spyOn(userService, "_getUserTokensWithSkippedChains").mockResolvedValue({ tokens: [T({ symbol: "DAI", name: "Dai" })], skipped: [] });
		const r = await userService.getTokenBalanceAcrossChainsRaw({ id: WALLET, token: "IQ" });
		expect(r.matches).toEqual([]);
		expect(r.error).toBeUndefined();
	});
	it("marks a non-finite amount null and excludes it from totals", async () => {
		vi.spyOn(userService, "_getUserTokensWithSkippedChains").mockResolvedValue({
			tokens: [T({ chain: "eth", amount: 5, price: 1 }), T({ chain: "base", amount: Number.NaN, price: 1 })],
			skipped: [],
		});
		const r = await userService.getTokenBalanceAcrossChainsRaw({ id: WALLET, token: "IQ" });
		expect(r.matches.find((m) => m.chain === "base")?.amount).toBeNull();
		expect(r.total).toBe(5);
	});
});
```

- [ ] **Step 2: Run the tests, expect failure**

Run: `npx vitest run src/services/user.service.test.ts`
Expected: FAIL — `getTokenBalanceAcrossChainsRaw` is not a function.

- [ ] **Step 3: Implement the method**

Add to the top of `user.service.ts`:
```typescript
import { resolveChain } from "../lib/entity-resolver.js";
import { matchesTokenReference } from "../lib/token-matcher.js";
import type { TokenBalanceAcrossChains } from "../types.js";
```

Method (place after `getUserTokensAcrossChainsRaw`):
```typescript
	async getTokenBalanceAcrossChainsRaw(
		args: { id: string; token: string; chain?: string },
		options?: RequestOptions,
	): Promise<TokenBalanceAcrossChains> {
		const { id, token, chain } = args;
		const empty = (error?: string): TokenBalanceAcrossChains => ({
			wallet: id, token, matches: [], total: 0, total_usd: 0,
			mixed_representations: false, chains: [], partial: false,
			chains_skipped: [], ...(error ? { error } : {}),
		});

		let holdings: UserTokenBalance[];
		let skipped: string[] = [];
		if (chain) {
			const chain_id = await resolveChain(chain);
			if (!chain_id) return empty(`Could not resolve chain '${chain}'.`);
			holdings = await this.getUserTokenListRaw({ id, chain_id, is_all: true }, options);
		} else {
			const r = await this._getUserTokensWithSkippedChains({ id, min_usd_value: 0, is_all: true }, options);
			holdings = r.tokens;
			skipped = r.skipped;
		}

		const matched = holdings.filter((h) => matchesTokenReference(token, h));
		const matches = matched.map((h) => {
			const amount = Number.isFinite(h.amount) ? h.amount : null;
			const price = Number.isFinite(h.price) ? h.price : 0;
			const usd = amount !== null ? amount * price : 0;
			return { chain: h.chain, name: h.name, symbol: h.symbol, amount, price, usd };
		});
		const total = matches.reduce((s, m) => (m.amount !== null ? s + m.amount : s), 0);
		const total_usd = matches.reduce((s, m) => (m.amount !== null ? s + m.usd : s), 0);
		return {
			wallet: id, token, matches, total, total_usd,
			mixed_representations: new Set(matched.map((h) => h.name)).size > 1,
			chains: [...new Set(matched.map((h) => h.chain))],
			partial: skipped.length > 0,
			chains_skipped: skipped,
		};
	}
```

Add the type to `src/types.ts`:
```typescript
export type TokenBalanceAcrossChains = {
	wallet: string;
	token: string;
	matches: Array<{ chain: string; name: string; symbol: string; amount: number | null; price: number; usd: number }>;
	total: number;
	total_usd: number;
	mixed_representations: boolean;
	chains: string[];
	partial: boolean;
	chains_skipped: string[];
	error?: string;
};
```

- [ ] **Step 4: Run the tests, expect pass**

Run: `npx vitest run src/services/user.service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/user.service.ts src/services/user.service.test.ts src/types.ts
git commit -m "feat: getTokenBalanceAcrossChainsRaw deterministic balance method"
```

---

### Task 4: responseSchema + TOOL_METADATA entry + regenerate docs

**Files:**
- Modify: `src/mcp/legacy/response-schemas.ts`
- Modify: `src/mcp/legacy/tool-metadata.ts`
- Modify: `src/mcp/legacy/tool-metadata.test.ts`

- [ ] **Step 1: Bump the entry-count test (failing first)**

In `src/mcp/legacy/tool-metadata.test.ts`, change `expect(TOOL_METADATA).toHaveLength(35)` to `toHaveLength(36)` and update the `it("contains exactly 35 entries"` title to `36`.

Run: `npx vitest run src/mcp/legacy/tool-metadata.test.ts`
Expected: FAIL — still 35 entries.

- [ ] **Step 2: Add the response schema**

In `src/mcp/legacy/response-schemas.ts` (next to `UserTokensAcrossChainsSchema`):
```typescript
/** debank.user.getTokenBalanceAcrossChains — deterministic per-chain balance + total for a named token. */
export const TokenBalanceAcrossChainsSchema = z.object({
	wallet: z.string(),
	token: z.string(),
	matches: z.array(
		z.object({
			chain: z.string(),
			name: z.string(),
			symbol: z.string(),
			amount: z.number().nullable(),
			price: z.number(),
			usd: z.number(),
		}),
	),
	total: z.number(),
	total_usd: z.number(),
	mixed_representations: z.boolean(),
	chains: z.array(z.string()),
	partial: z.boolean(),
	chains_skipped: z.array(z.string()),
	error: z.string().optional(),
});
```

- [ ] **Step 3: Add the TOOL_METADATA entry**

In `src/mcp/legacy/tool-metadata.ts`, import the schema in the existing response-schema import block, then add this entry to the `TOOL_METADATA` array (next to the `getUserTokensAcrossChains` entry):
```typescript
	{
		name: "debank_get_token_balance_across_chains",
		qualified: "debank.user.getTokenBalanceAcrossChains",
		sandboxImpl: lazyMethod("userService", "getTokenBalanceAcrossChainsRaw"),
		description:
			"Deterministic balance of a NAMED token (by name or symbol) for a wallet, aggregated across every chain it's held on. Returns per-chain matches plus a combined total (the host reads each holding's human-readable amount — no decimals math). Pass `chain` to restrict to one chain. `token` is a human name/symbol (e.g. 'IQ', 'USDC'), not a contract address. Note: bridged/wrapped symbol variants (e.g. USDC.e, USDC (PoS)) are NOT aggregated — only canonical name/symbol matches.",
		parameters: z.object({
			id: z.string().describe("The wallet address (0x...)."),
			token: z.string().describe("Token name or symbol, e.g. 'IQ' or 'USDC'. Human-readable, not a contract address."),
			chain: z.string().optional().describe("Optional chain id or name to restrict to (e.g. 'eth', 'Polygon')."),
		}),
		responseSchema: TokenBalanceAcrossChainsSchema,
		exampleCall:
			"await debank.user.getTokenBalanceAcrossChains({id: '0x...', token: 'USDC'})",
		timeoutMs: 45_000,
	},
```

- [ ] **Step 4: Regenerate docs + run the full test suite**

Run: `pnpm build:docs` (regenerates ONLY `src/mcp/search-docs/embedded-index.ts` from `TOOL_METADATA` — do NOT hand-edit it). Note: `instructions.generated.ts` is NOT affected — `build:instructions` derives it from `instructions.md`, not `TOOL_METADATA`, so adding a metadata entry leaves it unchanged.
Run: `npx vitest run`
Expected: PASS, including `tool-metadata.test.ts` (now 36) and any `tool-metadata.import.test.ts` boundary test.

- [ ] **Step 5: Commit**

```bash
git add src/mcp/legacy/response-schemas.ts src/mcp/legacy/tool-metadata.ts src/mcp/legacy/tool-metadata.test.ts src/mcp/search-docs/embedded-index.ts
git commit -m "feat: register debank.user.getTokenBalanceAcrossChains in TOOL_METADATA"
```
(No `instructions.generated.ts` in the add list — it isn't regenerated by this change. If `git status` shows it modified, that's a stale artifact: discard it with `git checkout -- src/mcp/instructions/instructions.generated.ts`.)

---

### Task 5: Changeset + green build

**Files:**
- Create: `.changeset/<kebab-name>.md`

- [ ] **Step 1: Add a changeset**

Create `.changeset/token-balance-across-chains.md`:
```markdown
---
"@iqai/mcp-debank": minor
---

Add `debank.user.getTokenBalanceAcrossChains` — a deterministic, host-side
balance method for a named token across all chains (per-chain breakdown + total,
reading each holding's human-readable amount). Removes the need for guest code to
do balance arithmetic.
```

- [ ] **Step 2: Full build + test**

Run: `pnpm build` (runs `prebuild` → `build:docs` + `build:instructions`, then `tsc`)
Run: `npx vitest run`
Expected: both succeed with no errors.

- [ ] **Step 3: Commit + open PR 1**

```bash
git add .changeset/token-balance-across-chains.md
git commit -m "chore: changeset for getTokenBalanceAcrossChains"
git push -u origin feat/token-balance-across-chains
gh pr create --base main --title "feat: deterministic getTokenBalanceAcrossChains (no new tool)" \
  --body "Adds a host-side aggregate \`debank.user.getTokenBalanceAcrossChains\` (exposed via TOOL_METADATA, no new MCP tool) so multichain token-balance computation is deterministic instead of LLM-authored. Spec: docs/superpowers/specs/2026-06-27-deterministic-token-balance-across-chains-design.md. Driven by IQAIcom/aiden#105."
```
Do NOT add Claude/Anthropic attribution to commits or the PR body.

---

## PHASE 2 — `aiden` (PR 2)

Work from `/Users/aliusalaudeen/Documents/GitHub/aiden-adk` on branch `feat/debank-multichain-token-disambiguation`.

### Task 6: Dev-link the local package and verify before publishing

**Files:**
- Modify: `/Users/aliusalaudeen/Documents/GitHub/aiden-adk/package.json` (temporary link)

- [ ] **Step 1: Build the package in the worktree**

Run (in the worktree): `cd /Users/aliusalaudeen/Documents/GitHub/debank-mcp-feat-token-balance && pnpm build`
Expected: `dist/index.js` built (aiden resolves the bin via `require.resolve("@iqai/mcp-debank/package.json") -> dist/index.js`).

- [ ] **Step 2: Point aiden at the local build**

In aiden `package.json`, set `"@iqai/mcp-debank": "link:../debank-mcp-feat-token-balance"`, then `pnpm install`.
Expected: install succeeds; `node_modules/@iqai/mcp-debank` resolves to the worktree.

(No commit — this link is reverted in Task 8 after publish.)

---

### Task 7: Wire the DeBank agent to the method; revert the #105 instruction workarounds

**Files:**
- Modify: `src/agents/sub-agents/workflow-agent/sub-agents/api-search-agent/sub-agents/debank-agent/instruction.ts`

- [ ] **Step 1: Replace the workaround bullets with a single discovery-driven instruction**

In the shared `## Code Rules`, **keep** the first two bullets (`Use async/await…` and `Filter/sort results…`) and **delete these THREE token-balance bullets** (verified current text on branch `feat/debank-multichain-token-disambiguation` — grep the opening words to locate):

```
- When the user names a token without giving its contract address, resolve it from the wallet's holdings: normalize both the user's reference and each holding's name and symbol the same way — trim whitespace, lower-case, and drop a trailing generic descriptor word ("token"/"coin") unless it is the only word (so a token literally named "Coin" stays intact) — then require an exact match (never a substring). When the user specifies a chain, restrict the match to that chain. Never guess or assume a token contract address.
- When resolving a named token (the rule above) and the user did not name a chain, enumerate the wallet's holdings across all chains (not a single chain) so every chain holding the token is found. If the resolved token — the holdings matched by the rule above (same normalized name or symbol) — is held on more than one chain, report each matching chain's balance and, in the same response, always include a combined total computed by summing those per-chain balances (never omit the total or offer it as a follow-up); if their token names differ across chains (e.g. a bridged or wrapped representation), note that the total is a raw sum of distinct representations.
- Report each holding's human-readable balance exactly as the holdings data provides it — it is already decimal-adjusted, so never divide it by 10^decimals again, and never report it as null or zero when the holding exists (if your value comes back empty, you read the wrong field).
```

Replace those three with one bullet:
```
- For a wallet's balance of a named token, call `debank.user.getTokenBalanceAcrossChains({ id, token })` (add `chain` if the user named one) and present its structured result — per-chain `matches`, `total`/`total_usd`, and note `mixed_representations`/`partial` when set. Do not compute balances yourself.
```
Leave the other DeBank rules (async/await, trimming, the `run(debank)` contract) intact.

- [ ] **Step 2: Verify the file lints**

Run: `cd /Users/aliusalaudeen/Documents/GitHub/aiden-adk && npx @biomejs/biome check src/agents/sub-agents/workflow-agent/sub-agents/api-search-agent/sub-agents/debank-agent/instruction.ts`
Expected: exit 0, `Checked 1 file in …`, no diagnostics.

- [ ] **Step 3: Commit**

```bash
git add src/agents/sub-agents/workflow-agent/sub-agents/api-search-agent/sub-agents/debank-agent/instruction.ts
git commit -m "feat(debank): call getTokenBalanceAcrossChains; drop instruction workarounds"
```

---

### Task 8: Live verification, then publish + pin (GATED)

**Files:** `aiden/package.json` (final pin)

- [ ] **Step 1: Live verify via the dev-linked build**

Start: `cd /Users/aliusalaudeen/Documents/GitHub/aiden-adk && LLM_MODEL=openai/gpt-4.1-mini pnpm start`
Derive port + wait for health:
```bash
PORT=$(grep -E "^API_PORT=" .env | head -1 | cut -d= -f2- | tr -d '"'); PORT=${PORT:-3000}
until curl -sf "http://localhost:$PORT/health" >/dev/null 2>&1; do sleep 2; done; echo READY
```
Fire the multichain query 5× and a chain-named query (real whale wallet to exercise the `min_usd_value: 0` sweep within `timeoutMs: 45_000`):
```bash
AUTH=$(grep -E "^BOT_AUTH_KEY=" .env | head -1 | cut -d= -f2- | tr -d '"')
for n in 1 2 3 4 5; do
  curl -s -X POST "http://localhost:$PORT/api/query" -H "Content-Type: application/json" -H "x-auth-key: $AUTH" \
    -d '{"query":"What is the balance of IQ token in wallet 0xaCa39B187352D9805DECEd6E73A3d72ABf86E7A0?","userId":"verify-pkg"}' \
    | python3 -c "import sys,json;print(json.load(sys.stdin).get('data',{}).get('answer','ERR'))"; echo;
done
```
Expected: consistent per-chain list + total across all 5 runs, **no `e-14`/null/"not available" glitches**; the chain-named query restricts to that chain. Stop the server (`kill $(lsof -ti tcp:$PORT)`).

If glitches persist, the method/instruction needs iteration before publish — do not proceed.

- [ ] **Step 2: Publish the package (release action)**

In `debank-mcp` (the maintainer's normal release flow): merge PR 1, then `pnpm changeset version` + `pnpm changeset publish` (needs npm auth). Note the new published version `X.Y.Z`.

- [ ] **Step 3: Pin aiden to the published version (drop the link)**

In aiden `package.json`, set `"@iqai/mcp-debank": "X.Y.Z"` (the published version), `pnpm install`.

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(deps): bump @iqai/mcp-debank to X.Y.Z (getTokenBalanceAcrossChains)"
```

**GATING:** Task 7's instruction revert and this bump MUST land together in PR 2, and PR 2 MUST NOT merge before the package is published. If the revert ships against 2.0.2, the method won't exist and the agent falls back to the LLM arithmetic this removes.

- [ ] **Step 4: Open PR 2**

```bash
git push -u origin feat/debank-multichain-token-disambiguation
gh pr create --base main --title "fix(debank): deterministic multichain token balance via package method" \
  --body "Closes #105. Wires the DeBank agent to debank.user.getTokenBalanceAcrossChains (added in @iqai/mcp-debank X.Y.Z) and removes the instruction-only workarounds. Blocked on: @iqai/mcp-debank X.Y.Z published + pinned (this PR)."
```

---

## Self-Review

**1. Spec coverage:**
- Deterministic method reading human `amount` → Task 3. ✓
- Pure matcher (name/symbol/display_symbol/optimized_symbol, address, empty, descriptor-strip, substring rejection, null-safe) → Task 1. ✓
- `min_usd_value: 0` complete sweep + single-chain path for `chain` → Task 3. ✓
- `error` field (resolveChain miss), infra failures throw → Task 3 (resolveChain miss test; getUserTokenListRaw/getUserTotalBalanceRaw rejections propagate). ✓
- `partial`/`chains_skipped` via the helper, closure-and-push after abort check → Task 2. ✓
- `amount: null` excluded from totals → Task 3 (NaN test). ✓
- `TokenBalanceAcrossChainsSchema` (`amount` nullable, `error` optional) → Task 4. ✓
- `TOOL_METADATA` entry + 45_000 timeout; embedded-index regenerated via build:docs (not hand-edited) → Task 4. ✓
- entry count 35 → 36 → Task 4. ✓
- changeset/publish; aiden wiring + revert + bump; gating → Tasks 5–8. ✓
- vitest (not node:test) → all package tasks. ✓

**2. Placeholder scan:** Real code in every code step; the one deliberate variable is the published version `X.Y.Z` (unknowable until publish) — used consistently in Task 8.

**3. Type consistency:** `TokenBalanceAcrossChains` (types.ts) ↔ `TokenBalanceAcrossChainsSchema` (response-schemas.ts) fields match; method name `getTokenBalanceAcrossChainsRaw` and qualified `debank.user.getTokenBalanceAcrossChains` consistent across Tasks 3–4 and the aiden call in Task 7; helper `_getUserTokensWithSkippedChains({ tokens, skipped })` consistent across Tasks 2–3.
