import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { ethers } from "ethers";
import {
    ADDRESSES,
    ROOT,
    cleanError,
    env,
    isoNow,
    loadArtifact,
    readState,
    required,
    sleep,
} from "./lib.mjs";

const require = createRequire(import.meta.url);
const sdk = require("@gluwa/usc-sdk");

const PHASE3_STATE_PATH = path.join(ROOT, ".phase3-factory-state.json");
const ERC20_ABI = [
    "function deposit() payable",
    "function approve(address spender,uint256 amount) returns (bool)",
    "function allowance(address owner,address spender) view returns (uint256)",
    "function balanceOf(address account) view returns (uint256)",
];
const AAVE_POOL_ABI = [
    "function supply(address asset,uint256 amount,address onBehalfOf,uint16 referralCode)",
    "event Supply(address indexed reserve,address user,address indexed onBehalfOf,uint256 amount,uint16 indexed referralCode)",
];
const FACTORY_ABI = [
    "function facilityLocker(bytes32 facilityId) view returns (address)",
    "event ReserveLockerCreated(bytes32 indexed facilityId,address indexed locker,address indexed borrower,address aavePool,address reserveAsset,address aToken,uint64 unlockTime)",
];
const LOCKER_ABI = [
    "function borrower() view returns (address)",
    "function aavePool() view returns (address)",
    "function reserveAsset() view returns (address)",
    "function aToken() view returns (address)",
    "function unlockTime() view returns (uint256)",
    "function aTokenBalance() view returns (uint256)",
];

function writePhase3State(state) {
    fs.writeFileSync(
        PHASE3_STATE_PATH,
        `${JSON.stringify(state, (_, value) => typeof value === "bigint" ? value.toString() : value, 2)}\n`,
        "utf8",
    );
}

function sameAddress(left, right) {
    return String(left).toLowerCase() === String(right).toLowerCase();
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

function parseFactoryEvent(receipt, factoryAddress) {
    const iface = new ethers.Interface(FACTORY_ABI);
    for (const log of receipt.logs) {
        if (!sameAddress(log.address, factoryAddress)) continue;
        try {
            const parsed = iface.parseLog({ topics: log.topics, data: log.data });
            if (parsed?.name === "ReserveLockerCreated") return parsed;
        } catch {
            // Ignore unrelated logs in the factory transaction receipt.
        }
    }
    throw new Error("factory_creation_event_missing");
}

async function verifyFactorySource(sepolia, txHash, factoryAddress, expected) {
    const tx = await sepolia.getTransaction(txHash);
    const receipt = await sepolia.getTransactionReceipt(txHash);
    if (!tx || !receipt) throw new Error("factory_transaction_pending");
    if (receipt.status !== 1) throw new Error("factory_transaction_failed");
    if (!sameAddress(tx.from, expected.borrower)) throw new Error("factory_borrower_mismatch");
    if (!sameAddress(tx.to, factoryAddress)) throw new Error("factory_address_mismatch");

    const event = parseFactoryEvent(receipt, factoryAddress);
    if (event.args.facilityId.toLowerCase() !== expected.facilityId.toLowerCase()) {
        throw new Error("factory_facility_mismatch");
    }
    if (!sameAddress(event.args.locker, expected.locker)) throw new Error("factory_locker_mismatch");
    if (!sameAddress(event.args.borrower, expected.borrower)) throw new Error("factory_event_borrower_mismatch");
    if (!sameAddress(event.args.aavePool, ADDRESSES.sepoliaAavePool)) {
        throw new Error("factory_pool_mismatch");
    }
    if (!sameAddress(event.args.reserveAsset, ADDRESSES.sepoliaWeth)) {
        throw new Error("factory_reserve_mismatch");
    }
    if (!sameAddress(event.args.aToken, ADDRESSES.sepoliaAWeth)) {
        throw new Error("factory_atoken_mismatch");
    }
    if (event.args.unlockTime !== expected.unlockTime) throw new Error("factory_unlock_mismatch");
    return { tx, receipt, event };
}

async function verifySupplySource(sepolia, txHash, expected) {
    const tx = await sepolia.getTransaction(txHash);
    const receipt = await sepolia.getTransactionReceipt(txHash);
    if (!tx || !receipt) throw new Error("supply_transaction_pending");
    if (receipt.status !== 1) throw new Error("supply_transaction_failed");
    if (!sameAddress(tx.from, expected.borrower)) throw new Error("supply_borrower_mismatch");
    if (!sameAddress(tx.to, ADDRESSES.sepoliaAavePool)) throw new Error("supply_pool_mismatch");

    const iface = new ethers.Interface(AAVE_POOL_ABI);
    let event;
    for (const log of receipt.logs) {
        if (!sameAddress(log.address, ADDRESSES.sepoliaAavePool)) continue;
        try {
            const parsed = iface.parseLog({ topics: log.topics, data: log.data });
            if (parsed?.name === "Supply") {
                event = parsed;
                break;
            }
        } catch {
            // Ignore unrelated logs in the Aave receipt.
        }
    }
    if (!event) throw new Error("supply_event_missing");
    if (!sameAddress(event.args.reserve, ADDRESSES.sepoliaWeth)) throw new Error("supply_reserve_mismatch");
    if (!sameAddress(event.args.user, expected.borrower)) throw new Error("supply_user_mismatch");
    if (!sameAddress(event.args.onBehalfOf, expected.locker)) throw new Error("supply_locker_mismatch");
    if (event.args.amount !== expected.amount) throw new Error("supply_amount_mismatch");
    if (event.args.referralCode !== 0n) throw new Error("supply_referral_mismatch");
    return { tx, receipt, event };
}

async function getFreshProof(builder, cc3, chainKey, sourceBlock, txHash, label) {
    await builder.waitUntilHeightAttested(chainKey, sourceBlock, 5_000, 900_000, 5_000);
    let result;
    for (let attempt = 1; attempt <= 20; attempt += 1) {
        result = await builder.getProof(txHash);
        if (result.success && result.data) break;
        if (attempt === 20) {
            const reason = String(result?.error || "proof_not_ready").slice(0, 300);
            throw new Error(`${label}_proof_generation_failed:${reason}`);
        }
        await sleep(15_000);
    }

    const proofData = result.data;
    if (proofData.txHash.toLowerCase() !== txHash.toLowerCase()) {
        throw new Error(`${label}_proof_transaction_hash_mismatch`);
    }
    if (Number(proofData.chainKey) !== chainKey) throw new Error(`${label}_proof_chain_key_mismatch`);
    if (Number(proofData.headerNumber) !== sourceBlock) {
        throw new Error(`${label}_proof_source_block_mismatch`);
    }

    const blockProver = new sdk.blockProver.PrecompileBlockProver(cc3);
    const sdkProofValid = await blockProver.verifySingle(
        proofData.chainKey,
        proofData.headerNumber,
        proofData.txBytes,
        proofData.merkleProof,
        proofData.continuityProof,
    );
    if (!sdkProofValid) throw new Error(`${label}_attestcoin_proof_capability_failed`);
    return { proofData, sdkProofValid };
}

async function waitForReceipt(transaction, label) {
    if (!transaction) throw new Error(`${label}_missing_transaction`);
    const receipt = await transaction.wait();
    if (!receipt || receipt.status !== 1) throw new Error(`${label}_failed`);
    return receipt;
}

async function main() {
    if (fs.existsSync(PHASE3_STATE_PATH)) {
        throw new Error("phase3_factory_state_exists_remove_duplicate_run_risk");
    }

    const sourceState = readState();
    if (!sourceState.proofVerifier) throw new Error("phase0_proof_verifier_state_missing");

    const cc3 = new ethers.JsonRpcProvider(required("CC3_RPC_URL"));
    const sepolia = new ethers.JsonRpcProvider(required("SEPOLIA_RPC_URL"));
    const privateKey = required("PRIVATE_KEY");
    const cc3Wallet = new ethers.Wallet(privateKey, cc3);
    const sepoliaWallet = new ethers.Wallet(privateKey, sepolia);
    if (!sameAddress(cc3Wallet.address, sepoliaWallet.address)) {
        throw new Error("wallet_network_addresses_differ");
    }

    const [cc3Network, sepoliaNetwork, cc3Latest, sepoliaLatest] = await Promise.all([
        cc3.getNetwork(),
        sepolia.getNetwork(),
        cc3.getBlock("latest"),
        sepolia.getBlock("latest"),
    ]);
    if (Number(cc3Network.chainId) !== ADDRESSES.cc3ChainId) {
        throw new Error(`Unexpected CC3 chain id: ${cc3Network.chainId}`);
    }
    if (Number(sepoliaNetwork.chainId) !== ADDRESSES.sepoliaChainId) {
        throw new Error(`Unexpected Sepolia chain id: ${sepoliaNetwork.chainId}`);
    }
    if (!cc3Latest || !sepoliaLatest) throw new Error("latest_block_missing");

    const amount = ethers.parseUnits(
        env.PHASE0_AMOUNT_WETH || ethers.formatUnits(BigInt(sourceState.requiredAmount || "500000000000000"), 18),
        18,
    );
    const principal = ethers.parseEther(env.PHASE3_PRINCIPAL_CC3 || "0.1");
    const sepoliaWeth = new ethers.Contract(ADDRESSES.sepoliaWeth, ERC20_ABI, sepoliaWallet);
    const wethBalanceAtStart = await sepoliaWeth.balanceOf(sepoliaWallet.address);
    let wethBalanceBefore = wethBalanceAtStart;
    let wethWrapTx;
    if (wethBalanceBefore < amount) {
        const wrapAmount = amount - wethBalanceBefore;
        const sepoliaEthBalance = await sepolia.getBalance(sepoliaWallet.address);
        if (sepoliaEthBalance < wrapAmount + ethers.parseEther("0.005")) {
            throw new Error(`Insufficient Sepolia ETH to wrap the missing WETH: ${ethers.formatEther(sepoliaEthBalance)}`);
        }
        wethWrapTx = await sepoliaWeth.deposit({ value: wrapAmount });
        await waitForReceipt(wethWrapTx, "weth_wrap");
        wethBalanceBefore = await sepoliaWeth.balanceOf(sepoliaWallet.address);
        if (wethBalanceBefore < amount) throw new Error("weth_wrap_balance_readback_failed");
    }
    const cc3Balance = await cc3.getBalance(cc3Wallet.address);
    if (cc3Balance < principal) throw new Error("insufficient_cc3_balance_for_principal_and_gas");

    const chainKey = ADDRESSES.sourceChainKey;
    const maturity = BigInt(Math.max(sepoliaLatest.timestamp, cc3Latest.timestamp)) + 7_200n;
    const qualificationDeadline = BigInt(cc3Latest.timestamp) + 3_600n;
    if (qualificationDeadline >= maturity) throw new Error("qualification_window_unavailable");

    const facilityId = ethers.id(
        `verd-phase-3-factory-${sourceState.sourceTxHash || "fresh"}-${Date.now()}`,
    );
    const standardAprBps = 1_000;
    const preferredAprBps = 500;

    const factoryArtifact = loadArtifact("ReserveLockerFactory.sol", "ReserveLockerFactory");
    const factoryFactory = new ethers.ContractFactory(
        factoryArtifact.abi,
        factoryArtifact.bytecode,
        sepoliaWallet,
    );
    const factory = await factoryFactory.deploy(
        ADDRESSES.sepoliaAavePool,
        ADDRESSES.sepoliaWeth,
        ADDRESSES.sepoliaAWeth,
    );
    const factoryDeploymentTx = factory.deploymentTransaction();
    const factoryDeploymentReceipt = await waitForReceipt(
        factoryDeploymentTx,
        "reserve_locker_factory_deployment",
    );
    const factoryAddress = await factory.getAddress();
    const factoryCode = await sepolia.getCode(factoryAddress);
    if (factoryCode === "0x") throw new Error("reserve_locker_factory_code_readback_failed");

    const state = {
        version: 2,
        phase: "phase3",
        architecture: "factory-event-binding",
        createdAt: isoNow(),
        wallet: cc3Wallet.address,
        borrower: cc3Wallet.address,
        lender: cc3Wallet.address,
        proofVerifier: sourceState.proofVerifier,
        factoryAddress,
        factoryDeploymentTxHash: factoryDeploymentTx.hash,
        factoryDeploymentBlock: factoryDeploymentReceipt.blockNumber,
        factoryDeploymentReceiptStatus: factoryDeploymentReceipt.status,
        factoryCodeBytes: (factoryCode.length - 2) / 2,
        approvedAavePool: ADDRESSES.sepoliaAavePool,
        reserveAsset: ADDRESSES.sepoliaWeth,
        aToken: ADDRESSES.sepoliaAWeth,
        facilityId,
        principal: principal.toString(),
        standardAprBps,
        preferredAprBps,
        requiredReserveAmount: amount.toString(),
        maturity: maturity.toString(),
        qualificationDeadline: qualificationDeadline.toString(),
        sourceChainKey: chainKey,
        sepoliaChainId: Number(sepoliaNetwork.chainId),
        cc3ChainId: Number(cc3Network.chainId),
        sepoliaWethBalanceBefore: wethBalanceBefore.toString(),
        cc3BalanceBefore: cc3Balance.toString(),
        wethBalanceAtStart: wethBalanceAtStart.toString(),
        wethWrapTxHash: wethWrapTx?.hash || null,
        step: "factory_deployed",
    };
    writePhase3State(state);

    const lockerTx = await factory.createReserveLocker(
        facilityId,
        sepoliaWallet.address,
        maturity,
    );
    const lockerReceipt = await waitForReceipt(lockerTx, "reserve_locker_creation");
    const lockerAddress = await factory.facilityLocker(facilityId);
    if (lockerAddress === ethers.ZeroAddress) throw new Error("reserve_locker_address_readback_failed");
    const factoryEvent = parseFactoryEvent(lockerReceipt, factoryAddress);
    if (!sameAddress(factoryEvent.args.locker, lockerAddress)) {
        throw new Error("factory_event_locker_readback_mismatch");
    }

    const locker = new ethers.Contract(lockerAddress, LOCKER_ABI, sepolia);
    const lockerConfig = await Promise.all([
        locker.borrower(),
        locker.aavePool(),
        locker.reserveAsset(),
        locker.aToken(),
        locker.unlockTime(),
    ]);
    if (
        !sameAddress(lockerConfig[0], sepoliaWallet.address) ||
        !sameAddress(lockerConfig[1], ADDRESSES.sepoliaAavePool) ||
        !sameAddress(lockerConfig[2], ADDRESSES.sepoliaWeth) ||
        !sameAddress(lockerConfig[3], ADDRESSES.sepoliaAWeth) ||
        lockerConfig[4] !== maturity
    ) throw new Error("reserve_locker_factory_configuration_readback_failed");

    const factorySource = await verifyFactorySource(sepolia, lockerTx.hash, factoryAddress, {
        facilityId,
        locker: lockerAddress,
        borrower: sepoliaWallet.address,
        unlockTime: maturity,
    });
    state.reserveLocker = lockerAddress;
    state.reserveLockerCreationTxHash = lockerTx.hash;
    state.reserveLockerCreationBlock = lockerReceipt.blockNumber;
    state.reserveLockerCreationReceiptStatus = lockerReceipt.status;
    state.reserveLockerUnlockTime = maturity.toString();
    state.step = "factory_event_confirmed";
    writePhase3State(state);

    const verdArtifact = loadArtifact("Verd.sol", "Verd");
    const verdFactory = new ethers.ContractFactory(verdArtifact.abi, verdArtifact.bytecode, cc3Wallet);
    const verd = await verdFactory.deploy(
        sourceState.proofVerifier,
        factoryAddress,
        ADDRESSES.sepoliaAavePool,
        ADDRESSES.sepoliaWeth,
        ADDRESSES.sepoliaAWeth,
    );
    const verdDeploymentTx = verd.deploymentTransaction();
    const verdDeploymentReceipt = await waitForReceipt(verdDeploymentTx, "verd_deployment");
    const verdAddress = await verd.getAddress();
    const verdCode = await cc3.getCode(verdAddress);
    if (verdCode === "0x") throw new Error("verd_deployment_code_readback_failed");
    state.verdAddress = verdAddress;
    state.verdDeploymentTxHash = verdDeploymentTx.hash;
    state.verdDeploymentBlock = verdDeploymentReceipt.blockNumber;
    state.verdDeploymentReceiptStatus = verdDeploymentReceipt.status;
    state.verdCodeBytes = (verdCode.length - 2) / 2;
    state.step = "verd_deployed";
    writePhase3State(state);

    const createTx = await verd.createFacility(
        facilityId,
        cc3Wallet.address,
        principal,
        standardAprBps,
        preferredAprBps,
        maturity,
        qualificationDeadline,
        amount,
    );
    const createReceipt = await waitForReceipt(createTx, "facility_creation");
    state.createTxHash = createTx.hash;
    state.createBlock = createReceipt.blockNumber;
    state.createReceiptStatus = createReceipt.status;
    state.step = "facility_created";
    writePhase3State(state);

    const builder = new sdk.proofProvider.service.ProofBuilder(
        chainKey,
        required("PROOF_BUILDER_URL"),
        30_000,
    );
    state.step = "awaiting_factory_attestation";
    writePhase3State(state);
    const factoryProofResult = await getFreshProof(
        builder,
        cc3,
        chainKey,
        factorySource.receipt.blockNumber,
        lockerTx.hash,
        "factory",
    );
    const factoryInclusion = proofEnvelope(factoryProofResult.proofData);
    const factoryContinuity = continuityEnvelope(factoryProofResult.proofData);
    const factoryProofId = await verd.proofId(
        chainKey,
        factorySource.receipt.blockNumber,
        factoryInclusion,
        factoryContinuity,
    );
    const bindTx = await verd.bindReserveLocker(
        facilityId,
        chainKey,
        factorySource.receipt.blockNumber,
        factoryInclusion,
        factoryContinuity,
        { gasLimit: 9_000_000n },
    );
    const bindReceipt = await waitForReceipt(bindTx, "reserve_locker_binding");
    const binding = await verd.getFacilityLockerBinding(facilityId);
    const boundFacility = await verd.getFacility(facilityId);
    if (
        !sameAddress(boundFacility.reserveLocker, lockerAddress) ||
        binding.bindingProofId.toLowerCase() !== factoryProofId.toLowerCase() ||
        Number(binding.bindingSourceBlock) !== factorySource.receipt.blockNumber ||
        binding.unlockTime !== maturity ||
        (await verd.lockerFacility(lockerAddress)).toLowerCase() !== facilityId.toLowerCase() ||
        !(await verd.processedProof(factoryProofId))
    ) throw new Error("reserve_locker_binding_readback_failed");
    state.factoryProofId = factoryProofId;
    state.factoryProofSourceBlock = factorySource.receipt.blockNumber;
    state.factorySdkProofValid = factoryProofResult.sdkProofValid;
    state.bindTxHash = bindTx.hash;
    state.bindBlock = bindReceipt.blockNumber;
    state.bindReceiptStatus = bindReceipt.status;
    state.step = "locker_bound";
    writePhase3State(state);

    const fundTx = await verd.fundFacility(facilityId, { value: principal });
    const fundReceipt = await waitForReceipt(fundTx, "facility_funding");
    state.fundTxHash = fundTx.hash;
    state.fundBlock = fundReceipt.blockNumber;
    state.fundReceiptStatus = fundReceipt.status;
    state.step = "funded";
    writePhase3State(state);

    const wethAllowance = await sepoliaWeth.allowance(
        sepoliaWallet.address,
        ADDRESSES.sepoliaAavePool,
    );
    if (wethAllowance < amount) {
        const approveTx = await sepoliaWeth.approve(ADDRESSES.sepoliaAavePool, amount);
        const approveReceipt = await waitForReceipt(approveTx, "weth_approval");
        state.approvalTxHash = approveTx.hash;
        state.approvalBlock = approveReceipt.blockNumber;
        state.approvalReceiptStatus = approveReceipt.status;
    }
    state.step = "source_ready_for_supply";
    writePhase3State(state);

    const pool = new ethers.Contract(ADDRESSES.sepoliaAavePool, AAVE_POOL_ABI, sepoliaWallet);
    const supplyTx = await pool.supply(ADDRESSES.sepoliaWeth, amount, lockerAddress, 0);
    const supplyReceipt = await waitForReceipt(supplyTx, "aave_supply");
    const supplySource = await verifySupplySource(sepolia, supplyTx.hash, {
        borrower: sepoliaWallet.address,
        locker: lockerAddress,
        amount,
    });
    const lockerBalance = await locker.aTokenBalance();
    if (lockerBalance < amount) throw new Error("reserve_locker_atoken_readback_failed");
    state.sourceTxHash = supplyTx.hash;
    state.sourceBlock = supplyReceipt.blockNumber;
    state.sourceReceiptStatus = supplyReceipt.status;
    state.sourceGasUsed = supplyReceipt.gasUsed.toString();
    state.supplyEvent = {
        reserve: supplySource.event.args.reserve,
        user: supplySource.event.args.user,
        onBehalfOf: supplySource.event.args.onBehalfOf,
        amount: supplySource.event.args.amount.toString(),
        referralCode: supplySource.event.args.referralCode.toString(),
    };
    state.reserveLockerATokenBalance = lockerBalance.toString();
    state.sepoliaWethBalanceAfter = (await sepoliaWeth.balanceOf(sepoliaWallet.address)).toString();
    state.step = "source_supply_confirmed";
    writePhase3State(state);

    state.step = "awaiting_supply_attestation";
    writePhase3State(state);
    const supplyProofResult = await getFreshProof(
        builder,
        cc3,
        chainKey,
        supplySource.receipt.blockNumber,
        supplyTx.hash,
        "supply",
    );
    const supplyInclusion = proofEnvelope(supplyProofResult.proofData);
    const supplyContinuity = continuityEnvelope(supplyProofResult.proofData);
    const supplyProofId = await verd.proofId(
        chainKey,
        supplySource.receipt.blockNumber,
        supplyInclusion,
        supplyContinuity,
    );
    const qualifyTx = await verd.qualifyFacility(
        facilityId,
        chainKey,
        supplySource.receipt.blockNumber,
        supplyInclusion,
        supplyContinuity,
        { gasLimit: 9_000_000n },
    );
    const qualifyReceipt = await waitForReceipt(qualifyTx, "facility_qualification");

    const processed = await verd.processedProof(supplyProofId);
    const financials = await verd.getFacilityFinancials(facilityId);
    const status = await verd.getFacilityStatus(facilityId);
    const proofEvidence = await verd.getFacilityProof(facilityId);
    const finalBinding = await verd.getFacilityLockerBinding(facilityId);
    const finalFacility = await verd.getFacility(facilityId);
    const finalFacilityState = await verd.facilityState(facilityId);
    if (
        !processed ||
        !status.preferredRateActive ||
        financials.currentAprBps !== BigInt(preferredAprBps) ||
        proofEvidence.qualificationProofId.toLowerCase() !== supplyProofId.toLowerCase() ||
        proofEvidence.qualificationSourceBlock !== BigInt(supplySource.receipt.blockNumber) ||
        !sameAddress(finalFacility.reserveLocker, lockerAddress) ||
        finalBinding.bindingProofId.toLowerCase() !== factoryProofId.toLowerCase() ||
        Number(finalFacilityState) !== 4
    ) throw new Error("corrected_phase3_final_state_readback_failed");

    state.supplyProofId = supplyProofId;
    state.supplyProofSourceBlock = supplySource.receipt.blockNumber;
    state.supplySdkProofValid = supplyProofResult.sdkProofValid;
    state.qualifyTxHash = qualifyTx.hash;
    state.qualifyBlock = qualifyReceipt.blockNumber;
    state.qualifyReceiptStatus = qualifyReceipt.status;
    state.processedSupplyProof = processed;
    state.preferredRateActive = status.preferredRateActive;
    state.currentAprBps = financials.currentAprBps.toString();
    state.accruedInterest = financials.accruedInterest.toString();
    state.qualificationSourceBlock = proofEvidence.qualificationSourceBlock.toString();
    state.finalFacilityState = Number(finalFacilityState);
    state.step = "qualified";
    state.completedAt = isoNow();
    writePhase3State(state);

    console.log("PHASE3_FACTORY_LIVE_CONFIRMED");
    console.log(`wallet=${cc3Wallet.address}`);
    console.log(`factory=${factoryAddress}`);
    console.log(`reserveLocker=${lockerAddress}`);
    console.log(`verd=${verdAddress}`);
    console.log(`facilityId=${facilityId}`);
    console.log(`factoryCreationTx=${lockerTx.hash}`);
    console.log(`factoryProofId=${factoryProofId}`);
    console.log(`bindTx=${bindTx.hash}`);
    console.log(`fundTx=${fundTx.hash}`);
    console.log(`supplyTx=${supplyTx.hash}`);
    console.log(`supplyProofId=${supplyProofId}`);
    console.log(`qualifyTx=${qualifyTx.hash}`);
    console.log(`preferredRateActive=${status.preferredRateActive}`);
    console.log(`currentAprBps=${financials.currentAprBps}`);
    console.log("state=qualified");
}

main().catch((error) => {
    console.error(`PHASE3_FACTORY_LIVE_FAILED|${cleanError(error)}`);
    process.exitCode = 1;
});
