# Get balances for a wallet on one chain

Returns token balances and total USD value for a wallet restricted to a single chain. Use this when you want chain-scoped data rather than the cross-chain aggregate from `getUserTotalBalance`.

```js
async function run(debank) {
  const result = await debank.user.getUserChainBalance({
    id: "0xWALLET",
    chain_id: "eth",
  });
  // result.usd_value: total balance on that chain in USD
  return result;
}
```
