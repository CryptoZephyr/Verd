import { createRequire } from "node:module";
import fs from "node:fs";
import { ethers } from "ethers";
import {
    ADDRESSES,
    cleanError,
    isoNow,
    readState,
    required,
} from "./lib.mjs";

const require = createRequire(import.meta.url);
const sdk = require("@gluwa/usc-sdk");

const POOL_ABI = [
    "function supply(address asset,uint256 amount,address onBehalfOf,uint16 referralCode)",
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
const PROBE_ABI = [
    "function proofId(uint64,uint64,(uint8,bytes32,bytes),(bytes32,bytes32[])) view returns (bytes32)",
    "function approvedAavePool() view returns (address)",
    "function approvedReserveAsset() view returns (address)",
    "function approvedAToken() view returns (address)",
    "function proofVerifier() view returns (address)",
    "function preferredRateActive(bytes32) view returns (bool)",
    "function processedProof(bytes32) view returns (bool)",
    "function facilityAmount(bytes32) view returns (uint256)",
    "function facilitySourceBlock(bytes32) view returns (uint64)",
    "event QualificationAccepted(bytes32 indexed facilityId,bytes32 indexed proofId,uint64 indexed sourceBlock,address borrower,address locker,address reserveAsset,uint256 amount)",
];

function proofEnvelope(proofData) {
    const coder = ethers.AbiCoder.defaultAbiCoder();
    const siblings = proofData.merkleProof.siblings.map((entry) => [
        entry.hash ?? entry.sibling,
        Boolean(entry.isLeft),
    ]);
    return [
        0,
        proofData.merkleProof.root,
        coder.encode(
            ["bytes", "tuple(bytes32 sibling,bool isLeft)[]"],
            [proofData.txBytes, siblings],
        ),
    ];
}

function sameAddress(left, right) {
    return left.toLowerCase() === right.toLowerCase();
}

function receiptStatus(receipt) {
    return receipt?.status ?? null;
}

async function main() {
    const state = readState();
    if (state.step !== "completed") throw new Error(`phase0_not_completed:${state.step}`);

    const sourceProvider = new ethers.JsonRpcProvider(required("SEPOLIA_RPC_URL"));
    const cc3Provider = new ethers.JsonRpcProvider(required("CC3_RPC_URL"));
    const sourceTx = await sourceProvider.getTransaction(state.sourceTxHash);
    const sourceReceipt = await sourceProvider.getTransactionReceipt(state.sourceTxHash);
    if (!sourceTx || !sourceReceipt) throw new Error("source_receipt_missing");
    if (sourceReceipt.status !== 1) throw new Error("source_receipt_failed");
    if (!sameAddress(sourceTx.from, state.borrower)) throw new Error("source_borrower_mismatch");
    if (!sameAddress(sourceTx.to, state.approvedAavePool)) throw new Error("source_pool_mismatch");

    const poolInterface = new ethers.Interface(POOL_ABI);
    const supplyCall = poolInterface.parseTransaction({ data: sourceTx.data, value: sourceTx.value });
    if (!supplyCall || supplyCall.name !== "supply") throw new Error("supply_call_missing");
    if (!sameAddress(supplyCall.args.asset, state.reserveAsset)) throw new Error("supply_call_asset_mismatch");
    if (supplyCall.args.amount !== BigInt(state.requiredAmount)) throw new Error("supply_call_amount_mismatch");
    if (!sameAddress(supplyCall.args.onBehalfOf, state.reserveLocker)) throw new Error("supply_call_locker_mismatch");
    if (supplyCall.args.referralCode !== 0n) throw new Error("supply_call_referral_mismatch");

    const supplyEvent = sourceReceipt.logs.map((log) => {
        try { return poolInterface.parseLog({ topics: log.topics, data: log.data }); } catch { return null; }
    }).find((parsed) => parsed?.name === "Supply");
    if (!supplyEvent) throw new Error("supply_event_missing");
    if (!sameAddress(supplyEvent.args.reserve, state.reserveAsset)) throw new Error("supply_event_reserve_mismatch");
    if (!sameAddress(supplyEvent.args.user, state.borrower)) throw new Error("supply_event_user_mismatch");
    if (!sameAddress(supplyEvent.args.onBehalfOf, state.reserveLocker)) throw new Error("supply_event_locker_mismatch");
    if (supplyEvent.args.amount !== BigInt(state.requiredAmount)) throw new Error("supply_event_amount_mismatch");
    if (supplyEvent.args.referralCode !== 0n) throw new Error("supply_event_referral_mismatch");

    const locker = new ethers.Contract(state.reserveLocker, LOCKER_ABI, sourceProvider);
    const lockerConfig = await Promise.all([
        locker.borrower(),
        locker.aavePool(),
        locker.reserveAsset(),
        locker.aToken(),
        locker.unlockTime(),
        locker.aTokenBalance(),
    ]);
    if (!sameAddress(lockerConfig[0], state.borrower)) throw new Error("locker_borrower_mismatch");
    if (!sameAddress(lockerConfig[1], state.approvedAavePool)) throw new Error("locker_pool_mismatch");
    if (!sameAddress(lockerConfig[2], state.reserveAsset)) throw new Error("locker_reserve_mismatch");
    if (!sameAddress(lockerConfig[3], state.aToken)) throw new Error("locker_atoken_mismatch");
    if (lockerConfig[4] < BigInt(state.facilityMaturity)) throw new Error("locker_maturity_mismatch");
    if (lockerConfig[5] < BigInt(state.requiredAmount)) throw new Error("locker_balance_insufficient");

    const proof = state.proof;
    const inclusion = proofEnvelope(proof);
    const continuity = [proof.continuityProof.lowerEndpointDigest, proof.continuityProof.roots];
    const proofVerifier = new sdk.blockProver.PrecompileBlockProver(cc3Provider);
    const sdkProofValid = await proofVerifier.verifySingle(
        proof.chainKey,
        proof.headerNumber,
        proof.txBytes,
        proof.merkleProof,
        proof.continuityProof,
    );
    if (!sdkProofValid) throw new Error("sdk_native_proof_readback_failed");

    const probe = new ethers.Contract(state.probeAddress, PROBE_ABI, cc3Provider);
    const proofIdentifier = await probe.proofId(
        proof.chainKey,
        proof.headerNumber,
        inclusion,
        continuity,
    );
    const qualificationReceipt = await cc3Provider.getTransactionReceipt(state.cc3TxHash);
    if (!qualificationReceipt || qualificationReceipt.status !== 1) throw new Error("qualification_receipt_failed");
    const qualificationEvent = qualificationReceipt.logs.map((log) => {
        try { return probe.interface.parseLog({ topics: log.topics, data: log.data }); } catch { return null; }
    }).find((parsed) => parsed?.name === "QualificationAccepted");
    if (!qualificationEvent) throw new Error("qualification_event_missing");
    if (qualificationEvent.args.proofId !== proofIdentifier) throw new Error("qualification_proof_id_mismatch");
    if (!sameAddress(qualificationEvent.args.borrower, state.borrower)) throw new Error("qualification_borrower_mismatch");
    if (!sameAddress(qualificationEvent.args.locker, state.reserveLocker)) throw new Error("qualification_locker_mismatch");
    if (!sameAddress(qualificationEvent.args.reserveAsset, state.reserveAsset)) throw new Error("qualification_asset_mismatch");
    if (qualificationEvent.args.amount !== BigInt(state.requiredAmount)) throw new Error("qualification_amount_mismatch");

    const active = await probe.preferredRateActive(state.facilityId);
    const processed = await probe.processedProof(proofIdentifier);
    const facilityAmount = await probe.facilityAmount(state.facilityId);
    const facilitySourceBlock = await probe.facilitySourceBlock(state.facilityId);
    if (!active || !processed) throw new Error("qualification_state_readback_failed");
    if (facilityAmount !== BigInt(state.requiredAmount)) throw new Error("facility_amount_readback_failed");
    if (facilitySourceBlock !== BigInt(proof.headerNumber)) throw new Error("facility_source_block_readback_failed");

    const negativeReceipt = await cc3Provider.getTransactionReceipt(state.adversarial.negative.txHash);
    const replayReceipt = await cc3Provider.getTransactionReceipt(state.adversarial.replay.txHash);
    if (!negativeReceipt || negativeReceipt.status !== 0) throw new Error("negative_receipt_readback_failed");
    if (!replayReceipt || replayReceipt.status !== 0) throw new Error("replay_receipt_readback_failed");
    if (!state.workerInterruptedAt) throw new Error("worker_interruption_checkpoint_missing");

    const verifierCode = await cc3Provider.getCode(state.proofVerifier);
    const probeCode = await cc3Provider.getCode(state.probeAddress);
    if (verifierCode === "0x" || probeCode === "0x") throw new Error("cc3_code_readback_failed");

    console.log(JSON.stringify({
        checkedAt: isoNow(),
        source: {
            txHash: state.sourceTxHash,
            blockNumber: sourceReceipt.blockNumber,
            receiptStatus: receiptStatus(sourceReceipt),
            from: sourceTx.from,
            to: sourceTx.to,
            supplyCall: {
                asset: supplyCall.args.asset,
                amount: supplyCall.args.amount.toString(),
                onBehalfOf: supplyCall.args.onBehalfOf,
                referralCode: supplyCall.args.referralCode.toString(),
            },
            supplyEvent: {
                reserve: supplyEvent.args.reserve,
                user: supplyEvent.args.user,
                onBehalfOf: supplyEvent.args.onBehalfOf,
                amount: supplyEvent.args.amount.toString(),
                referralCode: supplyEvent.args.referralCode.toString(),
            },
        },
        locker: {
            address: state.reserveLocker,
            borrower: lockerConfig[0],
            aavePool: lockerConfig[1],
            reserveAsset: lockerConfig[2],
            aToken: lockerConfig[3],
            unlockTime: lockerConfig[4].toString(),
            aTokenBalance: lockerConfig[5].toString(),
        },
        proof: {
            chainKey: proof.chainKey,
            headerNumber: proof.headerNumber,
            txHash: proof.txHash,
            sdkNativeVerification: sdkProofValid,
            proofId: proofIdentifier,
        },
        cc3: {
            proofVerifier: state.proofVerifier,
            probe: state.probeAddress,
            qualificationTxHash: state.cc3TxHash,
            qualificationBlock: qualificationReceipt.blockNumber,
            qualificationReceiptStatus: qualificationReceipt.status,
            preferredRateActive: active,
            processedProof: processed,
            facilityAmount: facilityAmount.toString(),
            facilitySourceBlock: facilitySourceBlock.toString(),
            verifierCodeBytes: (verifierCode.length - 2) / 2,
            probeCodeBytes: (probeCode.length - 2) / 2,
        },
        recovery: {
            interruptedAt: state.workerInterruptedAt,
            negativeTxHash: state.adversarial.negative.txHash,
            negativeReceiptStatus: negativeReceipt.status,
            replayTxHash: state.adversarial.replay.txHash,
            replayReceiptStatus: replayReceipt.status,
        },
    }, null, 2));
}

main().catch((error) => {
    console.error(`PHASE0_VERIFY_FAILED|${cleanError(error)}`);
    process.exitCode = 1;
});
