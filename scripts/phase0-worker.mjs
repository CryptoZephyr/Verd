import fs from "node:fs";
import { createRequire } from "node:module";
import { ethers } from "ethers";
import {
    ADDRESSES,
    cleanError,
    env,
    isoNow,
    readState,
    required,
    sleep,
    writeState,
} from "./lib.mjs";

const require = createRequire(import.meta.url);
const sdk = require("@gluwa/usc-sdk");
const PROBE_ABI = [
    "function proofId(uint64 sourceChainKey,uint64 sourceBlock,(uint8 kind,bytes32 root,bytes data) inclusionProof,(bytes32 lowerEndpointDigest,bytes32[] roots) continuityProof) view returns (bytes32)",
    "function qualify(bytes32 facilityId,uint64 sourceChainKey,uint64 sourceBlock,(uint8 kind,bytes32 root,bytes data) inclusionProof,(bytes32 lowerEndpointDigest,bytes32[] roots) continuityProof,address expectedBorrower,address locker,uint256 requiredAmount,uint64 qualificationDeadline,uint64 facilityMaturity) returns (bytes32)",
    "function preferredRateActive(bytes32 facilityId) view returns (bool)",
    "function processedProof(bytes32 proofId) view returns (bool)",
    "function facilityAmount(bytes32 facilityId) view returns (uint256)",
    "function facilitySourceBlock(bytes32 facilityId) view returns (uint64)",
];
const SOURCE_ABI = [
    "event Supply(address indexed reserve,address user,address indexed onBehalfOf,uint256 amount,uint16 indexed referralCode)",
];
const LOCKER_ABI = [
    "function borrower() view returns (address)",
    "function aavePool() view returns (address)",
    "function reserveAsset() view returns (address)",
    "function aToken() view returns (address)",
    "function unlockTime() view returns (uint256)",
    "function aTokenBalance() view returns (uint256)",
];

async function verifyLocker(provider, state) {
    const locker = new ethers.Contract(state.reserveLocker, LOCKER_ABI, provider);
    const config = await Promise.all([
        locker.borrower(),
        locker.aavePool(),
        locker.reserveAsset(),
        locker.aToken(),
        locker.unlockTime(),
        locker.aTokenBalance(),
    ]);
    if (config[0].toLowerCase() !== state.borrower.toLowerCase()) throw new Error("locker_borrower_mismatch");
    if (config[1].toLowerCase() !== state.approvedAavePool.toLowerCase()) throw new Error("locker_pool_mismatch");
    if (config[2].toLowerCase() !== state.reserveAsset.toLowerCase()) throw new Error("locker_reserve_mismatch");
    if (config[3].toLowerCase() !== state.aToken.toLowerCase()) throw new Error("locker_atoken_mismatch");
    if (config[4] < BigInt(state.facilityMaturity)) throw new Error("locker_maturity_mismatch");
    if (config[5] < BigInt(state.requiredAmount)) throw new Error("locker_atoken_balance_insufficient");
    return config[5];
}

function proofEnvelope(proofData) {
    const siblings = proofData.merkleProof.siblings.map((entry) => [
        entry.hash ?? entry.sibling,
        Boolean(entry.isLeft),
    ]);
    const data = ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes", "tuple(bytes32 sibling,bool isLeft)[]"],
        [proofData.txBytes, siblings],
    );
    return [0, proofData.merkleProof.root, data];
}

function continuityEnvelope(proofData) {
    return [proofData.continuityProof.lowerEndpointDigest, proofData.continuityProof.roots];
}

async function verifySource(provider, state) {
    const tx = await provider.getTransaction(state.sourceTxHash);
    const receipt = await provider.getTransactionReceipt(state.sourceTxHash);
    if (!tx || !receipt) throw new Error("source_transaction_pending");
    if (receipt.status !== 1) throw new Error("source_transaction_failed");
    if (tx.from.toLowerCase() !== state.borrower.toLowerCase()) throw new Error("source_borrower_mismatch");
    if (tx.to?.toLowerCase() !== state.approvedAavePool.toLowerCase()) throw new Error("source_pool_mismatch");
    const iface = new ethers.Interface(SOURCE_ABI);
    const event = receipt.logs.map((log) => {
        try { return iface.parseLog({ topics: log.topics, data: log.data }); } catch { return null; }
    }).find((parsed) => parsed?.name === "Supply");
    if (!event) throw new Error("supply_event_missing");
    if (event.args.reserve.toLowerCase() !== state.reserveAsset.toLowerCase()) throw new Error("source_reserve_mismatch");
    if (event.args.user.toLowerCase() !== state.borrower.toLowerCase()) throw new Error("source_user_mismatch");
    if (event.args.onBehalfOf.toLowerCase() !== state.reserveLocker.toLowerCase()) throw new Error("source_locker_mismatch");
    if (event.args.amount.toString() !== state.requiredAmount) throw new Error("source_amount_mismatch");
    if (event.args.referralCode !== 0n) throw new Error("source_referral_mismatch");
    const lockerBalance = await verifyLocker(provider, state);
    state.reserveLockerATokenBalance = lockerBalance.toString();
    return { receipt, event, lockerBalance };
}

async function getProof(provider, state) {
    const chainKey = Number(env.SOURCE_CHAIN_KEY || ADDRESSES.sourceChainKey);
    const builder = new sdk.proofProvider.service.ProofBuilder(
        chainKey,
        required("PROOF_BUILDER_URL"),
        30000,
    );
    const prover = new sdk.blockProver.PrecompileBlockProver(provider);
    try {
        await builder.waitUntilHeightAttested(
            chainKey,
            Number(state.sourceBlock),
            15000,
            900000,
            5000,
        );
    } catch (error) {
        throw new Error(`attestation_capability_failed:${cleanError(error)}`);
    }
    const maxAttempts = 40;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const result = await builder.getProof(state.sourceTxHash);
        if (result.success && result.data) {
            const proofData = result.data;
            if (proofData.txHash.toLowerCase() !== state.sourceTxHash.toLowerCase()) {
                throw new Error("proof_transaction_hash_mismatch");
            }
            const valid = await prover.verifySingle(
                proofData.chainKey,
                proofData.headerNumber,
                proofData.txBytes,
                proofData.merkleProof,
                proofData.continuityProof,
            );
            if (!valid) throw new Error("attestcoin_proof_capability_failed");
            return proofData;
        }
        const reason = String(result.error || "not ready");
        const retriable = reason.includes('"retriable":true') || /reorg-protection/i.test(reason);
        if (!retriable) {
            throw new Error(`attestcoin_proof_capability_failed:${reason.slice(0, 300)}`);
        }
        console.log(`attestation_pending|attempt=${attempt}|reason=${reason.slice(0, 160)}`);
        await sleep(15000);
    }
    throw new Error("attestation_pending_timeout");
}

async function submitProof(provider, signer, state) {
    const proofData = state.proof;
    const inclusion = proofEnvelope(proofData);
    const continuity = continuityEnvelope(proofData);
    const probeAddress = required("VERD_ADDRESS");
    const probe = new ethers.Contract(probeAddress, PROBE_ABI, signer);
    const args = [
        state.facilityId,
        Number(proofData.chainKey),
        Number(proofData.headerNumber),
        inclusion,
        continuity,
        state.borrower,
        state.reserveLocker,
        BigInt(state.requiredAmount),
        BigInt(state.qualificationDeadline),
        BigInt(state.facilityMaturity),
    ];
    const id = await probe.proofId(
        Number(proofData.chainKey),
        Number(proofData.headerNumber),
        inclusion,
        continuity,
    );
    state.probeAddress = probeAddress;
    state.proofId = id;
    state.step = "cc3_submission_pending";
    state.updatedAt = isoNow();
    writeState(state);

    const tx = await probe.qualify(...args, { gasLimit: 9000000n });
    state.cc3TxHash = tx.hash;
    state.updatedAt = isoNow();
    writeState(state);
    const receipt = await tx.wait();
    if (!receipt || receipt.status !== 1) throw new Error("cc3_qualification_failed");

    state.cc3Receipt = {
        status: receipt.status,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
    };
    state.step = "completed";
    state.completedAt = isoNow();
    writeState(state);

    const active = await probe.preferredRateActive(state.facilityId);
    const processed = await probe.processedProof(id);
    const recordedAmount = await probe.facilityAmount(state.facilityId);
    const recordedBlock = await probe.facilitySourceBlock(state.facilityId);
    if (!active || !processed || recordedAmount !== BigInt(state.requiredAmount) || recordedBlock !== BigInt(proofData.headerNumber)) {
        throw new Error("cc3_state_readback_failed");
    }
    console.log("PHASE0_CC3_CONFIRMED");
    console.log(`probe=${probeAddress}`);
    console.log(`proofId=${id}`);
    console.log(`cc3Tx=${tx.hash}`);
    console.log(`cc3Block=${receipt.blockNumber}`);
    console.log(`preferredRateActive=${active}`);
    console.log(`processedProof=${processed}`);
    console.log(`state=completed`);
}

async function main() {
    const state = readState();
    const provider = new ethers.JsonRpcProvider(required("CC3_RPC_URL"));
    const signer = new ethers.Wallet(required("PRIVATE_KEY"), provider);

    if (state.step === "source_transaction_confirmed" || state.step === "attestation_pending") {
        await verifySource(new ethers.JsonRpcProvider(required("SEPOLIA_RPC_URL")), state);
        if (state.step === "source_transaction_confirmed") {
            state.step = "attestation_pending";
            state.updatedAt = isoNow();
            writeState(state);
        }
        state.proof = await getProof(provider, state);
        state.proofVerifiedBySdk = true;
        state.proofGeneratedAt = new Date(state.proof.generatedAt).toISOString();
        state.step = "proof_ready";
        state.updatedAt = isoNow();
        writeState(state);
        console.log(`PROOF_READY|sourceTx=${state.sourceTxHash}|sourceBlock=${state.proof.headerNumber}`);
        if (process.argv.includes("--interrupt-after-proof")) {
            console.log("INTERRUPTED_AFTER_PROOF_READY");
            process.exitCode = 75;
            return;
        }
    }

    if (state.step === "proof_ready") {
        if (process.argv.includes("--interrupt-before-submit")) {
            state.workerInterruptedAt = isoNow();
            writeState(state);
            console.log("INTERRUPTED_BEFORE_CC3_SUBMISSION");
            process.exitCode = 75;
            return;
        }
        await submitProof(provider, signer, state);
        return;
    }

    if (state.step === "cc3_submission_pending") {
        if (!state.cc3TxHash) throw new Error("cc3_submission_pending_without_hash");
        const receipt = await provider.getTransactionReceipt(state.cc3TxHash);
        if (!receipt) throw new Error("cc3_transaction_pending");
        if (receipt.status !== 1) {
            state.cc3FailedTxHash = state.cc3TxHash;
            delete state.cc3TxHash;
            state.step = "proof_ready";
            state.updatedAt = isoNow();
            writeState(state);
            console.log(`CC3_SUBMISSION_REVERTED|tx=${state.cc3FailedTxHash}|state=proof_ready`);
            return;
        }
        state.step = "completed";
        state.completedAt = isoNow();
        writeState(state);
        console.log(`PHASE0_CC3_CONFIRMED|cc3Tx=${state.cc3TxHash}|cc3Block=${receipt.blockNumber}`);
        return;
    }

    if (state.step === "completed") {
        console.log(`PHASE0_ALREADY_COMPLETED|cc3Tx=${state.cc3TxHash}`);
        return;
    }
    throw new Error(`unsupported_worker_state:${state.step}`);
}

main().catch((error) => {
    console.error(`PHASE0_WORKER_FAILED|${cleanError(error)}`);
    process.exitCode = 1;
});
