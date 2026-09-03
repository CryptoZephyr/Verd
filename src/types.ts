export type JobStatus =
    | "source_pending"
    | "attestation_pending"
    | "proof_generation_pending"
    | "proof_ready"
    | "cc3_submission_pending"
    | "completed"
    | "manual_review";

export type NextAction =
    | "wait_source_transaction"
    | "wait_attestcoin"
    | "generate_proof"
    | "submit_cc3"
    | "check_cc3_submission"
    | "manual_review"
    | "complete";

export interface SerializedProof {
    chainKey: number;
    headerNumber: number;
    txHash: string;
    txBytes: string;
    merkleProof: {
        root: string;
        siblings: Array<{ hash: string; isLeft: boolean }>;
    };
    continuityProof: {
        lowerEndpointDigest: string;
        roots: string[];
    };
    generatedAt?: string;
}

export interface FacilitySnapshot {
    facilityId: string;
    borrower: string;
    requiredReserveAmount: bigint;
    maturity: number;
    qualificationDeadline: number;
    reserveLocker: string;
    preferredRateActive: boolean;
    funded: boolean;
    qualificationProofId: string;
    qualificationSourceBlock: number;
    lockerBindingProofId: string;
    lockerBindingSourceBlock: number;
    lockerUnlockTime: number;
}

export interface SourceVerification {
    sourceBlock: number;
    receiptStatus: number;
    event: {
        reserve: string;
        user: string;
        onBehalfOf: string;
        amount: string;
        referralCode: number;
    };
    lockerATokenBalance: string;
}

export interface GeneratedProof {
    proof: SerializedProof;
    proofId: string;
    sdkProofValid: boolean;
}

export interface QualificationSnapshot {
    processedProof: boolean;
    preferredRateActive: boolean;
    qualificationProofId: string;
    qualificationSourceBlock: number;
}

export interface SubmissionReceipt {
    status: number;
    blockNumber: number;
    gasUsed: string;
}

export interface ChainGateway {
    assertNetworks(): Promise<void>;
    getFacility(facilityId: string): Promise<FacilitySnapshot>;
    verifySource(
        facility: FacilitySnapshot,
        sourceTxHash: string,
        expectedSourceBlock?: number,
    ): Promise<SourceVerification>;
    waitForAttestation(sourceBlock: number): Promise<void>;
    generateProof(sourceTxHash: string, sourceBlock: number): Promise<GeneratedProof>;
    readQualification(facilityId: string, proofId: string): Promise<QualificationSnapshot>;
    reserveSubmissionNonce(): Promise<number>;
    getSubmissionNonceState(): Promise<{ latest: number; pending: number }>;
    findSubmissionByNonce(nonce: number): Promise<string | null>;
    sendQualification(facilityId: string, proof: SerializedProof, nonce: number): Promise<string>;
    getReceipt(txHash: string): Promise<SubmissionReceipt | null>;
}

export interface JobInput {
    facilityId: string;
    sourceTxHash: string;
    proofId?: string;
    sourceBlock?: number;
    cc3SubmissionTxHash?: string;
}

export interface JobState {
    version: 1;
    jobId: string;
    facilityId: string;
    sourceTxHash: string;
    status: JobStatus;
    nextAction: NextAction;
    terminal: boolean;
    attempts: number;
    retryCount: number;
    createdAt: string;
    updatedAt: string;
    lastActionAt?: string;
    completedAt?: string;
    sourceBlock?: number;
    sourceReceiptStatus?: number;
    sourceEvent?: SourceVerification["event"];
    lockerATokenBalance?: string;
    proofId?: string;
    proof?: SerializedProof;
    proofSdkValid?: boolean;
    proofGeneratedAt?: string;
    cc3SubmissionNonce?: number;
    cc3SubmissionTxHash?: string;
    cc3Receipt?: SubmissionReceipt;
    idempotencyOutcome?: string;
    lastErrorCategory?: string;
    lastErrorMessage?: string;
    evidenceId?: string;
}

export interface JobRecord {
    jobId: string;
    facilityId: string;
    sourceTxHash: string;
    state: JobState;
}

export interface ClaimedJob {
    job: JobRecord;
    leaseToken: string;
}

export interface JobStore {
    migrate(): Promise<void>;
    ping(): Promise<void>;
    createJob(input: JobInput): Promise<{ job: JobRecord; created: boolean }>;
    getJob(jobId: string): Promise<JobRecord | null>;
    claimJob(jobId?: string): Promise<ClaimedJob | null>;
    saveJob(job: JobRecord, leaseToken: string, releaseLease: boolean): Promise<void>;
    close(): Promise<void>;
}

export interface TickResult {
    outcome: "idle" | "busy" | "advanced" | "retrying" | "manual_review" | "completed";
    job?: JobRecord | null;
    message?: string;
}
