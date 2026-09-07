import { createRequire } from "node:module";
import { ethers, type JsonRpcProvider, type TransactionReceipt } from "ethers";
import { ADDRESSES, AAVE_POOL_ABI, LOCKER_ABI, RESERVE_LOCKER_FACTORY_ABI, VERD_ABI } from "./abi.js";
import type { Config } from "./config.js";
import { RetryableWorkerError, TerminalWorkerError } from "./errors.js";
import { cleanError, isLikelyRetryable, jsonSafe, sameAddress } from "./utils.js";
import type {
    ChainGateway,
    BindingSnapshot,
    BindingSourceVerification,
    FacilitySnapshot,
    FacilityTermsSnapshot,
    GeneratedProof,
    QualificationSnapshot,
    SerializedProof,
    SourceVerification,
    SubmissionReceipt,
} from "./types.js";

const require = createRequire(import.meta.url);
const sdk: any = require("@gluwa/usc-sdk");

const ZERO_ADDRESS = ethers.ZeroAddress;
const ZERO_BYTES32 = ethers.ZeroHash;

function proofEnvelope(proof: SerializedProof): [number, string, string] {
    const siblings = proof.merkleProof.siblings.map((entry) => [entry.hash, entry.isLeft]);
    const data = ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes", "tuple(bytes32 sibling,bool isLeft)[]"],
        [proof.txBytes, siblings],
    );
    return [0, proof.merkleProof.root, data];
}

function continuityEnvelope(proof: SerializedProof): [string, string[]] {
    return [proof.continuityProof.lowerEndpointDigest, proof.continuityProof.roots];
}

function toNumber(value: bigint | number | string): number {
    const converted = Number(value);
    if (!Number.isSafeInteger(converted) || converted < 0) {
        throw new Error("chain_number_out_of_range");
    }
    return converted;
}

function isZeroBytes32(value: string): boolean {
    return value.toLowerCase() === ZERO_BYTES32.toLowerCase();
}

function asProof(proofData: any): SerializedProof {
    const siblings = proofData?.merkleProof?.siblings;
    if (!proofData || !proofData.txHash || !proofData.txBytes || !proofData.merkleProof || !proofData.continuityProof) {
        throw new TerminalWorkerError("proof_shape_invalid", "Attestcoin returned an incomplete proof");
    }
    if (!Array.isArray(siblings) || !proofData.merkleProof.root || !Array.isArray(proofData.continuityProof.roots)) {
        throw new TerminalWorkerError("proof_shape_invalid", "Attestcoin returned an invalid proof envelope");
    }

    return jsonSafe({
        chainKey: toNumber(proofData.chainKey),
        headerNumber: toNumber(proofData.headerNumber),
        txHash: String(proofData.txHash),
        txBytes: String(proofData.txBytes),
        merkleProof: {
            root: String(proofData.merkleProof.root),
            siblings: siblings.map((entry: any) => ({
                hash: String(entry.hash ?? entry.sibling),
                isLeft: Boolean(entry.isLeft),
            })),
        },
        continuityProof: {
            lowerEndpointDigest: String(proofData.continuityProof.lowerEndpointDigest),
            roots: proofData.continuityProof.roots.map((root: any) => String(root)),
        },
        generatedAt: proofData.generatedAt ? new Date(proofData.generatedAt).toISOString() : undefined,
    });
}

function proofBuilderError(error: unknown): Error {
    if (isLikelyRetryable(error)) {
        return new RetryableWorkerError("attestcoin_unavailable", cleanError(error));
    }
    return new TerminalWorkerError("attestcoin_request_failed", cleanError(error));
}

export class LiveChainGateway implements ChainGateway {
    private readonly config: Config;
    private readonly sepolia: JsonRpcProvider;
    private readonly cc3: JsonRpcProvider;
    private readonly signer: ethers.Wallet;
    private readonly verd: any;
    private networksChecked = false;

    constructor(config: Config) {
        this.config = config;
        this.sepolia = new ethers.JsonRpcProvider(config.sepoliaRpcUrl);
        this.cc3 = new ethers.JsonRpcProvider(config.cc3RpcUrl);
        this.signer = new ethers.Wallet(config.privateKey, this.cc3);
        this.verd = new ethers.Contract(config.verdAddress, VERD_ABI, this.cc3);
    }

    async assertNetworks(): Promise<void> {
        if (this.networksChecked) return;
        try {
            const [cc3Network, sepoliaNetwork, verdCode] = await Promise.all([
                this.cc3.getNetwork(),
                this.sepolia.getNetwork(),
                this.cc3.getCode(this.config.verdAddress),
            ]);
            if (Number(cc3Network.chainId) !== ADDRESSES.cc3ChainId) {
                throw new TerminalWorkerError("cc3_chain_mismatch", "The configured CC3 RPC is on an unexpected chain");
            }
            if (Number(sepoliaNetwork.chainId) !== ADDRESSES.sepoliaChainId) {
                throw new TerminalWorkerError("sepolia_chain_mismatch", "The configured Sepolia RPC is on an unexpected chain");
            }
            if (verdCode === "0x") {
                throw new TerminalWorkerError("verd_code_missing", "VERD_ADDRESS has no deployed code on CC3");
            }
            this.networksChecked = true;
        } catch (error) {
            if (error instanceof TerminalWorkerError) throw error;
            throw new RetryableWorkerError("chain_unavailable", cleanError(error));
        }
    }

    async getFacility(facilityId: string): Promise<FacilitySnapshot> {
        try {
            const raw = await this.verd.getFacility(facilityId);
            const borrower = String(raw[1]);
            if (sameAddress(borrower, ZERO_ADDRESS)) {
                throw new TerminalWorkerError("facility_not_found", "The facility does not exist on CC3", facilityId);
            }

            const status = await this.verd.getFacilityStatus(facilityId);
            const proof = await this.verd.getFacilityProof(facilityId);
            const binding = await this.verd.getFacilityLockerBinding(facilityId);
            const locker = String(raw[11]);
            if (sameAddress(locker, ZERO_ADDRESS)) {
                throw new TerminalWorkerError("facility_locker_unbound", "The facility has no authenticated ReserveLocker", facilityId);
            }

            const lockerFacility = String(await this.verd.lockerFacility(locker));
            if (lockerFacility.toLowerCase() !== facilityId.toLowerCase()) {
                throw new TerminalWorkerError("locker_facility_mismatch", "CC3 locker binding does not point to this facility", facilityId);
            }
            if (isZeroBytes32(String(binding[0]))) {
                throw new TerminalWorkerError("locker_binding_evidence_missing", "The facility has no binding proof evidence", facilityId);
            }

            return {
                facilityId,
                borrower,
                requiredReserveAmount: BigInt(raw[10]),
                maturity: toNumber(raw[8]),
                qualificationDeadline: toNumber(raw[9]),
                reserveLocker: locker,
                preferredRateActive: Boolean(status[3]),
                funded: Boolean(status[1]),
                qualificationProofId: String(proof[0]),
                qualificationSourceBlock: toNumber(proof[1]),
                lockerBindingProofId: String(binding[0]),
                lockerBindingSourceBlock: toNumber(binding[1]),
                lockerUnlockTime: toNumber(binding[2]),
            };
        } catch (error) {
            if (error instanceof TerminalWorkerError) throw error;
            if (isLikelyRetryable(error)) throw new RetryableWorkerError("cc3_read_unavailable", cleanError(error));
            throw new TerminalWorkerError("facility_read_failed", cleanError(error), facilityId);
        }
    }

    async getFacilityTerms(facilityId: string): Promise<FacilityTermsSnapshot> {
        try {
            const raw = await this.verd.getFacility(facilityId);
            const borrower = String(raw[1]);
            if (sameAddress(borrower, ZERO_ADDRESS)) {
                throw new TerminalWorkerError("facility_not_found", "The facility does not exist on CC3", facilityId);
            }
            return { facilityId, borrower, maturity: toNumber(raw[8]) };
        } catch (error) {
            if (error instanceof TerminalWorkerError) throw error;
            if (isLikelyRetryable(error)) throw new RetryableWorkerError("cc3_read_unavailable", cleanError(error), facilityId);
            throw new TerminalWorkerError("facility_read_failed", cleanError(error), facilityId);
        }
    }

    async verifySource(
        facility: FacilitySnapshot,
        sourceTxHash: string,
        expectedSourceBlock?: number,
    ): Promise<SourceVerification> {
        let tx: ethers.TransactionResponse | null;
        let receipt: TransactionReceipt | null;
        try {
            [tx, receipt] = await Promise.all([
                this.sepolia.getTransaction(sourceTxHash),
                this.sepolia.getTransactionReceipt(sourceTxHash),
            ]);
        } catch (error) {
            throw new RetryableWorkerError("sepolia_rpc_unavailable", cleanError(error), sourceTxHash);
        }
        if (!tx || !receipt) throw new RetryableWorkerError("source_transaction_pending", "The source transaction or receipt is not available", sourceTxHash);
        if (receipt.status !== 1) throw new TerminalWorkerError("source_transaction_failed", "The source transaction reverted", sourceTxHash);
        if (expectedSourceBlock !== undefined && receipt.blockNumber !== expectedSourceBlock) {
            throw new TerminalWorkerError("source_block_mismatch", "The source receipt block differs from the registered block", sourceTxHash);
        }
        if (!sameAddress(tx.from, facility.borrower)) {
            throw new TerminalWorkerError("source_borrower_mismatch", "The source transaction sender differs from the facility borrower", sourceTxHash);
        }
        if (!tx.to || !sameAddress(tx.to, ADDRESSES.sepoliaAavePool)) {
            throw new TerminalWorkerError("source_pool_mismatch", "The source transaction destination is not the approved Aave Pool", sourceTxHash);
        }

        const iface = new ethers.Interface(AAVE_POOL_ABI);
        let supplyEvent: any;
        for (const log of receipt.logs) {
            if (!sameAddress(log.address, ADDRESSES.sepoliaAavePool)) continue;
            try {
                const parsed = iface.parseLog({ topics: log.topics, data: log.data });
                if (parsed?.name === "Supply") {
                    supplyEvent = parsed;
                    break;
                }
            } catch {
                // The receipt can contain unrelated Aave logs.
            }
        }
        if (!supplyEvent) throw new TerminalWorkerError("supply_event_missing", "The source receipt has no Aave Supply event", sourceTxHash);

        const reserve = String(supplyEvent.args[0]);
        const user = String(supplyEvent.args[1]);
        const onBehalfOf = String(supplyEvent.args[2]);
        const amount = BigInt(supplyEvent.args[3]);
        const referralCode = Number(supplyEvent.args[4]);
        if (!sameAddress(reserve, ADDRESSES.sepoliaWeth)) {
            throw new TerminalWorkerError("source_reserve_mismatch", "The Supply event reserve is not Sepolia WETH", sourceTxHash);
        }
        if (!sameAddress(user, facility.borrower)) {
            throw new TerminalWorkerError("source_user_mismatch", "The Supply event user is not the facility borrower", sourceTxHash);
        }
        if (!sameAddress(onBehalfOf, facility.reserveLocker)) {
            throw new TerminalWorkerError("source_locker_mismatch", "The Supply event recipient is not the authenticated ReserveLocker", sourceTxHash);
        }
        if (amount < facility.requiredReserveAmount) {
            throw new TerminalWorkerError("source_amount_insufficient", "The Supply amount is below the facility reserve requirement", sourceTxHash);
        }
        if (referralCode !== 0) {
            throw new TerminalWorkerError("source_referral_mismatch", "The Supply referral code is not zero", sourceTxHash);
        }

        try {
            const locker = new ethers.Contract(facility.reserveLocker, LOCKER_ABI, this.sepolia);
            const [borrower, pool, reserveAsset, aToken, unlockTime, aTokenBalance] = await Promise.all([
                locker.borrower(),
                locker.aavePool(),
                locker.reserveAsset(),
                locker.aToken(),
                locker.unlockTime(),
                locker.aTokenBalance(),
            ]);
            if (!sameAddress(String(borrower), facility.borrower)) throw new TerminalWorkerError("locker_borrower_mismatch", "The source locker borrower differs from CC3 state", sourceTxHash);
            if (!sameAddress(String(pool), ADDRESSES.sepoliaAavePool)) throw new TerminalWorkerError("locker_pool_mismatch", "The source locker Pool differs from the approved Pool", sourceTxHash);
            if (!sameAddress(String(reserveAsset), ADDRESSES.sepoliaWeth)) throw new TerminalWorkerError("locker_reserve_mismatch", "The source locker reserve differs from approved WETH", sourceTxHash);
            if (!sameAddress(String(aToken), ADDRESSES.sepoliaAWeth)) throw new TerminalWorkerError("locker_atoken_mismatch", "The source locker aToken differs from approved aWETH", sourceTxHash);
            if (BigInt(unlockTime) < BigInt(facility.maturity)) throw new TerminalWorkerError("locker_maturity_mismatch", "The source locker unlock time is before facility maturity", sourceTxHash);
            if (BigInt(aTokenBalance) < facility.requiredReserveAmount) throw new TerminalWorkerError("locker_balance_insufficient", "The source locker aToken balance is below the facility reserve requirement", sourceTxHash);

            return {
                sourceBlock: receipt.blockNumber,
                receiptStatus: receipt.status,
                event: {
                    reserve,
                    user,
                    onBehalfOf,
                    amount: amount.toString(),
                    referralCode,
                },
                lockerATokenBalance: BigInt(aTokenBalance).toString(),
            };
        } catch (error) {
            if (error instanceof TerminalWorkerError) throw error;
            if (isLikelyRetryable(error)) throw new RetryableWorkerError("sepolia_rpc_unavailable", cleanError(error), sourceTxHash);
            throw new TerminalWorkerError("locker_read_failed", cleanError(error), sourceTxHash);
        }
    }

    async verifyBindingSource(facility: FacilityTermsSnapshot, sourceTxHash: string, expectedSourceBlock?: number): Promise<BindingSourceVerification> {
        let tx: ethers.TransactionResponse | null;
        let receipt: TransactionReceipt | null;
        try {
            [tx, receipt] = await Promise.all([
                this.sepolia.getTransaction(sourceTxHash),
                this.sepolia.getTransactionReceipt(sourceTxHash),
            ]);
        } catch (error) {
            throw new RetryableWorkerError("sepolia_rpc_unavailable", cleanError(error), sourceTxHash);
        }
        if (!tx || !receipt) throw new RetryableWorkerError("source_transaction_pending", "The factory transaction or receipt is not available", sourceTxHash);
        if (receipt.status !== 1) throw new TerminalWorkerError("source_transaction_failed", "The factory transaction reverted", sourceTxHash);
        if (expectedSourceBlock !== undefined && receipt.blockNumber !== expectedSourceBlock) throw new TerminalWorkerError("source_block_mismatch", "The source receipt block differs from the registered block", sourceTxHash);
        if (!sameAddress(tx.from, facility.borrower)) throw new TerminalWorkerError("factory_borrower_mismatch", "The factory transaction sender differs from the facility borrower", sourceTxHash);
        if (!tx.to || !sameAddress(tx.to, ADDRESSES.sepoliaReserveLockerFactory)) throw new TerminalWorkerError("factory_source_mismatch", "The source transaction destination is not the approved ReserveLockerFactory", sourceTxHash);

        const iface = new ethers.Interface(RESERVE_LOCKER_FACTORY_ABI);
        let event: ethers.LogDescription | null = null;
        for (const log of receipt.logs) {
            if (!sameAddress(log.address, ADDRESSES.sepoliaReserveLockerFactory)) continue;
            try {
                const parsed = iface.parseLog({ topics: log.topics, data: log.data });
                if (parsed?.name === "ReserveLockerCreated") { event = parsed; break; }
            } catch {
                // Ignore unrelated factory logs.
            }
        }
        if (!event) throw new TerminalWorkerError("factory_event_missing", "The factory receipt has no ReserveLockerCreated event", sourceTxHash);
        const facilityId = String(event.args[0]);
        const locker = String(event.args[1]);
        const borrower = String(event.args[2]);
        const aavePool = String(event.args[3]);
        const reserveAsset = String(event.args[4]);
        const aToken = String(event.args[5]);
        const unlockTime = toNumber(event.args[6]);
        if (facilityId.toLowerCase() !== facility.facilityId.toLowerCase()) throw new TerminalWorkerError("factory_facility_mismatch", "The factory event belongs to another facility", sourceTxHash);
        if (!sameAddress(borrower, facility.borrower)) throw new TerminalWorkerError("factory_event_borrower_mismatch", "The factory event borrower differs from the facility borrower", sourceTxHash);
        if (!sameAddress(aavePool, ADDRESSES.sepoliaAavePool)) throw new TerminalWorkerError("factory_pool_mismatch", "The factory event Pool is not the approved Aave Pool", sourceTxHash);
        if (!sameAddress(reserveAsset, ADDRESSES.sepoliaWeth)) throw new TerminalWorkerError("factory_reserve_mismatch", "The factory event reserve is not Sepolia WETH", sourceTxHash);
        if (!sameAddress(aToken, ADDRESSES.sepoliaAWeth)) throw new TerminalWorkerError("factory_atoken_mismatch", "The factory event aToken is not the approved aWETH", sourceTxHash);
        if (unlockTime < facility.maturity) throw new TerminalWorkerError("factory_unlock_mismatch", "The locker unlock time is before facility maturity", sourceTxHash);
        return { sourceBlock: receipt.blockNumber, receiptStatus: receipt.status, locker, borrower, unlockTime };
    }

    private proofBuilder(): any {
        return new sdk.proofProvider.service.ProofBuilder(
            this.config.sourceChainKey,
            this.config.proofBuilderUrl,
            30_000,
        );
    }

    async waitForAttestation(sourceBlock: number): Promise<void> {
        try {
            await this.proofBuilder().waitUntilHeightAttested(
                this.config.sourceChainKey,
                sourceBlock,
                this.config.attestationRequestTimeoutMs,
                this.config.attestationMaxWaitMs,
                this.config.attestationPollIntervalMs,
            );
        } catch (error) {
            throw proofBuilderError(error);
        }
    }

    async generateProof(sourceTxHash: string, sourceBlock: number): Promise<GeneratedProof> {
        let result: any;
        try {
            result = await this.proofBuilder().getProof(sourceTxHash);
        } catch (error) {
            throw proofBuilderError(error);
        }
        if (!result?.success || !result.data) {
            const reason = String(result?.error || "proof_not_ready");
            if (/retriable|reorg-protection|not ready|pending|timeout/i.test(reason)) {
                throw new RetryableWorkerError("proof_builder_pending", reason.slice(0, 300), sourceTxHash);
            }
            throw new TerminalWorkerError("proof_builder_failed", reason.slice(0, 300), sourceTxHash);
        }

        const proof = asProof(result.data);
        if (!sameAddress(proof.txHash, sourceTxHash)) {
            throw new TerminalWorkerError("proof_transaction_hash_mismatch", "Attestcoin returned a proof for another transaction", sourceTxHash);
        }
        if (proof.chainKey !== this.config.sourceChainKey) {
            throw new TerminalWorkerError("proof_chain_key_mismatch", "Attestcoin returned a proof for another source chain", sourceTxHash);
        }
        if (proof.headerNumber !== sourceBlock) {
            throw new TerminalWorkerError("proof_source_block_mismatch", "Attestcoin returned a proof for another source block", sourceTxHash);
        }

        try {
            const prover = new sdk.blockProver.PrecompileBlockProver(this.cc3);
            const valid = await prover.verifySingle(
                proof.chainKey,
                proof.headerNumber,
                proof.txBytes,
                proof.merkleProof,
                proof.continuityProof,
            );
            if (!valid) throw new TerminalWorkerError("attestcoin_proof_invalid", "The CC3 BlockProver rejected the generated proof", sourceTxHash);
            const id = String(await this.verd.proofId(
                proof.chainKey,
                proof.headerNumber,
                proofEnvelope(proof),
                continuityEnvelope(proof),
            ));
            return { proof, proofId: id, sdkProofValid: true };
        } catch (error) {
            if (error instanceof TerminalWorkerError) throw error;
            if (isLikelyRetryable(error)) throw new RetryableWorkerError("cc3_proof_read_unavailable", cleanError(error), sourceTxHash);
            throw new TerminalWorkerError("proof_verification_failed", cleanError(error), sourceTxHash);
        }
    }

    async readQualification(facilityId: string, proofId: string): Promise<QualificationSnapshot> {
        try {
            const [status, proof, processed] = await Promise.all([
                this.verd.getFacilityStatus(facilityId),
                this.verd.getFacilityProof(facilityId),
                this.verd.processedProof(proofId),
            ]);
            return {
                processedProof: Boolean(processed),
                preferredRateActive: Boolean(status[3]),
                qualificationProofId: String(proof[0]),
                qualificationSourceBlock: toNumber(proof[1]),
            };
        } catch (error) {
            if (isLikelyRetryable(error)) throw new RetryableWorkerError("cc3_read_unavailable", cleanError(error), facilityId);
            throw new TerminalWorkerError("qualification_state_read_failed", cleanError(error), facilityId);
        }
    }

    async readBinding(facilityId: string, proofId: string): Promise<BindingSnapshot> {
        try {
            const [binding, processed, raw] = await Promise.all([
                this.verd.getFacilityLockerBinding(facilityId),
                this.verd.processedProof(proofId),
                this.verd.getFacility(facilityId),
            ]);
            return {
                bindingProofId: processed ? String(binding[0]) : ZERO_BYTES32,
                bindingSourceBlock: toNumber(binding[1]),
                locker: String(raw[11]),
            };
        } catch (error) {
            if (isLikelyRetryable(error)) throw new RetryableWorkerError("cc3_read_unavailable", cleanError(error), facilityId);
            throw new TerminalWorkerError("binding_state_read_failed", cleanError(error), facilityId);
        }
    }

    async reserveSubmissionNonce(): Promise<number> {
        try {
            return await this.cc3.getTransactionCount(this.signer.address, "pending");
        } catch (error) {
            throw new RetryableWorkerError("cc3_nonce_unavailable", cleanError(error));
        }
    }

    async getSubmissionNonceState(): Promise<{ latest: number; pending: number }> {
        try {
            const [latest, pending] = await Promise.all([
                this.cc3.getTransactionCount(this.signer.address, "latest"),
                this.cc3.getTransactionCount(this.signer.address, "pending"),
            ]);
            return { latest, pending };
        } catch (error) {
            throw new RetryableWorkerError("cc3_nonce_unavailable", cleanError(error));
        }
    }

    async findSubmissionByNonce(nonce: number): Promise<string | null> {
        try {
            const result = await this.cc3.send("eth_getTransactionBySenderAndNonce", [
                this.signer.address,
                ethers.toQuantity(nonce),
            ]);
            return result?.hash ? String(result.hash) : null;
        } catch {
            return null;
        }
    }

    async sendQualification(facilityId: string, proof: SerializedProof, nonce: number): Promise<string> {
        try {
            const tx = await this.verd.qualifyFacility(
                facilityId,
                proof.chainKey,
                proof.headerNumber,
                proofEnvelope(proof),
                continuityEnvelope(proof),
                { gasLimit: this.config.cc3GasLimit, nonce },
            );
            return String(tx.hash);
        } catch (error) {
            if (/revert|call exception|execution reverted|invalid argument/i.test(cleanError(error).toLowerCase())) {
                throw new TerminalWorkerError("cc3_submission_rejected", cleanError(error), facilityId);
            }
            throw new RetryableWorkerError("cc3_submission_unavailable", cleanError(error), facilityId);
        }
    }

    async sendBinding(facilityId: string, proof: SerializedProof, nonce: number): Promise<string> {
        try {
            const tx = await this.verd.bindReserveLocker(
                facilityId,
                proof.chainKey,
                proof.headerNumber,
                proofEnvelope(proof),
                continuityEnvelope(proof),
                { gasLimit: this.config.cc3GasLimit, nonce },
            );
            return String(tx.hash);
        } catch (error) {
            if (/revert|call exception|execution reverted|invalid argument/i.test(cleanError(error).toLowerCase())) {
                throw new TerminalWorkerError("cc3_binding_rejected", cleanError(error), facilityId);
            }
            throw new RetryableWorkerError("cc3_submission_unavailable", cleanError(error), facilityId);
        }
    }

    async getReceipt(txHash: string): Promise<SubmissionReceipt | null> {
        try {
            const receipt = await this.cc3.getTransactionReceipt(txHash);
            if (!receipt) return null;
            if (receipt.status === null) {
                throw new RetryableWorkerError("cc3_receipt_pending", "The CC3 receipt has no final status", txHash);
            }
            return {
                status: receipt.status,
                blockNumber: receipt.blockNumber,
                gasUsed: receipt.gasUsed.toString(),
            };
        } catch (error) {
            throw new RetryableWorkerError("cc3_receipt_unavailable", cleanError(error), txHash);
        }
    }
}
