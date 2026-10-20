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

        // `extends Error` is broken under babel 6: `super(...)` calls
        // `Error.call(this)`, which returns a *fresh* Error object, and babel's
        // `_possibleConstructorReturn` then swaps `this` for it. The result is
        // that `this` is a plain Error with `Error.prototype`, so `instanceof`
        // against the subclass fails and `this.constructor.name` is "Error".
        //
        // `new.target` would be the textbook fix, but babel 6's es2015 preset
        // does not transform it and leaves it `undefined` at runtime. So each
        // class restores its own prototype explicitly via `_restorePrototype`,
        // which also repairs `name` from the now-correct constructor.
        _restorePrototype(this, AppError);

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

/**
 * Point an instance at the prototype of the class actually being constructed
 * and refresh `name` from it. See the note in `AppError` for why this cannot be
 * done with `new.target` on this toolchain.
 */
function _restorePrototype(instance, klass) {
    Object.setPrototypeOf(instance, klass.prototype);
    instance.name = klass.name;
}

export class ValidationError extends AppError {
    constructor(message, options) {
        super(ERROR_CODES.VALIDATION, message, options);
        _restorePrototype(this, ValidationError);
    }
}

export class NetworkError extends AppError {
    constructor(message, options) {
        super(ERROR_CODES.NETWORK, message, Object.assign({retryable: true}, options));
        _restorePrototype(this, NetworkError);
    }
}

export class ConversionError extends AppError {
    constructor(message, options) {
        super(ERROR_CODES.CONVERSION, message, options);
        _restorePrototype(this, ConversionError);
    }
}

export class WithdrawalError extends AppError {
    constructor(message, options) {
        super(ERROR_CODES.WITHDRAWAL, message, options);
        _restorePrototype(this, WithdrawalError);
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
