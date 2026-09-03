import { ethers } from "ethers";
import {
    ADDRESSES,
    cleanError,
    env,
    isoNow,
    loadArtifact,
    required,
    writeState,
} from "./lib.mjs";

const ERC20_ABI = [
    "function approve(address spender,uint256 amount) returns (bool)",
    "function allowance(address owner,address spender) view returns (uint256)",
    "function balanceOf(address account) view returns (uint256)",
];
const AAVE_POOL_ABI = [
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

async function main() {
    const provider = new ethers.JsonRpcProvider(required("SEPOLIA_RPC_URL"));
    const wallet = new ethers.Wallet(required("PRIVATE_KEY"), provider);
    const amount = ethers.parseUnits(env.PHASE0_AMOUNT_WETH || "0.0005", 18);
    const latest = await provider.getBlock("latest");
    if (!latest) throw new Error("Could not read the latest Sepolia block");

    const weth = new ethers.Contract(ADDRESSES.sepoliaWeth, ERC20_ABI, wallet);
    const beforeBalance = await weth.balanceOf(wallet.address);
    if (beforeBalance < amount) {
        throw new Error(`Insufficient WETH for Phase 0: ${ethers.formatUnits(beforeBalance, 18)}`);
    }

    const lockerArtifact = loadArtifact("ReserveLocker.sol", "ReserveLocker");
    const unlockTime = BigInt(latest.timestamp) + 7200n;
    const lockerFactory = new ethers.ContractFactory(
        lockerArtifact.abi,
        lockerArtifact.bytecode,
        wallet,
    );
    const locker = await lockerFactory.deploy(
        wallet.address,
        ADDRESSES.sepoliaAavePool,
        ADDRESSES.sepoliaWeth,
        ADDRESSES.sepoliaAWeth,
        unlockTime,
    );
    await locker.waitForDeployment();
    const lockerAddress = await locker.getAddress();
    const lockerDeploymentTx = locker.deploymentTransaction();
    const lockerDeploymentReceipt = lockerDeploymentTx
        ? await lockerDeploymentTx.wait()
        : null;
    if (!lockerDeploymentReceipt || lockerDeploymentReceipt.status !== 1) {
        throw new Error("ReserveLocker deployment failed");
    }

    const lockerRead = new ethers.Contract(lockerAddress, LOCKER_ABI, provider);
    const lockerConfig = await Promise.all([
        lockerRead.borrower(),
        lockerRead.aavePool(),
        lockerRead.reserveAsset(),
        lockerRead.aToken(),
        lockerRead.unlockTime(),
    ]);
    if (
        lockerConfig[0].toLowerCase() !== wallet.address.toLowerCase() ||
        lockerConfig[1].toLowerCase() !== ADDRESSES.sepoliaAavePool.toLowerCase() ||
        lockerConfig[2].toLowerCase() !== ADDRESSES.sepoliaWeth.toLowerCase() ||
        lockerConfig[3].toLowerCase() !== ADDRESSES.sepoliaAWeth.toLowerCase() ||
        lockerConfig[4] !== unlockTime
    ) throw new Error("ReserveLocker immutable configuration readback failed");

    const approveTx = await weth.approve(ADDRESSES.sepoliaAavePool, amount);
    const approveReceipt = await approveTx.wait();
    if (!approveReceipt || approveReceipt.status !== 1) throw new Error("WETH approval failed");

    const pool = new ethers.Contract(ADDRESSES.sepoliaAavePool, AAVE_POOL_ABI, wallet);
    const supplyTx = await pool.supply(ADDRESSES.sepoliaWeth, amount, lockerAddress, 0);
    const supplyReceipt = await supplyTx.wait();
    if (!supplyReceipt || supplyReceipt.status !== 1) throw new Error("Aave WETH supply failed");

    const poolInterface = new ethers.Interface(AAVE_POOL_ABI);
    let supplyEvent;
    for (const log of supplyReceipt.logs) {
        try {
            const parsed = poolInterface.parseLog({ topics: log.topics, data: log.data });
            if (parsed?.name === "Supply") {
                supplyEvent = {
                    reserve: parsed.args.reserve,
                    user: parsed.args.user,
                    onBehalfOf: parsed.args.onBehalfOf,
                    amount: parsed.args.amount.toString(),
                    referralCode: parsed.args.referralCode.toString(),
                };
                break;
            }
        } catch {
            // Ignore logs from other contracts in the receipt.
        }
    }
    if (!supplyEvent) throw new Error("Aave Supply event was not found");
    if (
        supplyEvent.reserve.toLowerCase() !== ADDRESSES.sepoliaWeth.toLowerCase() ||
        supplyEvent.user.toLowerCase() !== wallet.address.toLowerCase() ||
        supplyEvent.onBehalfOf.toLowerCase() !== lockerAddress.toLowerCase() ||
        supplyEvent.amount !== amount.toString() ||
        supplyEvent.referralCode !== "0"
    ) throw new Error("Decoded Aave Supply event fields did not match the requested action");

    const aTokenBalance = await lockerRead.aTokenBalance();
    if (aTokenBalance < amount) throw new Error("ReserveLocker did not receive the supplied aToken");

    const state = {
        version: 1,
        step: "source_transaction_confirmed",
        createdAt: isoNow(),
        borrower: wallet.address,
        reserveLocker: lockerAddress,
        reserveLockerDeploymentTxHash: lockerDeploymentTx.hash,
        reserveLockerDeploymentBlock: lockerDeploymentReceipt.blockNumber,
        reserveLockerDeploymentReceiptStatus: lockerDeploymentReceipt.status,
        approvedAavePool: ADDRESSES.sepoliaAavePool,
        reserveAsset: ADDRESSES.sepoliaWeth,
        aToken: ADDRESSES.sepoliaAWeth,
        requiredAmount: amount.toString(),
        qualificationDeadline: (BigInt(latest.timestamp) + 3600n).toString(),
        facilityMaturity: unlockTime.toString(),
        facilityId: ethers.id(`verd-phase-0-${Date.now()}`),
        approvalTxHash: approveTx.hash,
        approvalReceiptBlock: approveReceipt.blockNumber,
        sourceTxHash: supplyTx.hash,
        sourceBlock: supplyReceipt.blockNumber,
        sourceReceiptStatus: supplyReceipt.status,
        sourceGasUsed: supplyReceipt.gasUsed.toString(),
        supplyEvent,
        reserveLockerATokenBalance: aTokenBalance.toString(),
        wethBalanceBefore: beforeBalance.toString(),
        wethBalanceAfter: (await weth.balanceOf(wallet.address)).toString(),
    };
    writeState(state);

    console.log("PHASE0_SOURCE_CONFIRMED");
    console.log(`borrower=${wallet.address}`);
    console.log(`reserveLocker=${lockerAddress}`);
    console.log(`approvalTx=${approveTx.hash}`);
    console.log(`sourceTx=${supplyTx.hash}`);
    console.log(`sourceBlock=${supplyReceipt.blockNumber}`);
    console.log(`suppliedWETH=${ethers.formatUnits(amount, 18)}`);
    console.log(`lockerAWETH=${ethers.formatUnits(aTokenBalance, 18)}`);
    console.log("state=source_transaction_confirmed");
}

main().catch((error) => {
    console.error(`PHASE0_SOURCE_FAILED|${cleanError(error)}`);
    process.exitCode = 1;
});
