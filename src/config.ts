import { ethers } from "ethers";
import dotenv from "dotenv";
import { ADDRESSES } from "./abi.js";

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

function positiveInt(name: string, fallback: number, maximum = Number.MAX_SAFE_INTEGER): number {
    const raw = process.env[name];
    if (!raw) return fallback;
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
        throw new Error(`Invalid positive integer environment variable: ${name}`);
    }
    return value;
}

function positiveBigInt(name: string, fallback: bigint): bigint {
    const raw = process.env[name];
    if (!raw) return fallback;
    try {
        const value = BigInt(raw);
        if (value <= 0n) throw new Error("non-positive");
        return value;
    } catch {
        throw new Error(`Invalid positive integer environment variable: ${name}`);
    }
}

function requiredHttpUrl(name: string): string {
    const value = required(name);
    let parsed: URL;
    try {
        parsed = new URL(value);
    } catch {
        throw new Error(`Invalid URL environment variable: ${name}`);
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error(`Environment variable ${name} must use http or https`);
    }
    return value;
}

function requiredPostgresUrl(name: string): string {
    const value = required(name);
    let parsed: URL;
    try {
        parsed = new URL(value);
    } catch {
        throw new Error(`Invalid database URL environment variable: ${name}`);
    }
    if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
        throw new Error(`Environment variable ${name} must use postgres or postgresql`);
    }
    return value;
}

function validatePrivateKey(value: string): string {
    try {
        new ethers.Wallet(value);
    } catch {
        throw new Error("PRIVATE_KEY must be a valid 32-byte private key");
    }
    return value;
}

export function loadConfig(): Config {
    const internalTickSecret = required("INTERNAL_TICK_SECRET").trim();
    if (internalTickSecret.length < 16) {
        throw new Error("INTERNAL_TICK_SECRET must be at least 16 characters");
    }
    const sourceChainKey = positiveInt("SOURCE_CHAIN_KEY", ADDRESSES.sourceChainKey);
    if (sourceChainKey !== ADDRESSES.sourceChainKey) {
        throw new Error(`SOURCE_CHAIN_KEY must be ${ADDRESSES.sourceChainKey} for the Sepolia worker`);
    }

    return {
        port: positiveInt("PORT", 10000, 65_535),
        databaseUrl: requiredPostgresUrl("DATABASE_URL"),
        databaseSsl: process.env.DATABASE_SSL !== "false",
        privateKey: validatePrivateKey(required("PRIVATE_KEY")),
        sepoliaRpcUrl: requiredHttpUrl("SEPOLIA_RPC_URL"),
        cc3RpcUrl: requiredHttpUrl("CC3_RPC_URL"),
        proofBuilderUrl: requiredHttpUrl("PROOF_BUILDER_URL"),
        verdAddress: ethers.getAddress(required("VERD_ADDRESS")),
        internalTickSecret,
        sourceChainKey,
        cc3GasLimit: positiveBigInt("CC3_GAS_LIMIT", 9_000_000n),
        leaseSeconds: positiveInt("WORKER_LEASE_SECONDS", 120),
        attestationRequestTimeoutMs: positiveInt("ATTESTATION_REQUEST_TIMEOUT_MS", 2500),
        attestationMaxWaitMs: positiveInt("ATTESTATION_MAX_WAIT_MS", 5000),
        attestationPollIntervalMs: positiveInt("ATTESTATION_POLL_INTERVAL_MS", 1000),
        maxBodyBytes: positiveInt("MAX_BODY_BYTES", 64 * 1024),
    };
}
