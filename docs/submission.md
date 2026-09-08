# Verd public product and evidence record

## One-line summary

Verd gives a working-capital borrower access to a preferred Creditcoin rate after an authenticated Ethereum reserve action is completed and held in a facility-specific ReserveLocker.

## Why the integration matters

Verd runs facility and APR state on Creditcoin CC3. The borrower creates a ReserveLocker on Ethereum Sepolia, supplies the approved WETH reserve to Aave V3 with that locker as `onBehalfOf`, and Attestcoin proves the source-chain event to CC3. Verd authenticates the factory-created locker configuration, binds it to exactly one facility, validates the Aave Supply receipt, and changes future interest accrual to the preferred APR.

## Public verification path

1. Read the [architecture](ARCHITECTURE.md) and [lifecycle](LIFECYCLE.md).
2. Review the [recorded testnet evidence](VERIFIED_EVIDENCE.md).
3. Check the worker [health endpoint](https://verd-phase5-worker.onrender.com/health) and root response before relying on public job routes.
4. Review the [backend API](BACKEND_API.md) and [security model](SECURITY_MODEL.md).
5. Open the public web interface and follow explorer links from the evidence surface.

## Technical evidence

- Foundry contract suite: 47 passing tests.
- Recovery suite: 6 passing tests.
- TypeScript worker suite: 10 passing tests.
- Frontend production build and TypeScript checks pass.
- Render web service and durable Postgres metadata are configured for testnet operation.

## Scope and limitations

The current implementation is testnet-only. It does not claim Mainnet readiness or independent security audit coverage. The active public reference is funded and awaiting borrower action. The complete lifecycle record, including locker binding, reserve supply, preferred-rate activation, draw, post-maturity repayment, reserve release, and the final Complete state, belongs to the historical Verd contract documented in [recorded evidence](VERIFIED_EVIDENCE.md).

The public worker deployment must be checked for its current route set before browser job registration is assumed. The Render Free database has a recorded provider expiry of 2026-09-27. The Ethereum lock remains time-based and does not receive an automatic repayment signal from Creditcoin. Verd records the release proof on CC3 after the borrower-authorized source release.

## Repository map

- `contracts/ethereum/`, ReserveLocker and ReserveLockerFactory.
- `contracts/creditcoin/`, Verd facility and proof validation.
- `src/`, resumable worker, Postgres store, chain gateway, and HTTP server.
- `web/`, public product and documentation interface.
- `test/`, Solidity, recovery, and worker tests.
- `docs/`, public architecture, guides, references, security, and evidence.

The repository is released under the [MIT License](../LICENSE).
