import fs from "node:fs";

export const ACTIONS = Object.freeze({
    WAIT_SOURCE_TRANSACTION: "wait_source_transaction",
    WAIT_ATTESTCOIN: "wait_attestcoin",
    GENERATE_PROOF: "generate_proof",
    SUBMIT_CC3: "submit_cc3",
    CHECK_CC3_SUBMISSION: "check_cc3_submission",
    MANUAL_REVIEW: "manual_review",
    COMPLETE: "complete",
});

function requireValue(value, name) {
    if (value === undefined || value === null || value === "") {
        throw new Error(`${name} is required`);
    }
}

function copyState(state) {
    return { ...state };
}

function requireAction(state, action) {
    if (state.nextAction !== action) {
        throw new Error(`invalid recovery action: expected ${action}, got ${state.nextAction}`);
    }
}

export function createRecoveryState({ facilityId, sourceTxHash }) {
    requireValue(facilityId, "facilityId");
    requireValue(sourceTxHash, "sourceTxHash");
    return {
        version: 1,
        facilityId,
        sourceTxHash,
        state: "source_pending",
        nextAction: ACTIONS.WAIT_SOURCE_TRANSACTION,
        retryCount: 0,
        terminal: false,
    };
}

export function reduceRecoveryState(state, event) {
    if (!state || state.version !== 1) throw new Error("unsupported recovery state");
    if (state.terminal) throw new Error("terminal recovery state cannot be retried");
    requireValue(event?.type, "event.type");

    const next = copyState(state);
    switch (event.type) {
        case "SOURCE_CONFIRMED":
            requireAction(state, ACTIONS.WAIT_SOURCE_TRANSACTION);
            requireValue(event.sourceBlock, "sourceBlock");
            next.state = "source_confirmed";
            next.sourceBlock = event.sourceBlock;
            next.nextAction = ACTIONS.WAIT_ATTESTCOIN;
            return next;

        case "ATTESTATION_READY":
            requireAction(state, ACTIONS.WAIT_ATTESTCOIN);
            next.state = "attestation_ready";
            next.nextAction = ACTIONS.GENERATE_PROOF;
            return next;

        case "PROOF_BUILDER_TIMEOUT":
            requireAction(state, ACTIONS.GENERATE_PROOF);
            next.state = "proof_generation_pending";
            next.nextAction = ACTIONS.GENERATE_PROOF;
            next.retryCount += 1;
            next.lastErrorCategory = event.errorCategory || "proof_builder_timeout";
            return next;

        case "PROOF_READY":
            requireAction(state, ACTIONS.GENERATE_PROOF);
            requireValue(event.proofId, "proofId");
            next.state = "proof_ready";
            next.proofId = event.proofId;
            next.nextAction = ACTIONS.SUBMIT_CC3;
            return next;

        case "CC3_SUBMISSION_SENT":
            requireAction(state, ACTIONS.SUBMIT_CC3);
            requireValue(event.txHash, "txHash");
            next.state = "cc3_submission_pending";
            next.cc3SubmissionTxHash = event.txHash;
            next.nextAction = ACTIONS.CHECK_CC3_SUBMISSION;
            return next;

        case "CC3_SUBMISSION_TIMEOUT":
            requireAction(state, ACTIONS.CHECK_CC3_SUBMISSION);
            next.state = "cc3_submission_pending";
            next.nextAction = ACTIONS.CHECK_CC3_SUBMISSION;
            next.retryCount += 1;
            next.lastErrorCategory = "cc3_submission_timeout";
            return next;

        case "CC3_RECEIPT_FOUND":
            requireAction(state, ACTIONS.CHECK_CC3_SUBMISSION);
            if (event.receiptStatus === 1 && event.preferredRateActive === true) {
                next.state = "qualified";
                next.cc3ReceiptStatus = 1;
                next.nextAction = ACTIONS.COMPLETE;
                return next;
            }
            next.state = "terminal_failure";
            next.terminal = true;
            next.nextAction = ACTIONS.MANUAL_REVIEW;
            next.errorCategory = "cc3_submission_validation_failed";
            return next;

        case "VALIDATION_FAILURE":
            next.state = "terminal_failure";
            next.terminal = true;
            next.nextAction = ACTIONS.MANUAL_REVIEW;
            next.errorCategory = event.errorCategory || "terminal_validation_failure";
            next.evidenceId = event.evidenceId;
            return next;

        default:
            throw new Error(`unsupported recovery event: ${event.type}`);
    }
}

export function saveRecoveryState(filePath, state) {
    requireValue(filePath, "filePath");
    if (!state || state.version !== 1) throw new Error("unsupported recovery state");
    fs.writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export function loadRecoveryState(filePath) {
    requireValue(filePath, "filePath");
    const state = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!state || state.version !== 1 || !state.facilityId || !state.sourceTxHash) {
        throw new Error("invalid persisted recovery state");
    }
    return state;
}
