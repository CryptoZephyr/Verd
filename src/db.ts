import { randomUUID } from "node:crypto";
import { Pool, type QueryResultRow } from "pg";
import type { Config } from "./config.js";
import { BadRequestError } from "./errors.js";
import { deriveJobId, isBytes32, isTransactionHash, normalizeBytes32, nowIso, jsonSafe } from "./utils.js";
import type { ClaimedJob, JobInput, JobRecord, JobState, JobStore } from "./types.js";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS verd_phase5_qualification_jobs (
    job_id TEXT PRIMARY KEY,
    facility_id TEXT NOT NULL,
    source_tx_hash TEXT NOT NULL,
    status TEXT NOT NULL,
    next_action TEXT NOT NULL,
    terminal BOOLEAN NOT NULL DEFAULT FALSE,
    state JSONB NOT NULL,
    proof_id TEXT,
    source_block BIGINT,
    cc3_submission_tx_hash TEXT,
    cc3_submission_nonce BIGINT,
    lease_token TEXT,
    lease_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS verd_phase5_qualification_jobs_idempotency
    ON verd_phase5_qualification_jobs (facility_id, source_tx_hash);
CREATE INDEX IF NOT EXISTS verd_phase5_qualification_jobs_due
    ON verd_phase5_qualification_jobs (terminal, lease_expires_at, updated_at);
`;

interface JobRow extends QueryResultRow {
    job_id: string;
    facility_id: string;
    source_tx_hash: string;
    state: JobState;
    created_at: Date | string;
}

function mapRow(row: JobRow): JobRecord {
    return {
        jobId: row.job_id,
        facilityId: row.facility_id,
        sourceTxHash: row.source_tx_hash,
        state: row.state,
    };
}

function createState(input: JobInput, jobId: string): JobState {
    const now = nowIso();
    return {
        version: 1,
        operation: input.operation ?? "qualification",
        jobId,
        facilityId: input.facilityId,
        sourceTxHash: input.sourceTxHash,
        status: "source_pending",
        nextAction: "wait_source_transaction",
        terminal: false,
        attempts: 0,
        retryCount: 0,
        createdAt: now,
        updatedAt: now,
        ...(input.proofId ? { proofId: input.proofId } : {}),
        ...(input.sourceBlock !== undefined ? { sourceBlock: input.sourceBlock } : {}),
        ...(input.cc3SubmissionTxHash ? { cc3SubmissionTxHash: input.cc3SubmissionTxHash } : {}),
    };
}

export function assertCompatibleJobRegistration(existing: JobRecord, input: JobInput): void {
    const checks: Array<[unknown, unknown]> = [
        [input.operation ?? "qualification", existing.state.operation ?? "qualification"],
        [input.proofId, existing.state.proofId],
        [input.sourceBlock, existing.state.sourceBlock],
        [input.cc3SubmissionTxHash, existing.state.cc3SubmissionTxHash],
    ];
    for (const [incoming, persisted] of checks) {
        if (incoming === undefined) continue;
        const matches = typeof incoming === "string" && typeof persisted === "string"
            ? incoming.toLowerCase() === persisted.toLowerCase()
            : incoming === persisted;
        if (!matches) throw new BadRequestError("job registration conflicts with existing durable state");
    }
}

export class PostgresJobStore implements JobStore {
    private readonly pool: Pool;
    private readonly leaseSeconds: number;

    constructor(config: Config) {
        this.leaseSeconds = config.leaseSeconds;
        this.pool = new Pool({
            connectionString: config.databaseUrl,
            max: 5,
            idleTimeoutMillis: 30_000,
            connectionTimeoutMillis: 10_000,
            ssl: config.databaseSsl ? { rejectUnauthorized: false } : false,
        });
    }

    async migrate(): Promise<void> {
        await this.pool.query(SCHEMA);
    }

    async ping(): Promise<void> {
        await this.pool.query("SELECT 1");
    }

    async createJob(input: JobInput): Promise<{ job: JobRecord; created: boolean }> {
        const facilityId = normalizeBytes32(input.facilityId, "facilityId");
        const sourceTxHash = normalizeBytes32(input.sourceTxHash, "sourceTxHash");
        if (input.proofId !== undefined && !isBytes32(input.proofId)) {
            throw new BadRequestError("proofId must be a 32-byte hex value");
        }
        if (input.cc3SubmissionTxHash !== undefined && !isTransactionHash(input.cc3SubmissionTxHash)) {
            throw new BadRequestError("cc3SubmissionTxHash must be a transaction hash");
        }
        if (input.sourceBlock !== undefined && (!Number.isSafeInteger(input.sourceBlock) || input.sourceBlock <= 0)) {
            throw new BadRequestError("sourceBlock must be a positive integer");
        }

        const normalized: JobInput = {
            ...input,
            facilityId,
            sourceTxHash,
            proofId: input.proofId?.toLowerCase(),
            cc3SubmissionTxHash: input.cc3SubmissionTxHash?.toLowerCase(),
        };
        const jobId = deriveJobId(facilityId, sourceTxHash);
        const client = await this.pool.connect();
        try {
            await client.query("BEGIN");
            const existing = await client.query<JobRow>(
                "SELECT job_id, facility_id, source_tx_hash, state, created_at FROM verd_phase5_qualification_jobs WHERE facility_id = $1 AND source_tx_hash = $2 FOR UPDATE",
                [facilityId, sourceTxHash],
            );
            if (existing.rowCount) {
                assertCompatibleJobRegistration(mapRow(existing.rows[0]), normalized);
                await client.query("COMMIT");
                return { job: mapRow(existing.rows[0]), created: false };
            }

            const state = createState(normalized, jobId);
            const inserted = await client.query<JobRow>(
                `INSERT INTO verd_phase5_qualification_jobs
                    (job_id, facility_id, source_tx_hash, status, next_action, terminal, state, proof_id, source_block, cc3_submission_tx_hash, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, NOW(), NOW())
                 RETURNING job_id, facility_id, source_tx_hash, state, created_at`,
                [
                    jobId,
                    facilityId,
                    sourceTxHash,
                    state.status,
                    state.nextAction,
                    state.terminal,
                    JSON.stringify(state),
                    state.proofId ?? null,
                    state.sourceBlock ?? null,
                    state.cc3SubmissionTxHash ?? null,
                ],
            );
            await client.query("COMMIT");
            return { job: mapRow(inserted.rows[0]), created: true };
        } catch (error) {
            await client.query("ROLLBACK");
            if ((error as { code?: string }).code === "23505") {
                const existing = await this.pool.query<JobRow>(
                    "SELECT job_id, facility_id, source_tx_hash, state, created_at FROM verd_phase5_qualification_jobs WHERE facility_id = $1 AND source_tx_hash = $2",
                    [facilityId, sourceTxHash],
                );
                if (existing.rowCount) {
                    const job = mapRow(existing.rows[0]);
                    assertCompatibleJobRegistration(job, normalized);
                    return { job, created: false };
                }
            }
            throw error;
        } finally {
            client.release();
        }
    }

    async getJob(jobId: string): Promise<JobRecord | null> {
        const result = await this.pool.query<JobRow>(
            "SELECT job_id, facility_id, source_tx_hash, state, created_at FROM verd_phase5_qualification_jobs WHERE job_id = $1",
            [jobId],
        );
        return result.rowCount ? mapRow(result.rows[0]) : null;
    }

    async claimJob(jobId?: string): Promise<ClaimedJob | null> {
        const client = await this.pool.connect();
        try {
            await client.query("BEGIN");
            const result = await client.query<JobRow>(
                `SELECT job_id, facility_id, source_tx_hash, state, created_at
                   FROM verd_phase5_qualification_jobs
                  WHERE ($1::TEXT IS NULL OR job_id = $1)
                    AND terminal = FALSE
                    AND (lease_expires_at IS NULL OR lease_expires_at < NOW())
                  ORDER BY updated_at ASC
                  LIMIT 1
                  FOR UPDATE SKIP LOCKED`,
                [jobId ?? null],
            );
            if (!result.rowCount) {
                await client.query("COMMIT");
                return null;
            }

            const leaseToken = randomUUID();
            await client.query(
                `UPDATE verd_phase5_qualification_jobs
                    SET lease_token = $2,
                        lease_expires_at = NOW() + ($3::INT * INTERVAL '1 second'),
                        updated_at = NOW()
                  WHERE job_id = $1`,
                [result.rows[0].job_id, leaseToken, this.leaseSeconds],
            );
            await client.query("COMMIT");
            return { job: mapRow(result.rows[0]), leaseToken };
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async saveJob(job: JobRecord, leaseToken: string, releaseLease: boolean): Promise<void> {
        const state = jsonSafe({ ...job.state, updatedAt: nowIso() });
        const result = await this.pool.query(
            `UPDATE verd_phase5_qualification_jobs
                SET status = $2,
                    next_action = $3,
                    terminal = $4,
                    state = $5::jsonb,
                    proof_id = $6,
                    source_block = $7,
                    cc3_submission_tx_hash = $8,
                    cc3_submission_nonce = $9,
                    completed_at = $10,
                    lease_token = CASE WHEN $11::BOOLEAN THEN NULL ELSE lease_token END,
                    lease_expires_at = CASE WHEN $11::BOOLEAN THEN NULL ELSE lease_expires_at END,
                    updated_at = NOW()
              WHERE job_id = $1 AND lease_token = $12`,
            [
                job.jobId,
                state.status,
                state.nextAction,
                state.terminal,
                JSON.stringify(state),
                state.proofId ?? null,
                state.sourceBlock ?? null,
                state.cc3SubmissionTxHash ?? null,
                state.cc3SubmissionNonce ?? null,
                state.completedAt ?? null,
                releaseLease,
                leaseToken,
            ],
        );
        if (result.rowCount !== 1) throw new Error("job_lease_lost");
        job.state = state;
    }

    async close(): Promise<void> {
        await this.pool.end();
    }
}
