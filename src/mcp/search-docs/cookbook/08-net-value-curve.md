# Get 24h net value curve

Returns the net-worth time series for a wallet over the past 24 hours. The response is a wrapper object — you must access `.usd_value_list` to get the actual array of data points. Forgetting to unwrap is a common mistake.

```js
async function run(debank) {
  const wrapper = await debank.user.getUserTotalNetCurve({ id: "0xWALLET" });

  // IMPORTANT: unwrap the response — the data lives at .usd_value_list
  const points = wrapper.usd_value_list;

  // Each point: { timestamp: number, usd_value: number }
  const last7 = points.slice(-7);
  const latest = last7[last7.length - 1];
  const earliest = last7[0];
  const changePct =
    earliest.usd_value > 0
      ? ((latest.usd_value - earliest.usd_value) / earliest.usd_value) * 100
      : 0;

  return { last7, changePct: changePct.toFixed(2) };
}
```
