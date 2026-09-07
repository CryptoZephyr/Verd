# Facility lifecycle

Verd presents one facility journey from terms to repayment and reserve release.

## Product sequence

1. Create terms.
2. Fund the exact principal.
3. Create the facility-specific ReserveLocker.
4. Bind the locker through the authenticated factory event.
5. Supply the required WETH reserve to Aave.
6. Register and track source verification.
7. Activate the Preferred Rate Condition after authoritative proof readback.
8. Draw before maturity.
9. Accrue and repay at or after maturity.
10. Release the time-unlocked reserve.
11. Confirm completion from external records.

## State vocabulary

The interface may show Draft, Funding pending, Awaiting borrower action, Qualification in progress, Preferred Rate Condition active, Drawn standard, Drawn preferred, Active, Qualification expired, Matured, Repayment pending, Repaid, Reserve releasable, Complete, and Failed with recovery required.

These are readable labels over contract and worker fields. They are not a second state machine.

## Interest

```text
interestDelta = outstandingPrincipal * currentRateBps * elapsed
                / (10,000 * 31,536,000)
```

The contract accrues the existing rate before preferred-rate activation and before repayment. Preferred APR changes future accrual only.

## Maturity boundary

Draw is unavailable at or after maturity. Repayment is due at or after maturity and must equal the contract's calculated outstanding amount. The interface's estimate is guidance. The contract is authoritative.

## Reserve release boundary

ReserveLocker release is borrower-authorized and time-based. The current contract does not receive a repayment message from Creditcoin. The product may sequence repayment before release, but it must not claim that the locker enforces repayment gating.
