# Verd architecture

Verd is a testnet working-capital protocol with two on-chain execution domains, one proof service, and one role-aware product interface.

## System boundary

The facility agreement lives on Creditcoin Testnet CC3. The reserve commitment lives on Ethereum Sepolia. Attestcoin carries authenticated source-chain evidence to Creditcoin. The browser presents current state and offers the next valid action, but it does not create protocol truth.

```text
Lender creates and funds a facility on CC3
        |
Borrower creates a facility-specific ReserveLocker on Sepolia
        |
Borrower supplies WETH to Aave with the locker as onBehalfOf
        |
Worker validates the source receipt and obtains an Attestcoin proof
        |
Verd binds the locker and activates the preferred rate on CC3
        |
Borrower draws, repays at maturity, and releases the time-unlocked reserve
```

## Components

### Verd on Creditcoin

`contracts/creditcoin/Verd.sol` creates and stores facilities, enforces lender and borrower roles, tracks funding and draw state, accrues interest, authenticates the locker and Aave proof path, activates the Preferred Rate Condition, and records repayment evidence.

Creditcoin is authoritative for facility terms, rate state, funding, draw, repayment, locker binding, and proof replay state.

### ReserveLocker on Ethereum Sepolia

`contracts/ethereum/ReserveLocker.sol` holds the Aave aToken position for one facility. Borrower, Aave Pool, reserve asset, aToken, and unlock time are immutable. The contract has no admin withdrawal, arbitrary call path, upgrade path, or pre-maturity release path.

The locker enforces borrower authorization and time. It does not receive an automatic repayment signal from Creditcoin.

### ReserveLockerFactory

`contracts/ethereum/ReserveLockerFactory.sol` creates one locker for one facility and emits `ReserveLockerCreated`. The worker proves that event and Verd checks the event against the facility borrower, facility ID, approved factory, Aave configuration, locker address, and unlock time.

### Attestcoin proof worker

The TypeScript worker resolves source receipts, waits for attestation, generates and verifies proofs, submits destination transactions, and reads back authoritative state. Postgres stores operational metadata such as job progress, source blocks, proof IDs, submission intent, retries, and error categories. It never replaces on-chain truth.

### Facility Workspace

The React interface reads CC3 and Sepolia state, guides wallet and network changes, signs public job registrations, polls worker status, and exposes an evidence drawer. It keeps financial terms and the next valid action ahead of raw protocol details.

## Data authority

| Layer | Authoritative for | Not authoritative for |
| --- | --- | --- |
| Creditcoin | Facility state, rates, funding, draw, repayment, locker binding | Ethereum receipt details |
| Ethereum Sepolia | Locker configuration, Aave receipt, aToken position, release | Creditcoin repayment state |
| Proof worker | Job progress, retries, evidence references | Facility balance or rate |
| Browser | Presentation and explicit user actions | Any protocol truth |

## Recovery model

The worker advances one safe step at a time. It persists the facility and source transaction idempotency key, checks source receipts before repeating source work, checks CC3 state before repeating proof submission, and reuses durable submission intent when a response is ambiguous.

Retryable infrastructure failures preserve evidence. Terminal validation failures stop without inviting a blind repeat. A borrower must never be asked to repeat a completed Aave supply because proof submission timed out.

## Maturity and release

The facility becomes due at maturity. Repayment is a CC3 action. The ReserveLocker unlocks at its immutable time and can then be released by the borrower. The worker verifies the release receipt and submits `recordReserveRelease` so CC3 can expose an authenticated completion record. The current contracts do not enforce a cross-chain repayment signal at the Ethereum lock, so product copy must describe this as sequencing and proof-backed recording rather than protocol-enforced repayment gating.

## Deployment topology

- Creditcoin Testnet: Verd contract and Attestcoin verifier path.
- Ethereum Sepolia: ReserveLockerFactory, ReserveLocker instances, Aave V3 Pool, WETH, and aWETH.
- Backend: Node.js and TypeScript web service with durable Postgres metadata.
- Frontend: Vite, React, and React Router with deep-linkable product and documentation routes.

The current deployment is testnet-only and has no independent security audit. See [deployments](DEPLOYMENTS.md), [security model](SECURITY_MODEL.md), and [verified evidence](VERIFIED_EVIDENCE.md) for the current boundary.
