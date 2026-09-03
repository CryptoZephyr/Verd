# Verd implementation status

Checked on 2026-09-03. Status labels describe the evidence that exists for this checkout.

| Area | Status | Evidence |
| --- | --- | --- |
| Phase 0 live proof spike | verified, public testnet | [PHASE0.md](PHASE0.md) |
| ReserveLocker hardening | verified, local Foundry tests | [RESERVE_LOCKER.md](RESERVE_LOCKER.md) |
| Verd facility core | verified, local tests | [VERD_FACILITY.md](VERD_FACILITY.md) |
| Phase 3 factory-bound proof flow | verified, Sepolia and CC3 | [PHASE3.md](PHASE3.md) |
| Phase 4 adversarial and recovery checks | verified, local tests | [PHASE4.md](PHASE4.md) |
| Phase 5 proof worker and backend | verified, Render Free testnet service | [PHASE5.md](PHASE5.md) |
| Frontend and Phase 6 | not started | UI design remains owner-controlled |
| Full repayment and reserve-release lifecycle | not verified | Requires a fresh facility and post-maturity evidence |
| Browser-independent wake scheduling | future | Authenticated manual ticks were used for the current gate |

## Verified Phase 5 boundary

The deployed worker uses durable Postgres metadata, a facility-plus-source idempotency key, authenticated wake calls, source receipt validation, bounded Attestcoin steps, proof SDK verification, authoritative CC3 readback, and persisted submission intent.

The live idempotency check used the already-qualified Phase 3 facility. The worker reconciled the existing CC3 proof and deliberately sent no new CC3 qualification transaction. The send, nonce, receipt, and recovery path is covered by the local Phase 5 tests.

## Deployment limitation

The worker reuses the existing Render Free Postgres instance `vocap-sepolia-postgres` in an isolated `verd_phase5_qualification_jobs` table. The provider expiry recorded for that database is 2026-09-27. Longer-lived operation needs a renewal or paid-database decision.

Verd remains testnet-only. No Mainnet deployment or production guarantee is claimed.
