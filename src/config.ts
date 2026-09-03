import { ethers } from "ethers";
import dotenv from "dotenv";

dotenv.config();

export interface Config {
    port: number;
    databaseUrl: string;
    databaseSsl: boolean;
    privateKey: string;
    sepoliaRpcUrl: string;
    cc3RpcUrl: string;
    proofBuilderUrl: string;
    verdAddress: string;
    internalTickSecret: string;
    sourceChainKey: number;
    cc3GasLimit: bigint;
    leaseSeconds: number;
    attestationRequestTimeoutMs: number;
    attestationMaxWaitMs: number;
    attestationPollIntervalMs: number;
    maxBodyBytes: number;
}

function required(name: string): string {
    const value = process.env[name];
    if (!value) throw new Error(`Missing required environment variable: ${name}`);
    return value;
}

function positiveInt(name: string, fallback: number): number {
    const raw = process.env[name];
    if (!raw) return fallback;
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value <= 0) {
        throw new Error(`Invalid positive integer environment variable: ${name}`);
    }
    return value;
}

export function loadConfig(): Config {
    const internalTickSecret = required("INTERNAL_TICK_SECRET");
    if (internalTickSecret.length < 16) {
        throw new Error("INTERNAL_TICK_SECRET must be at least 16 characters");
    }

    return {
        port: positiveInt("PORT", 10000),
        databaseUrl: required("DATABASE_URL"),
        databaseSsl: process.env.DATABASE_SSL !== "false",
        privateKey: required("PRIVATE_KEY"),
        sepoliaRpcUrl: required("SEPOLIA_RPC_URL"),
        cc3RpcUrl: required("CC3_RPC_URL"),
        proofBuilderUrl: required("PROOF_BUILDER_URL"),
        verdAddress: ethers.getAddress(required("VERD_ADDRESS")),
        internalTickSecret,
        sourceChainKey: positiveInt("SOURCE_CHAIN_KEY", 1),
        cc3GasLimit: BigInt(process.env.CC3_GAS_LIMIT || "9000000"),
        leaseSeconds: positiveInt("WORKER_LEASE_SECONDS", 120),
        attestationRequestTimeoutMs: positiveInt("ATTESTATION_REQUEST_TIMEOUT_MS", 2500),
        attestationMaxWaitMs: positiveInt("ATTESTATION_MAX_WAIT_MS", 5000),
        attestationPollIntervalMs: positiveInt("ATTESTATION_POLL_INTERVAL_MS", 1000),
        maxBodyBytes: positiveInt("MAX_BODY_BYTES", 64 * 1024),
    };
}
