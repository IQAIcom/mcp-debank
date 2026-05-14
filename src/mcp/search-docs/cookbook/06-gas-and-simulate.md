# Check gas and simulate a transaction

Fetches current gas price tiers for a chain and optionally pre-executes a transaction to estimate gas usage and detect potential reverts — all before committing anything on-chain.

```js
async function run(debank) {
  // Step 1: get current gas prices
  const gas = await debank.chain.getGasPrices({ chain_id: "eth" });
  // gas.slow / gas.normal / gas.fast: gwei tiers

  // Step 2: pre-execute (simulate) a transaction
  const simulation = await debank.transaction.preExecTransaction({
    tx: JSON.stringify({
      from: "0xWALLET",
      to: "0xCONTRACT",
      data: "0x",
      value: "0x0",
      gas: "0x5208",
      gasPrice: String(gas.normal.price),
    }),
  });
  // simulation.pre_exec: { success, error_message }
  return { gas, simulation };
}
```
