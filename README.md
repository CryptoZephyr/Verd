# Verd

[![CI](https://github.com/CryptoZephyr/Verd/actions/workflows/ci.yml/badge.svg)](https://github.com/CryptoZephyr/Verd/actions/workflows/ci.yml)

Verd is testnet fixed-term working-capital credit for crypto-native businesses. A lender sets a standard rate and a lower preferred rate. A borrower can qualify for the preferred rate by locking an agreed WETH reserve until maturity and having Verd accept the facility-specific reserve record.

[Open the Verd frontend](https://verd-kohl.vercel.app) · [Read the public documentation](docs/DOCUMENTATION.md) · [View the source](https://github.com/CryptoZephyr/Verd)

> Testnet only. No Mainnet funds. No independent security audit. The frontend is an inspectable product surface, not a live lending offer.

## Why Verd exists

Crypto-native businesses can have onchain activity without a clear way to make a credit commitment legible to a lender. Verd makes the terms, the reserve condition, and the rate consequence explicit in one fixed-term facility.

The product keeps the important questions visible:

- What principal and dates did the lender set?
- What standard and preferred rates were agreed?
- What WETH reserve must the borrower lock?
- Has Verd accepted the exact reserve record for this facility?
- What can happen next, and which chain is authoritative for it?

## How the product works

1. A lender creates and funds a fixed-term facility on Creditcoin Testnet CC3.
2. The borrower reviews the terms and creates a facility-specific reserve locker on Ethereum Sepolia.
3. The borrower supplies the agreed WETH reserve through Aave with that locker as the owner of the position.
4. Verd checks the factory event, the Aave supply receipt, the facility, the borrower, the asset, the amount, and the deadline.
5. When the reserve condition is accepted, Verd applies the preferred rate to future interest on the facility.
6. At maturity, repayment remains a Creditcoin action. The current reserve locker unlocks by time and borrower authorization. The testnet contracts do not enforce a cross-chain repayment signal at the locker.

The rate condition is the core product rule. The reserve qualifies the rate. It does not, by itself, prove repayment.

## Try the testnet interface

The public frontend is deployed at [verd-kohl.vercel.app](https://verd-kohl.vercel.app). It lets a reader:

- understand the facility before connecting a wallet,
- compare the standard and preferred rate in a worked example,
- follow separate lender and borrower paths,
- inspect a recorded testnet facility and its evidence boundary,
- see the next valid action without treating unavailable data as complete.

Wallet actions are explicit. Connect only a testnet wallet when you intend to inspect or exercise a testnet flow.

## Public documentation

Start with the [documentation map](docs/DOCUMENTATION.md). It is organized by reader intent, so product and role guidance comes before protocol mechanics.

- [Learn Verd](docs/README.md), for the product story, roles, rate condition, reserve boundary, and tour.
- [Build the testnet implementation](docs/QUICKSTART.md), for prerequisites, networks, deployment, and safe local use.
- [Understand the architecture](docs/ARCHITECTURE.md), for the two-chain boundary, proof worker, browser, and data authority.
- [Follow the lifecycle](docs/LIFECYCLE.md), for terms, rates, qualification, draw, repayment, maturity, and release.
- [Use the backend API](docs/BACKEND_API.md), for public job registration, status reads, and protected worker routes.
- [Check deployments](docs/DEPLOYMENTS.md), for testnet networks and contract addresses.
- [Read the security model](docs/SECURITY_MODEL.md), for trust boundaries, failure behavior, replay protection, and secret handling.
- [Inspect recorded evidence](docs/VERIFIED_EVIDENCE.md), for the reference facility and its explicit limits.
- [Review implementation status](docs/implementation-status.md), for the current product boundary and remaining work.
- [Read the security policy](SECURITY.md), for reporting guidance and secret handling.

The web interface also exposes deep links under `/docs/start`, `/docs/use`, `/docs/concepts`, `/docs/build`, `/docs/integrate`, `/docs/reference`, `/docs/evidence`, `/docs/security`, and `/docs/help`.

## Testnet topology

| Domain | Role | Source of truth |
| --- | --- | --- |
| Creditcoin Testnet CC3 | Facility terms, funding, draw, rates, repayment, locker binding, and proof replay state | Creditcoin contract reads and receipts |
| Ethereum Sepolia | Facility-specific locker, Aave position, WETH reserve, and time-based release | Ethereum contract reads and receipts |
| Attestcoin and the worker | Authenticated cross-chain proof construction, submission, retries, and recovery metadata | Proof records and durable job state |
| Verd frontend | Presentation, wallet actions, and evidence links | It does not create protocol truth |

The [architecture guide](docs/ARCHITECTURE.md) explains these boundaries in detail.

## Recorded testnet service

The proof worker has a recorded [testnet service endpoint](https://verd-phase5-worker.onrender.com). Its [health route](https://verd-phase5-worker.onrender.com/health) must be checked before use because hosted availability can change. The endpoint was not verified as healthy during this release pass.

The worker uses Render Postgres for resumable job metadata. Postgres stores progress, retries, source blocks, proof IDs, and submission intent. It does not replace Creditcoin or Ethereum as the source of financial truth.

## Current boundary

Verd is a testnet prototype. The current evidence demonstrates the facility terms, reserve locker, Aave supply, authenticated proof path, and preferred-rate activation for a recorded facility. It does not establish:

- Mainnet readiness or production safety,
- an independent security audit,
- a freshly deployed public registration path,
- a completed draw, repayment, and reserve-release lifecycle for a new facility,
- repayment-gated release across Creditcoin and Ethereum.

See [recorded evidence](docs/VERIFIED_EVIDENCE.md) and [implementation status](docs/implementation-status.md) before relying on any testnet record.

## Run locally

You need Node.js 20 or newer and Foundry. Keep private keys, database URLs, and internal secrets in a local `.env` file. The checked-in [.env.example](.env.example) contains variable names without secret values.

```bash
npm ci
cp .env.example .env
npm run typecheck
npm test
npm start
```

Run the web interface separately during local development:

```bash
npm run dev:web -- --host 127.0.0.1
```

Set `VITE_VERD_WORKER_URL` when the browser should use a local or newly deployed worker. The interface reads facility state from CC3 and keeps wallet transactions behind explicit connected-wallet actions.

Build the Solidity contracts directly with:

```bash
npm run build:contracts
```

## HTTP API

The worker exposes a small authenticated API for proof jobs.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/health` or `/healthz` | Service and database readiness |
| `POST` | `/public/qualification-jobs` | Register a borrower-signed qualification or locker-binding job |
| `POST` | `/qualification-jobs` | Register a job with internal service authentication |
| `GET` | `/job-status/:jobId` | Read persisted progress and evidence fields |
| `POST` | `/internal/tick` | Advance one job through the proof workflow |

Internal `POST` routes require the configured internal secret or bearer token. The public registration route requires a short-lived borrower wallet signature and never accepts the internal worker secret. A job is keyed by `facilityId` plus `sourceTxHash`. Re-registering the same pair is safe, while conflicting durable hints are rejected.

See the [backend API guide](docs/BACKEND_API.md) for request shapes and authentication boundaries.

## Repository map

| Directory | Contents |
| --- | --- |
| `contracts/creditcoin/` | Verd facility, locker binding, proof validation, and lifecycle state |
| `contracts/ethereum/` | Sepolia `ReserveLocker` and `ReserveLockerFactory` |
| `src/` | TypeScript worker, HTTP server, chain gateway, configuration, and Postgres store |
| `scripts/` | Deployment, live verification, and recovery helpers |
| `test/` | Contract, worker, and recovery tests |
| `docs/` | Public guides, architecture, live evidence, and implementation status |
| `.github/workflows/` | Reproducible CI checks |

## Verification

The local suites cover contract behavior, receipt handling, proof progression, submission intent, nonce recovery, restart recovery, and duplicate prevention. Passing local tests does not prove Mainnet readiness, hosted service availability, or a complete cross-chain maturity flow.

The Render Free Postgres record has a provider expiry of 2026-09-27. Longer-lived operation needs an explicit renewal or paid-database decision.

## License

Released under the [MIT License](LICENSE).
