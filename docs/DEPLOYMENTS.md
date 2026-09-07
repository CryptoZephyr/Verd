# Deployments and addresses

Verd currently targets testnet networks only.

## Creditcoin Testnet CC3

| Resource | Value |
| --- | --- |
| Chain ID | `102031` |
| RPC | `https://rpc.cc3-testnet.creditcoin.network/` |
| Explorer | `https://creditcoin-testnet.blockscout.com/` |
| Native asset | `tCTC` |
| Verd | `0xc36768eca67D65C454bD52ebbE4954dFe8B81CF7` |

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

The recorded testnet worker is available at the [testnet worker endpoint](https://verd-phase5-worker.onrender.com). It uses a Render web service and Postgres metadata. The service's public route set must be checked from its current root and health responses before integration claims are made.

## Frontend

The public testnet interface is deployed at [verd-credit.vercel.app](https://verd-credit.vercel.app). It is a Vite and React frontend with deep-linked product, documentation, privacy, and terms routes.

## Boundary

These addresses are testnet evidence. They are not Mainnet configuration. The Render Free Postgres record has a provider expiry of 2026-09-27, so longer-lived operation needs an explicit renewal or paid-database decision.
