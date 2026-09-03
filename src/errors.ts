export class RetryableWorkerError extends Error {
    readonly category: string;
    readonly evidenceId?: string;

    constructor(category: string, message: string, evidenceId?: string) {
        super(message);
        this.name = "RetryableWorkerError";
        this.category = category;
        this.evidenceId = evidenceId;
    }
}

export class TerminalWorkerError extends Error {
    readonly category: string;
    readonly evidenceId?: string;

    constructor(category: string, message: string, evidenceId?: string) {
        super(message);
        this.name = "TerminalWorkerError";
        this.category = category;
        this.evidenceId = evidenceId;
    }
}

export class BadRequestError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "BadRequestError";
    }
}
