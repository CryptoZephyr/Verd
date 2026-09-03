# Verd

[![CI](https://github.com/CryptoZephyr/Verd/actions/workflows/ci.yml/badge.svg)](https://github.com/CryptoZephyr/Verd/actions/workflows/ci.yml)

Verd is a testnet working-capital protocol for Creditcoin. A lender can offer better borrowing terms when a borrower completes a real, locked reserve commitment on Ethereum and proves it through Attestcoin.

## The product

Verd connects a Creditcoin facility to an Aave V3 reserve action on Ethereum Sepolia. The facility lives on Creditcoin, the reserve is held by a facility-specific locker, and Attestcoin carries authenticated source-chain evidence to the destination chain. When the required reserve action is accepted, Verd activates the agreed Preferred Rate Condition for future interest accrual.

The current release contains the smart contracts, proof orchestration worker, durable job store, deployment configuration, and verification evidence for the testnet integration.

## How the verified flow works

1. A lender creates and funds a fixed-term facility on Creditcoin CC3.
2. The borrower creates one `ReserveLocker` for that facility through the Sepolia `ReserveLockerFactory`.
3. The borrower supplies the approved WETH reserve to Aave V3 with the locker as `onBehalfOf`.
4. Attestcoin proves the factory event and the Aave Supply receipt to Creditcoin.
5. Verd authenticates the exact facility, borrower, locker, asset, amount, deadline, and proof state.
6. Verd binds the locker to exactly one facility and activates the preferred APR.
7. The worker stores progress in Postgres and resumes safely after restarts or transient infrastructure failures.

## Live testnet service

The proof worker is deployed at [the live Render service](https://verd-phase5-worker.onrender.com). Check its [health endpoint](https://verd-phase5-worker.onrender.com/health) to see whether the service and its Postgres connection are available.

The service is testnet-only. It uses Render Postgres for resumable job metadata and does not use the local filesystem or SQLite as a source of truth.

## Evidence

- [Cross-chain contract evidence](docs/PHASE3.md), including the factory event, authenticated locker binding, Aave Supply proof, and preferred-rate readback.
- [Adversarial and recovery evidence](docs/PHASE4.md), including the Solidity and restart-recovery suites.
- [Worker reliability evidence](docs/PHASE5.md), including durable state, Render restart recovery, proof progression, and idempotency.
- [Implementation status](docs/implementation-status.md), with the current product boundary and remaining work.
- [Hackathon submission record](docs/submission.md), with the judge-facing product summary and evidence map.
- [Security policy](SECURITY.md), with scope, reporting guidance, and secret-handling rules.

## Run locally

You need Node.js 20 or newer and Foundry. Runtime values belong in a local `.env` file. Start with the safe template and keep private keys, database URLs, and internal secrets out of Git.

```bash
npm ci
cp .env.example .env
npm run typecheck
npm test
npm start
```

To build the Solidity contracts directly:

```bash
npm run build:contracts
```

The worker expects the required chain, proof-builder, Postgres, wallet, and internal-authentication values from `.env`. The checked-in [.env.example](.env.example) contains the variable names without secret values.

## HTTP API

The worker exposes a small authenticated API for proof jobs.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/health` or `/healthz` | Service and database readiness |
| `POST` | `/qualification-jobs` | Register a facility and Sepolia source transaction |
| `GET` | `/job-status/:jobId` | Read persisted progress and evidence fields |
| `POST` | `/internal/tick` | Advance one job through the proof workflow |

The two `POST` endpoints require either the `x-internal-tick-secret` header or a bearer token. A job is keyed by `facilityId` plus `sourceTxHash`. Re-registering the same pair is safe, and conflicting durable hints are rejected instead of being silently ignored.

Example local registration request:

```bash
curl -X POST http://localhost:8787/qualification-jobs \
  -H "content-type: application/json" \
  -H "x-internal-tick-secret: <local-secret>" \
  -d '{"facilityId":"0x...","sourceTxHash":"0x..."}'
```

## Repository map

| Directory | Contents |
| --- | --- |
| `contracts/creditcoin/` | Verd facility, locker binding, proof validation, and lifecycle state |
| `contracts/ethereum/` | Sepolia `ReserveLocker` and `ReserveLockerFactory` |
| `src/` | TypeScript worker, HTTP server, chain gateway, configuration, and Postgres store |
| `scripts/` | Deployment, live verification, and recovery helpers |
| `test/` | Contract, worker, and recovery tests |
| `docs/` | Architecture, live evidence, implementation status, and submission notes |
| `.github/workflows/` | Reproducible CI checks |

## Current boundaries

Verd is a testnet prototype with no independent security audit. The current evidence does not establish Mainnet readiness, production availability, a completed frontend, a complete maturity repayment and reserve-release flow, or an external wake scheduler. Ethereum and Creditcoin remain authoritative. Postgres stores worker metadata only and cannot qualify a facility by itself.

The live idempotency check used an already-qualified testnet facility, so it intentionally created no new CC3 qualification transaction. The local suites cover receipt handling, proof progression, submission intent, nonce recovery, restart recovery, and duplicate prevention. Render Free Postgres has a recorded provider expiry of 2026-09-27.

## License

Released under the [MIT License](LICENSE).
