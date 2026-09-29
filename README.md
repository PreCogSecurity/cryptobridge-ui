Cryptobridge-UI
============

This is a light wallet that connects to a BitShares API provided by the *witness_node* executable.

It *stores all keys locally* in the browser, *never exposing your keys to anyone* as it signs transactions locally before transmitting them to the API server which then broadcasts them to the blockchain network. The wallet is encrypted with a password of your choosing and encrypted in a browser database.

## Getting started&emsp;

CryptoBridge-UI depends on Node.js. See [Supported Node versions](#supported-node-versions) below — the short version is **Node 14** (`.nvmrc` pins it).

On Ubuntu and OSX, the easiest way to install Node is to use the [Node Version Manager](https://github.com/creationix/nvm).

To install NVM for Linux/OSX, simply copy paste the following in a terminal:

```
curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.30.2/install.sh | bash
nvm install
nvm use
```

Once you have Node installed, you can clone the repo:

```
git clone https://github.com/CryptoBridge/cryptobridge-ui.git
cd cryptobridge-ui
```

Before launching the GUI you will need to install the npm packages. Use `npm ci` — `package-lock.json` is committed, so `npm ci` gives you the exact dependency tree that CI and every other developer build against:

```
npm ci
```

### Environment variables&emsp;

Copy `.env.example` to `.env` and adjust the endpoints you need. Nothing in that file is a secret: this wallet signs transactions locally, so API keys, seed phrases and signing material must **never** be introduced as environment variables or committed.

```
cp .env.example .env
```

## Running the dev server&emsp;

The dev server uses Express in combination with Webpack.

Once all the packages have been installed you can start the development server by running:

```
npm start
```

Once the compilation is done the GUI will be available in your browser at: `localhost:8080` or `127.0.0.1:8080`. Hot Reloading is enabled so the browser will live update as you edit the source files.

The server binds to `127.0.0.1` by default and sends a baseline set of security headers (CSP, `X-Frame-Options: DENY`, `nosniff`, and more). A `/healthz` endpoint returns `{"status":"ok"}` for liveness probes. Set `HOST=0.0.0.0` only on a trusted, isolated network — see the security notes below.

## Testing&emsp;

The unit test suite runs with [Jest](https://jestjs.io/) and needs no chain connection, no wallet and no network access:

```
npm test              # single run
npm run test:watch    # watch mode
npm run test:coverage # enforces the coverage thresholds in package.json
```

`npm test` is also what CI runs, on every push and pull request. Please add or update a test with every behavioural change — the suite covers the pure logic that touches money: amount/address/memo validation, the HTML sanitizer used for remote news content, the structured logger and the typed error classes.

## Linting&emsp;

Style is enforced by ESLint using the configuration in `.eslintrc.json`:

```
npm run lint
npm run lint:fix
```

Linting also runs as a required CI job.

## Supported Node versions&emsp;

**Node 14** is the supported version (`.nvmrc`, `package.json` `engines`, and CI all agree).

This is a deliberate ceiling, not an oversight: the build still depends on `node-sass@4`, whose prebuilt binaries and `node-gyp` bindings require Python 2.7 and only exist up to Node 14. Moving to a currently supported LTS requires replacing `node-sass` with `dart-sass`, and webpack 3 with webpack 5 — both are separate, testable changes. `npm ci` against a modern Node release will fail at the native build step until that migration lands.

## Testnet&emsp;
By default cryptobridge-ui connects to the live BitShares network, but it's very easy to switch it to the testnet run by Xeroc. To do so, open the UI in a browser, go to Settings, then under Access, select the *Public Testnet Server* in the dropdown menu. You should also change the faucet if you need to create an account, the testnet faucet address is https://testnet.bitshares.eu.

The UI will reload and connect to the testnet, where you can use the faucet to create an account and receive an initial sum of test BTS.


![image](https://cloud.githubusercontent.com/assets/6890015/22055747/f8e15e68-dd5c-11e6-84cd-692749b578d8.png)

## Security&emsp;

This application holds private keys and signs transactions in the browser. Treat every XSS as a total compromise of funds. The following controls are in place and must be preserved:

| Control | Where |
| --- | --- |
| Remote HTML is sanitized against an allowlist before rendering | `app/utils/sanitizeHtml.js`, used by `app/components/Dashboard/Dashboard.jsx` |
| Content-Security-Policy on every HTML entry point | `app/assets/index.html`, `index-dev.html`, `index-electron.html` |
| Baseline security headers on the dev server | `server.js` |
| Dev server binds to loopback by default | `server.js` (`HOST` override) |
| `shell.openExternal` scheme allowlist (`http`/`https`/`mailto` only) | `resources/index.js` |
| Renderer navigation confined to the bundled `file://` page | `resources/index.js` (`will-navigate`) |
| No analytics or third-party script in the desktop build | `app/assets/index-electron.html` |
| Developer `eval` console disabled in production builds | `app/components/Console/Console.jsx` |
| Credential-shaped values redacted from all log output | `app/utils/logger.js` |
| Amount / address / memo validation on the withdraw path | `app/utils/validate.js`, `app/components/DepositWithdraw/WithdrawModal.jsx` |
| Remote market feed validated before use | `app/components/Dashboard/Dashboard.jsx` |
| `npm audit` gate and secret scanning in CI | `.github/workflows/ci.yml` |

Rules of thumb when contributing:

- Never pass remote data to `dangerouslySetInnerHTML` without `sanitizeHtml`.
- Never add a dependency here, or point an endpoint at a non-`https`/`wss` URL, in a path that carries wallet state.
- Never add secrets to `.env`, `package.json` or any committed file.

## Production&emsp;
If you'd like to host your own wallet somewhere, you should create a production build and host it using NGINX or Apache. In order to create a prod bundle, simply run the following command:

```
npm run build
```
This will create a bundle in the /dist folder that can be hosted with the web server of your choice.


### Installable wallets
We use Electron to provide installable wallets, available for Windows, OSX and Linux Debian platforms such as Ubuntu. First, make sure your local python version is 2.7.x, as a dependency requires this.

On Linux you will need to install the following packages to handle icon generation:

`sudo apt-get install --no-install-recommends -y icnsutils graphicsmagick xz-utils`

For building, each architecture has it's own script that you can use to build your native binary:

__Linux__
`npm run package-deb`
__Windows__
`npm run package-win`
__Mac__
`npm run package-mac`

This will compile the UI with some special modifications for use with Electron, generate installable binaries with Electron and copy the result to the root `build/binaries` folder.
## Development process

- Milestones are numbered YYMMDD and refer to the **anticipated release date**.
- Bugs are always worked before enhancements
- Developers should work each issue according to a numbered branch corresponding to the issue `git checkout -b 123`
- We pay **bounties** for issues that have been estimated. An estimated issue is prefixed with a number in brackets like this: `[2] An nasty bug`. In this example, the bug is valued at two hours ($125 per hour). If you fix this issue according to these guidelines and your PR is accepted, this will earn you $250 bitUSD. You must have a Bitshares wallet and a Bitshares account to receive payment.
- If an issue is already claimed (assigned), do not attempt to claim it. Issues claimed by outside developers will indicate an assignment to wmbutler, but will mention the developer's github account in this the comments.
- To claim an issue, simply leave a comment with your request to claim.
- Do not claim an issue if you will be unable to complete it by the date indicated on the Milestone name. Milestone 170901 will be pushed on September 1, 2017.

## Coding style guideline

Our style guideline is based on 'Airbnb JavaScript Style Guide' (https://github.com/airbnb/javascript), with few exceptions:

- Strings are double quoted
- Additional trailing comma (in arrays and objects declaration) is optional
- 4 spaces tabs
- Spaces inside curly braces are optional

ESLint enforces this: the configuration lives in `.eslintrc.json`, `npm run lint` runs it locally and a required CI job runs it on every pull request. The three places where we deliberately deviate from stock Airbnb are disabled in that file: `no-var`/`prefer-const` (the codebase predates block scoping) and `react/prop-types` (components use `ChainTypes` validators instead).

## Pull request checklist&emsp;

1. `npm run lint` is clean.
2. `npm test` passes, and any new behaviour has a test that fails without your change.
3. `npm run test:coverage` still meets the thresholds in `package.json`.
4. If you touched a path that handles keys, signing, or the withdraw/deposit flow, re-read the [Security](#security) table above and confirm each control still holds.
5. Keep the change focused: one feature or fix per pull request, with its tests. Mixed refactor-and-feature commits are unreviewable and get reverted.

