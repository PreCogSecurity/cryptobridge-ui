import AppError, {
    ConversionError,
    ERROR_CODES,
    NetworkError,
    ValidationError,
    WithdrawalError,
    isAppError,
    toAppError
} from "utils/errors";

describe("typed errors", function() {
    describe("hierarchy", function() {
        it("subclasses are AppError and Error", function() {
            const error = new ConversionError("rejected by gateway");
            expect(error instanceof AppError).toBe(true);
            expect(error instanceof Error).toBe(true);
        });

        it("every subclass carries its own name", function() {
            expect(new ValidationError("a").name).toBe("ValidationError");
            expect(new NetworkError("a").name).toBe("NetworkError");
            expect(new ConversionError("a").name).toBe("ConversionError");
            expect(new WithdrawalError("a").name).toBe("WithdrawalError");
            expect(new AppError("X", "a").name).toBe("AppError");
        });

        it("every subclass carries its own stable code", function() {
            expect(new ValidationError("a").code).toBe(ERROR_CODES.VALIDATION);
            expect(new NetworkError("a").code).toBe(ERROR_CODES.NETWORK);
            expect(new ConversionError("a").code).toBe(ERROR_CODES.CONVERSION);
            expect(new WithdrawalError("a").code).toBe(ERROR_CODES.WITHDRAWAL);
        });

        it("falls back to UNKNOWN when no code is supplied", function() {
            expect(new AppError(undefined, "boom").code).toBe(ERROR_CODES.UNKNOWN);
        });

        it("keeps the message for logs", function() {
            expect(new ConversionError("gateway returned 502").message).toBe("gateway returned 502");
        });
    });

    describe("user-facing safety", function() {
        it("provides a generic userMessage by default", function() {
            expect(new ConversionError("internal detail /api/v1/wif").userMessage)
                .toBe("An unexpected error occurred.");
        });

        it("accepts an explicit userMessage", function() {
            expect(new ValidationError("raw", {userMessage: "Enter a valid amount."}).userMessage)
                .toBe("Enter a valid amount.");
        });

        it("carries optional details for telemetry", function() {
            expect(new ConversionError("x", {details: {status: 502}}).details).toEqual({status: 502});
            expect(new ConversionError("x").details).toBe(null);
        });
    });

    describe("retryability", function() {
        it("marks network failures as retryable by default", function() {
            expect(new NetworkError("timeout").retryable).toBe(true);
        });

        it("does not mark other failures as retryable", function() {
            expect(new ValidationError("bad input").retryable).toBe(false);
            expect(new ConversionError("rejected").retryable).toBe(false);
        });

        it("allows an explicit override", function() {
            expect(new NetworkError("flaky", {retryable: false}).retryable).toBe(false);
        });
    });

    describe("serialisation", function() {
        it("exposes a stable, stack-free shape", function() {
            const json = new ConversionError("boom", {details: {a: 1}}).toJSON();
            expect(Object.keys(json).sort())
                .toEqual(["code", "details", "message", "name", "retryable", "userMessage"]);
            expect(json.stack).toBeUndefined();
        });

        it("round-trips through JSON.stringify", function() {
            expect(JSON.parse(JSON.stringify(new ValidationError("x"))).code)
                .toBe(ERROR_CODES.VALIDATION);
        });
    });

    describe("isAppError", function() {
        it("accepts real AppError instances", function() {
            expect(isAppError(new ValidationError("x"))).toBe(true);
        });

        it("accepts structurally compatible cross-realm objects", function() {
            expect(isAppError({code: "X", userMessage: "y"})).toBe(true);
        });

        it("rejects strings, Errors, null and plain objects", function() {
            expect(isAppError("nope")).toBe(false);
            expect(isAppError(new Error("plain"))).toBe(false);
            expect(isAppError(null)).toBe(false);
            expect(isAppError(undefined)).toBe(false);
            expect(isAppError({code: "X"})).toBe(false);
        });
    });

    describe("toAppError", function() {
        it("passes an AppError through untouched", function() {
            const original = new ConversionError("boom");
            expect(toAppError(original)).toBe(original);
        });

        it("wraps a plain Error and keeps its message", function() {
            const wrapped = toAppError(new RangeError("out of range"));
            expect(wrapped).toBeInstanceOf(AppError);
            expect(wrapped.message).toBe("out of range");
            expect(wrapped.code).toBe(ERROR_CODES.UNKNOWN);
            expect(wrapped.userMessage).toBe("An unexpected error occurred.");
        });

        it("wraps a rejected string", function() {
            expect(toAppError("boom").message).toBe("boom");
        });

        it("never throws on undefined or null", function() {
            expect(toAppError(undefined).message).toBe("Unknown error");
            expect(toAppError(null).message).toBe("Unknown error");
        });

        it("does not leak unserialisable rejection values into details", function() {
            expect(toAppError({some: "object"}).details).toEqual({value: "[unserializable]"});
            expect(toAppError(undefined).details).toEqual({value: undefined});
        });

        it("honours a fallback code", function() {
            expect(toAppError(new Error("nope"), ERROR_CODES.NETWORK).code).toBe(ERROR_CODES.NETWORK);
        });
    });
});
