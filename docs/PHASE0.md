# Verd Phase 0 evidence

Status: VERIFIED

Checked at: 2026-09-02T21:35:26.780Z

This record covers the live Phase 0 proof spike only. It predates the corrected Phase 3 and completed Phase 4 records. Render was left untouched during this Phase 0 record.

## Live networks

- Ethereum Sepolia, chain ID `11155111`
- Creditcoin CC3 Testnet, chain ID `102031`
- Borrower wallet, `0x8b88E1E1174eDC65B08de75A5439f130da8A3DFd`
- Source chain key, `1`

The private key remains in the ignored local `.env` file and is not part of this record.

## Source chain proof

Current Sepolia contracts used:

- Aave V3 Pool, `0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951`
- WETH, `0xC558DBdd856501FCd9aaF1E62eae57A9F0629a3c`
- aWETH, `0x5b071b590a59395fE4025A0Ccc1FcC931AAc1830`
- ReserveLocker, `0xD269208b704CfED4Dca096aAFbFC8F685e007B41`

The immutable locker configuration was read back from Sepolia and matched the borrower, Aave Pool, WETH, aWETH, and maturity values recorded in the state file. The locker held `500000000000000` wei of aWETH after the supply.

Public transaction evidence:

- ReserveLocker deployment, `0x52b264cc958e9dc65eac2f72fe3e15c702dec47fc95fceb2419c1fc45b9454eb`, block `11622142`, receipt status `1`
- WETH approval, `0xd6604feb5b8fede1f2d6221d9587a9069d70c1b8e5b7e7b9cdaf2dc27b3e2aa5`, block `11622143`, receipt status `1`
- Aave WETH supply, `0x4b6cd5bb2184eac4a3c3dfd9f7e787a5d5a78841be2740edf247faf65e99ba19`, block `11622145`, receipt status `1`

The source call and decoded Aave `Supply` event both matched these exact fields:

```text
asset/reserve       0xC558DBdd856501FCd9aaF1E62eae57A9F0629a3c
user                0x8b88E1E1174eDC65B08de75A5439f130da8A3DFd
onBehalfOf          0xD269208b704CfED4Dca096aAFbFC8F685e007B41
amount              500000000000000
referralCode       0
source tx.from      0x8b88E1E1174eDC65B08de75A5439f130da8A3DFd
source tx.to        0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951
receipt status      1
```

## Attestcoin and CC3 transition

The current SDK proof path used `@gluwa/usc-sdk@0.18.0` with `@gluwa/usc-contracts@0.2.0`. The proof service returned a proof for source block `11622145`, transaction index `69`, and the exact source transaction hash. The SDK native CC3 verifier returned `true`.

Current CC3 deployments:

- Official USC proof verifier wrapper, `0x018c883E0632D7a5754d15b7Da83A0e93554db03`, deployment `0xf6bd2a1a7c02b18df4f2bec1cf8f80216ca68eec4efbebb7d55f000bd290fa73`, block `5419693`, receipt status `1`
- Verd Phase 0 probe, `0x330507A63b09776f5a1dAb2E6EDdD7aE997DF336`, deployment `0x54d2a6b777843d4cdc7c9788ce3ec97ffec501dd3e4d2f3ee5471e85b0fca5c9`, block `5419694`, receipt status `1`

The stable proof ID is:

`0xf0a41e5f51532d8136ba18c332a3e69f77bc19cc57adce925b5b33f4662a8385`

The successful CC3 qualification was:

- Transaction, `0x8a03cca999dd7e1e1fe4cfe474f8bac4e03830ed1cd293b87e6486f6b9279bc1`
- Block, `5419698`
- Receipt status, `1`
- `preferredRateActive`, `true`
- `processedProof`, `true`
- Recorded amount, `500000000000000`
- Recorded source block, `11622145`

## Recovery and adversarial checks

- The worker persisted `proof_ready`, exited at the explicit interruption checkpoint `INTERRUPTED_BEFORE_CC3_SUBMISSION`, and resumed successfully.
- Wrong-borrower proof, `0xa041062dbdb73e88df66c90f38639a1c4028e684f04f167234e7c88cc5f6a97c`, block `5419685`, receipt status `0`. The worker read `processedProof=false` immediately after this negative call.
- Duplicate replay proof, `0x7f8104fe92046e2187df773d39bdf138c3da93d1e7e2bea58006dd19c6922d36`, block `5419699`, receipt status `0`. The final mapping remained `processedProof=true`.

The independent readback command is:

```text
npm run phase0:verify
```

It re-reads the Sepolia call and receipt, exact Aave event fields, locker immutables and aWETH balance, SDK native proof verification, CC3 deployment code, qualification event and state, the interruption marker, and both reverted adversarial receipts.

## Phase 0 result

```text
Gate 0, real WETH -> Aave V3 -> ReserveLocker -> Attestcoin -> CC3, PASS
Gate 1, immutable locker binding and future maturity guard, PASS
Gate 3, source success and exact Aave field authentication, PASS
Gate 5, negative proof, replay protection, interrupted/resumed worker, PASS
Render deployment, intentionally deferred
Phase 4 is complete. Phase 5 proof worker and Render Free backend verification is complete. Phase 6 frontend work has not started.
```
