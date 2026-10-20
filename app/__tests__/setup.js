/**
 * Jest global setup.
 *
 * `require.context` is a webpack-only API. Components such as
 * `app/components/Utility/HelpContent.jsx` use it to pull in a directory of
 * markdown files at build time, so importing those components under Jest threw
 * `TypeError: require.context is not a function` and took whole suites down
 * before a single assertion ran.
 *
 * This shim returns an empty context so the component loads and its own logic
 * can be tested. It is intentionally minimal: tests that actually need the
 * bundled files should mock the module that consumes the context.
 */
if (typeof require.context !== "function") {
    require.context = function() {
        const context = function() {
            return {};
        };
        context.keys = function() {
            return [];
        };
        context.resolve = function(key) {
            return key;
        };
        context.id = "jest-require-context-stub";
        return context;
    };
}
