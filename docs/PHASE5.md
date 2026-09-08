# Phase 5, resumable proof worker and Render backend

Status: verified on Render Free and exercised through binding, qualification, and reserve-release jobs for the current fresh facility.

## Scope

Phase 5 turns the verified Phase 3 Aave Supply proof path into a TypeScript worker. Job metadata and proof state belong in durable Postgres. Render's local filesystem and SQLite are not used for resume-critical state.

The service exposes a public health endpoint, an authenticated qualification-job registration endpoint, a job-status endpoint, and an authenticated internal tick endpoint. The worker uses `facilityId` plus the exact source transaction hash as its idempotency key, reads CC3 state before every retry, persists proof-ready data and CC3 submission intent, and resumes from the last durable state after a restart.

## Configuration

Required secret values are supplied through the deployment environment and are never committed:

- `DATABASE_URL`
- `PRIVATE_KEY`
- `SEPOLIA_RPC_URL`
- `CC3_RPC_URL`
- `PROOF_BUILDER_URL`
- `VERD_ADDRESS`
- `INTERNAL_TICK_SECRET`

The safe public template is `.env.example`. Render configuration is in `render.yaml` with secret values marked `sync: false`.

## Verification record

The deployed service is `verd-phase5-worker`, Render service ID `srv-daclbqbm8hqs73ba5vr0`, at [https://verd-phase5-worker.onrender.com](https://verd-phase5-worker.onrender.com). The current functional worker deployment is commit `b85042a`, deployment ID `dep-dag45vq181qs73ag2ceg`, on the `master` branch in Frankfurt using the Node runtime and Free plan. It uses the signed worker contract gateway for live CC3 writes, including the authenticated reserve-release record.

The service uses the existing workspace Render Postgres instance `vocap-sepolia-postgres`, database ID `dpg-da8dqegn74is73dlelsg-a`, in Frankfurt. Verd owns the isolated `verd_phase5_qualification_jobs` table and its idempotency index. The database is currently a Render Free database with a provider expiry of 2026-09-27, so longer-lived operation requires a later database renewal or paid durable database decision.

Live health evidence on 2026-09-08 returned HTTP 200 with `ok=true`, `phase=phase5`, `database=ok`, `worker=ready`, and `phase6Started=true`. The current deployment logs show a successful build, `node dist/server.js` listening on port 10000, and Render marking the service live.

Restart recovery was verified with job `job_7c8b5ac0c7a96ee93607aa1e2d8665b4fcda4dc419425ea1e7d09c7e2a03bfc0`. Before the restart, the durable row was `attestation_pending` with source block `11622931`. After the Render restart, health returned 200 and the job status still showed the same job, source transaction, source block, receipt status `1`, Aave Supply evidence, and `nextAction=wait_attestcoin`. Subsequent authenticated ticks advanced the job through Attestcoin attestation and proof generation.

The proof-ready job then completed idempotently against the already-qualified Phase 3 facility. The live status is `completed`, `terminal=true`, `sourceBlock=11622931`, `proofId=0xecf7b48177ca61de7449400db6318d799c005b3322e4a858bc4e016efbd395e6`, `proofSdkValid=true`, and `idempotencyOutcome=proof_already_processed_on_chain`. No CC3 submission nonce or transaction hash was created. Re-registering the same facility and source returned `created=false` with the same job ID. A repeated tick returned `idle` with the completed state. An unauthenticated tick returned HTTP 401.

The worker therefore has verified cold-start, durable restart recovery, source receipt and event validation, bounded Attestcoin polling, proof generation and SDK verification, authoritative CC3 readback, duplicate-submission protection, and the release operation. The fresh release job completed with proof ID `0x98c198283a5201c70be777a89f849ab9fa2ef1c2a33ef658d1e004915c394408` and CC3 transaction `0x99dd91edc8b6b171f8f805a3b7fe450a68dbcbcd0468ae2b88887ba3824f1435`. The external wake-source checkbox remains future work because this gate used authenticated manual ticks.

## Repository release audit

The follow-up repository hardening keeps durable job registration idempotent when optional proof hints are supplied again, rejects invalid runtime URLs, non-Sepolia source-chain keys, invalid private keys, invalid Postgres URLs, oversized ports, and non-positive numeric settings, and keeps all secret values outside the repository.

The dependency audit is clean after upgrading `ethers` to `6.17.0`. The native verification workflow is `.github/workflows/ci.yml`, and the aggregate local command is `npm test`.
