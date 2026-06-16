# Find risky token approvals

Retrieves all ERC-20 token approvals a wallet has granted on a single chain. Use this to surface unlimited or unusually large approvals that could be revoked to reduce attack surface.

`chain_id` is **required** by DeBank's upstream — calling without it returns `"ChainID Missing required parameter in the query string"`. Each response entry is a token (with its identity fields like `symbol`, `decimals`, `amount`) plus a `spenders[]` array — one entry per address authorised to spend that token.

The `value` on a spender is the approved amount in token units (already scaled by the token's `decimals`). Unlimited approvals appear as `~1.16e(77 − decimals)` — e.g. `~1.16e59` for an 18-decimal ERC20, `~1.16e71` for 6-decimal USDC. The `1e20` threshold catches every common decimal count without false positives on legitimately large approvals. The raw uint256 (if needed) lives on the token at `t.raw_amount` / `t.raw_amount_hex_str`.

```js
async function run(debank) {
  const approvals = await debank.user.getUserTokenAuthorizedList({
    id: "0xWALLET",
    chain_id: "eth",
  });

  return approvals.flatMap((t) =>
    t.spenders
      .filter((s) => s.value > 1e20)
      .map((s) => ({
        chain: t.chain,
        token: t.symbol,
        spender: s.id,
        protocol: s.protocol?.name ?? null,
        risk: s.risk_level,
        last_approved_at: s.last_approve_at,
      })),
  );
}
```
