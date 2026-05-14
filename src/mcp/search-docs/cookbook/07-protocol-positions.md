# List user positions in a specific DeFi protocol

Returns a wallet's current positions inside a named DeFi protocol — LP shares, lending deposits, staking balances, etc. You need to know the DeBank `protocol_id` (e.g. `"uniswap"`, `"aave2"`, `"curve"`).

```js
async function run(debank) {
  const protocol = await debank.user.getUserProtocol({
    id: "0xWALLET",
    protocol_id: "uniswap",
  });
  // protocol.portfolio_item_list: array of position items with
  //   detail_types, detail (tokens, reward tokens), stats.net_usd_value
  return protocol.portfolio_item_list.map((p) => ({
    name: p.name,
    netUsd: p.stats.net_usd_value,
    assetUsd: p.stats.asset_usd_value,
  }));
}
```
