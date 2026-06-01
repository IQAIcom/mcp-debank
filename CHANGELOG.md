# @iqai/mcp-debank

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
