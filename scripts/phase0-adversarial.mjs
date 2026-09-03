import { createRequire } from "node:module";
import { ethers } from "ethers";
import {
    cleanError,
    env,
    isoNow,
    readState,
    required,
    writeState,
} from "./lib.mjs";

const require = createRequire(import.meta.url);
const sdk = require("@gluwa/usc-sdk");
const PROBE_ABI = [
    "function proofId(uint64 sourceChainKey,uint64 sourceBlock,(uint8 kind,bytes32 root,bytes data) inclusionProof,(bytes32 lowerEndpointDigest,bytes32[] roots) continuityProof) view returns (bytes32)",
    "function qualify(bytes32 facilityId,uint64 sourceChainKey,uint64 sourceBlock,(uint8 kind,bytes32 root,bytes data) inclusionProof,(bytes32 lowerEndpointDigest,bytes32[] roots) continuityProof,address expectedBorrower,address locker,uint256 requiredAmount,uint64 qualificationDeadline,uint64 facilityMaturity) returns (bytes32)",
    "function processedProof(bytes32 proofId) view returns (bool)",
];

function proofEnvelope(proofData) {
    const siblings = proofData.merkleProof.siblings.map((entry) => [
        entry.hash ?? entry.sibling,
        Boolean(entry.isLeft),
    ]);
    return [
        0,
        proofData.merkleProof.root,
        ethers.AbiCoder.defaultAbiCoder().encode(
            ["bytes", "tuple(bytes32 sibling,bool isLeft)[]"],
            [proofData.txBytes, siblings],
        ),
    ];
}

function argsFor(state, wrongBorrower = null) {
    const data = state.proof;
    return [
        state.facilityId,
        Number(data.chainKey),
        Number(data.headerNumber),
        proofEnvelope(data),
        [data.continuityProof.lowerEndpointDigest, data.continuityProof.roots],
        wrongBorrower || state.borrower,
        state.reserveLocker,
        BigInt(state.requiredAmount),
        BigInt(state.qualificationDeadline),
        BigInt(state.facilityMaturity),
    ];
}

async function broadcastExpectedRevert(provider, signer, probeAddress, data, label) {
    const fee = await provider.getFeeData();
    const nonce = await provider.getTransactionCount(signer.address, "pending");
    const request = {
        chainId: 102031,
        nonce,
        to: probeAddress,
        data,
        gasLimit: 9000000n,
    };
    if (fee.maxFeePerGas != null) {
        request.maxFeePerGas = fee.maxFeePerGas;
        request.maxPriorityFeePerGas = fee.maxPriorityFeePerGas ?? 0n;
    } else {
        request.gasPrice = fee.gasPrice;
    }
    const raw = await signer.signTransaction(request);
    const tx = await provider.broadcastTransaction(raw);
    let receipt;
    try {
        receipt = await tx.wait();
    } catch {
        receipt = await provider.getTransactionReceipt(tx.hash);
    }
    if (!receipt || receipt.status !== 0) throw new Error(`${label}_did_not_revert`);
    console.log(`${label}|status=REVERTED|tx=${tx.hash}|block=${receipt.blockNumber}`);
    return receipt;
}

async function main() {
    const modeIndex = process.argv.indexOf("--mode");
    const mode = modeIndex >= 0 ? process.argv[modeIndex + 1] : "";
    if (!mode || !["wrong-borrower", "replay"].includes(mode)) {
        throw new Error("Use --mode wrong-borrower or --mode replay");
    }
    const state = readState();
    if (!state.proof) throw new Error("proof_not_available_in_state");
    if (mode === "wrong-borrower" && state.step !== "proof_ready") {
        throw new Error(`wrong-borrower_requires_proof_ready:${state.step}`);
    }
    if (mode === "replay" && state.step !== "completed") {
        throw new Error(`replay_requires_completed_state:${state.step}`);
    }

    const provider = new ethers.JsonRpcProvider(required("CC3_RPC_URL"));
    const signer = new ethers.Wallet(required("PRIVATE_KEY"), provider);
    const probeAddress = required("VERD_ADDRESS");
    const iface = new ethers.Interface(PROBE_ABI);
    const probe = new ethers.Contract(probeAddress, PROBE_ABI, provider);
    const data = state.proof;
    const inclusion = proofEnvelope(data);
    const continuity = [data.continuityProof.lowerEndpointDigest, data.continuityProof.roots];
    const id = await probe.proofId(Number(data.chainKey), Number(data.headerNumber), inclusion, continuity);
    const callArgs = mode === "wrong-borrower"
        ? argsFor(state, "0x000000000000000000000000000000000000dEaD")
        : argsFor(state);
    const encoded = iface.encodeFunctionData("qualify", callArgs);
    const receipt = await broadcastExpectedRevert(
        provider,
        signer,
        probeAddress,
        encoded,
        mode === "wrong-borrower" ? "NEGATIVE_WRONG_BORROWER" : "REPLAY_DUPLICATE_PROOF",
    );
    const processed = await probe.processedProof(id);
    if (mode === "wrong-borrower" && processed) throw new Error("negative_path_consumed_proof");
    if (mode === "replay" && !processed) throw new Error("replay_mapping_not_set");
    state.adversarial = state.adversarial || {};
    state.adversarial[mode === "wrong-borrower" ? "negative" : "replay"] = {
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        status: receipt.status,
        proofId: id,
        checkedAt: isoNow(),
    };
    writeState(state);
    console.log(`proofId=${id}`);
    console.log(`processedProof=${processed}`);
}

main().catch((error) => {
    console.error(`PHASE0_ADVERSARIAL_FAILED|${cleanError(error)}`);
    process.exitCode = 1;
});
