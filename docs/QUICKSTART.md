# Verd quickstart

## Requirements

- Node.js 20 or newer.
- Foundry.
- A compatible EVM wallet for explicit testnet actions.
- Sepolia ETH and WETH for reserve actions.
- CC3 tCTC for facility actions.

## Install and verify

```bash
npm ci
cp .env.example .env
npm run typecheck
npm test
```

## Start the worker

```bash
npm run build
npm start
```

## Start the web interface

```bash
npm run dev:web -- --host 127.0.0.1
```

Set `VITE_VERD_WORKER_URL` when the browser should use a local or newly deployed worker. The interface reads the recorded facility directly from CC3 by default.

## Safe order for a testnet run

1. Read the facility and terms without connecting a wallet.
2. Connect the wallet only when the workspace shows a valid action.
3. Switch to the named network before signing.
4. Wait for the receipt and refresh authoritative state.
5. Use the evidence surface and explorer links to inspect the result.

Never use production funds. Keep private keys and all worker secrets outside the repository.
