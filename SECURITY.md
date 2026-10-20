# Security Policy

CryptoBridge-UI is a non-custodial wallet: it stores private keys in the
browser and signs transactions locally. A cross-site scripting bug, a
dependency compromise, or a leaked key is a direct loss of user funds, so
security reports are treated as the highest priority.

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

Report it privately through GitHub's
[private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
on this repository (Security tab -> "Report a vulnerability"). If that is not
available to you, contact the maintainers listed in `package.json`.

Please include:

- the affected file(s) and, where possible, a minimal reproduction,
- the impact you believe it has (key disclosure, transaction tampering,
  denial of service, ...),
- any suggested fix or mitigation.

We aim to acknowledge a report within 72 hours and to ship a fix or a
documented mitigation within 30 days for high-severity issues. We will credit
reporters in the release notes unless you ask us not to.

## Scope

In scope:

- the application source under `app/`,
- the dev server (`server.js`) and the Electron shell (`resources/`),
- the build and CI configuration (`.github/workflows/`, `webpack.config.js`),
- the dependency tree that ships in the production bundle.

Out of scope:

- the BitShares chain itself and third-party gateway APIs,
- issues that require an already-compromised machine or a malicious browser
  extension with full page access,
- missing hardening headers on a deployment that is not the bundled dev server.

## Security invariants

These controls are load-bearing. A change that weakens any of them is a
security regression and must be called out in review:

| Control | Where |
| --- | --- |
| Remote HTML is sanitized against an allowlist before rendering | `app/utils/sanitizeHtml.js` |
| Content-Security-Policy on every HTML entry point | `app/assets/index*.html` |
| Baseline security headers on the dev server | `server.js` |
| Dev server binds to loopback by default | `server.js` (`HOST` override) |
| `shell.openExternal` scheme allowlist (`http`/`https`/`mailto` only) | `resources/index.js` |
| Renderer navigation confined to the bundled `file://` page | `resources/index.js` |
| No analytics or third-party script in the desktop build | `app/assets/index-electron.html` |
| Developer `eval` console disabled in production builds | `app/components/Console/Console.jsx` |
| Credential-shaped values redacted from all log output | `app/utils/logger.js` |
| Amount / address / memo validation on the withdraw path | `app/utils/validate.js` |
| Remote market feed validated before use | `app/components/Dashboard/Dashboard.jsx` |
| `npm audit` gate and secret scanning in CI | `.github/workflows/ci.yml` |

## Handling secrets

Never commit a private key, seed phrase, WIF, API token or password. The wallet
is designed so that no signing material belongs in an environment file; see
`.env.example`. If you believe a secret has been committed, treat it as
compromised, rotate it, and report it privately as above.
