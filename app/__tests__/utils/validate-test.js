import validate, {
    MAX_MEMO_LENGTH,
    isSafeHttpUrl,
    isValidAccountName,
    isValidAmount,
    isValidAssetSymbol,
    isValidMarketDescriptor,
    isValidMemo,
    isValidWithdrawalAddress,
    normalizeAddress,
    normalizeAmount,
    validateWithdrawal
} from "utils/validate";

describe("input validation", function() {
    describe("normalizeAmount", function() {
        it("parses plain and comma-grouped numbers", function() {
            expect(normalizeAmount("1.5")).toBe(1.5);
            expect(normalizeAmount("1,234.5")).toBe(1234.5);
            expect(normalizeAmount(1.5)).toBe(1.5);
        });

        it("forgives surrounding whitespace but not embedded whitespace", function() {
            expect(normalizeAmount(" 2 ")).toBe(2);
            expect(normalizeAmount("1 2")).toBe(null);
        });

        it("accepts leading-dot and trailing-dot forms", function() {
            expect(normalizeAmount(".5")).toBe(0.5);
            expect(normalizeAmount("5.")).toBe(5);
        });

        it("parses signed values so callers can report the right error", function() {
            expect(normalizeAmount("-1")).toBe(-1);
            expect(normalizeAmount("+1")).toBe(1);
        });

        it("rejects anything that used to reach the chain as NaN", function() {
            ["", ".", "abc", "1e5", "0x10", "1.2.3", "Infinity", "NaN", "--1", null, undefined]
                .forEach((value) => expect(normalizeAmount(value)).toBe(null));
        });

        it("rejects non-finite numbers", function() {
            expect(normalizeAmount(NaN)).toBe(null);
            expect(normalizeAmount(Infinity)).toBe(null);
            expect(normalizeAmount(-Infinity)).toBe(null);
        });
    });

    describe("isValidAmount", function() {
        it("requires a positive finite amount", function() {
            expect(isValidAmount("1.5")).toBe(true);
            expect(isValidAmount(0)).toBe(false);
            expect(isValidAmount(-1)).toBe(false);
            expect(isValidAmount(null)).toBe(false);
        });

        it("honours the asset precision", function() {
            expect(isValidAmount("1.5", 1)).toBe(true);
            expect(isValidAmount("1.5", 0)).toBe(false);
            expect(isValidAmount("1.5", 5)).toBe(true);
            expect(isValidAmount("1.123456", 5)).toBe(false);
        });

        it("handles comma-grouped input with a precision limit", function() {
            expect(isValidAmount("1,5", 1)).toBe(true);
            expect(isValidAmount("1,5", 0)).toBe(false);
        });
    });

    describe("isValidAccountName", function() {
        it("accepts well-formed names", function() {
            ["alice", "a1b", "a-b-c", "alice-bob", "abc"].forEach((name) => {
                expect(isValidAccountName(name)).toBe(true);
            });
        });

        it("enforces the 3-63 character bound", function() {
            expect(isValidAccountName("ab")).toBe(false);
            expect(isValidAccountName("a".repeat(63))).toBe(true);
            expect(isValidAccountName("a".repeat(64))).toBe(false);
        });

        it("rejects uppercase, underscores and leading digits", function() {
            ["Alice", "a_b", "1abc", "-abc"].forEach((name) => {
                expect(isValidAccountName(name)).toBe(false);
            });
        });

        it("rejects trailing and consecutive dashes", function() {
            expect(isValidAccountName("abc-")).toBe(false);
            expect(isValidAccountName("a--b")).toBe(false);
        });

        it("rejects non-strings", function() {
            expect(isValidAccountName(null)).toBe(false);
            expect(isValidAccountName(123)).toBe(false);
        });
    });

    describe("isValidAssetSymbol", function() {
        it("accepts chain symbols", function() {
            ["BTS", "BRIDGE.BTC", "1", "BTC"].forEach((s) => expect(isValidAssetSymbol(s)).toBe(true));
            expect(isValidAssetSymbol("A".repeat(12))).toBe(true);
        });

        it("rejects lowercase, underscores and over-long symbols", function() {
            ["bts", "B_TS", "A".repeat(13), ""].forEach((s) => expect(isValidAssetSymbol(s)).toBe(false));
        });
    });

    describe("withdrawal addresses", function() {
        const BTC = "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2";
        const ETH = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed";
        const BECH32 = "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq";

        it("accepts real-world address encodings", function() {
            [BTC, ETH, BECH32].forEach((a) => expect(isValidWithdrawalAddress(a)).toBe(true));
        });

        it("trims surrounding whitespace from a pasted address", function() {
            expect(normalizeAddress("  " + BTC + " ")).toBe(BTC);
        });

        it("rejects addresses that are too short to be real", function() {
            expect(isValidWithdrawalAddress("short")).toBe(false);
        });

        it("rejects embedded whitespace, tabs and newlines", function() {
            ["addr with space", "addr\twith\ttabs", "addr\nnewline", "-leading", "addr!bang"]
                .forEach((a) => expect(isValidWithdrawalAddress(a)).toBe(false));
        });

        it("rejects non-ASCII so a homoglyph cannot be pasted in", function() {
            // U+0430 CYRILLIC SMALL LETTER A - visually identical to ASCII "a".
            expect(isValidWithdrawalAddress("Ð°ddr1234567")).toBe(false);
        });

        it("rejects zero-width characters used to disguise an address", function() {
            // U+200B ZERO WIDTH SPACE.
            expect(isValidWithdrawalAddress("1BvBMSEY" + "" + "stWetqTFn5Au4m4GFg7xJaNVN2")).toBe(false);
        });

        it("enforces the length ceiling", function() {
            expect(isValidWithdrawalAddress("a".repeat(201))).toBe(false);
            expect(isValidWithdrawalAddress("a" + "b".repeat(199))).toBe(true);
        });

        it("rejects non-strings", function() {
            expect(isValidWithdrawalAddress(null)).toBe(false);
            expect(isValidWithdrawalAddress(undefined)).toBe(false);
            expect(isValidWithdrawalAddress(42)).toBe(false);
        });
    });

    describe("isValidMemo", function() {
        it("treats an absent memo as valid", function() {
            expect(isValidMemo(undefined)).toBe(true);
            expect(isValidMemo(null)).toBe(true);
        });

        it("accepts ordinary memo text including non-ASCII", function() {
            expect(isValidMemo("via exchange")).toBe(true);
            expect(isValidMemo("café")).toBe(true);
        });

        it("rejects control characters, which enable protocol injection", function() {
            expect(isValidMemo("a\nb")).toBe(false);
            expect(isValidMemo("a\u0000b")).toBe(false);
            expect(isValidMemo("a\rb")).toBe(false);
        });

        it("enforces the length ceiling", function() {
            expect(isValidMemo("x".repeat(MAX_MEMO_LENGTH))).toBe(true);
            expect(isValidMemo("x".repeat(MAX_MEMO_LENGTH + 1))).toBe(false);
        });

        it("rejects non-strings", function() {
            expect(isValidMemo(42)).toBe(false);
        });
    });

    describe("isSafeHttpUrl", function() {
        it("accepts http and https endpoints", function() {
            expect(isSafeHttpUrl("https://api.example.com/v1")).toBe(true);
            expect(isSafeHttpUrl("http://localhost:8090")).toBe(true);
        });

        it("rejects every other scheme and malformed input", function() {
            [
                "wss://example.com/ws", "ws://127.0.0.1:8090", "javascript:alert(1)",
                "file:///etc/passwd", "https://", "", null
            ].forEach((url) => expect(isSafeHttpUrl(url)).toBe(false));
        });
    });

    describe("isValidMarketDescriptor", function() {
        it("accepts well-formed remote market entries", function() {
            expect(isValidMarketDescriptor({base: "BRIDGE.BTC", quote: "BTS"})).toBe(true);
            expect(isValidMarketDescriptor({base: "BTS", quote: "BTS", img: "btc.png"})).toBe(true);
            expect(isValidMarketDescriptor({base: "BTS", quote: "BTS", blacklisted: true})).toBe(true);
            expect(isValidMarketDescriptor({base: "BTS", quote: "BTS", id: 5})).toBe(true);
        });

        it("rejects path traversal in a symbol field", function() {
            expect(isValidMarketDescriptor({base: "../../etc", quote: "BTS"})).toBe(false);
        });

        it("rejects a missing or non-string side", function() {
            expect(isValidMarketDescriptor({base: "BTS"})).toBe(false);
            expect(isValidMarketDescriptor({base: "BTS", quote: 5})).toBe(false);
        });

        it("rejects a non-string image reference", function() {
            expect(isValidMarketDescriptor({base: "BTS", quote: "BTS", img: {}})).toBe(false);
        });

        it("rejects non-objects", function() {
            [null, undefined, "BTS", 5].forEach((m) => expect(isValidMarketDescriptor(m)).toBe(false));
        });
    });

    describe("validateWithdrawal", function() {
        const BTC = "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2";

        it("rejects an untouched form without throwing", function() {
            const result = validateWithdrawal({});
            expect(result.valid).toBe(false);
            expect(result.amount).toBe(null);
            expect(result.address).toBe(null);
            expect(result.errors.amount).toBeDefined();
            expect(result.errors.address).toBeDefined();
        });

        it("tolerates being called with no argument at all", function() {
            expect(validateWithdrawal().valid).toBe(false);
        });

        it("accepts and normalises a good submission", function() {
            const result = validateWithdrawal({amount: "1.5", address: "  " + BTC + "  ", precision: 5});
            expect(result.valid).toBe(true);
            expect(result.errors).toEqual({});
            expect(result.amount).toBe(1.5);
            expect(result.address).toBe(BTC);
        });

        it("distinguishes a negative amount from an unparseable one", function() {
            expect(validateWithdrawal({amount: "-1", address: BTC}).errors.amount)
                .toBe("modal.withdraw.error_amount_positive");
            expect(validateWithdrawal({amount: "abc", address: BTC}).errors.amount)
                .toBe("modal.withdraw.error_amount_invalid");
        });

        it("flags an amount with more precision than the asset supports", function() {
            expect(validateWithdrawal({amount: "1.123456", address: BTC, precision: 5}).errors.amount)
                .toBe("modal.withdraw.error_amount_precision");
        });

        it("flags an invalid address", function() {
            expect(validateWithdrawal({amount: "1", address: "not an address"}).errors.address)
                .toBe("modal.withdraw.error_address_invalid");
        });

        it("flags an invalid memo", function() {
            expect(validateWithdrawal({amount: "1", address: BTC, memo: "a\nb"}).errors.memo)
                .toBe("modal.withdraw.error_memo_invalid");
        });

        it("reports every problem at once", function() {
            const result = validateWithdrawal({amount: "x", address: "?", memo: "a\tb"});
            expect(Object.keys(result.errors).sort()).toEqual(["address", "amount", "memo"]);
        });
    });

    it("exposes a default export with the same surface", function() {
        expect(typeof validate.isValidWithdrawalAddress).toBe("function");
        expect(validate.validateWithdrawal).toBe(validateWithdrawal);
    });
});
