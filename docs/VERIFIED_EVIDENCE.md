# Recorded testnet evidence

This page records the external records currently used by the public interface. It is a testnet evidence record, not a production guarantee.

## Fresh complete facility record, verified 2026-09-08

- Verd: `0x37b858D0ADfDcBF851F17d87d69E02F7F9fA8328`
- Facility: `0xb1530a86a4ab63fe19f2777fb5f979ec7aaf0a3bd9ac108507783714fc50d136`
- Principal: `0.01 tCTC`
- Standard APR: `8.00%`
- Preferred APR: `5.00%`
- Required reserve: `0.0005 WETH`
- Maturity: CC3 timestamp `1788890595`
- Borrower and lender: `0x8b88E1E1174eDC65B08de75A5439f130da8A3DFd`
- ReserveLocker: `0xBC4dDb96c295058356F3D79dA71fD6011F1dD956`

| Record | Hash or block | Meaning |
| --- | --- | --- |
| Facility creation | `0x4de1bed1aacc73cbdb3d54abd47ef7d8497076446957e33473759559a2d90f40` | Fresh facility terms on CC3 |
| Locker creation | Sepolia block `11662381`, transaction `0x8d459e60f51824e4cb2254fbcb48dc21fefe188e8848365e7c5617625fa6c6e9` | Factory event and immutable locker configuration |
| Locker binding | `0xf975e011ac9d8a0d68b1f1515b4c27b33e1bd26172713a8f1e4ea81b02b2bab3` | CC3 binding of the authenticated locker |
| Facility funding | `0x3dadcf71ff53c1c16682c94f648628fe90a72ac745d371131c1fd54ce2658886` | Exact principal funded on CC3 |
| Aave Supply | `0xaeccbb4051fba1ec451e383694c1ed555ad53b81abbd2fa0181b005a14822d0b`, block `11662410` | Exact WETH reserve supplied to the locker |
| Qualification | `0xb3217820882bfaa525a408ab33d56e906748174ea9472575dccafb0ea94451a2` | Preferred Rate Condition activation |
| Draw | `0xce99f59b11d1b362305adb69e9aa5eb373226ed1a3651159fba22113a144460b` | Borrower draw at the preferred APR |
| Repayment | `0x1307c19d6b48ec550a06905f8c3d5f518ed15d4dc8275a815af2997293b84dec` | Exact post-maturity CC3 repayment |
| Reserve release | `0xb1567d3b3505be0bdcfb92f23751bda06a64ead73bd3c81506c4d4424f526bd4`, block `11662700` | Borrower-authorized Sepolia release; locker aToken balance is now zero |
| Release proof submission | `0x99dd91edc8b6b171f8f805a3b7fe450a68dbcbcd0468ae2b88887ba3824f1435` | Authenticated release proof accepted on CC3 |

The binding proof is `0xab452bb86b52de3409a886d958d5c57620cbe6d3f9cdc0e28163f64119fcda3d` from source block `11662381`. The qualification proof is `0xc9d9d5d00ab970a542d5fd1b92abc31f48cd4484f38f943421035ee6ec18e587` from source block `11662410`. The release proof is `0x98c198283a5201c70be777a89f849ab9fa2ef1c2a33ef658d1e004915c394408` from source block `11662700`, recording `0.0005 WETH` released from the configured locker.

Independent final readback confirmed `funded=true`, `drawn=true`, `preferredRateActive=true`, `repaid=true`, `reserveReleased=true`, facility state `Complete` (13), and locker aToken balance `0`.

## Worker evidence

Release job `job_4109aedc59d7f18ae4e3db00c8bf28d1fca156a70da034a5d4fcecf853bec909` completed after retryable Attestcoin waits. Final status was `completed`, `terminal=true`, `sourceBlock=11662700`, proof ID `0x98c198283a5201c70be777a89f849ab9fa2ef1c2a33ef658d1e004915c394408`, CC3 submission transaction `0x99dd91edc8b6b171f8f805a3b7fe450a68dbcbcd0468ae2b88887ba3824f1435`, and `retryCount=28`.

## Boundary

The complete sequence is verified on Creditcoin Testnet CC3 and Ethereum Sepolia only. ReserveLocker release remains borrower-authorized and time-based. Verd records an authenticated release proof after repayment and release, but the locker does not receive a protocol-enforced repayment signal. This record does not claim Mainnet readiness, production safety, or independent security audit coverage.

Inspect the [Creditcoin explorer](https://creditcoin-testnet.blockscout.com/address/0x37b858D0ADfDcBF851F17d87d69E02F7F9fA8328) and [Sepolia explorer](https://sepolia.etherscan.io/) before treating a record as current.

## Historical reference record

The earlier reference facility `0xfbef1da27e678746f384e2bd29d94b2063b2aac78a23e4983e88709a4d038de1` on Verd `0xc36768eca67D65C454bD52ebbE4954dFe8B81CF7` remains in the repository as historical evidence for the first proof path. It is not the public interface's current facility.
