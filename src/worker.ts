import { ethers } from "ethers";
import { RetryableWorkerError, TerminalWorkerError } from "./errors.js";
import type { Config } from "./config.js";
import { cleanError, isLikelyRetryable, nowIso, sameAddress } from "./utils.js";
import type {
    BindingSnapshot,
    ChainGateway,
    ClaimedJob,
    FacilitySnapshot,
    FacilityTermsSnapshot,
    JobInput,
    JobOperation,
    JobRecord,
    JobState,
    JobStore,
    TickResult,
} from "./types.js";

function matchingQualification(
    state: JobState,
    qualification: { processedProof: boolean; preferredRateActive: boolean; qualificationProofId: string; qualificationSourceBlock: number },
): boolean {
    return qualification.processedProof
        && qualification.preferredRateActive
        && Boolean(state.proofId)
        && qualification.qualificationProofId.toLowerCase() === state.proofId!.toLowerCase()
        && qualification.qualificationSourceBlock === state.sourceBlock;
}

function matchingBinding(state: JobState, binding: BindingSnapshot): boolean {
    return Boolean(state.proofId)
        && binding.bindingProofId.toLowerCase() === state.proofId!.toLowerCase()
        && binding.bindingSourceBlock === state.sourceBlock
        && !/^0x0{40}$/i.test(binding.locker);
}

function sameProof(left: string, right: string): boolean {
    return left.toLowerCase() === right.toLowerCase();
}

export class ProofWorker {
    private readonly store: JobStore;
    private readonly chain: ChainGateway;
    private readonly config: Config;
    private active = false;

    constructor(store: JobStore, chain: ChainGateway, config: Config) {
        this.store = store;
        this.chain = chain;
        this.config = config;
    }

    async registerBorrowerJob(input: JobInput, walletAddress: string, signature: string, issuedAt: number): Promise<{ job: JobRecord; created: boolean }> {
        const now = Date.now();
        if (!ethers.isAddress(walletAddress)) {
            throw new TerminalWorkerError("job_wallet_invalid", "The wallet address is invalid");
        }
        if (!Number.isSafeInteger(issuedAt) || Math.abs(now - issuedAt) > 5 * 60 * 1000) {
            throw new TerminalWorkerError("job_signature_expired", "The wallet authorization has expired");
        }
        const message = qualificationJobMessage(input, issuedAt);
        let recovered: string;
        try {
            recovered = ethers.verifyMessage(message, signature);
        } catch {
            throw new TerminalWorkerError("job_signature_invalid", "The wallet authorization is invalid");
        }
        if (!sameAddress(recovered, walletAddress)) {
            throw new TerminalWorkerError("job_signer_mismatch", "The signed wallet address does not match the request");
        }
        const facility = input.operation === "binding"
            ? await this.chain.getFacilityTerms(input.facilityId)
            : await this.chain.getFacility(input.facilityId);
        if (!sameAddress(facility.borrower, recovered)) {
            throw new TerminalWorkerError("job_borrower_mismatch", "Only the facility borrower can register its qualification job");
        }
        return this.store.createJob(input);
    }

    async tick(jobId?: string): Promise<TickResult> {
        if (this.active) return { outcome: "busy", message: "A worker tick is already running" };
        this.active = true;
        try {
            const claimed = await this.store.claimJob(jobId);
            if (!claimed) {
                const current = jobId ? await this.store.getJob(jobId) : null;
                return { outcome: "idle", job: current, message: current ? "Job is complete or leased by another worker" : "No due job" };
            }

            const state = {
                ...claimed.job.state,
                attempts: claimed.job.state.attempts + 1,
                lastActionAt: nowIso(),
            };
            claimed.job.state = state;
            await this.store.saveJob(claimed.job, claimed.leaseToken, false);

            try {
                await this.chain.assertNetworks();
                switch (state.nextAction) {
                    case "wait_source_transaction":
                        await this.sourceStep(claimed);
                        break;
                    case "wait_attestcoin":
                        await this.attestationStep(claimed);
                        break;
                    case "generate_proof":
                        await this.proofStep(claimed);
                        break;
                    case "submit_cc3":
                        await this.submitStep(claimed);
                        break;
                    case "check_cc3_submission":
                        await this.checkSubmissionStep(claimed);
                        break;
                    case "complete":
                        await this.completeStep(claimed.job, claimed.leaseToken, "already_complete");
                        break;
                    case "manual_review":
                        await this.store.saveJob(claimed.job, claimed.leaseToken, true);
                        break;
                    default:
                        throw new TerminalWorkerError("unsupported_job_action", `Unsupported job action: ${state.nextAction}`, claimed.job.jobId);
                }
            } catch (error) {
                return await this.handleError(claimed, error);
            }

            const updated = await this.store.getJob(claimed.job.jobId);
            const outcome = updated?.state.status === "completed" ? "completed" : "advanced";
            return { outcome, job: updated };
        } finally {
            this.active = false;
        }
    }

    private async facilityFor(job: JobRecord): Promise<FacilitySnapshot> {
        return this.chain.getFacility(job.facilityId);
    }

    private async facilityTermsFor(job: JobRecord): Promise<FacilityTermsSnapshot> {
        return this.chain.getFacilityTerms(job.facilityId);
    }

    private async sourceStep(claimed: ClaimedJob): Promise<void> {
        const { job, leaseToken } = claimed;
        if (job.state.operation === "binding") {
            const facility = await this.facilityTermsFor(job);
            const source = await this.chain.verifyBindingSource(facility, job.sourceTxHash, job.state.sourceBlock);
            job.state = {
                ...job.state,
                status: job.state.cc3SubmissionTxHash ? "cc3_submission_pending" : "attestation_pending",
                nextAction: job.state.cc3SubmissionTxHash ? "check_cc3_submission" : "wait_attestcoin",
                sourceBlock: source.sourceBlock,
                sourceReceiptStatus: source.receiptStatus,
                bindingLocker: source.locker,
                bindingUnlockTime: source.unlockTime,
                lastErrorCategory: undefined,
                lastErrorMessage: undefined,
            };
            if (job.state.proofId) {
                const binding = await this.chain.readBinding(job.facilityId, job.state.proofId);
                if (matchingBinding(job.state, binding)) {
                    await this.completeStep(job, leaseToken, "binding_already_processed_on_chain");
                    return;
                }
                if (!/^0x0{64}$/i.test(binding.bindingProofId)) {
                    throw new TerminalWorkerError("facility_already_bound_with_different_proof", "The facility has binding evidence that does not match this job", job.facilityId);
                }
            }
            await this.store.saveJob(job, leaseToken, true);
            return;
        }
        const facility = await this.facilityFor(job);
        const source = await this.chain.verifySource(facility, job.sourceTxHash, job.state.sourceBlock);
        const nextStatus = job.state.cc3SubmissionTxHash
            ? { status: "cc3_submission_pending" as const, nextAction: "check_cc3_submission" as const }
            : { status: "attestation_pending" as const, nextAction: "wait_attestcoin" as const };
        job.state = {
            ...job.state,
            ...nextStatus,
            sourceBlock: source.sourceBlock,
            sourceReceiptStatus: source.receiptStatus,
            sourceEvent: source.event,
            lockerATokenBalance: source.lockerATokenBalance,
            lastErrorCategory: undefined,
            lastErrorMessage: undefined,
        };

        if (job.state.proofId) {
            const qualification = await this.chain.readQualification(job.facilityId, job.state.proofId);
            if (matchingQualification(job.state, qualification)) {
                await this.completeStep(job, leaseToken, "proof_already_processed_on_chain");
                return;
            }
            if (qualification.preferredRateActive || qualification.processedProof) {
                throw new TerminalWorkerError(
                    "facility_already_qualified_with_different_proof",
                    "The facility has proof state that does not match this job",
                    job.facilityId,
                );
            }
        }

        await this.store.saveJob(job, leaseToken, true);
    }

    private async attestationStep(claimed: ClaimedJob): Promise<void> {
        const { job, leaseToken } = claimed;
        if (job.state.sourceBlock === undefined) {
            throw new TerminalWorkerError("source_block_missing", "The job has no confirmed source block", job.sourceTxHash);
        }
        await this.chain.waitForAttestation(job.state.sourceBlock);
        job.state = {
            ...job.state,
            status: "proof_generation_pending",
            nextAction: "generate_proof",
            lastErrorCategory: undefined,
            lastErrorMessage: undefined,
        };
        await this.store.saveJob(job, leaseToken, true);
    }

    private async proofStep(claimed: ClaimedJob): Promise<void> {
        const { job, leaseToken } = claimed;
        if (job.state.sourceBlock === undefined) {
            throw new TerminalWorkerError("source_block_missing", "The job has no confirmed source block", job.sourceTxHash);
        }
        const generated = await this.chain.generateProof(job.sourceTxHash, job.state.sourceBlock);
        if (job.state.proofId && !sameProof(job.state.proofId, generated.proofId)) {
            throw new TerminalWorkerError("proof_id_mismatch", "The generated proof does not match the registered proof ID", job.sourceTxHash);
        }
        job.state = {
            ...job.state,
            status: "proof_ready",
            nextAction: "submit_cc3",
            proof: generated.proof,
            proofId: generated.proofId,
            proofSdkValid: generated.sdkProofValid,
            proofGeneratedAt: generated.proof.generatedAt || nowIso(),
            lastErrorCategory: undefined,
            lastErrorMessage: undefined,
        };
        await this.store.saveJob(job, leaseToken, true);
    }

    private async submitStep(claimed: ClaimedJob): Promise<void> {
        const { job, leaseToken } = claimed;
        if (!job.state.proof || !job.state.proofId || job.state.sourceBlock === undefined) {
            throw new TerminalWorkerError("proof_material_missing", "A proof-ready job has incomplete proof material", job.jobId);
        }
        if (job.state.operation === "binding") {
            const proof = job.state.proof;
            if (!proof) throw new TerminalWorkerError("submission_proof_missing", "The durable submission intent has no proof payload", job.jobId);
            const binding = await this.chain.readBinding(job.facilityId, job.state.proofId);
            if (matchingBinding(job.state, binding)) {
                await this.completeStep(job, leaseToken, "binding_already_processed_on_chain");
                return;
            }
            if (!/^0x0{64}$/i.test(binding.bindingProofId)) {
                throw new TerminalWorkerError("proof_already_used_or_facility_bound", "CC3 state prevents this binding proof from being submitted safely", job.facilityId);
            }
            const nonce = job.state.cc3SubmissionNonce ?? await this.chain.reserveSubmissionNonce();
            job.state = { ...job.state, status: "cc3_submission_pending", nextAction: "check_cc3_submission", cc3SubmissionNonce: nonce };
            await this.store.saveJob(job, leaseToken, false);
            const txHash = await this.chain.sendBinding(job.facilityId, proof, nonce);
            job.state = { ...job.state, cc3SubmissionTxHash: txHash, lastErrorCategory: undefined, lastErrorMessage: undefined };
            await this.store.saveJob(job, leaseToken, true);
            return;
        }
        const facility = await this.facilityFor(job);
        if (
            facility.preferredRateActive
            && facility.qualificationSourceBlock === job.state.sourceBlock
            && facility.qualificationProofId
            && !/^0x0{64}$/i.test(facility.qualificationProofId)
        ) {
            const existing = await this.chain.readQualification(job.facilityId, facility.qualificationProofId);
            if (
                existing.processedProof
                && existing.preferredRateActive
                && existing.qualificationSourceBlock === job.state.sourceBlock
                && sameProof(existing.qualificationProofId, facility.qualificationProofId)
            ) {
                job.state = { ...job.state, proofId: facility.qualificationProofId };
                await this.completeStep(job, leaseToken, "proof_already_processed_on_chain");
                return;
            }
        }
        const qualification = await this.chain.readQualification(job.facilityId, job.state.proofId);
        if (matchingQualification(job.state, qualification)) {
            await this.completeStep(job, leaseToken, "proof_already_processed_on_chain");
            return;
        }
        if (qualification.preferredRateActive || qualification.processedProof) {
            throw new TerminalWorkerError(
                "proof_already_used_or_facility_qualified",
                "CC3 state prevents this proof from being submitted safely",
                job.facilityId,
            );
        }
        if (!facility.funded) {
            throw new TerminalWorkerError("facility_not_funded", "The facility is not funded", job.facilityId);
        }

        const nonce = job.state.cc3SubmissionNonce ?? await this.chain.reserveSubmissionNonce();
        job.state = {
            ...job.state,
            status: "cc3_submission_pending",
            nextAction: "check_cc3_submission",
            cc3SubmissionNonce: nonce,
        };
        await this.store.saveJob(job, leaseToken, false);

        const proof = job.state.proof;
        if (!proof) {
            throw new TerminalWorkerError("submission_proof_missing", "The durable submission intent has no proof payload", job.jobId);
        }
        const txHash = await this.chain.sendQualification(job.facilityId, proof, nonce);
        job.state = {
            ...job.state,
            cc3SubmissionTxHash: txHash,
            lastErrorCategory: undefined,
            lastErrorMessage: undefined,
        };
        await this.store.saveJob(job, leaseToken, true);
    }

    private async checkSubmissionStep(claimed: ClaimedJob): Promise<void> {
        const { job, leaseToken } = claimed;
        if (!job.state.proofId || job.state.sourceBlock === undefined) {
            throw new TerminalWorkerError("proof_material_missing", "A pending CC3 submission has no proof identity", job.jobId);
        }

        if (job.state.operation === "binding") {
            const before = await this.chain.readBinding(job.facilityId, job.state.proofId);
            if (matchingBinding(job.state, before)) {
                await this.completeStep(job, leaseToken, "binding_already_processed_on_chain");
                return;
            }
            if (job.state.cc3SubmissionTxHash) {
                const receipt = await this.chain.getReceipt(job.state.cc3SubmissionTxHash);
                if (!receipt) throw new RetryableWorkerError("cc3_submission_pending", "The CC3 submission receipt is not available", job.state.cc3SubmissionTxHash);
                if (receipt.status !== 1) throw new TerminalWorkerError("cc3_submission_reverted", "The CC3 binding transaction reverted", job.state.cc3SubmissionTxHash);
                const after = await this.chain.readBinding(job.facilityId, job.state.proofId);
                if (!matchingBinding(job.state, after)) throw new TerminalWorkerError("cc3_state_readback_failed", "The successful CC3 receipt did not produce the expected binding state", job.facilityId);
                job.state = { ...job.state, cc3Receipt: receipt };
                await this.completeStep(job, leaseToken, "binding_receipt_confirmed");
                return;
            }
            if (job.state.cc3SubmissionNonce === undefined) throw new TerminalWorkerError("submission_nonce_missing", "A pending submission has no durable nonce", job.jobId);
            const recoveredHash = await this.chain.findSubmissionByNonce(job.state.cc3SubmissionNonce);
            if (recoveredHash) { job.state = { ...job.state, cc3SubmissionTxHash: recoveredHash }; await this.store.saveJob(job, leaseToken, true); return; }
            const nonceState = await this.chain.getSubmissionNonceState();
            if (nonceState.latest > job.state.cc3SubmissionNonce) throw new TerminalWorkerError("submission_nonce_consumed_without_proof", "The durable submission nonce was consumed without the expected binding state", job.facilityId);
            if (nonceState.pending > job.state.cc3SubmissionNonce) throw new RetryableWorkerError("submission_nonce_pending", "A transaction is still pending at the reserved nonce", job.facilityId);
            if (!job.state.proof) throw new TerminalWorkerError("submission_proof_missing", "The durable submission intent has no proof payload", job.jobId);
            const txHash = await this.chain.sendBinding(job.facilityId, job.state.proof, job.state.cc3SubmissionNonce);
            job.state = { ...job.state, cc3SubmissionTxHash: txHash };
            await this.store.saveJob(job, leaseToken, true);
            return;
        }

        const before = await this.chain.readQualification(job.facilityId, job.state.proofId);
        if (matchingQualification(job.state, before)) {
            await this.completeStep(job, leaseToken, "proof_already_processed_on_chain");
            return;
        }

        if (job.state.cc3SubmissionTxHash) {
            const receipt = await this.chain.getReceipt(job.state.cc3SubmissionTxHash);
            if (!receipt) throw new RetryableWorkerError("cc3_submission_pending", "The CC3 submission receipt is not available", job.state.cc3SubmissionTxHash);
            if (receipt.status !== 1) {
                throw new TerminalWorkerError("cc3_submission_reverted", "The CC3 submission reverted", job.state.cc3SubmissionTxHash);
            }
            const after = await this.chain.readQualification(job.facilityId, job.state.proofId);
            if (!matchingQualification(job.state, after)) {
                throw new TerminalWorkerError("cc3_state_readback_failed", "The successful CC3 receipt did not produce the expected qualification state", job.facilityId);
            }
            job.state = {
                ...job.state,
                cc3Receipt: receipt,
            };
            await this.completeStep(job, leaseToken, "submission_receipt_confirmed");
            return;
        }

        if (job.state.cc3SubmissionNonce === undefined) {
            throw new TerminalWorkerError("submission_nonce_missing", "A pending submission has no durable nonce", job.jobId);
        }

        const recoveredHash = await this.chain.findSubmissionByNonce(job.state.cc3SubmissionNonce);
        if (recoveredHash) {
            job.state = { ...job.state, cc3SubmissionTxHash: recoveredHash };
            await this.store.saveJob(job, leaseToken, true);
            return;
        }

        const nonceState = await this.chain.getSubmissionNonceState();
        if (nonceState.latest > job.state.cc3SubmissionNonce) {
            throw new TerminalWorkerError(
                "submission_nonce_consumed_without_proof",
                "The durable submission nonce was consumed without the expected proof state",
                job.facilityId,
            );
        }
        if (nonceState.pending > job.state.cc3SubmissionNonce) {
            throw new RetryableWorkerError("submission_nonce_pending", "A transaction is still pending at the reserved nonce", job.facilityId);
        }
        if (!job.state.proof) {
            throw new TerminalWorkerError("submission_proof_missing", "The durable submission intent has no proof payload", job.jobId);
        }

        const txHash = await this.chain.sendQualification(job.facilityId, job.state.proof, job.state.cc3SubmissionNonce);
        job.state = { ...job.state, cc3SubmissionTxHash: txHash };
        await this.store.saveJob(job, leaseToken, true);
    }

    private async completeStep(job: JobRecord, leaseToken: string, outcome: string): Promise<void> {
        job.state = {
            ...job.state,
            status: "completed",
            nextAction: "complete",
            terminal: true,
            completedAt: job.state.completedAt || nowIso(),
            idempotencyOutcome: outcome,
            lastErrorCategory: undefined,
            lastErrorMessage: undefined,
        };
        await this.store.saveJob(job, leaseToken, true);
    }

    private async handleError(claimed: ClaimedJob, error: unknown): Promise<TickResult> {
        const { job, leaseToken } = claimed;
        const terminal = error instanceof TerminalWorkerError
            || (!error || !(error instanceof RetryableWorkerError) && !isLikelyRetryable(error));
        const category = error instanceof TerminalWorkerError || error instanceof RetryableWorkerError
            ? error.category
            : terminal ? "worker_unexpected_error" : "worker_retryable_error";
        const evidenceId = error instanceof TerminalWorkerError || error instanceof RetryableWorkerError
            ? error.evidenceId
            : undefined;
        job.state = {
            ...job.state,
            ...(terminal
                ? { status: "manual_review" as const, nextAction: "manual_review" as const, terminal: true }
                : {}),
            retryCount: job.state.retryCount + (terminal ? 0 : 1),
            lastErrorCategory: category,
            lastErrorMessage: cleanError(error),
            evidenceId: evidenceId || job.state.evidenceId || job.sourceTxHash,
        };
        await this.store.saveJob(job, leaseToken, true);
        const updated = await this.store.getJob(job.jobId);
        return {
            outcome: terminal ? "manual_review" : "retrying",
            job: updated,
            message: terminal ? "Manual review required" : "Retryable worker condition recorded",
        };
    }
}

export function qualificationJobMessage(input: JobInput, issuedAt: number): string {
    return [
        "Verd qualification job",
        `Operation: ${input.operation ?? "qualification"}`,
        `Facility: ${input.facilityId}`,
        `Source transaction: ${input.sourceTxHash}`,
        `Source block: ${input.sourceBlock ?? "not supplied"}`,
        `Issued at: ${issuedAt}`,
    ].join("\n");
}
