# zerobridge — ETH mainnet to native ZEC

Browser-only swap interface for Ethereum mainnet ETH → native transparent ZEC.

It uses Maya Protocol directly:

- Quotes: `https://mayanode.mayachain.info/mayachain/quote/swap`
- Route: `ETH.ETH` → `ZEC.ZEC`
- Execution: user sends ETH to the fresh Maya ETH inbound vault with the quote memo encoded in tx data.

No custom Solidity is used. Per ethskills, this does not need a contract: the onchain value movement is handled by Ethereum + Maya's existing vault/router protocol, and the rest is UI.

## Run locally

```bash
npm test
npm run build
npm run serve
```

Open `http://127.0.0.1:4174`.

## Safety notes

- Transparent Zcash addresses only (`t1…` / `t3…`). Shielded/unified addresses are not supported by Maya/SwapKit for this route yet.
- Never cache quote vault addresses. The app refreshes the quote immediately before sending.
- Use Ethereum mainnet only.
- The app does not custody funds and does not ask for seed phrases or private keys.
