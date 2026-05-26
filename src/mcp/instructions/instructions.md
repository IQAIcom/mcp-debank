# DeBank MCP — Code Mode Operational Guide

This server exposes two primary tools to agents: `execute` (sandboxed JavaScript against a DeBank client) and `search_docs` (search SDK documentation). Two convenience tools — `debank_resolve` and `debank_get_supported_chain_list` — are also available by default. The 30 hidden legacy tools can be restored with `--legacy-tools`.

## When to use which tool

- **`execute`** — multi-step workflows with loops, joins, conditional logic, or custom projection. The expressive default.
- **`invoke_endpoint`** — single API call with a jq filter for projection. Lighter-weight than `execute` when you just need a few fields from one endpoint.
- **`list_endpoints`** + **`get_endpoint_schema`** — discovery. Use when you don't know what's available or what an endpoint's params/response look like.

### `invoke_endpoint` quick reference

```json
{
  "name": "debank.user.getUserChainBalance",
  "params": { "id": "0xWALLET", "chain_id": "eth" },
  "jq_filter": ".usd_value"
}
```

The response is the jq-projected JSON. Use `get_endpoint_schema` first to see the full response shape.

## Top operations

### 1. Total portfolio value across all chains

```js
async function run(debank) {
  return await debank.user.getUserTotalBalance({ id: "0xWALLET" });
}
```

### 2. Balances on a specific chain

```js
async function run(debank) {
  return await debank.user.getUserChainBalance({ id: "0xWALLET", chain_id: "eth" });
}
```

### 3. NFTs across all chains

```js
async function run(debank) {
  return await debank.user.getUserAllNftList({ id: "0xWALLET" });
}
```

### 4. Top tokens by USD value held on a chain

```js
async function run(debank) {
  const tokens = await debank.user.getUserTokenList({ id: "0xWALLET", chain_id: "eth", is_all: true });
  return tokens
    .map(t => ({ symbol: t.symbol, usd: (t.amount ?? 0) * (t.price ?? 0) }))
    .sort((a, b) => b.usd - a.usd)
    .slice(0, 10);
}
```

### 5. Find risky token approvals

```js
async function run(debank) {
  // Note: v0.1 service signature is `{id}` only — this method queries
  // approvals across all chains the wallet has interacted with.
  const approvals = await debank.user.getUserTokenAuthorizedList({ id: "0xWALLET" });
  // Filter to unlimited approvals
  return approvals.filter(a => a.value === "unlimited" || Number(a.value) > 1e20);
}
```

### 6. Recent transactions

```js
async function run(debank) {
  return await debank.user.getUserHistoryList({ id: "0xWALLET", chain_id: "eth", page_count: 20 });
}
```

### 7. Current gas on a chain

```js
async function run(debank) {
  return await debank.chain.getGasPrices({ chain_id: "eth" });
}
```

### 8. Simulate a transaction before sending

```js
async function run(debank) {
  return await debank.transaction.preExecTransaction({
    tx: JSON.stringify({ from: "0xWALLET", to: "0xCONTRACT", data: "0x...", value: "0x0" }),
  });
}
```

### 9. List user positions in a specific DeFi protocol

```js
async function run(debank) {
  return await debank.user.getUserProtocol({ id: "0xWALLET", protocol_id: "uniswap" });
}
```

### 10. Token price on a specific historical date

```js
async function run(debank) {
  return await debank.token.getTokenHistoryPrice({
    id: "0xdac17f958d2ee523a2206206994597c13d831ec7",
    chain_id: "eth",
    date_at: "2024-01-01",
  });
}
```

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

The `debank.resolveWrappedToken(keyword, chain_id)` helper converts the keywords `"WETH"`, `"wrapped native"`, and `"native token"` to the chain's wrapped-token address. **You must call it explicitly** — passing one of those strings directly as a `token_id` or `id` argument inside a `debank.*` call will NOT auto-resolve. Example:

```js
async function run(debank) {
  const wethAddr = debank.resolveWrappedToken("WETH", "eth");
  return await debank.token.getTokenInformation({ id: wethAddr, chain_id: "eth" });
}
```

## Common patterns

### Pagination
The DeBank API uses offset-based pagination via `start` and `limit` (or `page_count` for history). Always paginate inside a single `execute` block — variables don't persist between calls.

### Error handling
**Throw** to indicate failure: uncaught exceptions from `run(debank)` are caught by the runtime and returned as `{ok: false, error: <message>}` with `isError: true` in the MCP envelope. **Returning** an error-shaped object (e.g. `return { error: "..." }`) is a *successful* result — the runtime wraps it as `{ok: true, result: { error: "..." }}` and the agent sees no failure signal. If something genuinely failed, `throw`. **The server does NOT retry upstream errors on your behalf.** If a `debank.*` call fails, decide whether to retry from your own code. For transient errors (network blip, DeBank 429, 5xx) a short `for`-loop with a small delay is fine; for hard 4xx errors retrying is pointless. Variables don't persist between `execute` calls, so put any retry loop inside one `execute` body.

Example pattern (uses the sandbox-provided `sleep(ms)` helper — `setTimeout` is NOT available in the sandbox; `sleep` is the only timer):

```js
async function run(debank) {
  for (let i = 0; i < 3; i++) {
    try {
      return await debank.user.getUserTotalBalance({ id: "0xWALLET" });
    } catch (err) {
      if (i === 2) throw err;
      await sleep(500 * (i + 1));   // bounded by the 30 s outer deadline
    }
  }
}
```

### Projection
Return only what you need. The result crosses the V8 boundary as a JSON copy — keep payloads small.

## Sandbox constraints

- JavaScript only — no TypeScript syntax (no `: string`, no generics).
- No `process`, no `require`, no `import`, no `eval`.
- No `fetch` outside the `debank` client.
- No `setTimeout` / `setInterval`. Use `await sleep(ms)` instead — the only timer the sandbox provides. Bounded by the 30 s outer deadline.
- 30 s outer wall-clock per `execute`.
- 5 s per `debank.*` call; on timeout you'll see `"DeBank call timed out after 5s: <method>"`.
- No persistent state between `execute` calls.

## Wrapper-shape gotcha

`debank.user.getUserTotalNetCurve` returns `{usd_value_list: [...]}` — unwrap before mapping:

```js
async function run(debank) {
  const curve = await debank.user.getUserTotalNetCurve({ id: "0xWALLET" });
  return curve.usd_value_list.slice(-7);   // last 7 data points
}
```
