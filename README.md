# Verd

Verd is a fixed-term working-capital facility on Creditcoin. The borrower qualifies for a preferred rate by completing an authenticated Aave reserve action on Ethereum Sepolia.

This checkout contains the verified Phase 3 factory-bound contract flow, Phase 4 adversarial and recovery tests, and the Phase 5 resumable proof worker. Phase 6 frontend work is outside the current scope.

## Phase 5 worker

The worker is a TypeScript Node service backed by durable Postgres. It does not use Render's local filesystem or SQLite for resume-critical state.

```text
npm ci
npm run build
npm run test:phase5
npm start
```

Required runtime values are listed in `.env.example`. Keep private keys, database URLs, and the internal tick secret in local or Render environment configuration only.

The service exposes:

- `GET /health`
- `POST /qualification-jobs`, authenticated with the internal tick secret
- `GET /job-status/:jobId`
- `POST /internal/tick`, authenticated with the internal tick secret

The worker uses `facilityId` plus the exact source transaction hash as its durable idempotency key. It reads CC3 state before retrying a proof submission and preserves the proof-ready payload and submission intent in Postgres.

## Contract verification

```text
forge test -vv
npm run phase4:recovery
```

The contract path is testnet-only. A complete Facility state still requires verified repayment, reserve release, backend, frontend, and lifecycle evidence.
