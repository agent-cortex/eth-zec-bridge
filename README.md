# zerobridge — ETH mainnet to native ZEC

Browser-only swap interface for Ethereum mainnet ETH → native ZEC recipients.

It uses Maya Protocol directly:

- Quotes: `https://mayanode.mayachain.info/mayachain/quote/swap`
- Route: `ETH.ETH` → `ZEC.ZEC`
- Execution: user sends ETH to the fresh Maya ETH inbound vault with the quote memo encoded in tx data.

No custom Solidity is used. Ethereum and Maya's existing vault/router protocol handle the onchain value movement; this repo is only the browser UI.

## Run locally

```bash
npm test
npm run build
npm run serve
```

Open `http://127.0.0.1:4174`.

## Safety notes

- The app accepts transparent (`t1…` / `t3…`), unified (`u1…`), and shielded Sapling (`zs…`) Zcash addresses, then lets Maya perform final route validation.
- Never cache quote vault addresses. The app refreshes the quote immediately before sending.
- Use Ethereum mainnet only.
- The app does not custody funds and does not ask for seed phrases or private keys.
