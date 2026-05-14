# Get total portfolio value across all chains

Fetches the aggregate USD value of all tokens held by a wallet address across every chain that DeBank tracks. This is the fastest way to get a single "net worth" number for any address without having to query each chain individually.

```js
async function run(debank) {
  const result = await debank.user.getUserTotalBalance({ id: "0xWALLET" });
  // result.total_usd_value: total portfolio value in USD
  // result.chain_list: per-chain breakdown
  return result;
}
```
