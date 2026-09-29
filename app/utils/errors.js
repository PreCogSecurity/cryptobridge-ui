/**
 * Typed application errors.
 *
 * Promise chains in this codebase previously rejected with bare strings or
 * swallowed failures in anonymous `catch (err) {}` blocks, so a failed
 * blocktrades conversion was indistinguishable from a dropped WebSocket. That
 * makes incident triage impossible and lets generic UI error text leak internal
 * endpoint details to the user.
 *
 * `AppError` gives every failure a stable machine-readable `code`, a `details`
 * bag that is safe to log, and a `userMessage` that is safe to display. The
 * distinction matters: `message` is for logs (may contain technical detail),
 * `userMessage` must never contain a private key, URL with credentials, or an
 * internal stack trace.
 */

export const ERROR_CODES = {
    VALIDATION: "VALIDATION",
    NETWORK: "NETWORK",
    CONVERSION: "CONVERSION",
    WITHDRAWAL: "WITHDRAWAL",
    UNKNOWN: "UNKNOWN"
};

export class AppError extends Error {
    constructor(code, message, options) {
        const opts = options || {};
        super(message || code);

        // `extends Error` loses the prototype when the file is down-compiled to
        // ES5 by babel, so restore it explicitly for `instanceof` to work.
        Object.setPrototypeOf(this, new.target.prototype);

        this.name = this.constructor.name;
        this.code = code || ERROR_CODES.UNKNOWN;
        this.userMessage = opts.userMessage || "An unexpected error occurred.";
        this.details = opts.details || null;
        this.cause = opts.cause || null;
        this.retryable = opts.retryable === true;

        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
    }

    toJSON() {
        return {
            name: this.name,
            code: this.code,
            message: this.message,
            userMessage: this.userMessage,
            details: this.details,
            retryable: this.retryable
        };
    }
}

export class ValidationError extends AppError {
    constructor(message, options) {
        super(ERROR_CODES.VALIDATION, message, options);
    }
}

export class NetworkError extends AppError {
    constructor(message, options) {
        super(ERROR_CODES.NETWORK, message, Object.assign({retryable: true}, options));
    }
}

export class ConversionError extends AppError {
    constructor(message, options) {
        super(ERROR_CODES.CONVERSION, message, options);
    }
}

export class WithdrawalError extends AppError {
    constructor(message, options) {
        super(ERROR_CODES.WITHDRAWAL, message, options);
    }
}

export function isAppError(value) {
    return value instanceof AppError ||
        (!!value && typeof value === "object" && typeof value.code === "string" &&
            typeof value.userMessage === "string");
}

/**
 * Normalise anything thrown by a promise chain into an `AppError` so callers
 * always have `.code` and `.userMessage` available. Never throws.
 */
export function toAppError(value, fallbackCode) {
    if (isAppError(value)) return value;

    if (value instanceof Error) {
        return new AppError(
            fallbackCode || ERROR_CODES.UNKNOWN,
            value.message || String(value),
            {cause: value, userMessage: "An unexpected error occurred."}
        );
    }

    if (typeof value === "string" && value.length) {
        return new AppError(fallbackCode || ERROR_CODES.UNKNOWN, value);
    }

    return new AppError(fallbackCode || ERROR_CODES.UNKNOWN, "Unknown error", {
        details: {value: safeDetail(value)}
    });
}

function safeDetail(value) {
    const type = typeof value;
    if (value === null || type === "undefined" || type === "number" || type === "boolean") {
        return value;
    }
    return "[unserializable]";
}

export default AppError;
