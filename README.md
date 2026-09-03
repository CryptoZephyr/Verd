# Verd

Verd is a fixed-term working-capital facility on Creditcoin. A borrower can earn a preferred rate by completing an authenticated Aave reserve action on Ethereum Sepolia with a facility-specific ReserveLocker.

The current checkout contains the verified factory-bound Phase 3 contract flow, Phase 4 adversarial and recovery coverage, and a Phase 5 resumable proof worker. The backend is live on Render for testnet evidence. Phase 6 frontend work and full repayment lifecycle evidence have not started.

## Verified deployment

The Phase 5 worker is live at [verd-phase5-worker.onrender.com](https://verd-phase5-worker.onrender.com). Its `/health` endpoint reports the Postgres connection and worker readiness. The service uses an isolated durable Postgres table and does not rely on Render's local filesystem or SQLite for resume-critical state.

The live restart and idempotency record is in [docs/PHASE5.md](docs/PHASE5.md). The corrected cross-chain contract evidence is in [docs/PHASE3.md](docs/PHASE3.md).

## How Verd works

1. A lender creates and funds a fixed-term facility on Creditcoin CC3.
2. The borrower creates one ReserveLocker for that facility on Ethereum Sepolia.
3. The borrower supplies the approved WETH reserve to Aave V3 with the locker as `onBehalfOf`.
4. Attestcoin proves the factory configuration and Aave Supply transaction to CC3.
5. Verd binds the authenticated locker to exactly one facility and activates the preferred APR for future accrual.
6. The resumable worker persists progress, retries safe infrastructure steps, and checks on-chain state before any retry.

## Local setup

Use Node.js 20 or newer and Foundry. Copy `.env.example` to `.env`, then fill the required values locally. Never commit `.env`, private keys, database URLs, or `INTERNAL_TICK_SECRET`.

```text
npm ci
npm run build
npm test
npm start
```

The service exposes:

- `GET /health` and `GET /healthz`
- authenticated `POST /qualification-jobs`
- public `GET /job-status/:jobId`
- authenticated `POST /internal/tick`

## Verification

```text
npm run typecheck
npm test
```

`npm test` runs the Phase 5 worker suite, Phase 4 recovery suite, and Foundry contracts. The repository also includes [implementation status](docs/implementation-status.md), a [hackathon submission record](docs/submission.md), and a [security policy](SECURITY.md).

## Scope and limitations

Verd is testnet-only and has no independent security audit. Ethereum and Creditcoin remain authoritative. Postgres stores worker metadata only. Mainnet readiness, production availability, frontend completion, repayment-gated reserve release, and full facility lifecycle evidence are outside the verified scope.

The live idempotency check used an already-qualified Phase 3 facility, so no new CC3 qualification transaction was sent. Local tests cover the actual send, nonce, receipt, and recovery path. The Render Free Postgres instance has a recorded provider expiry of 2026-09-27.

License state: no license file is declared. Do not reuse or redistribute this repository without permission.
