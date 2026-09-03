# Phase 3, factory-bound locker and preferred-rate proof

Status: verified end to end on Sepolia and CC3. Phase 4 adversarial and recovery verification is complete. Current engineering gate: Phase 5, proof worker and Render Free backend. No Phase 5 deployment work has started.

## Corrected cross-chain architecture

`contracts/ethereum/ReserveLockerFactory.sol` fixes the Sepolia Aave configuration at deployment. The borrower can create one `ReserveLocker` for a facility, and the factory emits `ReserveLockerCreated` with the facility ID, locker, borrower, Aave Pool, reserve asset, aToken, and unlock time.

`contracts/creditcoin/Verd.sol` stores the approved factory and Aave configuration. `bindReserveLocker` authenticates the factory creation transaction through the official USC proof verifier and EVM decoder. It requires the transaction sender to be the facility borrower, the destination to be the approved factory, a successful receipt, the exact factory event emitter and signature, the exact facility ID and borrower, the approved Aave configuration, and an unlock time at or after facility maturity. Verd records the binding proof and source block and prevents the locker from being bound to another facility.

`qualifyFacility` then uses the existing Aave Supply proof path. It requires the authenticated locker binding, verifies the Sepolia Supply transaction and receipt, checks the Aave Pool emitter and Supply fields, checks the exact reserve, borrower, locker, referral code, and reserve amount, rejects proof replay, accrues the standard APR to the qualification timestamp, and activates the preferred APR for future interest.

## Local verification

The complete Foundry suite passed after the architecture update.

```text
forge test -vv
42 passed, 0 failed, 0 skipped
```

The focused suites cover 11 ReserveLocker tests, 9 facility-core tests, 6 factory and binding tests, and 16 proof qualification tests. `node --check scripts/phase3-live.mjs` also passed.

## Live evidence

The same wallet address was used on Sepolia and CC3. The runner wrapped `0.0005` Sepolia ETH into WETH because the wallet began with zero WETH, then completed the two proof-backed steps.

```text
wallet=0x8b88E1E1174eDC65B08de75A5439f130da8A3DFd
factory=0x018c883E0632D7a5754d15b7Da83A0e93554db03
reserveLocker=0xe88d7D1F5107e0F754cf66a1d5f7EC348Ef23454
verd=0xc36768eca67D65C454bD52ebbE4954dFe8B81CF7
facilityId=0xfbef1da27e678746f384e2bd29d94b2063b2aac78a23e4983e88709a4d038de1
```

The factory creation transaction is `0x5e83f49b8193efd93a1e8bdf806a052816b75edb09b9fc3d4e240e693265ff62` in Sepolia block `11622889`. The authenticated factory proof ID is `0x690753973f0c3eb194d019aaa885974342a0f73384dad713fbe8bd62d9719a7b`, and the CC3 binding transaction is `0xcb29abc0f8374614e35abb4cee118d79741f617859813e8fdbda102b1ac09b98`.

The locker creation event and immutable reads matched the approved Sepolia Aave Pool `0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951`, WETH `0xC558DBdd856501FCd9aaF1E62eae57A9F0629a3c`, aWETH `0x5b071b590a59395fE4025A0Ccc1FcC931AAc1830`, borrower, facility ID, and unlock time `1788400050`. The factory proof passed a fresh CC3 BlockProver readback.

Verd was deployed on CC3 at `0xc36768eca67D65C454bD52ebbE4954dFe8B81CF7` in transaction `0x8519d2cab529522e9d3820de0f8c6a43d4db5a526e0b24fc769b3285e7742a6a`. The facility creation transaction is `0x113e1bcc6a318d93f096c9a26470d8a5c678eacdeb6a1fefc3df1aa2599e53b0`, and the facility funding transaction is `0xadc2438c72d68057b361fdc530e2d425f1b4c730c6b12117ae707023017b7ca5`.

The Aave Supply transaction is `0x47c44c7acd76c34e9b9d2e45f7601690eaa754dae6aff41778c347dad8120346` in Sepolia block `11622931`. It supplied exactly `500000000000000` WETH to the authenticated locker, with the expected borrower, reserve, Pool emitter, and referral code `0`. The fresh supply proof ID is `0xecf7b48177ca61de7449400db6318d799c005b3322e4a858bc4e016efbd395e6`, and the qualification transaction is `0x1a60bd280b0d18ee41e356cfe5d9aa1f5fded93b8c8b12561fbcbe0ed4ef9fef`.

Final CC3 readback confirmed `preferredRateActive=true`, `currentAprBps=500`, facility state `PreferredRateConditionActive`, the factory proof marked processed, the supply proof marked processed, the exact locker bound to the facility, and both proof IDs accepted by the CC3 BlockProver. The public checkpoint is `.phase3-factory-state.json`.

The previous direct-cross-chain locker attempt remains preserved in `.phase3-state.json` as historical evidence. It was not reused. Render configuration was not touched.
