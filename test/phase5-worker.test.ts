import test from "node:test";
import assert from "node:assert/strict";
import { ethers } from "ethers";
import { loadConfig, type Config } from "../src/config.js";
import { createHttpServer } from "../src/server.js";
import { assertCompatibleJobRegistration } from "../src/db.js";
import { RetryableWorkerError } from "../src/errors.js";
import { deriveJobId, nowIso } from "../src/utils.js";
import { ProofWorker, qualificationJobMessage } from "../src/worker.js";
import type {
    BindingSnapshot,
    BindingSourceVerification,
    ChainGateway,
    ClaimedJob,
    FacilitySnapshot,
    FacilityTermsSnapshot,
    GeneratedProof,
    JobInput,
    JobRecord,
    JobState,
    JobStore,
    QualificationSnapshot,
    ReleaseSnapshot,
    ReleaseSourceVerification,
    SerializedProof,
    SourceVerification,
    SubmissionReceipt,
} from "../src/types.js";

const FACILITY_ID = `0x${"11".repeat(32)}`;
const SOURCE_TX_HASH = `0x${"22".repeat(32)}`;
const PROOF_ID = `0x${"33".repeat(32)}`;
const BORROWER = `0x${"44".repeat(20)}`;
const LOCKER = `0x${"55".repeat(20)}`;
const POOL = `0x${"66".repeat(20)}`;
const WETH = `0x${"77".repeat(20)}`;
const ATOKEN = `0x${"88".repeat(20)}`;

function config(): Config {
    return {
        port: 0,
        databaseUrl: "postgres://unit-test",
        databaseSsl: false,
        privateKey: `0x${"99".repeat(32)}`,
        sepoliaRpcUrl: "http://sepolia.test",
        cc3RpcUrl: "http://cc3.test",
        proofBuilderUrl: "http://proof.test",
        verdAddress: `0x${"aa".repeat(20)}`,
        internalTickSecret: "phase5-unit-secret-1234",
        sourceChainKey: 1,
        cc3GasLimit: 9_000_000n,
        leaseSeconds: 120,
        attestationRequestTimeoutMs: 1,
        attestationMaxWaitMs: 1,
        attestationPollIntervalMs: 1,
        maxBodyBytes: 64 * 1024,
    };
}

class MemoryJobStore implements JobStore {
    readonly jobs = new Map<string, JobRecord>();
    private readonly leases = new Map<string, string>();

    async migrate(): Promise<void> {}
    async ping(): Promise<void> {}

    async createJob(input: JobInput): Promise<{ job: JobRecord; created: boolean }> {
        const jobId = deriveJobId(input.facilityId, input.sourceTxHash);
        const existing = this.jobs.get(jobId);
        if (existing) return { job: structuredClone(existing), created: false };
        const createdAt = nowIso();
        const state: JobState = {
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
            createdAt,
            updatedAt: createdAt,
            proofId: input.proofId,
            sourceBlock: input.sourceBlock,
            cc3SubmissionTxHash: input.cc3SubmissionTxHash,
        };
        const job = { jobId, facilityId: input.facilityId, sourceTxHash: input.sourceTxHash, state };
        this.jobs.set(jobId, structuredClone(job));
        return { job, created: true };
    }

    async getJob(jobId: string): Promise<JobRecord | null> {
        const job = this.jobs.get(jobId);
        return job ? structuredClone(job) : null;
    }

    async claimJob(jobId?: string): Promise<ClaimedJob | null> {
        const candidates = jobId ? [this.jobs.get(jobId)] : [...this.jobs.values()];
        const job = candidates.find((candidate) => candidate && !candidate.state.terminal && !this.leases.has(candidate.jobId));
        if (!job) return null;
        const leaseToken = `lease-${job.jobId}`;
        this.leases.set(job.jobId, leaseToken);
        return { job: structuredClone(job), leaseToken };
    }

    async saveJob(job: JobRecord, leaseToken: string, releaseLease: boolean): Promise<void> {
        assert.equal(this.leases.get(job.jobId), leaseToken);
        job.state.updatedAt = nowIso();
        this.jobs.set(job.jobId, structuredClone(job));
        if (releaseLease) this.leases.delete(job.jobId);
    }

    async close(): Promise<void> {}
}

class FakeChain implements ChainGateway {
    readonly facility: FacilitySnapshot = {
        facilityId: FACILITY_ID,
        borrower: BORROWER,
        requiredReserveAmount: 500n,
        maturity: 200,
        qualificationDeadline: 150,
        reserveLocker: LOCKER,
        preferredRateActive: false,
        funded: true,
        repaid: false,
        reserveReleased: false,
        qualificationProofId: `0x${"00".repeat(32)}`,
        qualificationSourceBlock: 0,
        lockerBindingProofId: `0x${"10".repeat(32)}`,
        lockerBindingSourceBlock: 90,
        lockerUnlockTime: 200,
        reserveReleaseProofId: `0x${"00".repeat(32)}`,
        reserveReleaseSourceBlock: 0,
        reserveReleaseAmount: 0n,
    };
    readonly proof: SerializedProof = {
        chainKey: 1,
        headerNumber: 100,
        txHash: SOURCE_TX_HASH,
        txBytes: "0x1234",
        merkleProof: { root: `0x${"01".repeat(32)}`, siblings: [] },
        continuityProof: { lowerEndpointDigest: `0x${"02".repeat(32)}`, roots: [] },
        generatedAt: nowIso(),
    };
    processed = false;
    preferred = false;
    receiptReady = false;
    releaseProcessed = false;
    releaseTxHash: string | undefined;
    throwFirstSend = false;
    sendNonces: number[] = [];

    async assertNetworks(): Promise<void> {}

    async getFacility(): Promise<FacilitySnapshot> {
        return {
            ...this.facility,
            preferredRateActive: this.preferred,
            qualificationProofId: this.preferred ? PROOF_ID : this.facility.qualificationProofId,
            qualificationSourceBlock: this.preferred ? 100 : this.facility.qualificationSourceBlock,
        };
    }

    async getFacilityTerms(): Promise<FacilityTermsSnapshot> {
        return { facilityId: FACILITY_ID, borrower: this.facility.borrower, maturity: this.facility.maturity };
    }

    async verifySource(_facility: FacilitySnapshot, _sourceTxHash: string, expectedSourceBlock?: number): Promise<SourceVerification> {
        if (expectedSourceBlock !== undefined) assert.equal(expectedSourceBlock, 100);
        return {
            sourceBlock: 100,
            receiptStatus: 1,
            event: {
                reserve: WETH,
                user: BORROWER,
                onBehalfOf: LOCKER,
                amount: "500",
                referralCode: 0,
            },
            lockerATokenBalance: "500",
        };
    }

    async verifyBindingSource(_facility: FacilityTermsSnapshot, _sourceTxHash: string, expectedSourceBlock?: number): Promise<BindingSourceVerification> {
        if (expectedSourceBlock !== undefined) assert.equal(expectedSourceBlock, 100);
        return { sourceBlock: 100, receiptStatus: 1, locker: LOCKER, borrower: BORROWER, unlockTime: 200 };
    }

    async waitForAttestation(): Promise<void> {}

    async generateProof(): Promise<GeneratedProof> {
        return { proof: this.proof, proofId: PROOF_ID, sdkProofValid: true };
    }

    async readQualification(_facilityId: string, proofId: string): Promise<QualificationSnapshot> {
        return {
            processedProof: this.processed,
            preferredRateActive: this.preferred,
            qualificationProofId: this.processed ? proofId : `0x${"00".repeat(32)}`,
            qualificationSourceBlock: this.processed ? 100 : 0,
        };
    }

    async readBinding(_facilityId: string, proofId: string): Promise<BindingSnapshot> {
        return { bindingProofId: this.processed ? proofId : `0x${"00".repeat(32)}`, bindingSourceBlock: this.processed ? 100 : 0, locker: LOCKER };
    }

    async verifyReleaseSource(_facility: FacilitySnapshot, _sourceTxHash: string, expectedSourceBlock?: number): Promise<ReleaseSourceVerification> {
        if (expectedSourceBlock !== undefined) assert.equal(expectedSourceBlock, 100);
        return { sourceBlock: 100, receiptStatus: 1, borrower: BORROWER, aToken: ATOKEN, amount: "500", lockerATokenBalance: "0" };
    }

    async readRelease(_facilityId: string, proofId: string): Promise<ReleaseSnapshot> {
        return {
            releaseProofId: this.releaseProcessed ? proofId : `0x${"00".repeat(32)}`,
            releaseSourceBlock: this.releaseProcessed ? 100 : 0,
            releaseAmount: this.releaseProcessed ? "500" : "0",
        };
    }

    async reserveSubmissionNonce(): Promise<number> {
        return 7;
    }

    async getSubmissionNonceState(): Promise<{ latest: number; pending: number }> {
        return { latest: 7, pending: 7 };
    }

    async findSubmissionByNonce(): Promise<string | null> {
        return null;
    }

    async sendQualification(_facilityId: string, _proof: SerializedProof, nonce: number): Promise<string> {
        this.sendNonces.push(nonce);
        if (this.throwFirstSend) {
            this.throwFirstSend = false;
            throw new RetryableWorkerError("cc3_submission_unavailable", "temporary test transport failure");
        }
        return `0x${"ab".repeat(32)}`;
    }

    async sendBinding(_facilityId: string, _proof: SerializedProof, nonce: number): Promise<string> {
        this.sendNonces.push(nonce);
        this.processed = true;
        return `0x${"bc".repeat(32)}`;
    }

    async sendRelease(_facilityId: string, _proof: SerializedProof, nonce: number): Promise<string> {
        this.sendNonces.push(nonce);
        this.releaseTxHash = `0x${"cd".repeat(32)}`;
        return this.releaseTxHash;
    }

    async getReceipt(txHash?: string): Promise<SubmissionReceipt | null> {
        if (!this.receiptReady) return null;
        if (txHash && txHash === this.releaseTxHash) {
            this.releaseProcessed = true;
            this.facility.repaid = true;
            return { status: 1, blockNumber: 501, gasUsed: "12345" };
        }
        this.processed = true;
        this.preferred = true;
        return { status: 1, blockNumber: 500, gasUsed: "12345" };
    }
}

async function createJob(store: MemoryJobStore, input: Partial<JobInput> = {}): Promise<JobRecord> {
    const result = await store.createJob({
        facilityId: FACILITY_ID,
        sourceTxHash: SOURCE_TX_HASH,
        ...input,
    });
    return result.job;
}

async function advanceToProofReady(store: MemoryJobStore, chain: FakeChain, jobId: string): Promise<void> {
    await new ProofWorker(store, chain, config()).tick(jobId);
    await new ProofWorker(store, chain, config()).tick(jobId);
    await new ProofWorker(store, chain, config()).tick(jobId);
    assert.equal((await store.getJob(jobId))?.state.nextAction, "submit_cc3");
}

test("a durable job resumes after a worker restart and confirms the same CC3 submission", async () => {
    const store = new MemoryJobStore();
    const chain = new FakeChain();
    const job = await createJob(store);

    await advanceToProofReady(store, chain, job.jobId);
    await new ProofWorker(store, chain, config()).tick(job.jobId);
    let saved = await store.getJob(job.jobId);
    assert.equal(saved?.state.nextAction, "check_cc3_submission");
    assert.equal(saved?.state.cc3SubmissionNonce, 7);
    assert.equal(chain.sendNonces.length, 1);

    const pending = await new ProofWorker(store, chain, config()).tick(job.jobId);
    assert.equal(pending.outcome, "retrying");
    assert.equal(chain.sendNonces.length, 1);

    chain.receiptReady = true;
    const completed = await new ProofWorker(store, chain, config()).tick(job.jobId);
    assert.equal(completed.outcome, "completed");
    saved = await store.getJob(job.jobId);
    assert.equal(saved?.state.status, "completed");
    assert.equal(saved?.state.idempotencyOutcome, "submission_receipt_confirmed");
    assert.equal(chain.sendNonces.length, 1);
});

test("a proof already accepted by the verified Phase 3 contracts is idempotent", async () => {
    const store = new MemoryJobStore();
    const chain = new FakeChain();
    chain.processed = true;
    chain.preferred = true;
    const job = await createJob(store, { proofId: PROOF_ID, sourceBlock: 100 });

    const first = await new ProofWorker(store, chain, config()).tick(job.jobId);
    assert.equal(first.outcome, "completed");
    assert.equal(first.job?.state.idempotencyOutcome, "proof_already_processed_on_chain");
    assert.equal(chain.sendNonces.length, 0);

    const second = await new ProofWorker(store, chain, config()).tick(job.jobId);
    assert.equal(second.outcome, "idle");
    assert.equal(chain.sendNonces.length, 0);
});

test("job registration rejects conflicting durable proof hints", async () => {
    const store = new MemoryJobStore();
    const job = await createJob(store, { proofId: PROOF_ID, sourceBlock: 100 });

    assert.doesNotThrow(() => assertCompatibleJobRegistration(job, {
        facilityId: FACILITY_ID,
        sourceTxHash: SOURCE_TX_HASH,
        proofId: PROOF_ID.toUpperCase(),
        sourceBlock: 100,
    }));
    assert.throws(() => assertCompatibleJobRegistration(job, {
        facilityId: FACILITY_ID,
        sourceTxHash: SOURCE_TX_HASH,
        proofId: `0x${"aa".repeat(32)}`,
    }), /conflicts with existing durable state/);
    assert.throws(() => assertCompatibleJobRegistration(job, {
        facilityId: FACILITY_ID,
        sourceTxHash: SOURCE_TX_HASH,
        sourceBlock: 101,
    }), /conflicts with existing durable state/);
});

test("a proof-ready job reconciles an already-qualified source before submission", async () => {
    const store = new MemoryJobStore();
    const chain = new FakeChain();
    chain.processed = true;
    chain.preferred = true;
    const job = await createJob(store);

    await advanceToProofReady(store, chain, job.jobId);
    const result = await new ProofWorker(store, chain, config()).tick(job.jobId);

    assert.equal(result.outcome, "completed");
    assert.equal(result.job?.state.idempotencyOutcome, "proof_already_processed_on_chain");
    assert.equal(result.job?.state.proofId, PROOF_ID);
    assert.equal(chain.sendNonces.length, 0);
});

test("a restart after durable submission intent reuses the reserved nonce", async () => {
    const store = new MemoryJobStore();
    const chain = new FakeChain();
    chain.throwFirstSend = true;
    const job = await createJob(store);
    await advanceToProofReady(store, chain, job.jobId);

    const first = await new ProofWorker(store, chain, config()).tick(job.jobId);
    assert.equal(first.outcome, "retrying");
    let saved = await store.getJob(job.jobId);
    assert.equal(saved?.state.cc3SubmissionNonce, 7);
    assert.equal(saved?.state.cc3SubmissionTxHash, undefined);

    const resumed = await new ProofWorker(store, chain, config()).tick(job.jobId);
    assert.equal(resumed.outcome, "advanced");
    saved = await store.getJob(job.jobId);
    assert.equal(saved?.state.cc3SubmissionTxHash, `0x${"ab".repeat(32)}`);
    assert.deepEqual(chain.sendNonces, [7, 7]);
});

test("health, registration, and status routes enforce the internal secret", async () => {
    const store = new MemoryJobStore();
    const chain = new FakeChain();
    const worker = new ProofWorker(store, chain, config());
    const server = createHttpServer(store, worker, config());
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`;

    try {
        const health = await fetch(`${base}/health`);
        assert.equal(health.status, 200);
        assert.equal((await health.json()).phase, "phase5");

        const publicBorrower = ethers.Wallet.createRandom();
        chain.facility.borrower = publicBorrower.address;
        const publicInput = { facilityId: FACILITY_ID, sourceTxHash: `0x${"23".repeat(32)}`, sourceBlock: 100 };
        const issuedAt = Date.now();
        const signature = await publicBorrower.signMessage(qualificationJobMessage(publicInput, issuedAt));
        const publicRegistration = await fetch(`${base}/public/qualification-jobs`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ...publicInput, walletAddress: publicBorrower.address, signature, issuedAt }),
        });
        assert.equal(publicRegistration.status, 201);
        assert.equal(publicRegistration.headers.get("access-control-allow-origin"), "*");

        const unauthorized = await fetch(`${base}/qualification-jobs`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ facilityId: FACILITY_ID, sourceTxHash: SOURCE_TX_HASH }),
        });
        assert.equal(unauthorized.status, 401);

        const registered = await fetch(`${base}/qualification-jobs`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-internal-tick-secret": config().internalTickSecret,
            },
            body: JSON.stringify({ facilityId: FACILITY_ID, sourceTxHash: SOURCE_TX_HASH }),
        });
        assert.equal(registered.status, 201);
        const registeredBody = await registered.json();
        const status = await fetch(`${base}/job-status/${registeredBody.job.jobId}`);
        assert.equal(status.status, 200);
        assert.equal((await status.json()).nextAction, "wait_source_transaction");
    } finally {
        await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
});

test("borrower-signed public qualification registration is idempotent and scoped", async () => {
    const store = new MemoryJobStore();
    const chain = new FakeChain();
    const borrower = ethers.Wallet.createRandom();
    chain.facility.borrower = borrower.address;
    const worker = new ProofWorker(store, chain, config());
    const input = { facilityId: FACILITY_ID, sourceTxHash: SOURCE_TX_HASH, sourceBlock: 100 };
    const issuedAt = Date.now();
    const signature = await borrower.signMessage(qualificationJobMessage(input, issuedAt));

    const first = await worker.registerBorrowerJob(input, borrower.address, signature, issuedAt);
    const second = await worker.registerBorrowerJob(input, borrower.address, signature, issuedAt);
    assert.equal(first.created, true);
    assert.equal(second.created, false);
    await assert.rejects(
        () => worker.registerBorrowerJob(input, ethers.Wallet.createRandom().address, signature, issuedAt),
        /signed wallet address does not match/,
    );
});

test("binding jobs prove a factory locker and recover through the same durable worker path", async () => {
    const store = new MemoryJobStore();
    const chain = new FakeChain();
    const job = await createJob(store, { operation: "binding", sourceTxHash: `0x${"24".repeat(32)}` });
    const worker = new ProofWorker(store, chain, config());
    await worker.tick(job.jobId);
    await worker.tick(job.jobId);
    await worker.tick(job.jobId);
    const submitted = await worker.tick(job.jobId);
    assert.equal(submitted.outcome, "advanced");
    const completed = await worker.tick(job.jobId);
    assert.equal(completed.outcome, "completed");
    assert.equal(completed.job?.state.idempotencyOutcome, "binding_already_processed_on_chain");
});

test("release jobs prove repayment release and record authoritative completion", async () => {
    const store = new MemoryJobStore();
    const chain = new FakeChain();
    chain.facility.repaid = true;
    const job = await createJob(store, { operation: "release", sourceTxHash: `0x${"25".repeat(32)}` });
    const worker = new ProofWorker(store, chain, config());

    await worker.tick(job.jobId);
    await worker.tick(job.jobId);
    await worker.tick(job.jobId);
    const submitted = await worker.tick(job.jobId);
    assert.equal(submitted.outcome, "advanced");
    assert.equal((await store.getJob(job.jobId))?.state.nextAction, "check_cc3_submission");

    const pending = await worker.tick(job.jobId);
    assert.equal(pending.outcome, "retrying");
    chain.receiptReady = true;
    const completed = await worker.tick(job.jobId);

    assert.equal(completed.outcome, "completed");
    assert.equal(completed.job?.state.status, "completed");
    assert.equal(completed.job?.state.idempotencyOutcome, "release_receipt_confirmed");
    assert.equal(chain.releaseProcessed, true);
    assert.deepEqual(chain.sendNonces, [7]);
});

test("runtime configuration rejects a non-Sepolia source chain and oversized port", () => {
    const names = [
        "INTERNAL_TICK_SECRET",
        "SOURCE_CHAIN_KEY",
        "PORT",
        "DATABASE_URL",
        "PRIVATE_KEY",
        "SEPOLIA_RPC_URL",
        "CC3_RPC_URL",
        "PROOF_BUILDER_URL",
        "VERD_ADDRESS",
    ];
    const original = new Map(names.map((name) => [name, process.env[name]]));
    const valid = {
        INTERNAL_TICK_SECRET: "phase5-config-secret-1234",
        SOURCE_CHAIN_KEY: "1",
        PORT: "10000",
        DATABASE_URL: "postgres://config-test",
        PRIVATE_KEY: `0x${"99".repeat(32)}`,
        SEPOLIA_RPC_URL: "https://sepolia.test",
        CC3_RPC_URL: "https://cc3.test",
        PROOF_BUILDER_URL: "https://proof.test",
        VERD_ADDRESS: `0x${"aa".repeat(20)}`,
    };
    try {
        for (const [name, value] of Object.entries(valid)) process.env[name] = value;
        assert.equal(loadConfig().sourceChainKey, 1);

        process.env.SOURCE_CHAIN_KEY = "2";
        assert.throws(() => loadConfig(), /SOURCE_CHAIN_KEY/);

        process.env.SOURCE_CHAIN_KEY = "1";
        process.env.PORT = "65536";
        assert.throws(() => loadConfig(), /PORT/);
    } finally {
        for (const name of names) {
            const value = original.get(name);
            if (value === undefined) delete process.env[name];
            else process.env[name] = value;
        }
    }
});
