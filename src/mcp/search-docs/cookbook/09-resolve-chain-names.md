# Convert user-facing chain names to DeBank chain IDs

Users often refer to chains by common aliases ("BSC", "Binance", "Polygon", "Matic"). DeBank APIs expect lowercase short IDs like `"bsc"`, `"matic"`, `"eth"`. Use `debank.resolveChain()` to translate any human-readable name into the correct chain ID before passing it to other methods.

```js
async function run(debank) {
  // resolveChain handles common aliases — case-insensitive
  const bscId = await debank.resolveChain("BSC");         // "bsc"
  const ethId = await debank.resolveChain("Ethereum");    // "eth"
  const maticId = await debank.resolveChain("Polygon");   // "matic"

  // Now use the resolved IDs in subsequent calls
  const balance = await debank.user.getUserChainBalance({
    id: "0xWALLET",
    chain_id: bscId,
  });
  return { bscId, ethId, maticId, balance };
}
```
