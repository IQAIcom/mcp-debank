# Get last N transactions

Fetches the most recent transactions for a wallet on a specific chain. Useful for reconstructing activity history, finding a specific transfer, or auditing recent on-chain behaviour.

```js
async function run(debank) {
  const txs = await debank.user.getUserHistoryList({
    id: "0xWALLET",
    chain_id: "eth",
    page_count: 20,
  });
  // Each entry has: time_at, tx (hash, from, to, value), sends, receives
  return txs.map((t) => ({
    hash: t.id,
    time: new Date(t.time_at * 1000).toISOString(),
    sends: t.sends,
    receives: t.receives,
  }));
}
```
