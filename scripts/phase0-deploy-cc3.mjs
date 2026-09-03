import { ethers } from "ethers";
import {
    ADDRESSES,
    cleanError,
    isoNow,
    loadArtifact,
    readState,
    required,
    writeState,
} from "./lib.mjs";

function existingState() {
    try {
        return readState();
    } catch {
        return { version: 1 };
    }
}

async function main() {
    const provider = new ethers.JsonRpcProvider(required("CC3_RPC_URL"));
    const network = await provider.getNetwork();
    if (Number(network.chainId) !== ADDRESSES.cc3ChainId) {
        throw new Error(`Unexpected CC3 chain id: ${network.chainId}`);
    }

    const signer = new ethers.Wallet(required("PRIVATE_KEY"), provider);
    const verifierArtifact = loadArtifact(
        "VerdUSCProofVerifier.sol",
        "VerdUSCProofVerifier",
    );
    const verifierFactory = new ethers.ContractFactory(
        verifierArtifact.abi,
        verifierArtifact.bytecode,
        signer,
    );
    const verifier = await verifierFactory.deploy();
    await verifier.waitForDeployment();
    const verifierAddress = await verifier.getAddress();
    const verifierTx = verifier.deploymentTransaction();
    const verifierReceipt = verifierTx ? await verifierTx.wait() : null;
    if (!verifierReceipt || verifierReceipt.status !== 1) {
        throw new Error("USC proof verifier deployment failed");
    }

    const probeArtifact = loadArtifact(
        "VerdAttestcoinProbe.sol",
        "VerdAttestcoinProbe",
    );
    const probeFactory = new ethers.ContractFactory(
        probeArtifact.abi,
        probeArtifact.bytecode,
        signer,
    );
    const probe = await probeFactory.deploy(
        verifierAddress,
        ADDRESSES.sepoliaAavePool,
        ADDRESSES.sepoliaWeth,
        ADDRESSES.sepoliaAWeth,
    );
    await probe.waitForDeployment();
    const probeAddress = await probe.getAddress();
    const probeTx = probe.deploymentTransaction();
    const probeReceipt = probeTx ? await probeTx.wait() : null;
    if (!probeReceipt || probeReceipt.status !== 1) {
        throw new Error("VerdAttestcoinProbe deployment failed");
    }

    const verifierCode = await provider.getCode(verifierAddress);
    const probeCode = await provider.getCode(probeAddress);
    if (verifierCode === "0x" || probeCode === "0x") {
        throw new Error("CC3 deployment code readback failed");
    }

    const state = existingState();
    state.proofVerifier = verifierAddress;
    state.probeAddress = probeAddress;
    state.cc3Deployments = {
        proofVerifier: {
            address: verifierAddress,
            txHash: verifierTx.hash,
            blockNumber: verifierReceipt.blockNumber,
            receiptStatus: verifierReceipt.status,
            codeBytes: (verifierCode.length - 2) / 2,
        },
        probe: {
            address: probeAddress,
            txHash: probeTx.hash,
            blockNumber: probeReceipt.blockNumber,
            receiptStatus: probeReceipt.status,
            codeBytes: (probeCode.length - 2) / 2,
        },
        checkedAt: isoNow(),
    };
    writeState(state);

    console.log("PHASE0_CC3_DEPLOYMENTS_CONFIRMED");
    console.log(`proofVerifier=${verifierAddress}`);
    console.log(`proofVerifierTx=${verifierTx.hash}`);
    console.log(`proofVerifierBlock=${verifierReceipt.blockNumber}`);
    console.log(`probe=${probeAddress}`);
    console.log(`probeTx=${probeTx.hash}`);
    console.log(`probeBlock=${probeReceipt.blockNumber}`);
}

main().catch((error) => {
    console.error(`PHASE0_CC3_DEPLOY_FAILED|${cleanError(error)}`);
    process.exitCode = 1;
});
