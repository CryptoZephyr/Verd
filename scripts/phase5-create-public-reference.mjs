import fs from "node:fs";
import path from "node:path";
import { ethers } from "ethers";
import { ADDRESSES, ROOT, cleanError, env, required } from "./lib.mjs";

const STATE_PATH = path.join(ROOT, ".phase5-public-reference-state.json");
const UPGRADED_VERD_ADDRESS = "0x73E1d4c5496eC0b39Bdb8765376e65e3576429cf";
const VERD_ABI = [
    "function facilityExists(bytes32) view returns (bool)",
    "function createFacility(bytes32,address,uint256,uint256,uint256,uint64,uint64,uint256)",
    "function fundFacility(bytes32) payable",
    "function getFacility(bytes32) view returns (address lender,address borrower,uint256 principal,uint256 outstandingPrincipal,uint256 standardAprBps,uint256 preferredAprBps,uint256 currentAprBps,uint256 accruedInterest,uint64 maturity,uint64 qualificationDeadline,uint256 requiredReserveAmount,address reserveLocker)",
    "function getFacilityStatus(bytes32) view returns (uint64 lastAccrualTimestamp,bool funded,bool drawn,bool preferredRateActive,bool repaid,bool reserveReleased,bool drawnAtPreferredRate,uint256 repaidAmount)",
    "function facilityState(bytes32) view returns (uint8)",
];

function writeState(state) {
    fs.writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function sameAddress(left, right) {
    return String(left).toLowerCase() === String(right).toLowerCase();
}

async function confirmedReceipt(transaction, label) {
    if (!transaction) throw new Error(`${label}_transaction_missing`);
    const receipt = await transaction.wait();
    if (!receipt || receipt.status !== 1) throw new Error(`${label}_failed`);
    return receipt;
}

async function main() {
    if (fs.existsSync(STATE_PATH)) throw new Error("public_reference_already_recorded");

    const verdAddress = required("VERD_ADDRESS");
    if (!sameAddress(verdAddress, UPGRADED_VERD_ADDRESS)) {
        throw new Error("public_reference_requires_repayment_safety_deployment");
    }

    const provider = new ethers.JsonRpcProvider(required("CC3_RPC_URL"));
    const wallet = new ethers.Wallet(required("PRIVATE_KEY"), provider);
    const verd = new ethers.Contract(verdAddress, VERD_ABI, wallet);
    const [network, latestBlock, code, balance] = await Promise.all([
        provider.getNetwork(),
        provider.getBlock("latest"),
        provider.getCode(verdAddress),
        provider.getBalance(wallet.address),
    ]);
    if (Number(network.chainId) !== ADDRESSES.cc3ChainId) throw new Error(`unexpected_cc3_chain_id_${network.chainId}`);
    if (!latestBlock) throw new Error("latest_cc3_block_missing");
    if (code === "0x") throw new Error("verd_contract_code_missing");

    const principal = ethers.parseEther(env.PHASE5_REFERENCE_PRINCIPAL_CC3 || "0.01");
    const requiredReserve = ethers.parseEther(env.PHASE0_AMOUNT_WETH || "0.0005");
    const maturity = BigInt(latestBlock.timestamp) + 86_400n;
    const qualificationDeadline = BigInt(latestBlock.timestamp) + 43_200n;
    if (qualificationDeadline >= maturity) throw new Error("invalid_public_reference_window");
    if (balance < principal + ethers.parseEther("0.002")) throw new Error("insufficient_cc3_balance_for_reference_and_gas");

    const facilityId = ethers.id(`verd-public-reference-${wallet.address}-${Date.now()}`);
    if (await verd.facilityExists(facilityId)) throw new Error("public_reference_id_collision");

    const createTransaction = await verd.createFacility(
        facilityId,
        wallet.address,
        principal,
        1_000,
        500,
        maturity,
        qualificationDeadline,
        requiredReserve,
    );
    const createReceipt = await confirmedReceipt(createTransaction, "public_reference_creation");

    const created = await verd.getFacility(facilityId);
    if (
        !sameAddress(created.lender, wallet.address) ||
        !sameAddress(created.borrower, wallet.address) ||
        created.principal !== principal ||
        created.maturity !== maturity ||
        created.qualificationDeadline !== qualificationDeadline ||
        created.requiredReserveAmount !== requiredReserve
    ) throw new Error("public_reference_creation_readback_failed");

    const fundTransaction = await verd.fundFacility(facilityId, { value: principal });
    const fundReceipt = await confirmedReceipt(fundTransaction, "public_reference_funding");
    const [funded, state] = await Promise.all([verd.getFacilityStatus(facilityId), verd.facilityState(facilityId)]);
    if (!funded.funded || funded.drawn || funded.repaid || Number(state) !== 2) {
        throw new Error("public_reference_funding_readback_failed");
    }

    writeState({
        version: 1,
        purpose: "fresh_public_testnet_reference_for_repayment_safety_deployment",
        createdAt: new Date().toISOString(),
        chainId: Number(network.chainId),
        verdAddress,
        facilityId,
        lender: wallet.address,
        borrower: wallet.address,
        principal: principal.toString(),
        requiredReserveAmount: requiredReserve.toString(),
        standardAprBps: 1_000,
        preferredAprBps: 500,
        maturity: maturity.toString(),
        qualificationDeadline: qualificationDeadline.toString(),
        createTxHash: createTransaction.hash,
        createBlock: createReceipt.blockNumber,
        fundTxHash: fundTransaction.hash,
        fundBlock: fundReceipt.blockNumber,
        funded: funded.funded,
        drawn: funded.drawn,
        preferredRateActive: funded.preferredRateActive,
        repaid: funded.repaid,
        state: Number(state),
    });

    console.log("PHASE5_PUBLIC_REFERENCE_CONFIRMED");
    console.log(`verd=${verdAddress}`);
    console.log(`facilityId=${facilityId}`);
    console.log(`createTx=${createTransaction.hash}`);
    console.log(`fundTx=${fundTransaction.hash}`);
    console.log(`facilityState=${state}`);
}

main().catch(error => {
    console.error(`PHASE5_PUBLIC_REFERENCE_FAILED|${cleanError(error)}`);
    process.exitCode = 1;
});
