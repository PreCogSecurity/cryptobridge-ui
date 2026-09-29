/**
 * Dependency-free, allowlist-based HTML sanitizer.
 *
 * WHY THIS EXISTS
 * ---------------
 * `app/components/Dashboard/Dashboard.jsx` fetches `https://crypto-bridge.org/news.json`
 * and injected `news.content` straight into the DOM with
 * `dangerouslySetInnerHTML`. That turns the news host (or anything able to spoof
 * it) into arbitrary JavaScript execution *inside the wallet origin*, where the
 * user's encrypted wallet, active accounts and signing helpers live. In the
 * Electron build the same origin has `require('electron')` available, so it is
 * remote code execution on the user's desktop, not merely UI redressing.
 *
 * We cannot add a sanitizer dependency (this tree is pinned to a 2017 lockfile),
 * so this module implements a conservative subset: parse tags, keep only an
 * allowlist of formatting elements, keep only an allowlist of attributes, and
 * validate every URL after HTML-entity decoding so `&#106;avascript:` style
 * bypasses are rejected.
 *
 * It is deliberately lossy -- unknown elements are unwrapped (their text is
 * kept), everything dangerous is dropped wholesale.
 */

const MAX_INPUT_LENGTH = 100000;

/** Elements whose *contents* must be dropped along with the tag. */
const DROP_WITH_CONTENT = [
    "script", "style", "iframe", "object", "embed", "applet", "template",
    "noscript", "svg", "math", "form", "frame", "frameset", "link", "meta",
    "base", "title", "textarea", "select", "button"
];

const DROP_WITH_CONTENT_PATTERN = new RegExp(
    "<\\s*(?:" + DROP_WITH_CONTENT.join("|") + ")\\b[^>]*>[\\s\\S]*?" +
    "<\\s*\\/\\s*(?:" + DROP_WITH_CONTENT.join("|") + ")\\s*>",
    "gi"
);

/** Unterminated variants of the tags above (no closing tag present). */
const DROP_UNTERMINATED_PATTERN = new RegExp(
    "<\\s*(?:" + DROP_WITH_CONTENT.join("|") + ")\\b[^>]*>[\\s\\S]*$",
    "gi"
);

/** Formatting elements we are willing to keep. */
const ALLOWED_TAGS = {
    a: ["href", "title", "target", "rel"],
    b: [],
    blockquote: [],
    br: [],
    code: [],
    del: [],
    em: [],
    h1: [], h2: [], h3: [], h4: [], h5: [], h6: [],
    hr: [],
    i: [],
    li: [],
    ol: [],
    p: [],
    pre: [],
    s: [],
    small: [],
    span: [],
    strong: [],
    sub: [],
    sup: [],
    u: [],
    ul: []
};

/** Elements that never have a closing tag. */
const VOID_TAGS = {br: true, hr: true};

const ALLOWED_URL_SCHEMES = ["http:", "https:", "mailto:"];

const NAMED_ENTITIES = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    colon: ":",
    tab: "\t",
    newline: "\n",
    sol: "/"
};

/**
 * Decode the entity forms an attacker can use to hide a scheme (e.g.
 * `&#106;avascript:`, `java&Tab;script:`, `javascript&colon;alert(1)`).
 * Anything unrecognised is left untouched.
 */
export function decodeEntities(value) {
    return String(value).replace(/&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);?/g, (match, body) => {
        if (body.charAt(0) === "#") {
            const isHex = body.charAt(1) === "x" || body.charAt(1) === "X";
            const code = parseInt(isHex ? body.slice(2) : body.slice(1), isHex ? 16 : 10);
            if (!isFinite(code) || code < 0 || code > 0x10ffff) return match;
            try {
                return String.fromCodePoint(code);
            } catch (e) {
                return match;
            }
        }
        const named = NAMED_ENTITIES[body.toLowerCase()];
        return named === undefined ? match : named;
    });
}

/** Re-escape a value for safe interpolation into a double-quoted attribute. */
export function escapeAttribute(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

export function escapeText(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}


/**
 * Return true when `raw` is a URL we are willing to place in an `href`.
 * Relative URLs are allowed; absolute URLs must use an allowlisted scheme.
 */
export function isSafeUrl(raw) {
    if (typeof raw !== "string") return false;

    // Strip characters browsers ignore when resolving a scheme, so
    // "java\tscript:alert(1)" and "  javascript:alert(1)" cannot slip through.
    const cleaned = decodeEntities(raw).replace(/[\u0000-\u0020\u007f]+/g, "");

    const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(cleaned);
    if (!schemeMatch) {
        // No scheme at all. A relative URL cannot introduce an executable
        // scheme, so it is safe regardless of what else it contains.
        return true;
    }
    return ALLOWED_URL_SCHEMES.indexOf(schemeMatch[1].toLowerCase() + ":") !== -1;
}

const TAG_PATTERN = /<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
const ATTRIBUTE_PATTERN = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`=<>]+)))?/g;

/**
 * Sanitize a fragment of remote HTML.
 *
 * @param {string} html untrusted markup
 * @param {object} [options]
 * @param {number} [options.maxLength] hard cap on the returned string
 * @returns {string} markup containing only allowlisted elements/attributes
 */
export function sanitizeHtml(html, options) {
    const opts = options || {};
    const maxLength = typeof opts.maxLength === "number" ? opts.maxLength : MAX_INPUT_LENGTH;

    if (typeof html !== "string" || html.length === 0) return "";

    let working = html.slice(0, Math.min(html.length, maxLength));

    // 1. Comments, CDATA and doctypes/PIs.
    working = working
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "")
        .replace(/<![^>]*>/g, "");

    // 2. Dangerous elements, contents included.
    working = working
        .replace(DROP_WITH_CONTENT_PATTERN, "")
        .replace(DROP_UNTERMINATED_PATTERN, "");

    // 3. Rebuild from the allowlist, tracking open elements so unclosed tags
    //    cannot escape their container and stray closers are discarded.
    const open = [];
    let out = "";
    let lastIndex = 0;
    let match;

    TAG_PATTERN.lastIndex = 0;
    while ((match = TAG_PATTERN.exec(working)) !== null) {
        if (out.length >= maxLength) break; // hard cap: stop doing work
        out += working.slice(lastIndex, match.index);
        lastIndex = TAG_PATTERN.lastIndex;

        const isClosing = match[1] === "/";
        const tag = match[2].toLowerCase();
        const allowedAttrs = ALLOWED_TAGS[tag];

        if (!Object.prototype.hasOwnProperty.call(ALLOWED_TAGS, tag)) {
            // Unknown/dangerous element: unwrap (keep the text it contained).
            continue;
        }

        if (isClosing) {
            if (VOID_TAGS[tag]) continue;
            const index = open.lastIndexOf(tag);
            if (index === -1) continue; // stray closer
            // Implicitly close anything left open inside it.
            while (open.length > index) out += "</" + open.pop() + ">";
            continue;
        }

        let attrs = "";
        const relTokens = [];
        let hasTarget = false;
        if (allowedAttrs.length) {
            const rawAttrs = match[3] || "";
            ATTRIBUTE_PATTERN.lastIndex = 0;
            let attrMatch;
            while ((attrMatch = ATTRIBUTE_PATTERN.exec(rawAttrs)) !== null) {
                const name = attrMatch[1].toLowerCase();
                if (allowedAttrs.indexOf(name) === -1) continue;
                const value = attrMatch[2] !== undefined ? attrMatch[2]
                    : attrMatch[3] !== undefined ? attrMatch[3]
                        : attrMatch[4] !== undefined ? attrMatch[4] : "";
                if (name === "href" && !isSafeUrl(value)) continue;
                if (name === "target") {
                    const lowered = value.toLowerCase();
                    // Only `_blank` and `_self` are meaningful here; anything
                    // else is dropped rather than silently normalised.
                    if (lowered !== "_blank" && lowered !== "_self") continue;
                    hasTarget = true;
                }
                if (name === "rel") {
                    relTokens.push.apply(relTokens, value.split(/\s+/).filter(Boolean));
                    continue;
                }
                attrs += " " + name + '="' + escapeAttribute(value) + '"';
            }
        }
        if (tag === "a") {
            // Preserve the author's rel tokens but always harden the link: a
            // sanitised page must never be able to hand a new browsing context
            // a live `window.opener` reference.
            const tokens = relTokens.slice();
            if (hasTarget) {
                ["noopener", "noreferrer"].forEach((t) => {
                    if (tokens.indexOf(t) === -1) tokens.push(t);
                });
            }
            if (tokens.length) {
                attrs += ' rel="' + escapeAttribute(tokens.join(" ")) + '"';
            }
        }

        if (VOID_TAGS[tag]) {
            out += "<" + tag + attrs + ">";
            continue;
        }

        out += "<" + tag + attrs + ">";
        open.push(tag);
    }

    out += working.slice(lastIndex);
    while (open.length) out += "</" + open.pop() + ">";

    return out.length > maxLength ? out.slice(0, maxLength) : out;
}

/**
 * Fetch-and-validate helper for the dashboard news feed: returns sanitized HTML
 * or an empty string, never throwing and never returning raw remote markup.
 */
export function sanitizeNewsContent(content, options) {
    if (typeof content !== "string") return "";
    // Reject a non-string payload outright rather than coercing: the feed is
    // remote input and a shape change is a signal that must not be rendered.
    if (content.length > MAX_INPUT_LENGTH) return "";
    return sanitizeHtml(content, options);
}

export default sanitizeHtml;
