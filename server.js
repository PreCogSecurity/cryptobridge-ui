/**
 * Development server for the wallet UI (Express + webpack dev middleware).
 *
 * SECURITY NOTES (previously absent):
 *  - The listener binds to 127.0.0.1 by default. `app.listen(8080)` binds
 *    0.0.0.0, which publishes the dev server -- and with it the wallet, its
 *    IndexedDB-backed key store and the webpack HMR endpoint -- to the entire
 *    LAN. Override with HOST=0.0.0.0 only when you understand the exposure.
 *  - Baseline security headers are set for every response. The app is a wallet:
 *    an XSS or a framing attack here is a key-theft bug, not a cosmetic one.
 *  - `/healthz` exists so CI and container orchestrators can probe the server
 *    without compiling the bundle first.
 */
var path = require("path");
var webpack = require("webpack");
var express = require("express");
var devMiddleware = require("webpack-dev-middleware");
var hotMiddleware = require("webpack-hot-middleware");

var ProgressPlugin = require("webpack/lib/ProgressPlugin");
var config = require("./webpack.config.js")({prod: false});

var PORT = parseInt(process.env.PORT, 10) || 8080;
// Default to loopback: this server must never be reachable from the network by
// accident. A dev server that serves a hot-reloading wallet is a remote
// debugging session on the user's keys.
var HOST = process.env.HOST || "127.0.0.1";

var app = express();
var compiler = webpack(config);

compiler.apply(new ProgressPlugin(function (percentage, msg) {
    process.stdout.write((percentage * 100).toFixed(2) + "% " + msg + "                 \033[0G");
}));

app.disable("x-powered-by");
app.use(function (req, res, next) {
    // `unsafe-inline` is required because the HTML entry points carry inline
    // bootstrap/analytics snippets. `unsafe-eval` is required by webpack's dev
    // `eval` source maps; both are development-only affordances and are absent
    // from the production bundle. Never reuse this header set in production.
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
    res.setHeader(
        "Content-Security-Policy",
        [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: https:",
            "font-src 'self' data:",
            "connect-src 'self' https: wss: ws://127.0.0.1:8090 wss://127.0.0.1:8090",
            "frame-ancestors 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "object-src 'none'"
        ].join("; ")
    );
    next();
});

// Liveness/readiness probe. Deliberately does not touch the compiler so it
// answers immediately instead of blocking on the first bundle build.
app.get("/healthz", function (req, res) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.status(200).send(JSON.stringify({status: "ok", pid: process.pid}));
});

app.use(devMiddleware(compiler, {
    publicPath: config.output.publicPath,
    historyApiFallback: true
}));

app.use(hotMiddleware(compiler));

app.get("*", function (req, res) {
    res.sendFile(path.join(__dirname, "app/assets/index-dev.html"));
});

app.listen(PORT, HOST, function (err) {
    if (err) {
        return console.error(err);
    }

    console.log("Listening at http://" + HOST + ":" + PORT + "/");
    if (HOST !== "127.0.0.1" && HOST !== "localhost") {
        console.warn("WARNING: bound to " + HOST + "; the dev server is reachable from the network.");
    }
});
