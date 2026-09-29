/**
 * Input validation for the paths that move money.
 *
 * WHY THIS EXISTS
 * ---------------
 * The deposit/withdraw forms accepted whatever the user typed. `WithdrawModal`
 * concatenated `memo_prefix + withdraw_address` with no checks, so:
 *   - submitting an untouched form threw `TypeError: Cannot read property
 *     'replace' of null` (amount is `null` in the initial state), and
 *   - submitting only an address produced the literal string "null" inside the
 *     memo, which the gateway cannot route -- the withdrawal is silently lost.
 *
 * These validators are deliberately dependency-free pure functions so they can
 * be unit tested without a DOM, a chain connection, or a wallet.
 */

/** BitShares account names: 3-63 chars, lowercase, dash-separated segments
 *  that each begin with a letter. Because every segment must start with a
 *  letter, leading, trailing and consecutive dashes are all rejected. */
const ACCOUNT_NAME_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z][a-z0-9]*)*$/;
const MIN_ACCOUNT_NAME_LENGTH = 3;
const MAX_ACCOUNT_NAME_LENGTH = 63;

/** Destination addresses: ASCII, alphanumerics plus the punctuation used by
 *  base58/bech32/legacy-hex encodings. Deliberately excludes whitespace,
 *  control characters and non-ASCII so a pasted address cannot smuggle a
 *  homoglyph, a zero-width character, or a trailing newline. */
const ADDRESS_PATTERN = /^[0-9A-Za-z][0-9A-Za-z:._-]{7,199}$/;

/** Asset symbols on the BitShares chain. */
const ASSET_SYMBOL_PATTERN = /^[A-Z0-9][A-Z0-9.]{0,11}$/;

/** Control characters are rejected in memos. Printable Unicode is allowed --
 *  users legitimately write accented text, but a stray newline inside an
 *  `address:memo` payload is a protocol-injection primitive. */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;

/** Conservative ceiling; gateways truncate or reject longer memos. */
export const MAX_MEMO_LENGTH = 1024;
export const MAX_ADDRESS_LENGTH = 200;

/**
 * Parse a user-entered amount into a finite number.
 * Accepts thousands separators and surrounding whitespace; rejects anything
 * else -- including scientific notation, multiple decimal points, `Infinity`
 * and hex/empty input, all of which previously produced `NaN` and were handed
 * to the chain.
 *
 * @returns {number|null} the parsed amount, or null when unparseable
 */
export function normalizeAmount(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === "number") return isFinite(value) ? value : null;

    // Only *outer* whitespace is forgiven: "1 2" must not silently become 12.
    const raw = String(value).trim().replace(/,/g, "");
    if (raw === "" || !/^[+-]?(\d+\.?\d*|\.\d+)$/.test(raw)) return null;

    const parsed = Number(raw);
    return isFinite(parsed) ? parsed : null;
}

/**
 * @param {*} value amount as typed by the user
 * @param {number} [precision] asset precision; when given, extra decimals are rejected
 */
export function isValidAmount(value, precision) {
    const amount = normalizeAmount(value);
    if (amount === null) return false;
    if (amount <= 0) return false;

    if (typeof precision === "number" && precision >= 0) {
        const raw = String(value).trim().replace(/,/g, "");
        const dot = raw.indexOf(".");
        if (dot !== -1 && raw.length - dot - 1 > precision) return false;
    }
    return true;
}

export function isValidAccountName(value) {
    if (typeof value !== "string") return false;
    if (value.length < MIN_ACCOUNT_NAME_LENGTH || value.length > MAX_ACCOUNT_NAME_LENGTH) return false;
    return ACCOUNT_NAME_PATTERN.test(value);
}

export function isValidAssetSymbol(value) {
    return typeof value === "string" && ASSET_SYMBOL_PATTERN.test(value);
}

/** Trim and shape-check a destination address. */
export function normalizeAddress(value) {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (trimmed.length > MAX_ADDRESS_LENGTH) return null;
    if (!ADDRESS_PATTERN.test(trimmed)) return null;
    return trimmed;
}

export function isValidWithdrawalAddress(value) {
    return normalizeAddress(value) !== null;
}

/**
 * A memo is an arbitrary note routed to a gateway. It may contain spaces and
 * punctuation, but never control characters (see CONTROL_CHARACTER_PATTERN),
 * and never exceed the chain's length budget.
 */
export function isValidMemo(value) {
    if (value === null || value === undefined) return true;
    if (typeof value !== "string") return false;
    if (value.length > MAX_MEMO_LENGTH) return false;
    return !CONTROL_CHARACTER_PATTERN.test(value);
}

/** Only http(s) endpoints may be contacted with wallet context attached. */
export function isSafeHttpUrl(value) {
    if (typeof value !== "string") return false;
    const trimmed = value.trim();
    if (!/^https?:\/\//i.test(trimmed)) return false;
    try {
        // eslint-disable-next-line no-new
        new URL(trimmed);
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * Shape check for an entry of the remote `/markets` feed. The dashboard renders
 * these directly into React keys and `MarketCard` props; without validation a
 * malformed feed can inject arbitrary strings and non-string values into the
 * component tree.
 */
export function isValidMarketDescriptor(market) {
    if (!market || typeof market !== "object") return false;
    if (!isValidAssetSymbol(market.base)) return false;
    if (!isValidAssetSymbol(market.quote)) return false;
    if (market.blacklisted !== undefined && typeof market.blacklisted !== "boolean") return false;
    if (market.img !== undefined && market.img !== null && typeof market.img !== "string") return false;
    return true;
}

/**
 * Validate a withdrawal form as a whole.
 *
 * @param {object} fields
 * @param {*} fields.amount        amount as typed
 * @param {*} fields.address       destination address as typed
 * @param {number} [fields.precision] asset precision
 * @param {string} [fields.memo]   memo body, excluding any gateway prefix
 * @returns {{valid: boolean, errors: object, amount: number|null, address: string|null}}
 */
export function validateWithdrawal(fields) {
    const input = fields || {};
    const errors = {};

    const amount = normalizeAmount(input.amount);
    if (amount === null) {
        errors.amount = "modal.withdraw.error_amount_invalid";
    } else if (amount <= 0) {
        errors.amount = "modal.withdraw.error_amount_positive";
    } else if (typeof input.precision === "number" && !isValidAmount(input.amount, input.precision)) {
        errors.amount = "modal.withdraw.error_amount_precision";
    }

    const address = normalizeAddress(input.address);
    if (address === null) {
        errors.address = "modal.withdraw.error_address_invalid";
    }

    if (!isValidMemo(input.memo)) {
        errors.memo = "modal.withdraw.error_memo_invalid";
    }

    return {
        valid: Object.keys(errors).length === 0,
        errors: errors,
        amount: amount,
        address: address
    };
}

export default {
    isSafeHttpUrl,
    isValidAccountName,
    isValidAmount,
    isValidAssetSymbol,
    isValidMemo,
    isValidWithdrawalAddress,
    isValidMarketDescriptor,
    normalizeAddress,
    normalizeAmount,
    validateWithdrawal
};
