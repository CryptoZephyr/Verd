# Verd implementation status

Checked on 2026-09-08. This page describes the current product boundary in reader-facing terms. Internal work history is kept in project records rather than the public interface.

| Area | Status | Evidence |
| --- | --- | --- |
| Creditcoin facility core | verified in local contract tests | [Architecture](ARCHITECTURE.md), [Lifecycle](LIFECYCLE.md) |
| Sepolia ReserveLocker and factory | verified in local contract tests and historical testnet evidence | [Deployments](DEPLOYMENTS.md), [Recorded evidence](VERIFIED_EVIDENCE.md) |
| Authenticated cross-chain proof path | verified on Sepolia and CC3 for the historical completed facility | [Recorded evidence](VERIFIED_EVIDENCE.md) |
| Durable proof worker | verified in local worker and recovery tests | [Backend API](BACKEND_API.md), [Security model](SECURITY_MODEL.md) |
| Public web interface | implemented with responsive product, facility, creation, and documentation routes | [Public documentation map](DOCUMENTATION.md) |
| Contract and wallet actions | wired behind explicit wallet and network controls | [Quickstart](QUICKSTART.md), [Lifecycle](LIFECYCLE.md) |
| Active public reference | funded and awaiting borrower action on the repayment-safe contract | [Deployments](DEPLOYMENTS.md), [Recorded evidence](VERIFIED_EVIDENCE.md) |
| Full draw, maturity, repayment, and release record | verified on testnet for the historical facility, not inherited by the active reference | [Recorded evidence](VERIFIED_EVIDENCE.md) |
| Browser-independent worker wake | implemented as a server-side interval and covered by worker tests. End-to-end autonomous progression on the active reference has not been claimed. | [Architecture](ARCHITECTURE.md), [Backend API](BACKEND_API.md) |

## What is authoritative

Creditcoin and Ethereum are the sources of facility, rate, reserve, repayment, and release truth. Worker Postgres stores operational metadata for retries and observability. The browser displays the latest reads and does not create a parallel financial state.

## Deployment boundary

Verd remains testnet-only. The current public worker service must be checked at `/health` and `/` before relying on optional public job routes. No Mainnet deployment, production guarantee, or independent security audit is claimed.

## Verification commands

```bash
npm run typecheck
npm test
npm run build:web
```

The frontend bundle still emits a size warning during production build. This is an optimization item, not a correctness result.
