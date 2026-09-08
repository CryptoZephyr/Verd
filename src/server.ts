import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { loadConfig, type Config } from "./config.js";
import { BadRequestError, TerminalWorkerError } from "./errors.js";
import { PostgresJobStore } from "./db.js";
import { LiveChainGateway } from "./chain.js";
import { cleanError, timingSafeEqualText } from "./utils.js";
import { ProofWorker } from "./worker.js";
import type { JobInput, JobOperation, JobRecord, JobStore } from "./types.js";

function json(res: ServerResponse, status: number, payload: unknown): void {
    const body = JSON.stringify(payload);
    res.statusCode = status;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.setHeader("cache-control", "no-store");
    res.setHeader("access-control-allow-origin", "*");
    res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
    res.setHeader("access-control-allow-headers", "content-type,authorization,x-internal-tick-secret");
    res.end(body);
}

function publicJob(job: JobRecord): Record<string, unknown> {
    const state = job.state;
    return {
        jobId: job.jobId,
        operation: state.operation ?? "qualification",
        facilityId: job.facilityId,
        sourceTxHash: job.sourceTxHash,
        status: state.status,
        nextAction: state.nextAction,
        terminal: state.terminal,
        attempts: state.attempts,
        retryCount: state.retryCount,
        sourceBlock: state.sourceBlock ?? null,
        sourceReceiptStatus: state.sourceReceiptStatus ?? null,
        sourceEvent: state.sourceEvent ?? null,
        releaseEvent: state.releaseEvent ?? null,
        lockerATokenBalance: state.lockerATokenBalance ?? null,
        proofId: state.proofId ?? null,
        proofSdkValid: state.proofSdkValid ?? null,
        proofGeneratedAt: state.proofGeneratedAt ?? null,
        cc3SubmissionNonce: state.cc3SubmissionNonce ?? null,
        cc3SubmissionTxHash: state.cc3SubmissionTxHash ?? null,
        cc3Receipt: state.cc3Receipt ?? null,
        idempotencyOutcome: state.idempotencyOutcome ?? null,
        lastErrorCategory: state.lastErrorCategory ?? null,
        lastErrorMessage: state.lastErrorMessage ?? null,
        evidenceId: state.evidenceId ?? null,
        createdAt: state.createdAt,
        updatedAt: state.updatedAt,
        completedAt: state.completedAt ?? null,
    };
}

async function advanceWorker(worker: ProofWorker, jobId?: string): Promise<void> {
    try {
        const result = await worker.tick(jobId);
        if (result.outcome !== "idle" && result.outcome !== "busy") {
            console.log(JSON.stringify({
                event: "worker_tick",
                outcome: result.outcome,
                jobId: result.job?.jobId ?? jobId ?? null,
                status: result.job?.state.status ?? null,
            }));
        }
    } catch (error) {
        console.error(JSON.stringify({ event: "worker_tick_failed", jobId: jobId ?? null, error: cleanError(error) }));
    }
}

function bearerOrHeader(req: IncomingMessage): string {
    const header = req.headers["x-internal-tick-secret"];
    if (typeof header === "string") return header;
    const auth = req.headers.authorization;
    if (auth?.startsWith("Bearer ")) return auth.slice("Bearer ".length);
    return "";
}

function authorized(req: IncomingMessage, config: Config): boolean {
    return timingSafeEqualText(bearerOrHeader(req), config.internalTickSecret);
}

async function body(req: IncomingMessage, maxBytes: number): Promise<Record<string, unknown>> {
    const declaredLength = Number(req.headers["content-length"] || 0);
    if (declaredLength > maxBytes) throw new BadRequestError("request body is too large");
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.length;
        if (size > maxBytes) throw new BadRequestError("request body is too large");
        chunks.push(buffer);
    }
    if (!size) return {};
    let parsed: unknown;
    try {
        parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
        throw new BadRequestError("request body must be valid JSON");
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new BadRequestError("request body must be a JSON object");
    }
    return parsed as Record<string, unknown>;
}

function stringField(value: unknown, name: string): string {
    if (typeof value !== "string" || !value.trim()) throw new BadRequestError(`${name} is required`);
    return value.trim();
}

function optionalHash(value: unknown, name: string): string | undefined {
    if (value === undefined || value === null || value === "") return undefined;
    return stringField(value, name);
}

function jobInput(payload: Record<string, unknown>): JobInput {
    const operation = payload.operation === undefined ? "qualification" : payload.operation;
    if (operation !== "qualification" && operation !== "binding" && operation !== "release") throw new BadRequestError("operation must be qualification, binding, or release");
    const sourceBlock = payload.sourceBlock === undefined || payload.sourceBlock === null || payload.sourceBlock === ""
        ? undefined
        : Number(payload.sourceBlock);
    if (sourceBlock !== undefined && (!Number.isSafeInteger(sourceBlock) || sourceBlock <= 0)) {
        throw new BadRequestError("sourceBlock must be a positive integer");
    }
    const proofId = optionalHash(payload.proofId, "proofId");
    const cc3SubmissionTxHash = optionalHash(payload.cc3SubmissionTxHash, "cc3SubmissionTxHash");
    if (cc3SubmissionTxHash && !proofId) {
        throw new BadRequestError("proofId is required when cc3SubmissionTxHash is supplied");
    }
    return {
        operation: operation as JobOperation,
        facilityId: stringField(payload.facilityId, "facilityId"),
        sourceTxHash: stringField(payload.sourceTxHash, "sourceTxHash"),
        proofId,
        sourceBlock,
        cc3SubmissionTxHash,
    };
}

export function createHttpServer(store: JobStore, worker: ProofWorker, config: Config): Server {
    return createServer(async (req, res) => {
        const method = req.method || "GET";
        const requestUrl = new URL(req.url || "/", "http://localhost");
        const pathname = requestUrl.pathname.replace(/\/+$/, "") || "/";
        const parts = pathname.split("/").filter(Boolean).map((part) => decodeURIComponent(part));

        try {
            if (method === "OPTIONS") {
                res.setHeader("access-control-allow-origin", "*");
                res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
                res.setHeader("access-control-allow-headers", "content-type,authorization,x-internal-tick-secret");
                res.statusCode = 204;
                res.end();
                return;
            }
            if (method === "GET" && (pathname === "/health" || pathname === "/healthz")) {
                await store.ping();
                json(res, 200, {
                    ok: true,
                    service: "verd-phase5-worker",
                    phase: "phase5",
                    database: "ok",
                    worker: "ready",
                    phase6Started: true,
                    timestamp: new Date().toISOString(),
                });
                return;
            }

            if (method === "GET" && (parts[0] === "qualification-jobs" || parts[0] === "job-status" || parts[0] === "jobs") && parts.length === 2) {
                const job = await store.getJob(parts[1]);
                if (!job) {
                    json(res, 404, { error: "job_not_found" });
                    return;
                }
                json(res, 200, publicJob(job));
                return;
            }

            if (method === "POST" && (pathname === "/qualification-jobs" || pathname === "/jobs")) {
                if (!authorized(req, config)) {
                    json(res, 401, { error: "unauthorized" });
                    return;
                }
                const input = jobInput(await body(req, config.maxBodyBytes));
                const result = await store.createJob(input);
                json(res, result.created ? 201 : 200, {
                    created: result.created,
                    idempotencyKey: `${result.job.facilityId}|${result.job.sourceTxHash}`,
                    job: publicJob(result.job),
                });
                return;
            }

            if (method === "POST" && pathname === "/public/qualification-jobs") {
                const payload = await body(req, config.maxBodyBytes);
                const walletAddress = stringField(payload.walletAddress, "walletAddress");
                const signature = stringField(payload.signature, "signature");
                const issuedAt = Number(payload.issuedAt);
                if (!Number.isSafeInteger(issuedAt)) throw new BadRequestError("issuedAt must be a millisecond timestamp");
                const input = jobInput(payload);
                const result = await worker.registerBorrowerJob(input, walletAddress, signature, issuedAt);
                void advanceWorker(worker, result.job.jobId);
                json(res, result.created ? 201 : 200, {
                    created: result.created,
                    idempotencyKey: `${result.job.facilityId}|${result.job.sourceTxHash}`,
                    job: publicJob(result.job),
                });
                return;
            }

            if (method === "POST" && pathname === "/internal/tick") {
                if (!authorized(req, config)) {
                    json(res, 401, { error: "unauthorized" });
                    return;
                }
                const payload = await body(req, config.maxBodyBytes);
                const requestedJobId = payload.jobId === undefined ? undefined : stringField(payload.jobId, "jobId");
                const result = await worker.tick(requestedJobId);
                json(res, result.outcome === "manual_review" ? 409 : 200, {
                    ...result,
                    job: result.job ? publicJob(result.job) : result.job,
                });
                return;
            }

            if (method === "GET" && pathname === "/") {
                json(res, 200, {
                    service: "verd-phase5-worker",
                    phase: "phase5",
                    endpoints: ["GET /health", "POST /public/qualification-jobs", "GET /job-status/:jobId", "POST /internal/tick"],
                });
                return;
            }

            json(res, 404, { error: "not_found" });
        } catch (error) {
            if (error instanceof BadRequestError) {
                json(res, 400, { error: "bad_request", message: error.message });
                return;
            }
            if (error instanceof TerminalWorkerError) {
                json(res, 422, { error: error.category, message: error.message });
                return;
            }
            console.error(JSON.stringify({ event: "request_failed", path: pathname, method, error: cleanError(error) }));
            json(res, 500, { error: "internal_error" });
        }
    });
}

async function main(): Promise<void> {
    const config = loadConfig();
    const store = new PostgresJobStore(config);
    await store.migrate();
    const chain = new LiveChainGateway(config);
    const worker = new ProofWorker(store, chain, config);
    const server = createHttpServer(store, worker, config);
    const workerTimer = setInterval(() => void advanceWorker(worker), config.workerTickIntervalMs);
    void advanceWorker(worker);

    const shutdown = async (signal: string) => {
        console.log(JSON.stringify({ event: "shutdown", signal }));
        clearInterval(workerTimer);
        server.close(async () => {
            await store.close();
            process.exit(0);
        });
    };
    process.once("SIGTERM", () => void shutdown("SIGTERM"));
    process.once("SIGINT", () => void shutdown("SIGINT"));

    server.listen(config.port, "0.0.0.0", () => {
        console.log(JSON.stringify({ event: "listening", service: "verd-phase5-worker", port: config.port }));
    });
}

if (process.argv[1] && process.argv[1].endsWith("server.js")) {
    main().catch((error) => {
        console.error(JSON.stringify({ event: "startup_failed", error: cleanError(error) }));
        process.exitCode = 1;
    });
}
