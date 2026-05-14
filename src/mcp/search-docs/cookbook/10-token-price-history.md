# Get historical price for a token

Returns the USD price of a specific token on a specific chain at a given historical date. Useful for computing cost-basis, PnL on historical holdings, or charting price movements.

```js
async function run(debank) {
  const priceData = await debank.token.getTokenHistoryPrice({
    id: "0xdac17f958d2ee523a2206206994597c13d831ec7", // USDT on Ethereum
    chain_id: "eth",
    date_at: "2024-01-01",
  });
  // priceData.price: USD price at that date
  return {
    token: priceData.symbol,
    date: "2024-01-01",
    price: priceData.price,
  };
}
```
