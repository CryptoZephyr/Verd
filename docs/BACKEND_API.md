# Backend API reference

The Verd worker exposes public job registration and status reads, plus secret-protected operational routes.

## Base URL

The testnet service URL is configured in the frontend as `VITE_VERD_WORKER_URL`. The current recorded service is the [testnet worker endpoint](https://verd-phase5-worker.onrender.com). Check `/health` and `/` before relying on a deployment's optional routes.

## Public routes

### `GET /health` or `GET /healthz`

Returns service and database readiness. This response does not prove a facility state or a completed proof.

### `POST /public/qualification-jobs`

Registers a borrower-authenticated `qualification`, `binding`, or `release` job.

```json
{
  "operation": "qualification | binding | release",
  "facilityId": "0x...",
  "sourceTxHash": "0x...",
  "sourceBlock": 11622931,
  "walletAddress": "0x...",
  "signature": "0x...",
  "issuedAt": 0
}
```

The signature covers the operation, facility, source transaction, optional source block, and issue time. The worker recovers the signer, compares it with the facility borrower, rejects expired messages, and applies facility-plus-source idempotency.

### `GET /job-status/:jobId`

Returns job status, next action, attempts, retry count, source evidence, proof ID, submission evidence, terminal state, and the last error category when available.

## Protected routes

- `POST /qualification-jobs` and `POST /jobs` register an internally authenticated job.
- `POST /internal/tick` advances one due job or a requested job.

Use either the `x-internal-tick-secret` header or a bearer token. Never send this secret from the browser.

## Response boundary

The API returns operational progress. The frontend must still read Creditcoin and Ethereum before displaying a final financial state. A completed worker job is not a substitute for a contract readback.

## CORS and request limits

The public registration route supports browser CORS for `GET`, `POST`, and `OPTIONS`. Request bodies are bounded by `MAX_BODY_BYTES`. Internal authentication remains required for wake and service-only routes.

## Local development

```bash
npm run build
npm start
```

Configure `DATABASE_URL`, `PRIVATE_KEY`, RPC URLs, the proof-builder URL, the Verd address, and `INTERNAL_TICK_SECRET` in local environment configuration. Keep all secret values out of Git.
