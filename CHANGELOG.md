# @iqai/mcp-debank

## 2.0.0

### Major Changes

- 9bfee84: Fix three endpoint contract drift bugs in `user.service` (#21):

  - **`getUserTotalNetCurve`** returns a bare `NetCurvePoint[]` — the previous typing claimed a `{ usd_value_list: NetCurvePoint[] }` wrapper that doesn't exist. The cookbook example was throwing `TypeError` at runtime.
  - **`getUserTokenAuthorizedList`** now forwards the required `chain_id` query param. Previously DeBank rejected every call with `"ChainID Missing required parameter"`. Response shape corrected to match real API (token entry with nested `spenders[]`, not a flat `{spender, value, token}` triplet).
  - **`getUserNftAuthorizedList`** also forwards `chain_id`. Response shape corrected from bare `NFTAuthorization[]` to the real `{ total, contracts, tokens }` wrapper with collection-level and per-token approval splits.

  **Breaking change** for any direct caller of the service `*Raw` methods (not via the MCP tool layer): `getUserTokenAuthorizedListRaw` and `getUserNftAuthorizedListRaw` now require `chain_id` in args, and `getUserNftAuthorizedListRaw` returns the wrapper object instead of an array. The old call shapes were already rejected by DeBank, so anyone using them was effectively broken.

  All approval-related Zod schemas now use `.passthrough()` to match the types' `[key: string]: unknown` open-shape contract — DeBank's frequent field additions won't break the agent. _(This entry was backfilled — the changeset commit landed on the PR branch after the PR had already merged, so it missed the release that bundled the fix.)_

- b9f49cf: Add `debank.user.getUserTokensAcrossChains` aggregate and remove the broken `getUserAllTokenList` (#16).

  `/user/all_token_list` was structurally unservable for any active wallet — DeBank's upstream cannot return within the 5 s per-call wrapper timeout, and soft instructions could not stop the agent from inventing a "3-call limit per invocation" rule and degrading queries to 14-minute round trips.

  The new `getUserTokensAcrossChainsRaw` does the fan-out inside the service layer:

  1. `getUserTotalBalanceRaw` → discover active chains.
  2. Filter to chains with `usd_value >= min_usd_value` (default 1).
  3. `Promise.all(getUserTokenListRaw per filtered chain)` with per-chain `.catch` so a single chain's failure degrades the aggregate to best-effort instead of failing entirely.

  Wall-time on a whale wallet (~30 active chains): **~6 s** (down from 2-14 minutes). The aggregate gets a per-method `timeoutMs: 30_000` override (new `ToolMetadata.timeoutMs` field) so the wrapper doesn't cancel it at 5 s.

  **Breaking change**: `debank.user.getUserAllTokenList` is no longer registered. Anyone calling it gets `Invalid arguments` from Zod or an undefined property error — the recommended replacement is `getUserTokensAcrossChains`, which is faster for every wallet size.

### Minor Changes

- b9f49cf: Add request coalescing, an in-process GET cache, and per-call latency instrumentation to `BaseService` (#15). Three coordinated changes:

  - **Coalescing**: concurrent callers for the same URL now share one underlying promise instead of firing duplicate axios requests. Critical when a guest `Promise.all`s identical lookups.
  - **TTL cache**: identical lookups within `cacheDuration` skip the gateway hop entirely; emits `cache=hit` in the log. Layered on top of IQ Gateway's own cache. POSTs are never cached. Failed promises and expired entries are evicted with proper timer cleanup.
  - **Instrumentation**: every upstream GET/POST emits one stderr line `[DeBank API] info: op=… route=… path=… ms=… ok=…` — enables identifying slow endpoints from real session traces.

  The cache layer uses an internal `AbortController` per shared fetch (decoupled from any caller's signal) so one caller's abort cannot cascade to coalesced peers. Each caller gets a per-caller race wrapper for their own signal, preserving the standard `AbortError` contract (including `signal.reason` propagation). Logger also gates ANSI colorization on `process.stderr?.isTTY` so MCP host log files stay clean.

### Patch Changes

- b9f49cf: Drop the unused `zod-to-json-schema` devDependency (#14). The codebase migrated to Zod v4's native `z.toJSONSchema()` API; the legacy package had zero references in `src/`, `scripts/`, or `tests/`. Remains in the lockfile as a transitive of `xsschema` (pulled in by `@iqai/adk`), which is unchanged.
- b9f49cf: Enforce the Node engine version at process startup (#13). MCP hosts (Claude Desktop, etc.) often spawn `node` from a non-interactive shell that picks whichever Node sits first on PATH — frequently an old nvm default. On Node < 20, `undici` v7 crashes during module evaluation with an opaque `ReferenceError: File is not defined`, leaving operators to debug a cryptic stack trace.

  The bin entry is now a thin shim (`src/index.ts`) that checks `process.versions.node` against the required major **before** any static import of `fastmcp`/`undici` runs. On older Node, it emits a clear `[debank-mcp] Node v… is too old — set the "command" field to an absolute path to a Node 22+ binary` diagnostic and exits with code 1. Bootstrap is dynamic-imported only after the version gate passes.

- b9f49cf: Rename `IQAICOM` / `IQAIcom` references to `IQOfficial` to match the new GitHub org handle (#20). No functional change; aligns repo URLs and contributor references with the canonical org name.

## 1.0.0

### Major Changes

- 894ad85: **Breaking change:** The 30 legacy `debank_*` tools (formerly behind `--legacy-tools`) are removed. Use `list_endpoints` + `get_endpoint_schema` + `invoke_endpoint` for per-endpoint access (host-side jq filtering supported), or `execute` for multi-step workflows.

  New tools: `execute` (sandboxed JavaScript against a DeBank client) and `search_docs` (local MiniSearch index over methods + cookbook) are the default surface. Four additional tools — `debank_resolve`, `list_endpoints`, `get_endpoint_schema`, and `invoke_endpoint` (with optional `jq_filter` for host-side response projection) — are available with `--tools=dynamic` or `DEBANK_MCP_TOOLS=dynamic`.

  Internals: each service exposes only `*Raw()` JSON-returning methods. `invoke_endpoint` dispatches by qualified name via the `sandboxImpl` field on each tool metadata entry. The markdown wrapper layer (`toMarkdown`) is fully removed.

  **Breaking changes:**

  - The 30 `debank_*` tools (chain, protocol, token, user, transaction) are no longer available. Use `invoke_endpoint` with the qualified name from `list_endpoints`.
  - The `--legacy-tools` flag and `DEBANK_MCP_LEGACY` env var are removed and no longer recognized.
  - `debank_get_supported_chain_list` now returns JSON, not markdown.
  - The `OPENROUTER_API_KEY`, `LLM_MODEL`, and `GOOGLE_GENERATIVE_AI_API_KEY` environment variables are no longer recognized.
  - The default tool surface is now `execute` + `search_docs` only. The four extra tools (`debank_resolve`, `list_endpoints`, `get_endpoint_schema`, `invoke_endpoint`) require `--tools=dynamic` or `DEBANK_MCP_TOOLS=dynamic` to register.

## 0.1.1

### Patch Changes

- b529b74: Fixed gas price fetching issue caused by an incorrect DeBank API endpoint.

## 0.1.0

### Minor Changes

- 89e09ca: Support direct DeBank API usage and flexible gateway proxying.
