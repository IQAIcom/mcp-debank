# Deterministic token balance across chains

Driven by IQAIcom/aiden#105 (DeBank multichain token disambiguation). This is
the `@iqai/mcp-debank` side of the fix; a small aiden wiring change + version
bump follows.

## Problem

In aiden, a query like "balance of \<token\> in wallet 0x…" routes to the DeBank
agent (code mode), which writes guest JS for the `execute` tool. Live runs on
`gpt-4.1-mini` showed the guest code intermittently mishandles the per-chain
balance — it re-divides the already-decimal-adjusted `amount` by `10**decimals`
(→ ~`3e-14` values) or reads a null/empty field (→ "balance not available").
Roughly 1-in-3 to 1-in-5 runs glitch. The DeBank API returns correct data every
time; the error is purely in LLM-authored arithmetic. Instruction wording (tried
in aiden) does not reliably fix a probabilistic code-gen error.

## Goal

Move the balance computation off the LLM into deterministic package code,
**without adding a new MCP tool** — the code-mode surface stays `execute` +
`search_docs`. Follow the existing host-side-aggregate pattern
(`getUserTokensAcrossChains`): a deterministic method exposed to guest code via a
`TOOL_METADATA` entry and documented through `search_docs`. The guest's job
shrinks to a single call with no arithmetic.

## Decision log (non-normative; the body sections are authoritative)

1. Complete sweep — `min_usd_value: 0`, not exposed as a knob (a balance query
   must not under-report).
2. Bridged-suffix variants (`USDC.e`, `(PoS)`) out of scope v1; match canonical
   name/symbol/display_symbol/optimized_symbol only, documented in the tool.
3. Chain-restricted queries use a single-chain fetch, not aggregate-then-filter.
4. (R2) `resolveChain` miss returns a single shape with an `error` field — not a
   second shape and not a throw. Infra failures (network) still throw.
5. (R2) Skipped-chain observability via an internal helper that returns
   `{ tokens, skipped }`; the public aggregate keeps its flat-array contract.
6. (R2) This method gets `timeoutMs: 45_000` (the `min_usd_value: 0` sweep hits
   more chains than the aggregate's 30 s default was sized for).

## Design

### New host-side aggregate: `UserService.getTokenBalanceAcrossChainsRaw`

Signature: `{ id: string; token: string; chain?: string } -> TokenBalanceAcrossChains`

Always a COMPLETE sweep; does not expose `min_usd_value`/`is_all`.

Algorithm:
1. **Fetch (two paths):**
   - `chain` provided → `resolveChain(chain)`, then single-chain
     `this.getUserTokenListRaw({ id, chain_id, is_all: true })`. Don't fan out to
     N chains to drop N-1. If `resolveChain` MISSES → return the normal shape
     with `error` set and all other fields zeroed (see return shape); never
     silently fall back to all chains.
   - `chain` absent → `this._getUserTokensWithSkippedChains({ id,
     min_usd_value: 0, is_all: true })` (the internal helper — see below).
     `min_usd_value: 0` queries EVERY chain the wallet has touched (the default
     of 1 would drop a chain whose total USD < $1, hiding the token there).
2. **Match:** keep holdings the matcher accepts for `token`.
3. **Per match:** read the human `amount` directly (already decimal-adjusted);
   `usd = amount * price`. No `10**decimals` math. `amount` missing/non-finite →
   `amount: null` (excluded from totals).
4. **Aggregate + observability:** `total`/`total_usd` over finite amounts;
   `mixed_representations` = distinct match `name`s > 1; `chains` = DEDUPED set of
   chains with a match; `partial` = `chains_skipped.length > 0`; `chains_skipped`
   from the helper (single-chain path: `partial: false`, `chains_skipped: []`).
5. **Return shape (one shape always):**
   ```ts
   {
     wallet: string;
     token: string;                  // the user's reference, echoed
     matches: Array<{ chain: string; name: string; symbol: string; amount: number | null; price: number; usd: number }>;
     total: number;                  // Σ amount over finite-amount matches
     total_usd: number;              // Σ usd over the same
     mixed_representations: boolean;  // distinct match names > 1
     chains: string[];               // DEDUPED chains with a match
     partial: boolean;               // a targeted chain was skipped (transient error)
     chains_skipped: string[];       // skipped chain ids (empty when partial=false)
     error?: string;                 // input-validation miss only (e.g. unresolvable chain); when set, all
                                      // other fields are zero values (matches [], total 0, partial false, …)
   }
   ```
   Distinguishing terminal states from the fields (no second shape):
   - `error` set → input error (unresolvable chain). Other fields zeroed.
   - no `error`, `matches: []` → wallet holds none of the token.
   - no `error`, `matches` non-empty, `partial: true` → results, but a chain was
     skipped (under-count possible).
   Infra failures (a per-call network/timeout in the single-chain path) THROW —
   the sandbox surfaces the error string, as today.

### Pure matcher — `src/lib/token-matcher.ts` (sibling of `entity-resolver.ts`, unit-tested)

`matchesTokenReference(reference, holding)` where `holding` is
`Pick<UserTokenBalance, "id" | "name" | "symbol" | "display_symbol" | "optimized_symbol">`.

- **Empty reference:** if the trimmed reference is `""`, return `false`
  immediately (guards against an empty reference matching empty/null fields).
- **Address inputs:** if the trimmed reference matches `/^0x[a-f0-9]{40}$/i` (the
  canonical pattern from `entity-resolver.ts:78`), match case-insensitively
  against `holding.id` (the token address) and skip the name/symbol path. A
  MALFORMED `0x…` (wrong length/typo) does NOT take this path — it falls through
  to name/symbol matching (most malformed addresses are user typos).
- **Name/symbol path:** for each of the holding's `name`, `symbol`,
  `display_symbol`, `optimized_symbol` — **skip fields that are null/undefined**
  (`display_symbol` is `string | null`) — normalize both the reference and the
  field:
  - trim, lower-case,
  - drop a **trailing** generic descriptor word (`token`/`coin`) **unless it is
    the only word**,
  then **exact** equality (never substring). Match if the normalized reference
  equals ANY non-null normalized field.

Concrete normalization cases (must be in the unit tests):
`"IQ token"`→`"iq"`, `"USD Coin"`→`"usd"`, `"The Token"`→`"the"`,
`"Big Dog Coin"`→`"big dog"`; sole-word `"Coin"`→`"coin"`, `"Token"`→`"token"`
(preserved). Reject: `"IQ"` ≠ `"hiIQ"` (substring); empty reference matches
nothing; `display_symbol: null` neither crashes nor matches.

**Bridged/suffix variants are NOT matched in v1** (decision 2): `USDC` won't
match `USDC.e`/`USDC (PoS)`. The tool description states this.

### Internal helper for skipped-chain observability

The current `getUserTokensAcrossChainsRaw` returns `Promise<UserTokenBalance[]>`
and a flat array is the contract guest code relies on (`tokens.map(...)`); the
only registrations are `tool-metadata.ts:558` and `search-docs/embedded-index.ts:585`.
To avoid a breaking change:
- Extract a private `_getUserTokensWithSkippedChains({ id, min_usd_value, is_all })
  -> { tokens: UserTokenBalance[]; skipped: string[] }` that does the existing
  fan-out and records each chain id whose per-chain `.catch` fired.
- `getUserTokensAcrossChainsRaw` becomes a thin wrapper returning `helper().tokens`
  (unchanged external contract).
- The new method consumes the helper directly to get `skipped`.

### TOOL_METADATA entry + search_docs

- `src/mcp/legacy/tool-metadata.ts`: add an entry mirroring `getUserTokensAcrossChains`:
  `qualified: "debank.user.getTokenBalanceAcrossChains"`,
  `sandboxImpl: lazyMethod("userService", "getTokenBalanceAcrossChainsRaw")`,
  `parameters` (zod `{ id, token, chain? }`), `responseSchema`
  (`TokenBalanceAcrossChainsSchema`), `description` + `exampleCall` (teach "balance
  of a named token at a wallet" + state the bridged-variant limitation),
  `timeoutMs: 45_000`.
- `src/mcp/search-docs/embedded-index.ts`: add the matching discovery entry
  (this file is what `search_docs` searches — without it the method is callable
  but not discoverable). Mirror the existing `getUserTokensAcrossChains` entry.
- `src/mcp/legacy/response-schemas.ts`: add
  `export const TokenBalanceAcrossChainsSchema` (object with the `matches` array
  etc.). `matches[].amount` is **`z.number().nullable()`** and `error` is
  `z.string().optional()` (the existing `UserTokenBalanceSchema.amount` is plain
  `z.number()`, so nullable must be explicit or the null case is untestable).

This makes `debank.user.getTokenBalanceAcrossChains({ id, token })` callable from
guest code via the existing `execute` tool. **No new MCP tool.**

### aiden wiring (separate, smaller change)

- The guest's `run(debank)` for a named-token balance becomes
  `return await debank.user.getTokenBalanceAcrossChains({ id, token });`. The agent
  echoes the structured result. `search_docs` surfaces the method (discovery-driven).
- Revert the #105-branch instruction bullets (all-chain enumeration, mandatory
  total, decimals nudge, balance-field nudge) — the method owns all of it.
- Bump `@iqai/mcp-debank` `2.0.2 → <new>` after publish.

## Error handling / edge cases

- **No matches:** `matches: []`, no `error` (caller renders "no \<token\>").
- **Unresolvable chain:** `error` set, all other fields zeroed (decision 4). Not
  a throw — keeps one LLM-facing shape.
- **Partial chain failure (observability):** the helper records skipped chain ids
  on its per-chain `.catch`; surfaced as `partial`/`chains_skipped`. A 5/7-chain
  answer is now distinguishable from a complete one (the silent under-count this
  feature must not reproduce).
- **`amount` missing/non-finite:** `amount: null`, excluded from totals; visible
  rather than silently zeroed. Schema `z.number().nullable()`.
- **`price` missing:** `usd: 0`, token `amount` still reported.
- **`total` precision:** sums JS numbers; whale-scale high-decimal sums past 2^53
  lose precision. Acceptable for this display/LLM use; not corrected.

## Testing

Tests use **vitest** (every `*.test.ts` imports from `"vitest"`; no `node:test`
in this repo).

Package (the real test surface):
- `src/lib/token-matcher.test.ts` — the normalization cases above (sole-word
  "Coin"/"Token", 2-word descriptor tails, substring rejection, empty reference →
  false, name/symbol/display_symbol/optimized_symbol, `display_symbol: null`
  safe, valid `0x…40` → `id`, malformed `0x…` → name/symbol fallback).
- `getTokenBalanceAcrossChainsRaw` with the helper / `getUserTokenListRaw` mocked:
  multi-chain same-name, multi-chain differing-names (`mixed_representations=true`),
  chain-restricted (single fetch, no fan-out), `resolveChain` miss (`error` set,
  fields zeroed), empty matches, missing `amount` (→ `null`, excluded), missing
  `price`, skipped-chain (`partial=true` + `chains_skipped`).
- `_getUserTokensWithSkippedChains` test, plus a regression test that
  `getUserTokensAcrossChainsRaw` still returns the flat array (contract preserved).
- `src/mcp/legacy/tool-metadata.test.ts`: hardcoded
  `expect(TOOL_METADATA).toHaveLength(35)` → `36`; add a new-entry well-formedness
  assertion. (Check `embedded-index` tests for an analogous count, if any.)

aiden (end-to-end, via the dev-linked build):
- `/api/query` on `gpt-4.1-mini`: multichain query returns a consistent per-chain
  list + total across ~5 runs, no `e-14`/null glitches; a chain-named query
  restricts to that chain. **Use a real whale wallet** to confirm the
  `min_usd_value: 0` sweep completes within `timeoutMs: 45_000`.

## Dev-link → release

1. In the worktree: `pnpm build`.
2. aiden's #105 branch: `"@iqai/mcp-debank": "link:../debank-mcp-feat-token-balance"`
   (or `file:`), `pnpm install`; aiden resolves the bin via
   `require.resolve("@iqai/mcp-debank/package.json") -> dist/index.js`, so the
   local `dist` must be built.
3. Verify end-to-end via `/api/query`.
4. Add a changeset, version bump, `changeset publish`.
5. aiden bumps the pin to the published version and drops the link.

## Cross-repo sequencing

- PR 1 (`debank-mcp`): internal helper + new method + matcher + TOOL_METADATA &
  embedded-index entries + responseSchema + tests + changeset → publish.
- PR 2 (`aiden`): guest wiring + dependency bump to the published version + revert
  the superseded #105 instruction bullets. (The existing aiden #105 branch becomes
  this PR.)

**Gating (must not regress):** PR 2's instruction reverts MUST NOT merge before
`@iqai/mcp-debank` is published AND aiden's pin is bumped. If the reverts ship
while aiden still resolves 2.0.2, the method won't exist and the agent falls back
to LLM arithmetic — the exact glitch this removes. Bump + revert land in the same
aiden PR, after PR 1 is published.

## Out of scope

- A new first-class MCP tool (rejected — preserves the 2-tool surface).
- **Bridged/wrapped symbol variants** — `USDC` won't aggregate `USDC.e`,
  `USDC (PoS)`, `USDbC`. Normalized exact match on
  name/symbol/display_symbol/optimized_symbol only; no suffix stripping (too
  false-positive-prone for v1). The tool description states this. Revisit as a
  follow-up if the USDC-across-chains case proves important.
- Per-chain USD pricing beyond `amount * price` already on each holding.
- Any change to the `execute` sandbox or the dynamic-mode tools.
