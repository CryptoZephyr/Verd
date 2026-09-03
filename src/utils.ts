import { createHash, timingSafeEqual } from "node:crypto";
import { ethers } from "ethers";

export function nowIso(): string {
    return new Date().toISOString();
}

export function sameAddress(left: string, right: string): boolean {
    return String(left).toLowerCase() === String(right).toLowerCase();
}

export function isBytes32(value: unknown): value is string {
    return typeof value === "string" && ethers.isHexString(value, 32);
}

export function isTransactionHash(value: unknown): value is string {
    return isBytes32(value);
}

export function normalizeBytes32(value: string, name: string): string {
    if (!isBytes32(value)) throw new Error(`${name} must be a 32-byte hex value`);
    return value.toLowerCase();
}

export function deriveJobId(facilityId: string, sourceTxHash: string): string {
    return `job_${createHash("sha256")
        .update(`${facilityId.toLowerCase()}|${sourceTxHash.toLowerCase()}`)
        .digest("hex")}`;
}

export function jsonSafe<T>(value: T): T {
    return JSON.parse(JSON.stringify(value, (_, entry) =>
        typeof entry === "bigint" ? entry.toString() : entry,
    )) as T;
}

export function cleanError(error: unknown): string {
    return String((error as { shortMessage?: string; message?: string })?.shortMessage
        || (error as { message?: string })?.message
        || error)
        .replace(/0x[a-fA-F0-9]{64}/g, "[hex64]")
        .replace(/private.?key/gi, "[redacted]")
        .slice(0, 500);
}

export function isLikelyRetryable(error: unknown): boolean {
    const message = cleanError(error).toLowerCase();
    return /timeout|timed out|network|fetch|socket|econn|enotfound|429|502|503|504|temporar|pending|not ready|attest|rate limit|replacement underpriced|nonce too low/.test(message);
}

export function timingSafeEqualText(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    if (leftBuffer.length !== rightBuffer.length) return false;
    return timingSafeEqual(leftBuffer, rightBuffer);
}
