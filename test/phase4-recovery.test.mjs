import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
    ACTIONS,
    createRecoveryState,
    loadRecoveryState,
    reduceRecoveryState,
    saveRecoveryState,
} from "../scripts/phase4-recovery.mjs";

function facilityState() {
    return createRecoveryState({
        facilityId: "0xfacility",
        sourceTxHash: "0xsource",
    });
}

function proofReadyState() {
    let state = facilityState();
    state = reduceRecoveryState(state, { type: "SOURCE_CONFIRMED", sourceBlock: 100 });
    state = reduceRecoveryState(state, { type: "ATTESTATION_READY" });
    return state;
}

test("source transaction pending state resumes at Attestcoin wait", () => {
    const state = reduceRecoveryState(facilityState(), {
        type: "SOURCE_CONFIRMED",
        sourceBlock: 100,
    });

    assert.equal(state.nextAction, ACTIONS.WAIT_ATTESTCOIN);
    assert.equal(state.sourceBlock, 100);
});

test("Attestcoin wait resumes at proof generation", () => {
    const state = reduceRecoveryState(
        reduceRecoveryState(facilityState(), { type: "SOURCE_CONFIRMED", sourceBlock: 100 }),
        { type: "ATTESTATION_READY" },
    );

    assert.equal(state.nextAction, ACTIONS.GENERATE_PROOF);
});

test("proof-builder timeout retries safely without submitting a duplicate", () => {
    const timedOut = reduceRecoveryState(proofReadyState(), {
        type: "PROOF_BUILDER_TIMEOUT",
        errorCategory: "proof_builder_timeout",
    });

    assert.equal(timedOut.nextAction, ACTIONS.GENERATE_PROOF);
    assert.equal(timedOut.retryCount, 1);
    assert.equal(timedOut.cc3SubmissionTxHash, undefined);

    const proofReady = reduceRecoveryState(timedOut, {
        type: "PROOF_READY",
        proofId: "0xproof",
    });
    assert.equal(proofReady.nextAction, ACTIONS.SUBMIT_CC3);
    assert.equal(proofReady.proofId, "0xproof");
});

test("CC3 submission timeout checks the existing transaction before retrying", () => {
    let state = reduceRecoveryState(proofReadyState(), {
        type: "PROOF_READY",
        proofId: "0xproof",
    });
    state = reduceRecoveryState(state, {
        type: "CC3_SUBMISSION_SENT",
        txHash: "0xcc3tx",
    });
    state = reduceRecoveryState(state, { type: "CC3_SUBMISSION_TIMEOUT" });

    assert.equal(state.nextAction, ACTIONS.CHECK_CC3_SUBMISSION);
    assert.equal(state.cc3SubmissionTxHash, "0xcc3tx");

    state = reduceRecoveryState(state, {
        type: "CC3_RECEIPT_FOUND",
        receiptStatus: 1,
        preferredRateActive: true,
    });
    assert.equal(state.nextAction, ACTIONS.COMPLETE);
});

test("terminal validation failure cannot be blindly retried", () => {
    const terminal = reduceRecoveryState(proofReadyState(), {
        type: "VALIDATION_FAILURE",
        errorCategory: "wrong_supply_locker",
        evidenceId: "0xsource",
    });

    assert.equal(terminal.nextAction, ACTIONS.MANUAL_REVIEW);
    assert.equal(terminal.terminal, true);
    assert.throws(
        () => reduceRecoveryState(terminal, { type: "PROOF_BUILDER_TIMEOUT" }),
        /terminal recovery state/,
    );
});

test("browser reload preserves the next safe action and idempotency fields", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "verd-phase4-"));
    const statePath = path.join(directory, "recovery.json");
    let state = reduceRecoveryState(proofReadyState(), {
        type: "PROOF_READY",
        proofId: "0xproof",
    });
    state = reduceRecoveryState(state, {
        type: "CC3_SUBMISSION_SENT",
        txHash: "0xcc3tx",
    });
    saveRecoveryState(statePath, state);

    const reloaded = loadRecoveryState(statePath);
    assert.equal(reloaded.nextAction, ACTIONS.CHECK_CC3_SUBMISSION);
    assert.equal(reloaded.cc3SubmissionTxHash, "0xcc3tx");
    assert.equal(reloaded.facilityId, "0xfacility");
    fs.rmSync(directory, { recursive: true, force: true });
});
