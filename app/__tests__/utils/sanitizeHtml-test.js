import sanitizeHtml, {
    decodeEntities,
    escapeAttribute,
    escapeText,
    isSafeUrl,
    sanitizeNewsContent
} from "utils/sanitizeHtml";

describe("sanitizeHtml", function() {
    describe("script execution sinks", function() {
        it("removes a <script> element together with its body", function() {
            expect(sanitizeHtml("<script>alert(1)</script>safe")).toBe("safe");
        });

        it("removes <script> regardless of case", function() {
            expect(sanitizeHtml("<SCRIPT>alert(1)</SCRIPT>safe")).toBe("safe");
        });

        it("removes an unterminated <script> and everything after it", function() {
            expect(sanitizeHtml("before<script>alert(1)")).toBe("before");
        });

        it("removes <style>, <iframe>, <svg> and <form> with their contents", function() {
            expect(sanitizeHtml("<style>body{}</style>ok")).toBe("ok");
            expect(sanitizeHtml('<iframe src="https://evil"></iframe>ok')).toBe("ok");
            expect(sanitizeHtml("<svg onload=alert(1)></svg>ok")).toBe("ok");
            expect(sanitizeHtml("<form action=x>in</form>out")).toBe("out");
        });

        it("removes <img> so onerror cannot fire", function() {
            expect(sanitizeHtml('<img src=x onerror="alert(1)">after')).toBe("after");
        });

        it("strips event handler attributes from allowed elements", function() {
            expect(sanitizeHtml('<b onclick="alert(1)">x</b>')).toBe("<b>x</b>");
        });

        it("strips HTML comments, which can smuggle markup past naive filters", function() {
            expect(sanitizeHtml("a<!-- <script>alert(1)</script> -->b")).toBe("ab");
        });

        it("strips doctypes and processing instructions", function() {
            expect(sanitizeHtml("<!DOCTYPE html><b>x</b>")).toBe("<b>x</b>");
        });

        it("cannot be tricked by a tag whose name lives inside an attribute", function() {
            expect(sanitizeHtml('<b title="</b>">x</b>')).toBe("<b>x</b>");
        });
    });

    describe("url handling", function() {
        it("keeps http, https and mailto links", function() {
            expect(sanitizeHtml('<a href="https://example.com">link</a>'))
                .toBe('<a href="https://example.com">link</a>');
            expect(sanitizeHtml('<a href="http://example.com">l</a>'))
                .toBe('<a href="http://example.com">l</a>');
            expect(sanitizeHtml('<a href="mailto:a@b.co">l</a>'))
                .toBe('<a href="mailto:a@b.co">l</a>');
        });

        it("keeps relative links", function() {
            expect(sanitizeHtml('<a href="/markets">x</a>')).toBe('<a href="/markets">x</a>');
        });

        it("drops javascript: hrefs", function() {
            expect(sanitizeHtml('<a href="javascript:alert(1)">x</a>')).toBe("<a>x</a>");
            expect(sanitizeHtml('<a href="JaVaScRiPt:alert(1)">x</a>')).toBe("<a>x</a>");
        });

        it("drops entity-encoded javascript: hrefs", function() {
            expect(sanitizeHtml('<a href="&#106;avascript:alert(1)">x</a>')).toBe("<a>x</a>");
            expect(sanitizeHtml('<a href="java&Tab;script:alert(1)">x</a>')).toBe("<a>x</a>");
            expect(sanitizeHtml('<a href="javascript&colon;alert(1)">x</a>')).toBe("<a>x</a>");
        });

        it("drops data: and vbscript: hrefs", function() {
            expect(sanitizeHtml('<a href="data:text/html,<b>x</b>">y</a>')).toBe("<a>y</a>");
            expect(sanitizeHtml('<a href="vbscript:msgbox(1)">y</a>')).toBe("<a>y</a>");
        });

        it("forces noopener on links that open a new browsing context", function() {
            expect(sanitizeHtml('<a href="https://x.com" target="_blank">x</a>'))
                .toBe('<a href="https://x.com" target="_blank" rel="noopener noreferrer">x</a>');
        });

        it("drops unusable target values instead of normalising them", function() {
            expect(sanitizeHtml('<a href="https://x.com" target="evilname">x</a>'))
                .toBe('<a href="https://x.com">x</a>');
        });

        it("isSafeUrl accepts relative and allowlisted URLs only", function() {
            expect(isSafeUrl("/markets")).toBe(true);
            expect(isSafeUrl("https://example.com")).toBe(true);
            expect(isSafeUrl("mailto:a@b.co")).toBe(true);
            expect(isSafeUrl("javascript:alert(1)")).toBe(false);
            expect(isSafeUrl("  javascript:alert(1)")).toBe(false);
            expect(isSafeUrl("data:text/html,x")).toBe(false);
            expect(isSafeUrl(null)).toBe(false);
        });
    });

    describe("structure", function() {
        it("preserves allowlisted formatting elements", function() {
            expect(sanitizeHtml("<b>bold</b> and <strong>strong</strong>"))
                .toBe("<b>bold</b> and <strong>strong</strong>");
            expect(sanitizeHtml("<ul><li>a</li><li>b</li></ul>")).toBe("<ul><li>a</li><li>b</li></ul>");
        });

        it("unwraps unknown elements but keeps their text", function() {
            expect(sanitizeHtml("<div>inner</div>")).toBe("inner");
            expect(sanitizeHtml("<marquee>hi</marquee>")).toBe("hi");
        });

        it("closes elements the source left open", function() {
            expect(sanitizeHtml("<b>bold")).toBe("<b>bold</b>");
        });

        it("discards stray closing tags", function() {
            expect(sanitizeHtml("</b>text")).toBe("text");
        });

        it("repairs crossed tags instead of emitting unbalanced markup", function() {
            expect(sanitizeHtml("<b><i>x</b></i>")).toBe("<b><i>x</i></b>");
        });

        it("emits void elements without a closing tag", function() {
            expect(sanitizeHtml("a<br>b<hr>c")).toBe("a<br>b<hr>c");
        });
    });

    describe("input handling", function() {
        it("returns an empty string for non-string input", function() {
            expect(sanitizeHtml(null)).toBe("");
            expect(sanitizeHtml(undefined)).toBe("");
            expect(sanitizeHtml(42)).toBe("");
            expect(sanitizeHtml({})).toBe("");
        });

        it("returns an empty string for empty input", function() {
            expect(sanitizeHtml("")).toBe("");
        });

        it("leaves plain text untouched", function() {
            expect(sanitizeHtml("hello world")).toBe("hello world");
        });

        it("caps the output length so a huge feed cannot bloat the DOM", function() {
            const out = sanitizeHtml("<b>x</b>", {maxLength: 6});
            expect(out.length).toBeLessThanOrEqual(6);
        });
    });

    describe("sanitizeNewsContent", function() {
        it("sanitizes a well-formed payload", function() {
            expect(sanitizeNewsContent("<b>Notice</b>")).toBe("<b>Notice</b>");
        });

        it("rejects non-string payloads rather than coercing them", function() {
            expect(sanitizeNewsContent({content: "<b>x</b>"})).toBe("");
            expect(sanitizeNewsContent(null)).toBe("");
        });

        it("rejects oversized payloads outright", function() {
            expect(sanitizeNewsContent("x".repeat(100001))).toBe("");
        });
    });

    describe("helpers", function() {
        it("decodeEntities understands numeric and named forms", function() {
            expect(decodeEntities("&#106;avascript:")).toBe("javascript:");
            expect(decodeEntities("java&Tab;script:")).toBe("java\tscript:");
            expect(decodeEntities("javascript&colon;")).toBe("javascript:");
        });

        it("decodeEntities leaves unknown entities alone", function() {
            expect(decodeEntities("&nosuchentity;")).toBe("&nosuchentity;");
        });

        it("escapeAttribute neutralises every attribute break-out character", function() {
            expect(escapeAttribute("a\"b<c>d&e'f")).toBe("a&quot;b&lt;c&gt;d&amp;e&#39;f");
        });

        it("escapeText neutralises tag characters", function() {
            expect(escapeText("<b>&</b>")).toBe("&lt;b&gt;&amp;&lt;/b&gt;");
        });
    });
});
