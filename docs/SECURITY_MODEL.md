# Security model

Verd is a testnet prototype. It has no independent security audit and should not be used with production funds.

## Trust boundaries

| Component | Trust responsibility |
| --- | --- |
| Creditcoin | Facility terms, lifecycle, rates, proof replay, repayment |
| Ethereum Sepolia | Locker configuration, Aave receipt, aToken position, time-based release |
| Attestcoin | Authenticated source inclusion and proof output |
| Worker | Operational progression, retries, and evidence persistence |
| Browser | User presentation, wallet requests, and explicit transactions |

## Validation controls

- Exact borrower and role checks.
- Approved factory, Aave Pool, WETH, and aWETH checks.
- Factory event and immutable locker configuration checks.
- Source receipt success and expected event checks.
- Exact reserve amount and locker beneficiary checks.
- Qualification deadline and maturity checks.
- Single-use proof identifiers.
- Durable submission intent and nonce reconciliation.
- Authoritative readback before a final UI confirmation.

## Failure classes

Retryable failures include RPC timeouts, attestation still pending, proof-builder timeouts, browser restarts, and ambiguous submission responses. Terminal failures include a reverted source transaction, wrong emitter or asset, wrong borrower or locker, insufficient amount, invalid or reused proof, and an expired deadline.

The worker preserves the source transaction and last safe state. The browser must not ask the user to repeat a completed Aave supply after a downstream timeout.

## Secret handling

Private keys, database URLs, proof-builder credentials, and the internal tick secret belong in local or hosted secret configuration. The public browser registration route uses a short-lived borrower wallet signature and never accepts the internal worker secret.

## Known boundary

The Ethereum lock is time-based and independent of a CC3 repayment signal. A repayment-gated release requires a separate cross-chain feature and a new security review.
