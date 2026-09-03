# Security

Verd is a testnet hackathon prototype. Its contracts, worker, deployment, and operational setup have not received an independent security audit and must not hold production funds.

## Reporting a vulnerability

Please do not disclose a suspected vulnerability in a public issue. Use GitHub private vulnerability reporting for this repository when it is available, or contact the repository owner privately through GitHub with the affected file, reproduction steps, and the smallest safe proof of impact.

Do not include private keys, seed phrases, database credentials, tick secrets, wallet exports, or other credentials in a report.

## Scope

The in-scope surface includes:

- `contracts/creditcoin/`, including the proof-backed facility state transitions;
- `contracts/ethereum/`, including the immutable ReserveLocker and factory;
- `src/`, including the Postgres-backed worker and authenticated internal endpoint;
- `render.yaml` and deployment configuration that can affect secret handling or access control.

The current deployment is limited to Ethereum Sepolia, Creditcoin CC3 Testnet, and a Render Free testnet service. Mainnet funds, production availability, and repayment-gated reserve release are outside the current scope.

## Secret handling

Keep `.env`, private keys, database URLs, RPC credentials, and `INTERNAL_TICK_SECRET` outside Git. Use `.env.example` only as a public name-and-default template. Render secret values must be supplied through its environment configuration and must not be copied into source, logs, screenshots, or issue reports.

## Trust boundaries

Ethereum and Creditcoin remain authoritative. Postgres stores resumable worker metadata only and must never activate a rate or declare a facility qualified. The worker checks source receipts, authenticated proof state, and CC3 state before retrying a submission. A successful local test or a submitted transaction hash is not production security evidence.
