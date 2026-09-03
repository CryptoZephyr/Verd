# Phase 5, resumable proof worker and Render backend

Status: verified on Render Free. Phase 6 frontend work has not started.

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

The deployed service is `verd-phase5-worker`, Render service ID `srv-daclbqbm8hqs73ba5vr0`, at [https://verd-phase5-worker.onrender.com](https://verd-phase5-worker.onrender.com). The functional worker deployment verified in this record is commit `a674574ddd60585aab6df402350e842fdcd76b37`, deployment ID `dep-daclgieq1p3s73eq63r0`, on the `master` branch in Frankfurt using the Node runtime and Free plan. Later record-only documentation commits may trigger equivalent auto-deploys.

The service uses the existing workspace Render Postgres instance `vocap-sepolia-postgres`, database ID `dpg-da8dqegn74is73dlelsg-a`, in Frankfurt. Verd owns the isolated `verd_phase5_qualification_jobs` table and its idempotency index. The database is currently a Render Free database with a provider expiry of 2026-09-27, so longer-lived operation requires a later database renewal or paid durable database decision.

Live health evidence on 2026-09-03 at 11:12:49Z returned HTTP 200 with `ok=true`, `phase=phase5`, `database=ok`, `worker=ready`, and `phase6Started=false`. The initial deployment logs show a successful build, `node dist/server.js` listening on port 10000, and Render marking the service live.

Restart recovery was verified with job `job_7c8b5ac0c7a96ee93607aa1e2d8665b4fcda4dc419425ea1e7d09c7e2a03bfc0`. Before the restart, the durable row was `attestation_pending` with source block `11622931`. After the Render restart, health returned 200 and the job status still showed the same job, source transaction, source block, receipt status `1`, Aave Supply evidence, and `nextAction=wait_attestcoin`. Subsequent authenticated ticks advanced the job through Attestcoin attestation and proof generation.

The proof-ready job then completed idempotently against the already-qualified Phase 3 facility. The live status is `completed`, `terminal=true`, `sourceBlock=11622931`, `proofId=0xecf7b48177ca61de7449400db6318d799c005b3322e4a858bc4e016efbd395e6`, `proofSdkValid=true`, and `idempotencyOutcome=proof_already_processed_on_chain`. No CC3 submission nonce or transaction hash was created. Re-registering the same facility and source returned `created=false` with the same job ID. A repeated tick returned `idle` with the completed state. An unauthenticated tick returned HTTP 401.

The worker therefore has verified cold-start, durable restart recovery, source receipt and event validation, bounded Attestcoin polling, proof generation and SDK verification, authoritative CC3 readback, and duplicate-submission protection. No Phase 6 frontend work has started. The external wake-source checkbox remains future work because this gate used authenticated manual ticks.
