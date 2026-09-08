# ReserveLocker hardening

Status: The immutable locker boundary and release invariants are covered by the local contract suite and the current testnet integration.

## Contract boundary

`contracts/ethereum/ReserveLocker.sol` holds the configured Aave aToken position for one Verd facility. The following deployment values are immutable:

- borrower
- approved Aave Pool
- reserve asset
- aToken
- unlock time

The constructor rejects zero addresses and rejects an unlock time at or before deployment. The locker has no owner, admin withdrawal, upgrade path, arbitrary call path, `delegatecall`, or payable fallback.

## Release invariants

- Only the configured borrower can call `release`.
- Release reverts before the immutable unlock time, including for the borrower.
- Release is allowed at and after the unlock time.
- Release transfers the complete current aToken balance to the borrower and returns the amount.
- A zero balance cannot be released.
- A token transfer that returns `false` reverts and leaves the locker balance unchanged.
- A release reentrancy guard prevents a configured token from starting a second release during the first transfer.

The public immutable getters, `aTokenBalance()`, and `ReserveReleased` event provide the configuration and balance evidence needed by the Evidence drawer.

## Validation evidence

The focused Foundry suite is `test/ReserveLocker.t.sol`.

```text
forge test -vv
11 passed, 0 failed, 0 skipped
```

The suite covers constructor validation, immutable configuration reads, pre-maturity ownership and release failures, exact-maturity release, post-maturity borrower-only release, zero balance, failed token transfers, reentrancy, and unknown selectors for token transfers, setters, admin withdrawal, ownership, upgrades, and payable value.

The hardening cycle first produced the intended red failures for past or current unlock times and reentrant transfer behavior. After the constructor guard and release guard were added, the complete 11-test suite passed.

## Remaining gates

- Official Sepolia Aave address validation and facility-to-locker binding belong in deployment and facility-core validation. This generic locker currently rejects zero addresses but does not hard-code a network-specific address registry.
- The current fresh testnet facility released `0.0005 WETH` from locker `0xBC4dDb96c295058356F3D79dA71fD6011F1dD956` in transaction `0xb1567d3b3505be0bdcfb92f23751bda06a64ead73bd3c81506c4d4424f526bd4` at Sepolia block `11662700`, and the remaining aToken balance is `0`.
- The Ethereum lock is time-based and independent of repayment. Verd records repayment first and authenticates the later release on CC3, but the locker itself does not enforce repayment gating.
