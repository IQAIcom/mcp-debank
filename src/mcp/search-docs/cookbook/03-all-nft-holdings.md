# List all NFTs across chains

Returns every NFT held by a wallet across all chains DeBank indexes. The response includes collection metadata, token IDs, and estimated USD values where available. This is the single call to use when you need a full picture of someone's NFT holdings.

```js
async function run(debank) {
  const nfts = await debank.user.getUserAllNftList({ id: "0xWALLET" });
  // Each entry has: chain, contract_name, contract_id, inner_id, usd_price
  return nfts.map((n) => ({
    chain: n.chain,
    collection: n.contract_name,
    tokenId: n.inner_id,
    usd: n.usd_price ?? 0,
  }));
}
```
