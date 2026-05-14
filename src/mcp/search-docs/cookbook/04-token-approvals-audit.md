# Find risky token approvals

Retrieves all ERC-20 token approvals a wallet has granted across every chain it has interacted with. Use this to surface unlimited or unusually large approvals that could be revoked to reduce attack surface.

Note: the v0.1 service signature accepts `{id}` only — there is no `chain_id` filter. The method internally queries approvals on every chain the wallet has activity on.

```js
async function run(debank) {
  const approvals = await debank.user.getUserTokenAuthorizedList({ id: "0xWALLET" });
  // Filter to unlimited or very large approvals
  const risky = approvals.filter(
    (a) => a.value === "unlimited" || Number(a.value) > 1e20,
  );
  return risky.map((a) => ({
    chain: a.chain,
    token: a.symbol,
    spender: a.spender_list?.[0]?.id,
    value: a.value,
  }));
}
```
