import React from "react";
import ReactDOMServer from "react-dom/server";

// FormattedAsset reaches into the chain store, the intl runtime, a popover and
// two chain-state-connected children. Server rendering keeps the assertions on
// the component's own logic (precision maths, visibility flags, percentage
// formatting) while stubbing everything that needs a live chain.

jest.mock("bitsharesjs/es", () => ({
    ChainStore: {
        getObject: () => null
    },
    ChainTypes: {
        object_type: {},
        ChainAsset: {},
        ChainAccount: {}
    }
}));

jest.mock("components/Utility/BindToChainState", () => (Component) => Component);

jest.mock("components/Utility/ChainTypes", () => ({
    ChainAsset: {isRequired: false},
    ChainAccount: {isRequired: false}
}));

jest.mock("components/Utility/AssetName", () => (props) =>
    React.createElement("span", {className: "asset-name"}, props.name));

jest.mock("components/Utility/HelpContent", () => () =>
    React.createElement("div", {className: "help-content"}));

jest.mock("react-popover", () => (props) => React.createElement("div", null, props.children));

// A faithful stand-in for react-intl's FormattedNumber: it applies the
// requested fixed precision, which is the behaviour under test.
jest.mock("react-intl", () => ({
    FormattedNumber: (props) => React.createElement("span", {className: "number"},
        Number(props.value).toFixed(props.minimumFractionDigits))
}));

jest.mock("common/asset_utils", () => ({
    parseDescription: () => ({main: "a description", short_name: ""})
}));

jest.mock("common/utils", () => ({
    get_asset_precision: (precision) => Math.pow(10, precision),
    format_number: (value, decimals) => Number(value).toFixed(decimals)
}));

import FormattedAsset from "components/Utility/FormattedAsset";

function makeAsset(overrides) {
    return Object.assign({
        id: "1.3.0",
        symbol: "BTS",
        precision: 5,
        issuer: "1.2.0",
        options: {description: "a description"},
        dynamic: {current_supply: "2100000000000000"}
    }, overrides);
}

function render(props) {
    return ReactDOMServer.renderToStaticMarkup(
        <FormattedAsset asset={makeAsset()} amount={1000000} {...props}/>
    );
}

describe("<FormattedAsset>", function() {
    describe("precision", function() {
        it("divides the integer amount by the asset precision", function() {
            // 1000000 raw units at precision 5 is 10 BTS.
            expect(render({amount: 1000000})).toContain("10.00000");
        });

        it("uses the asset precision as the number of decimals", function() {
            expect(render({amount: 1, asset: makeAsset({precision: 3})})).toContain("0.001");
        });

        it("does not divide when exact_amount is set", function() {
            expect(render({amount: 10, exact_amount: true})).toContain("10.00000");
        });

        it("honours decimalOffset", function() {
            // precision 5 minus a 2-place offset leaves 3 displayed decimals.
            expect(render({amount: 1000000, decimalOffset: 2})).toContain("10.000");
        });

        it("renders zero without producing NaN", function() {
            expect(render({amount: 0})).toContain("0.00000");
        });
    });

    describe("visibility flags", function() {
        it("renders the asset symbol by default", function() {
            expect(render({})).toContain("BTS");
        });

        it("hides the amount when hide_amount is set", function() {
            const markup = render({hide_amount: true});
            expect(markup).not.toContain("10.00000");
            expect(markup).toContain("no-amount");
        });

        it("hides the symbol when hide_asset is set", function() {
            expect(render({hide_asset: true})).not.toContain("BTS");
        });
    });

    describe("percentage mode", function() {
        it("renders the amount as a percentage of the dynamic supply", function() {
            const markup = render({amount: 2100000000000000, asPercentage: true});
            expect(markup).toContain("100.0000%");
        });

        it("renders a small holding as a small percentage", function() {
            const markup = render({amount: 21000000000000, asPercentage: true});
            expect(markup).toContain("1.0000%");
        });
    });

    describe("colour", function() {
        it("applies the facolor class when a colour is supplied", function() {
            expect(render({color: "red"})).toContain("facolor-red");
        });

        it("omits the class when no colour is supplied", function() {
            expect(render({})).not.toContain("facolor-");
        });
    });

    it("renders without throwing when the issuer is not in the chain store", function() {
        // ChainStore.getObject is stubbed to return null, which is the state of
        // every asset on first paint before the store has caught up.
        expect(() => render({})).not.toThrow();
    });
});
