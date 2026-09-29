var coffee = require("coffee-script");
var babelJest = require("babel-jest");

// babel-jest destructures its third argument, so the previous implementation
// (which forwarded only `src` and `path`) threw on every single transform.
// Forward a safe default whenever Jest does not hand us a config.
var DEFAULT_CONFIG = {cwd: process.cwd(), rootDir: process.cwd()};

module.exports = {
    process: function(src, filename, config) {
        // CoffeeScript files can be .coffee, .litcoffee, or .coffee.md.
        // They must be compiled by CoffeeScript first; handing them to babel
        // first raised a SyntaxError before coffee ever saw them.
        if (coffee.helpers.isCoffee(filename)) {
            return coffee.compile(src, {"bare": true});
        }
        return babelJest.process(src, filename, config || DEFAULT_CONFIG);
    }
};
