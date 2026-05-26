# ADR 0001 — No host-side response filter

- **Status:** Accepted
- **Date:** 2026-05-26
- **Deciders:** Aliu Salaudeen
- **Supersedes:** the v0.1 `LLMDataFilter` mechanism (removed in `0e4316e`)

## Context

v0.1 of the DeBank MCP server returned a single large markdown blob per tool call. When a response was big enough to overrun the calling LLM's context window, the server would re-compress it host-side using a second LLM:

- `BaseService.formatResponse` compared `toMarkdown(data).length` (via a tiktoken encoder) against a configured `maxTokens` threshold.
- If exceeded AND a `_userQuery` parameter was set on the tool call AND `aiModel` was wired (via `OPENROUTER_API_KEY`), the markdown was filtered against the query.
- The trigger inputs (`currentQuery`, `aiModel`) were held as **mutable singleton state** on each `BaseService` instance, set via side channels (`setQuery`, `setAIModel`). Every tool handler broadcast `setQuery(q)` to all 5 service singletons before invoking a method.

The v0.2 refactor introduced **Code Mode**: the `execute` tool runs agent-authored JavaScript inside an `isolated-vm` sandbox with a `debank.*` client. Agents now express projection in JS — `.map().sort().slice(0, 10)` — and only what the agent returns crosses the V8 boundary back to the host.

This created a question: keep the v0.1 host-side filter for the legacy tool surface (`--legacy-tools`), or delete it?

## Decision

**Delete the host-side response filter entirely.** Services own transport (`*Raw()`) and markdown rendering (`toMarkdown`). No `LLMDataFilter`, no per-call query state on services, no `setQuery` / `setAIModel` / `currentQuery` / `aiModel` / `dataFilter` / `formatResponse`. The `_userQuery` parameter is removed from all 31 legacy tool schemas. The `OPENROUTER_API_KEY`, `LLM_MODEL`, and `GOOGLE_GENERATIVE_AI_API_KEY` environment variables are no longer recognized.

When agents need to compress a large response, the answer is `execute` — agent-authored projection in the sandbox, before the result crosses the boundary.

## Rationale

1. **Host-side filtering requires knowing the agent's intent.** The agent's intent is *already* encoded in the JS it writes in `execute()`. The host cannot out-guess the agent's projection. A host-side filter that "summarizes against `_userQuery`" is solving a lower-quality version of a problem the agent already solves itself.

2. **The reference architecture doesn't do it.** The CoinGecko Stainless MCP server — the architectural template we modeled v0.2 on — has no host-side response filter. It relies entirely on Code Mode for response shaping.

3. **The filter was dead in the new default surface.** Under v0.2 the four default tools are `execute`, `search_docs`, `debank_resolve`, and `debank_get_supported_chain_list`. None of them invoke the filter. It only fired on `--legacy-tools` paths with `_userQuery` set — a v0.1 affordance for a v0.1-only problem.

4. **The mutable singleton state was a real bug source.** During the v0.2 refactor we wrote a regression test (`tool-handlers.test.ts` "calls without `_userQuery` clear singleton state from a prior call (no leak)") because a leaked `currentQuery` from a prior tool call would silently filter the next response against the wrong query. The fix was a `setQuery("")` clear-broadcast in every code path. Deleting the state deletes the bug class — no clear-broadcast needed, no leak possible.

5. **The deletion test passes cleanly.** Removing the filter concentrates complexity nowhere. ~600 lines and 2 dependencies (`js-tiktoken`, `@openrouter/ai-sdk-provider`) disappear. No caller has to compensate.

## Consequences

### Gained

- `BaseService` is now a pure transport + formatter primitive. No singleton state, no async filter detour. Easier to reason about, easier to test.
- Filtering-related machinery removed: `LLMDataFilter`, `openrouter` integration module, `Tiktoken` encoder, three env vars, `tsconfig.scripts.json` (which existed only to work around tsx's `js-tiktoken/lite` resolution).
- 3 brittle tests deleted (singleton-state-leak regression + 2 `_userQuery` piping tests). Their bug class no longer exists.
- `src/services/index.ts` is now side-effect-free at module load: no `openrouter()` call, no `setAIModel` wiring.

### Lost

- **`--legacy-tools` users who passed `_userQuery` on huge responses lose silent compression.** Migration path: invoke `execute` with a JS projection of the same call.
- Strict byte-identity with v0.1 behavior on the `_userQuery` path. v0.1's markdown output for non-`_userQuery` calls is still preserved byte-identical (verified by the 31-method snapshot regression in `tests/integration/service-snapshots.test.ts`).

## When to revisit

This ADR should be reopened **only if**:

- Code Mode (`execute`) itself fails to address response-size shaping for a new tool surface that genuinely cannot use the sandbox.
- A response-size problem arises that the agent provably cannot solve via projection (e.g. streaming results, multi-step pagination where the agent's first call already exceeds context).

If filtering is ever needed again, the right architectural location is **the tool layer**, not `BaseService`. Tool handlers are where `_userQuery`-equivalent inputs would originate as MCP parameters; co-locating the filter with its trigger keeps locality intact. `BaseService` should remain a pure transport primitive regardless.

## Related

- PR #7 — Stainless-style MCP refactor phase one
- Commit `0e4316e` — refactor!: delete v0.1 LLM response filter (deepening via deletion)
- Spec `docs/superpowers/specs/2026-05-13-stainless-style-mcp-refactor-phase-one-design.md` §2.1, §2.2 — Code Mode design
