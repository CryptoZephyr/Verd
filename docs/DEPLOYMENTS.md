# Deployments and addresses

Verd currently targets testnet networks only.

## Creditcoin Testnet CC3

| Resource | Value |
| --- | --- |
| Chain ID | `102031` |
| RPC | `https://rpc.cc3-testnet.creditcoin.network/` |
| Explorer | `https://creditcoin-testnet.blockscout.com/` |
| Native asset | `tCTC` |
| Verd | `0x73E1d4c5496eC0b39Bdb8765376e65e3576429cf` |

### Active public reference

The active CC3 contract was deployed on 2026-09-08 with repayment timing-buffer behavior. Its deployment transaction is `0xfc939fc4f376f9488c7155c5955b6a636172922e20cc76a1a7617b2930900632`.

The public reference facility is `0xd5b7da6a049be8a09cc7183035dac4701385e35a497cdde1dc9f47d889a92a09`. It was created in CC3 block `5454283` by transaction `0x5edcf4960736f1d14ff095875bdef5fe33f7d26f05a8b9969827e36f0f549a01`, then funded in block `5454284` by transaction `0xa2415051199fde7edb78678f15d29b5faa35c870860ee12d4f0f553e2161a6a6`.

At publication it is funded and awaiting the borrower action. It has no locker, reserve supply, cross-chain proof, draw, repayment, or reserve-release evidence. The public interface must read its current state from CC3 and must never attach historical evidence to it.

### Historical completed evidence

The previous CC3 contract at `0x37b858D0ADfDcBF851F17d87d69E02F7F9fA8328` contains the completed historical reference facility `0xb1530a86a4ab63fe19f2777fb5f979ec7aaf0a3bd9ac108507783714fc50d136`. Its lifecycle evidence remains available for inspection in the documentation. Facilities and evidence do not move between contract deployments.

## Ethereum Sepolia

| Resource | Value |
| --- | --- |
| Chain ID | `11155111` |
| RPC | `https://ethereum-sepolia-rpc.publicnode.com` |
| Explorer | `https://sepolia.etherscan.io/` |
| Native asset | `ETH` |
| ReserveLockerFactory | `0x018c883E0632D7a5754d15b7Da83A0e93554db03` |
| Aave V3 Pool | `0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951` |
| WETH | `0xC558DBdd856501FCd9aaF1E62eae57A9F0629a3c` |
| aWETH | `0x5b071b590a59395fE4025A0Ccc1FcC931AAc1830` |

## Worker service

The testnet worker is available at the [testnet worker endpoint](https://verd-phase5-worker.onrender.com). It uses a Render web service and Postgres metadata. The service receives its active Verd address through hosted configuration, starts a safe interval after its current source deploys, and must be checked through its public health endpoint before integration claims are made.

## Frontend

The public testnet interface is deployed at [verd-credit.vercel.app](https://verd-credit.vercel.app). It is a Vite and React frontend with deep-linked product, documentation, privacy, and terms routes.

## Boundary

These addresses are testnet evidence. They are not Mainnet configuration. The Render Free Postgres record has a provider expiry of 2026-09-27, so longer-lived operation needs an explicit renewal or paid-database decision.
