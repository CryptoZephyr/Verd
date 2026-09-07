# Verd facility core

Status: The facility contract, authenticated cross-chain path, worker integration, and public interface are implemented within the current testnet boundary. See [implementation status](implementation-status.md) for the current evidence limits.

## Facility contract

`contracts/creditcoin/Verd.sol` implements one fixed-term facility per `facilityId`.

The contract stores and exposes:

- lender and borrower
- principal and outstanding principal
- standard, preferred, and current APR in basis points
- accrued interest and the last accrual timestamp
- maturity and qualification deadline
- required reserve amount and the authenticated ReserveLocker
- the factory binding proof ID, source block, and unlock time
- funded, drawn, preferred-rate, repaid, and release evidence state
- the Aave Supply qualification proof and source-block evidence

The constructor fixes the USC proof verifier, the approved Sepolia `ReserveLockerFactory`, and the approved Aave Pool, WETH, and aWETH addresses. Facility creation stores the terms without making a cross-chain contract call. The borrower-created factory event is proven to CC3 before Verd binds the locker. The binding checks the factory event against the facility and approved Aave configuration and allows each locker to belong to only one facility.

## Actions and invariants

- Only the lender can fund, and funding must equal the exact principal.
- Only the borrower can draw a funded facility, and it can be drawn once before maturity.
- Interest accrues from the last timestamp using basis points and a 365-day year.
- Repayment is borrower-only, available at or after maturity, and must equal outstanding principal plus accrued interest.
- State is updated before native value transfers and protected against reentrancy.
- Preferred-rate activation requires an authenticated factory locker binding and the existing Aave Supply proof path.
- The standard APR is accrued before the preferred APR changes future accrual.
- Proof IDs are single-use, and a locker cannot be bound to two facilities.

## Event coverage

Contract event coverage is complete. `Verd` emits `FacilityCreated`, `ReserveLockerBound`, `FacilityFunded`, `FacilityDrawn`, `InterestAccrued`, `PreferredRateConditionActivated`, and `FacilityRepaid`. `ReserveLocker` emits `ReserveReleased`, and `ReserveLockerFactory` emits `ReserveLockerCreated`. Release truth belongs to `ReserveLocker`, so `Verd` does not duplicate that event.

## Validation evidence

```text
forge test -vv
42 passed, 0 failed, 0 skipped
```

The factory creation, binding, Supply, proof, qualification, and final-state records are summarized in [the public evidence record](VERIFIED_EVIDENCE.md). Historical test records remain in the repository for reproducibility but are not part of the product navigation.
