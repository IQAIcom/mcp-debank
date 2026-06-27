---
"@iqai/mcp-debank": minor
---

Add `debank.user.getTokenBalanceAcrossChains` — a deterministic, host-side
balance method for a named token across all chains (per-chain breakdown + total,
reading each holding's human-readable amount). Removes the need for guest code to
do balance arithmetic.
