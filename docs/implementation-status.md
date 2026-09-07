# Verd implementation status

Checked on 2026-09-07. This page describes the current product boundary in reader-facing terms. Internal work history is kept in project records rather than the public interface.

| Area | Status | Evidence |
| --- | --- | --- |
| Creditcoin facility core | verified in local contract tests | [Architecture](ARCHITECTURE.md), [Lifecycle](LIFECYCLE.md) |
| Sepolia ReserveLocker and factory | verified in local contract tests and recorded testnet evidence | [Deployments](DEPLOYMENTS.md), [Recorded evidence](VERIFIED_EVIDENCE.md) |
| Authenticated cross-chain proof path | recorded on Sepolia and CC3 for the reference facility | [Recorded evidence](VERIFIED_EVIDENCE.md) |
| Durable proof worker | verified in local worker and recovery tests | [Backend API](BACKEND_API.md), [Security model](SECURITY_MODEL.md) |
| Public web interface | implemented with responsive product, facility, creation, and documentation routes | [Public documentation map](DOCUMENTATION.md) |
| Contract and wallet actions | wired behind explicit wallet and network controls | [Quickstart](QUICKSTART.md), [Lifecycle](LIFECYCLE.md) |
| Full draw, maturity, repayment, and release record | not established by the current reference facility | [Recorded evidence](VERIFIED_EVIDENCE.md) |
| Browser-independent worker wake | not claimed without a configured and verified scheduler | [Architecture](ARCHITECTURE.md) |

## What is authoritative

Creditcoin and Ethereum are the sources of facility, rate, reserve, repayment, and release truth. Worker Postgres stores operational metadata for retries and observability. The browser displays the latest reads and does not create a parallel financial state.

## Deployment boundary

Verd remains testnet-only. The current public worker service must be checked at `/health` and `/` before relying on optional public job routes. No Mainnet deployment or production guarantee is claimed.

## Verification commands

```bash
npm run typecheck
npm test
npm run build:web
```

The frontend bundle still emits a size warning during production build. This is an optimization item, not a correctness result.
