import fs from "node:fs";
import path from "node:path";
import { ethers } from "ethers";
import { ADDRESSES, ROOT, cleanError, loadArtifact, readState, required } from "./lib.mjs";

const STATE_PATH = path.join(ROOT, ".phase5-repayment-safety-state.json");
const FACTORY_ADDRESS = "0x018c883E0632D7a5754d15b7Da83A0e93554db03";

function writeState(state) {
    fs.writeFileSync(
        STATE_PATH,
        `${JSON.stringify(state, null, 2)}\n`,
        "utf8",
    );
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
    if (fs.existsSync(STATE_PATH)) {
        throw new Error("repayment_safety_deployment_already_recorded");
    }

    const sourceState = readState();
    if (!sourceState.proofVerifier) throw new Error("proof_verifier_state_missing");

    const provider = new ethers.JsonRpcProvider(required("CC3_RPC_URL"));
    const wallet = new ethers.Wallet(required("PRIVATE_KEY"), provider);
    const network = await provider.getNetwork();
    if (Number(network.chainId) !== ADDRESSES.cc3ChainId) {
        throw new Error(`unexpected_cc3_chain_id_${network.chainId}`);
    }

    const [balance, factoryCode] = await Promise.all([
        provider.getBalance(wallet.address),
        new ethers.JsonRpcProvider(required("SEPOLIA_RPC_URL")).getCode(FACTORY_ADDRESS),
    ]);
    if (balance === 0n) throw new Error("insufficient_cc3_balance_for_deployment");
    if (factoryCode === "0x") throw new Error("reserve_locker_factory_code_missing");

    const artifact = loadArtifact("Verd.sol", "Verd");
    const contractFactory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
    const verd = await contractFactory.deploy(
        sourceState.proofVerifier,
        FACTORY_ADDRESS,
        ADDRESSES.sepoliaAavePool,
        ADDRESSES.sepoliaWeth,
        ADDRESSES.sepoliaAWeth,
    );
    const deploymentTransaction = verd.deploymentTransaction();
    const receipt = await confirmedReceipt(deploymentTransaction, "verd_repayment_safety_deployment");
    const verdAddress = await verd.getAddress();

    const [code, verifier, factory, aavePool, reserveAsset, aToken] = await Promise.all([
        provider.getCode(verdAddress),
        verd.proofVerifier(),
        verd.approvedReserveLockerFactory(),
        verd.approvedAavePool(),
        verd.approvedReserveAsset(),
        verd.approvedAToken(),
    ]);
    if (
        code === "0x" ||
        !sameAddress(verifier, sourceState.proofVerifier) ||
        !sameAddress(factory, FACTORY_ADDRESS) ||
        !sameAddress(aavePool, ADDRESSES.sepoliaAavePool) ||
        !sameAddress(reserveAsset, ADDRESSES.sepoliaWeth) ||
        !sameAddress(aToken, ADDRESSES.sepoliaAWeth)
    ) {
        throw new Error("repayment_safety_deployment_readback_failed");
    }

    const state = {
        version: 1,
        purpose: "repayment_timing_buffer_upgrade",
        deployedAt: new Date().toISOString(),
        chainId: Number(network.chainId),
        deployer: wallet.address,
        verdAddress,
        deploymentTxHash: deploymentTransaction.hash,
        deploymentBlock: receipt.blockNumber,
        codeBytes: (code.length - 2) / 2,
        proofVerifier: verifier,
        reserveLockerFactory: factory,
        aavePool,
        reserveAsset,
        aToken,
        publicCutover: "pending_worker_and_frontend_configuration",
    };
    writeState(state);

    console.log("PHASE5_REPAYMENT_SAFETY_DEPLOYED");
    console.log(`verd=${verdAddress}`);
    console.log(`deploymentTx=${deploymentTransaction.hash}`);
    console.log(`deploymentBlock=${receipt.blockNumber}`);
    console.log("cutover=pending_worker_and_frontend_configuration");
}

main().catch(error => {
    console.error(`PHASE5_REPAYMENT_SAFETY_FAILED|${cleanError(error)}`);
    process.exitCode = 1;
});
