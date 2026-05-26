---
"@iqai/mcp-debank": minor
---

**Breaking change:** 30 of the 31 legacy `debank_*` tools are now hidden by default; `debank_get_supported_chain_list` remains visible as a default grounding tool. Pass `--legacy-tools` or set `DEBANK_MCP_LEGACY=1` to restore the hidden 30.

New tools: `execute` (sandboxed JavaScript against a DeBank client), `search_docs` (local MiniSearch index over methods + cookbook), and `debank_resolve`.

Internals: each service method now exposes a public `*Raw()` JSON-returning variant; the markdown method is a thin wrapper that catches formatter failures separately.

**Breaking change for `--legacy-tools` users:** the v0.1 host-side LLM response filter has been removed. The `_userQuery` parameter on legacy tools is no longer accepted and no longer compresses large responses. Agents needing projection on large responses should use the `execute` tool to project in JavaScript instead. The `OPENROUTER_API_KEY`, `LLM_MODEL`, and `GOOGLE_GENERATIVE_AI_API_KEY` environment variables are no longer recognized.
