# Verd hackathon submission record

## One-line summary

Verd gives a working-capital borrower a preferred Creditcoin rate after an authenticated Ethereum reserve action is completed and held in a facility-specific ReserveLocker.

## Why the integration matters

Verd runs the facility and APR state on Creditcoin CC3. The borrower creates a ReserveLocker on Ethereum Sepolia, supplies the approved WETH reserve to Aave V3 with that locker as `onBehalfOf`, and Attestcoin proves the source-chain event to CC3. Verd authenticates the factory-created locker configuration, binds it to exactly one facility, validates the Aave Supply receipt, and changes future interest accrual to the preferred APR.

## Verified demo path

1. Read the corrected factory-bound architecture and live contract evidence in [PHASE3.md](PHASE3.md).
2. Review the adversarial and recovery coverage in [PHASE4.md](PHASE4.md).
3. Open the deployed backend at [verd-phase5-worker.onrender.com](https://verd-phase5-worker.onrender.com) and check `/health`.
4. Review the restart, durable Postgres, proof, and idempotency evidence in [PHASE5.md](PHASE5.md).

## Technical evidence

- Foundry contract suite, 45 passing tests.
- Recovery suite, 6 passing tests.
- TypeScript Phase 5 suite, 7 passing tests after the registration-conflict and runtime-configuration hardening in this release.
- Render Free Web Service `verd-phase5-worker` in Frankfurt.
- Durable Postgres table `verd_phase5_qualification_jobs`.
- Live health response confirms the database and worker are ready, while `phase6Started=false`.

## Scope and limitations

The current implementation is testnet-only. It does not claim Mainnet readiness, independent security audit coverage, production availability, repayment-gated Ethereum release, frontend completion, or full lifecycle evidence.

The deployed idempotency check used the already-qualified Phase 3 facility, so it deliberately created no new CC3 qualification transaction. Local tests cover the actual send and receipt-recovery path. The external wake scheduler remains future work, and the Render Free database has a recorded expiry of 2026-09-27.

## Repository map

- `contracts/ethereum/`, ReserveLocker and ReserveLockerFactory.
- `contracts/creditcoin/`, Verd facility and proof validation.
- `src/`, resumable worker, Postgres store, chain gateway, and HTTP server.
- `test/`, Solidity, recovery, and worker tests.
- `docs/`, phase evidence and implementation status.

The repository is released under the [MIT License](../LICENSE).
