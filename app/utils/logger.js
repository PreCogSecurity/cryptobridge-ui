/**
 * Minimal, dependency-free structured logger.
 *
 * Why this exists: the application previously reported operational and
 * security-relevant failures through bare `console.error(...)` calls. Those
 * produce no level, no timestamp, no scope, and -- worse -- no redaction, so a
 * stray object that happens to contain a wallet key or an account password is
 * printed verbatim into the developer console of a wallet that stores private
 * keys in the page.
 *
 * This module keeps the same call sites (`logger.error("...", data)`) but adds:
 *   - named levels that can be filtered at runtime,
 *   - a scope/child logger so every line can be attributed to a module,
 *   - recursive redaction of credential-shaped values,
 *   - a replaceable sink so tests (and future Sentry/Rollbar wiring) can capture
 *     output without monkey-patching the global console.
 *
 * It intentionally has no dependencies: it must stay usable from the webpack
 * bundle, from the Electron main/renderer process, and from the Express dev
 * server.
 */

const LEVELS = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
    silent: 100
};

const LEVEL_NAMES = Object.keys(LEVELS);
const DEFAULT_LEVEL = "info";

// Credential-shaped key names. camelCase is normalised to snake_case first so
// `privateKey` and `private_key` are treated identically, and the surrounding
// boundaries are non-alphanumeric so ordinary identifiers such as "keyboard",
// "tokenizer" or "seedless" are not accidentally redacted.
const SECRET_KEY_PATTERN = new RegExp(
    "(^|[^a-z0-9])(pass(word|wd)?|secret|token|api[-_]?key|private[-_]?key|" +
    "private|wif|seed|mnemonic|pin|credential)([^a-z0-9]|$)"
);

const REDACTION = "[redacted]";

/** True when an object key names a value that must never be logged. */
export function isSecretKey(key) {
    return SECRET_KEY_PATTERN.test(
        String(key).replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase()
    );
}

const MAX_DEPTH = 6;
const MAX_ARRAY_ITEMS = 100;
const MAX_STRING_LENGTH = 2048;

/**
 * Recursively strip credential-shaped values and bound the output size so a
 * cyclic or enormous object can never lock up the renderer.
 */
export function redact(value, depth) {
    const level = depth || 0;

    if (level > MAX_DEPTH) return "[max depth]";

    if (value === null || value === undefined) return value;

    const type = typeof value;
    if (type === "string") {
        return value.length > MAX_STRING_LENGTH
            ? value.slice(0, MAX_STRING_LENGTH) + "...[truncated]"
            : value;
    }
    if (type === "number" || type === "boolean") return value;
    if (type === "function") return "[function]";
    if (type !== "object") return String(value);

    if (value instanceof Error) {
        return {name: value.name, message: value.message, stack: value.stack};
    }

    if (Array.isArray(value)) {
        const items = value.slice(0, MAX_ARRAY_ITEMS).map((item) => redact(item, level + 1));
        if (value.length > MAX_ARRAY_ITEMS) items.push("...[" + (value.length - MAX_ARRAY_ITEMS) + " more]");
        return items;
    }

    const out = {};
    Object.keys(value).forEach((key) => {
        out[key] = isSecretKey(key) ? REDACTION : redact(value[key], level + 1);
    });
    return out;
}

function defaultSink(record) {
    /* eslint-disable no-console */
    const method = record.level === "debug" ? "log" : record.level;
    if (typeof console !== "undefined" && typeof console[method] === "function") {
        console[method](formatRecord(record));
    }
    /* eslint-enable no-console */
}

/** Render a record as a single line: `[timestamp] LEVEL scope message {json}`. */
export function formatRecord(record) {
    const parts = [];
    if (record.timestamp) parts.push(record.timestamp);
    parts.push(record.level.toUpperCase());
    if (record.scope) parts.push("[" + record.scope + "]");
    parts.push(record.message);
    if (record.data !== undefined) {
        try {
            parts.push(JSON.stringify(record.data));
        } catch (e) {
            // Circular structures are already bounded by redact(), but a getter
            // that throws would otherwise turn logging into a second failure.
            parts.push("[unserializable data]");
        }
    }
    return parts.join(" ");
}

export class Logger {
    constructor(options) {
        const opts = options || {};
        this.scope = opts.scope || null;
        this.sink = typeof opts.sink === "function" ? opts.sink : defaultSink;
        this.now = typeof opts.now === "function" ? opts.now : () => new Date().toISOString();
        this.useTimestamp = opts.timestamp !== false;
        this.setLevel(opts.level);
    }

    setLevel(level) {
        this.level = Object.prototype.hasOwnProperty.call(LEVELS, level) ? level : DEFAULT_LEVEL;
        return this;
    }

    setSink(sink) {
        this.sink = typeof sink === "function" ? sink : defaultSink;
        return this;
    }

    /** Derive a logger that tags every record with an additional scope. */
    child(scope) {
        const childScope = this.scope ? this.scope + ":" + scope : scope;
        return new Logger({
            scope: childScope,
            sink: this.sink,
            now: this.now,
            timestamp: this.useTimestamp,
            level: this.level
        });
    }

    isLevelEnabled(level) {
        return LEVELS[level] >= LEVELS[this.level];
    }

    _log(level, message, data) {
        if (!this.isLevelEnabled(level)) return;

        const record = {
            level: level,
            scope: this.scope,
            message: typeof message === "string" ? message : String(message),
            timestamp: this.useTimestamp ? this.now() : null
        };

        if (arguments.length > 2) record.data = redact(data);

        try {
            this.sink(record);
        } catch (e) {
            // A failing sink must never take down the caller.
        }
    }
}

LEVEL_NAMES.forEach((name) => {
    if (name === "silent") return;
    Logger.prototype[name] = function(message, data) {
        // Forward the arity so `_log` can tell "no data" apart from
        // "explicitly undefined" -- always passing three arguments would make
        // `logger.info("hi")` emit a `data: undefined` key.
        if (arguments.length > 1) {
            this._log(name, message, data);
        } else {
            this._log(name, message);
        }
    };
});

const logger = new Logger({scope: "app"});

export default logger;
