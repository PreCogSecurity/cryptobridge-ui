import React from "react";
import ReactDOMServer from "react-dom/server";
import sha256 from "js-sha256";

// jdenticon paints into a real <canvas>, which jsdom does not implement. The
// component only calls it from componentDidMount, so server rendering exercises
// the whole render path (hashing, sizing, attributes) without needing a 2d
// context.
jest.mock("jdenticon", () => ({
    updateById: jest.fn(),
    update: jest.fn()
}));

import Identicon from "components/Account/Identicon";

const SIZE = {height: 100, width: 100};

function render(props) {
    return ReactDOMServer.renderToStaticMarkup(<Identicon {...props}/>);
}

describe("<Identicon>", function() {
    it("renders a canvas element", function() {
        expect(render({account: "Identicon", size: SIZE})).toMatch(/^<canvas/);
    });

    it("styles the canvas at the requested size", function() {
        const markup = render({account: "Identicon", size: SIZE});
        expect(markup).toContain("height:100px");
        expect(markup).toContain("width:100px");
    });

    it("renders at 2x the requested size for retina displays", function() {
        const markup = render({account: "Identicon", size: SIZE});
        expect(markup).toContain('width="200"');
        expect(markup).toContain('height="200"');
    });

    it("hashes the account name with sha256 for the jdenticon renderer", function() {
        const markup = render({account: "Identicon", size: SIZE});
        expect(markup).toContain('data-jdenticon-hash="' + sha256("Identicon") + '"');
    });

    it("changes the hash when the account changes", function() {
        const a = render({account: "alice", size: SIZE});
        const b = render({account: "bob", size: SIZE});
        expect(a).not.toBe(b);
        expect(a).toContain(sha256("alice"));
        expect(b).toContain(sha256("bob"));
    });

    it("omits the hash when no account name is supplied", function() {
        const markup = render({account: undefined, size: SIZE});
        // The placeholder "?" rendering path is driven by a null hash.
        expect(markup).not.toContain("data-jdenticon-hash=" + sha256(""));
    });

    it("gives every instance a unique canvas id", function() {
        const first = render({account: "alice", size: SIZE});
        const second = render({account: "alice", size: SIZE});
        expect(first).not.toBe(second);
    });

    it("escapes the account name so it cannot break out of the id attribute", function() {
        // The canvas id embeds the account name; an unescaped quote would let a
        // crafted account name inject attributes into the wallet's DOM.
        const markup = render({account: 'a" onload="alert(1)', size: SIZE});
        expect(markup).not.toContain('onload="alert(1)"');
        expect(markup).toContain("&quot;");
    });

    describe("shouldComponentUpdate", function() {
        const Component = Identicon;

        it("re-renders when the account changes", function() {
            const props = {account: "alice", size: {height: 10, width: 10}};
            const instance = new Component(props);
            expect(instance.shouldComponentUpdate({
                account: "bob", size: {height: 10, width: 10}
            })).toBe(true);
        });

        it("re-renders when the size changes", function() {
            const props = {account: "alice", size: {height: 10, width: 10}};
            const instance = new Component(props);
            expect(instance.shouldComponentUpdate({
                account: "alice", size: {height: 20, width: 10}
            })).toBe(true);
        });

        it("skips the repaint when nothing changed", function() {
            const props = {account: "alice", size: {height: 10, width: 10}};
            const instance = new Component(props);
            expect(instance.shouldComponentUpdate({
                account: "alice", size: {height: 10, width: 10}
            })).toBe(false);
        });
    });
});
