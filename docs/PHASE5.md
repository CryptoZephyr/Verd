# Phase 5, resumable proof worker and Render backend

Status: implementation in progress. Phase 6 frontend work has not started.

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

Deployment URL, cold-start evidence, restart-recovery evidence, and idempotent submission evidence will be recorded here after the Render service is deployed and read back from the live URL. No Phase 6 frontend work is included in this gate.
