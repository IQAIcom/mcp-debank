---
"@iqai/mcp-debank": patch
---

Teach the agent to discover `protocol_id` and `token_id` slugs before invoking, instead of guessing from the user's phrasing. Real session telemetry showed agents wasting ~7-12 upstream calls per query trying variants like `aave_v3`, `aave3`, `arb_aave3` before one matched — pure waste because DeBank's slug scheme is non-derivable ("Aave V3" is `aave3` on Ethereum, `arb_aave3` on Arbitrum, never `aave_v3`).

Two coordinated changes:

- **`instructions.md`**: new "Protocol & token IDs — discover, don't guess" section between "Chain ID conventions" and "Wrapped token keywords". States the rule (don't guess), explains why (slugs are non-derivable), and points at the discovery primitives. One concrete `aave3` example to illustrate; no enumerated cheat sheet.
- **`cookbook/11-find-protocol-id.md`**: new recipe surfaces via `search_docs` and walks through the canonical `getProtocolList({chain_id}).filter(p => p.name.includes(...))` pattern. Includes chain-prefix examples for non-Ethereum deployments (`arb_aave3`, `base_aave3`, …). Linked from `07-protocol-positions.md`.

The instruction tells the agent WHY/WHEN to discover; the cookbook walks through HOW. Together they close the discovery gap without adding a fixed lookup table to the always-loaded context.
