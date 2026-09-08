# Phase 4, adversarial and recovery verification

Status: complete locally after the corrected proof path passed. Current worker deployment and fresh lifecycle evidence are recorded in [PHASE5.md](PHASE5.md) and [VERIFIED_EVIDENCE.md](VERIFIED_EVIDENCE.md).

## Adversarial coverage

The Solidity tests cover the source proof and factory binding boundaries:

- fake Aave emitter rejected
- wrong WETH or reserve asset rejected
- wrong source borrower rejected
- wrong locker rejected
- a locker already bound to another facility rejected
- insufficient Supply amount rejected
- reverted source transaction rejected
- duplicate proof rejected
- duplicate Preferred Rate Condition execution rejected
- expired proof submission rejected
- pre-maturity ReserveLocker release rejected
- past interest is not repriced when the preferred APR activates
- the same proof cannot affect multiple facilities

Factory-specific tests also cover borrower-only locker creation, immutable Aave configuration, one factory record per facility, wrong factory event emitter, wrong facility ID, and an unlock time before facility maturity.

## Recovery coverage

`scripts/phase4-recovery.mjs` is a minimal persisted state machine for the proof workflow. It preserves facility and source transaction idempotency fields, separates retryable infrastructure failures from terminal validation failures, and returns a safe next action after reload.

The Node test suite covers:

- source transaction pending state resuming at Attestcoin wait
- Attestcoin wait resuming at proof generation
- proof-builder timeout retry without a duplicate CC3 submission
- CC3 submission timeout checking the existing transaction hash first
- terminal validation failure refusing blind retry
- browser reload preserving the safe next action and submission hash

## Verification evidence

```text
forge test -vv
45 passed, 0 failed, 0 skipped

npm run phase4:recovery
6 passed, 0 failed, 0 skipped

node --check scripts/phase3-live.mjs
node --check scripts/phase4-recovery.mjs
forge build
passed with existing block-timestamp and checked-cast lint warnings
```

Phase 4 itself covers adversarial and recovery behavior. The current Render worker and public frontend are documented separately. The fresh testnet lifecycle is verified in the current evidence record.
