# Find a protocol's DeBank ID

DeBank's `protocol_id` doesn't follow a single convention — guessing wastes calls and budget. Some protocols use a bare name (`uniswap`), some are versioned (`aave`, `aave2`, `aave3`, `aave4`), and per-chain deployments use a chain prefix (`aave3` on Ethereum, `arb_aave3` on Arbitrum, `avax_aave3` on Avalanche, `matic_aave3` on Polygon, `base_aave3` on Base, etc.).

Don't guess. Enumerate the chain's protocol catalog and filter by name.

```js
async function run(debank) {
  // Per-chain catalog returns every protocol on that chain.
  const ethProtocols = await debank.protocol.getProtocolList({ chain_id: "eth" });

  // Case-insensitive name filter to find candidates. The `name` field is the
  // human-readable label DeBank shows in the UI ("Aave V3", "Uniswap V3").
  const aaveCandidates = ethProtocols
    .filter(p => p.name && p.name.toLowerCase().includes("aave"))
    .map(p => ({ id: p.id, name: p.name }));

  // Returns the variants the user might mean — pick by version.
  // Example for eth: [{id:"aave",name:"Aave V1"}, {id:"aave2",name:"Aave V2"},
  //                   {id:"aave3",name:"Aave V3"}, {id:"aave4",name:"Aave V4"},
  //                   {id:"aave_amm",name:"Aave AMM"}, ...]
  return aaveCandidates;
}
```

Cross-chain catalog (when you need to disambiguate by chain):

```js
async function run(debank) {
  // Top 20 protocols across all chains; pass chain_ids to scope it.
  const protocols = await debank.protocol.getAllProtocolsOfSupportedChains({
    chain_ids: "eth,arb,avax,matic,base",
  });

  // Each entry includes its chain — useful when the user says
  // "Aave on Avalanche" and you need the avax variant.
  return protocols
    .filter(p => p.name && p.name.toLowerCase().includes("aave"))
    .map(p => ({ id: p.id, chain: p.chain, name: p.name }));
}
```

Once you have the ID, pass it to `debank.user.getUserProtocol({ id: "0xWALLET", protocol_id: "aave3" })` — see the protocol-positions recipe.

**Heuristics that don't replace looking it up:**

- Single-version protocols often use the bare name: `uniswap`, `curve`, `sushiswap`.
- Multi-version protocols use numeric suffixes: `aave`, `aave2`, `aave3`, `aave4`. There is NO `aave_v3` form — the `_v` style is wrong.
- Per-chain deployments use `<chain>_<protocol>` on non-Ethereum chains: `arb_aave3`, `base_aave3`. Ethereum is unprefixed.
- App-protocols (cross-chain dApps wrapping multiple deployments) are listed separately via `getAppProtocolList` and have their own short IDs.
