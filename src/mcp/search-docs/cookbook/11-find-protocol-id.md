# Find a protocol's DeBank ID

DeBank's `protocol_id` doesn't follow a single convention — versions, separators, and chain prefixes vary unpredictably between protocols, so guessing wastes calls and budget. The fix is always the same shape: enumerate the catalog and filter by `name`.

```js
async function run(debank) {
  // Per-chain catalog returns every protocol on that chain — the
  // comprehensive, ungapped source. Prefer this when you know the chain.
  const protocols = await debank.protocol.getProtocolList({ chain_id: "eth" });

  // Case-insensitive name filter using whatever the user typed (the keyword
  // is the input, not the answer). The `name` field is the human-readable
  // label DeBank shows in the UI.
  const candidates = (protocols || [])
    .filter(p => p && p.name && p.name.toLowerCase().includes("aave"))
    .map(p => ({ id: p.id, name: p.name }));

  // Shape returned: `[{id: "<slug>", name: "<label>"}, ...]` — one entry per
  // match. Pick the slug whose `name` matches the version the user asked for.
  // DON'T hardcode the slug values; read them off the response.
  return candidates;
}
```

Cross-chain catalog (when the user names the protocol but not the chain):

```js
async function run(debank) {
  // Comprehensive multi-chain catalog — no top-N cap, includes
  // less-popular protocols on smaller chains. Each entry carries its
  // `chain` field for disambiguation. Use this when the user says
  // something like "Aave on Avalanche" and you need to pick the right
  // chain variant.
  const protocols = await debank.protocol.getAllProtocolsOfSupportedChains({
    chain_ids: "eth,arb,avax,matic,base",
  });

  return (protocols || [])
    .filter(p => p && p.name && p.name.toLowerCase().includes("aave"))
    .map(p => ({ id: p.id, chain: p.chain, name: p.name }));
}
```

Once you have the canonical ID from the response, pass it to `debank.user.getUserProtocol({ id, protocol_id })` — see the protocol-positions recipe.

**Things to know about the slug scheme (without baking in answers):**

- The slug is not derivable from the human-facing name. Don't try to construct it by replacing spaces, lowercasing, inserting `_v`, or any other transform — those forms generally don't exist in the catalog.
- A protocol with multiple deployed versions has a separate slug per version. The `name` field disambiguates ("Foo V2" vs "Foo V3").
- Per-chain deployments often use a `<chain>_<base>` prefix convention on non-Ethereum chains; Ethereum deployments are usually unprefixed. The actual catalog is authoritative — don't infer the prefix without checking.
- Cross-chain "app-protocols" (dApps that wrap multiple per-chain deployments) live in a separate catalog under `getAppProtocolList` with their own slugs.
