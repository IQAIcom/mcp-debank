# List user positions in a specific DeFi protocol

Returns a wallet's current positions inside a named DeFi protocol — LP shares, lending deposits, staking balances, etc. You need the DeBank `protocol_id` (e.g. `"uniswap"`, `"aave3"`, `"curve"`).

Not sure of the exact ID? Versions and chain prefixes vary (`aave3` on eth, `arb_aave3` on Arbitrum, etc.) — see the **find-protocol-id** recipe to enumerate the catalog before calling this. Don't guess: the IDs don't follow a single convention.

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
