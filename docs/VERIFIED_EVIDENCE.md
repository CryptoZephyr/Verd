# Recorded testnet evidence

This page records the external records currently used by the public interface. It is a testnet evidence record, not a production guarantee.

## Reference facility

- Verd: `0xc36768eca67D65C454bD52ebbE4954dFe8B81CF7`
- Facility: `0xfbef1da27e678746f384e2bd29d94b2063b2aac78a23e4983e88709a4d038de1`
- Principal: `0.1 tCTC`
- Standard APR: `10.00%`
- Preferred APR: `5.00%`
- Required reserve: `0.0005 WETH`
- Borrower and lender: `0x8b88E1E1174eDC65B08de75A5439f130da8A3DFd`

## External records

| Record | Hash or block | Meaning |
| --- | --- | --- |
| Locker creation | Sepolia block `11622889` | Factory event and immutable locker configuration |
| Locker binding | `0xcb29abc0f8374614e35abb4cee118d79741f617859813e8fdbda102b1ac09b98` | CC3 binding of the authenticated locker |
| Aave Supply | `0x47c44c7acd76c34e9b9d2e45f7601690eaa754dae6aff41778c347dad8120346` | Exact WETH reserve supplied to the locker |
| Qualification | `0x1a60bd280b0d18ee41e356cfe5d9aa1f5fded93b8c8b12561fbcbe0ed4ef9fef` | Preferred Rate Condition activation |
| Supply source block | Sepolia block `11622931` | Source receipt and Aave event |

The recorded binding proof is `0x690753973f0c3eb194d019aaa885974342a0f73384dad713fbe8bd62d9719a7b`. The recorded qualification proof is `0xecf7b48177ca61de7449400db6318d799c005b3322e4a858bc4e016efbd395e6`.

## Current boundary

The reference facility is funded, has the preferred condition active, and matured without being drawn. The current record does not claim a completed draw, repayment, reserve release, or full completion state. Those records require a fresh lifecycle run and independent readback.

Inspect the [Creditcoin explorer](https://creditcoin-testnet.blockscout.com/address/0xc36768eca67D65C454bD52ebbE4954dFe8B81CF7) and [Sepolia explorer](https://sepolia.etherscan.io/) before treating a record as current.
