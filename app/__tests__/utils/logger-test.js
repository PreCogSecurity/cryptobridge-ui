import loggerDefault, {Logger, formatRecord, redact} from "utils/logger";

function capture(options) {
    const records = [];
    const logger = new Logger(Object.assign({
        sink: (record) => records.push(record),
        timestamp: false
    }, options));
    return {logger, records};
}

describe("logger", function() {
    describe("levels", function() {
        it("suppresses records below the configured level", function() {
            const {logger, records} = capture({level: "warn"});

            logger.debug("d");
            logger.info("i");
            logger.warn("w");
            logger.error("e");

            expect(records.map((r) => r.level)).toEqual(["warn", "error"]);
        });

        it("emits every level when set to debug", function() {
            const {logger, records} = capture({level: "debug"});

            logger.debug("d");
            logger.info("i");
            logger.warn("w");
            logger.error("e");

            expect(records.length).toBe(4);
        });

        it("emits nothing at all when silenced", function() {
            const {logger, records} = capture({level: "silent"});
            logger.error("boom");
            expect(records.length).toBe(0);
        });

        it("falls back to info for an unknown level instead of throwing", function() {
            const {logger, records} = capture({level: "not-a-level"});
            logger.info("i");
            logger.debug("d");
            expect(records.length).toBe(1);
        });
    });

    describe("record shape", function() {
        it("keeps the message verbatim", function() {
            const {logger, records} = capture();
            logger.error("Unable to construct calls array");
            expect(records[0].message).toBe("Unable to construct calls array");
        });

        it("coerces a non-string message rather than dropping the record", function() {
            const {logger, records} = capture();
            logger.error(new Error("boom"));
            expect(records[0].message).toBe("Error: boom");
        });

        it("omits the data key entirely when no data argument is passed", function() {
            const {logger, records} = capture();
            logger.info("no data");
            expect("data" in records[0]).toBe(false);
        });

        it("attaches data when an argument is passed, including undefined", function() {
            const {logger, records} = capture();
            logger.info("explicit undefined", undefined);
            expect("data" in records[0]).toBe(true);
        });

        it("stamps an ISO timestamp by default and omits it on request", function() {
            const stamped = capture({timestamp: true});
            stamped.logger.info("x");
            expect(stamped.records[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);

            const unstamped = capture({timestamp: false});
            unstamped.logger.info("x");
            expect(unstamped.records[0].timestamp).toBe(null);
        });
    });

    describe("scopes", function() {
        it("tags records with the logger scope", function() {
            const {logger, records} = capture({scope: "MarketsStore"});
            logger.warn("slow feed");
            expect(records[0].scope).toBe("MarketsStore");
        });

        it("nests scopes in child loggers", function() {
            const {logger, records} = capture({scope: "stores"});
            logger.child("Markets").child("feed").error("nope");
            expect(records[0].scope).toBe("stores:Markets:feed");
        });

        it("lets a child change the level without mutating its parent", function() {
            const {logger, records} = capture({level: "error"});
            const child = logger.child("verbose").setLevel("debug");
            child.debug("chatty");
            expect(records.length).toBe(1);
            expect(logger.isLevelEnabled("debug")).toBe(false);
        });

        it("has no scope when none is configured", function() {
            const {logger, records} = capture();
            logger.info("x");
            expect(records[0].scope).toBe(null);
        });
    });

    describe("redaction", function() {
        it("redacts credential-shaped keys at the top level", function() {
            expect(redact({password: "hunter2"})).toEqual({password: "[redacted]"});
        });

        it("redacts nested credential-shaped keys", function() {
            const out = redact({wallet: {private_key: "5J...", nested: {wif: "5K..."}}});
            expect(out.wallet.private_key).toBe("[redacted]");
            expect(out.wallet.nested.wif).toBe("[redacted]");
        });

        it("covers the common wallet/vault key names", function() {
            const out = redact({
                password: "a", passwd: "b", secret: "c", token: "d",
                apiKey: "e", api_key: "f", privateKey: "g", private_key: "h",
                wif: "i", seed: "j", mnemonic: "k", pin: "l"
            });
            Object.keys(out).forEach((key) => expect(out[key]).toBe("[redacted]"));
        });

        it("does not redact unrelated identifiers that merely contain a match", function() {
            const out = redact({keyboard: "Enter", tokenizer: "t", seedless: "s", pinned: true});
            expect(out.keyboard).toBe("Enter");
            expect(out.tokenizer).toBe("t");
            expect(out.seedless).toBe("s");
            expect(out.pinned).toBe(true);
        });

        it("preserves primitive types exactly", function() {
            expect(redact({n: 0, s: "", b: false, nil: null})).toEqual({n: 0, s: "", b: false, nil: null});
        });

        it("converts Errors into a plain, serialisable shape", function() {
            const out = redact({err: new TypeError("bad")});
            expect(out.err.name).toBe("TypeError");
            expect(out.err.message).toBe("bad");
            expect(typeof out.err.stack).toBe("string");
        });

        it("walks arrays", function() {
            expect(redact([{password: "p"}, 2])).toEqual([{password: "[redacted]"}, 2]);
        });

        it("truncates very long strings", function() {
            const out = redact("x".repeat(5000));
            expect(out.length).toBeLessThan(5000);
            expect(out).toMatch(/\.\.\.\[truncated\]$/);
        });

        it("bounds recursion depth so a cyclic-ish object cannot hang the renderer", function() {
            let deep = {leaf: true};
            for (let i = 0; i < 40; i++) deep = {next: deep};
            expect(() => redact(deep)).not.toThrow();
        });

        it("bounds array length", function() {
            expect(redact(new Array(500).fill(1)).length).toBeLessThanOrEqual(101);
        });

        it("does not mutate the input object", function() {
            const input = {password: "hunter2", keep: 1};
            redact(input);
            expect(input.password).toBe("hunter2");
        });
    });

    describe("formatRecord", function() {
        it("renders level, scope, message and data on one line", function() {
            const line = formatRecord({
                level: "error", scope: "stores", message: "boom", timestamp: null, data: {a: 1}
            });
            expect(line).toBe("ERROR [stores] boom {\"a\":1}");
        });

        it("renders without a scope", function() {
            expect(formatRecord({level: "info", scope: null, message: "hi", timestamp: null}))
                .toBe("INFO hi");
        });

        it("includes the timestamp when present", function() {
            expect(formatRecord({level: "warn", scope: null, message: "w", timestamp: "2020-01-01T00:00:00.000Z"}))
                .toBe("2020-01-01T00:00:00.000Z WARN w");
        });

        it("never throws on unserialisable data", function() {
            const cyclic = {level: "info", message: "m", timestamp: null};
            cyclic.data = cyclic;
            expect(() => formatRecord(cyclic)).not.toThrow();
        });
    });

    describe("sink isolation", function() {
        it("swallows sink failures so logging cannot break the caller", function() {
            const logger = new Logger({
                timestamp: false,
                sink: () => {
                    throw new Error("sink is down");
                }
            });
            expect(() => logger.error("still fine")).not.toThrow();
        });

        it("restores the default sink via setSink(null)", function() {
            const {logger} = capture();
            logger.setSink(null);
            expect(typeof logger.sink).toBe("function");
        });
    });

    it("exports a ready-to-use singleton logger", function() {
        expect(loggerDefault).toBeInstanceOf(Logger);
        expect(typeof loggerDefault.child).toBe("function");
        expect(loggerDefault.scope).toBe("app");
    });
});
