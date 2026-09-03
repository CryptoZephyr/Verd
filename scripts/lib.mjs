import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { ethers } from "ethers";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(ROOT, ".env") });

export const env = process.env;
export const STATE_PATH = path.join(ROOT, ".phase0-state.json");

export const ADDRESSES = Object.freeze({
    sepoliaWeth: "0xC558DBdd856501FCd9aaF1E62eae57A9F0629a3c",
    sepoliaAWeth: "0x5b071b590a59395fE4025A0Ccc1FcC931AAc1830",
    sepoliaAavePool: "0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951",
    cc3ChainInfo: "0x0000000000000000000000000000000000000fd3",
    cc3BlockProver: "0x0000000000000000000000000000000000000FD2",
    sourceChainKey: 1,
    cc3ChainId: 102031,
    sepoliaChainId: 11155111,
});

export function required(name) {
    const value = env[name];
    if (!value) throw new Error(`Missing required environment variable: ${name}`);
    return value;
}

export function loadArtifact(fileName, contractName) {
    const artifactPath = path.join(ROOT, "out", fileName, `${contractName}.json`);
    return JSON.parse(fs.readFileSync(artifactPath, "utf8"));
}

export function writeState(state) {
    fs.writeFileSync(
        STATE_PATH,
        `${JSON.stringify(state, (_, value) => typeof value === "bigint" ? value.toString() : value, 2)}\n`,
        "utf8",
    );
}

export function readState() {
    return JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
}

export function cleanError(error) {
    return String(error?.shortMessage || error?.message || error)
        .replace(/0x[a-fA-F0-9]{64}/g, "[hex64]")
        .replace(/private.?key/gi, "[redacted]");
}

export function asHex(value) {
    return ethers.hexlify(value);
}

export function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isoNow() {
    return new Date().toISOString();
}
