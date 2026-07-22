# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.4] - 2026-07-22

### Security
- **Forced the transitive `@hono/node-server` dependency to ^2.0.5 via an npm override**, resolving [GHSA-frvp-7c67-39w9](https://github.com/advisories/GHSA-frvp-7c67-39w9) (medium severity), a path traversal in its `serve-static` module on Windows via encoded backslashes. The package comes in through `@modelcontextprotocol/sdk`, which pins `^1.19.9` — below the patched 2.0.5. This server was not exploitable: the SDK only uses `serve`/`getRequestListener`, never the vulnerable `serveStatic`, and the flaw is Windows-only. The override closes the alert until the SDK moves to 2.x upstream.
- **Bumped transitive `fast-uri` from 3.1.2 to 3.1.4**, resolving two high-severity host-confusion vulnerabilities: [GHSA-4c8g-83qw-93j6](https://github.com/advisories/GHSA-4c8g-83qw-93j6) (failed IDN canonicalization) and [GHSA-v2hh-gcrm-f6hx](https://github.com/advisories/GHSA-v2hh-gcrm-f6hx) (literal backslash accepted as authority delimiter).
- **Bumped transitive `hono` from 4.12.25 to 4.12.31**, resolving three medium-severity vulnerabilities fixed in 4.12.27: [GHSA-xgm2-5f3f-mvvc](https://github.com/advisories/GHSA-xgm2-5f3f-mvvc) (API Gateway v1 adapter can drop a distinct repeated request header value during de-duplication), [GHSA-w62v-xxxg-mg59](https://github.com/advisories/GHSA-w62v-xxxg-mg59) (server-side XSS via JSX escaping bypass in the `cx()` utility), and [GHSA-hvrm-45r6-mjfj](https://github.com/advisories/GHSA-hvrm-45r6-mjfj) (`hono/jsx` context not isolated per request, allowing cross-request data disclosure).
- **Bumped transitive `body-parser` from 2.2.2 to 2.3.0**, resolving [GHSA-v422-hmwv-36x6](https://github.com/advisories/GHSA-v422-hmwv-36x6) (low severity), a denial of service where an invalid `limit` value silently disables request-size enforcement.

## [0.3.3] - 2026-07-21

### Security
- **The OAuth redirect URI allow-list could be bypassed via a hostname-extension attack on bare-origin `MCP_ALLOWED_REDIRECT_PREFIXES` entries.** A bare-origin prefix — one with nothing after the host, e.g. `https://example.com` — was matched against the raw redirect URI string with `uri.startsWith(prefix)`. That check also matches `https://example.com.attacker.test/steal`: the hostname is merely extended, not spoofed via userinfo, so the 0.3.2 userinfo fix did not catch it. The redirect URI is where the OAuth authorization code is sent, so an operator configuring a bare-origin prefix unintentionally allow-listed every hostname sharing that prefix, letting an attacker redirect a victim's authorization code to their own domain.

  Bare-origin prefixes (where `new URL(prefix).origin === prefix`) are now matched by comparing the parsed redirect URI's origin to the prefix, never by raw `startsWith`. Prefixes with a path, a trailing slash, or that don't parse as a URL (e.g. the port-prefix form `http://192.168.1.10:`) keep the existing `startsWith` behavior, which is safe there since a `/` or `:` right after the host already delimits it.

  **Affected:** the HTTP transport in OAuth mode with a bare-origin `MCP_ALLOWED_REDIRECT_PREFIXES` entry configured, in all releases up to and including 0.3.2. **Not affected:** deployments that don't set `MCP_ALLOWED_REDIRECT_PREFIXES`, or that set only prefixes with a path/trailing slash. Operators using a bare-origin prefix should upgrade.
- **`/oauth/register` validated only the first entry in `redirect_uris`, accepting unvetted URIs registered alongside it.** A registration request with `["http://127.0.0.1:3000/cb", "https://evil.example.com/steal"]` was accepted with `201`, since only `redirect_uris[0]` was checked against the allow-list. `/oauth/authorize` re-validates the redirect URI it actually uses, so this was not directly exploitable on its own, but the registration surface should not accept unvetted URIs — a future consumer of the stored registration record could rely on it having been validated.

  Every entry in `redirect_uris` is now checked against the allow-list; the request is rejected with the existing `400 invalid_redirect_uri` response if any entry fails. An empty `redirect_uris` array is still accepted, unchanged.

  **Affected:** the HTTP transport in OAuth mode, in all releases up to and including 0.3.2. **Not affected:** the stdio transport, and the HTTP transport in PAT-only mode. Defense-in-depth fix; no known exploit path given `/oauth/authorize`'s existing re-validation. Operators running HTTP/OAuth mode should upgrade alongside the fix above.

## [0.3.2] - 2026-07-21

### Security
- **The OAuth redirect URI allow-list could be bypassed via URL userinfo, leaking authorization codes.** The allow-list matched loopback addresses against the raw redirect URI string, but URL userinfo lets that string misrepresent the real host: `http://127.0.0.1:@evil.example.com/steal` starts with `http://127.0.0.1:` while its parsed origin is `http://evil.example.com`. Such a URI passed validation at `/oauth/authorize`, was stored against the flow's `state`, and `/oauth/callback` then redirected the Firefly III authorization code to the attacker's host. Because the attacker also supplies the PKCE `code_challenge`, they could complete the token exchange and gain full API access to the victim's Firefly III account. The same technique defeated any `MCP_ALLOWED_REDIRECT_PREFIXES` entry, since those are matched as literal prefixes too (`https://my-client.example.com@evil.example.com/`).

  Matching is now performed on parsed URL components instead of the raw string, and any redirect URI carrying userinfo is rejected outright. Loopback matching additionally accepts a port-less `http://127.0.0.1/callback` per [RFC 8252](https://datatracker.ietf.org/doc/html/rfc8252).

  **Affected:** the HTTP transport in OAuth mode (`FIREFLY_OAUTH_CLIENT_ID` set) in all releases up to and including 0.3.1. **Not affected:** the stdio transport, and the HTTP transport in PAT-only mode — that mode serves no OAuth surface at all. Exploitation requires persuading a victim to start an authorization flow from a crafted URL. Operators running HTTP/OAuth mode should upgrade.

## [0.3.1] - 2026-07-06

### Fixed
- `create_transaction_link` and `update_transaction_link` always failed Firefly's validation with "The inward id field is required." / "The outward id field is required.", regardless of the IDs passed in. The tools' exposed schema used `in_id` / `out_id`, but Firefly III's `/api/v1/transaction-links` endpoint expects `inward_id` / `outward_id` — the request body was forwarded verbatim without renaming these fields. The schema fields are now renamed to `inward_id` / `outward_id`, matching Firefly's API and the pattern used by every other tool. _Contributed by [@mircea-pavel-anton](https://github.com/mircea-pavel-anton) in [#37](https://github.com/daften/fireflyiii-mcp/pull/37)._
- GitHub Release notes are no longer empty. The `release` job assumed `softprops/action-gh-release` would populate the release body from the annotated tag's message, but it does not — releases were created with blank notes. The workflow now extracts the matching `## [X.Y.Z]` section from `CHANGELOG.md` and passes it via `body_path`.

## [0.3.0] - 2026-06-20

### Added
- HTTP transport now supports PAT-only mode: `FIREFLY_OAUTH_CLIENT_ID` is optional, and omitting it runs the server without the OAuth proxy surface (`/.well-known/oauth-authorization-server` and `/oauth/*` now 404), authenticating every request with a Firefly III Personal Access Token sent as a Bearer token instead. `MCP_BASE_URL` is no longer required in this mode, since there's no OAuth redirect URI to construct. Intended for headless callers — gateways, automation — that have no way to drive an interactive browser-based OAuth flow. See the new [HTTP/PAT guide](https://daften.github.io/fireflyiii-mcp/guide/http-pat). _Contributed by [@mircea-pavel-anton](https://github.com/mircea-pavel-anton) in [#30](https://github.com/daften/fireflyiii-mcp/pull/30)._
- Unauthenticated, mode-agnostic `GET /health` liveness endpoint that always returns `200 {"status":"ok"}`. The Docker `HEALTHCHECK` now probes `/health` instead of the OAuth metadata endpoint, so containers report healthy in PAT-only mode (where the OAuth surface 404s). _Contributed by [@mircea-pavel-anton](https://github.com/mircea-pavel-anton) in [#30](https://github.com/daften/fireflyiii-mcp/pull/30)._

### Security
- Pinned the transitive `hono` dependency (pulled in by `@modelcontextprotocol/sdk`) to `^4.12.25` via an `overrides` entry, closing a high-severity advisory affecting `hono <=4.12.24` (GHSA-wwfh-h76j-fc44 and related). None of the flagged code paths (`serve-static` on Windows, the AWS Lambda / Lambda@Edge adapters, CORS middleware) are reachable from this server, which uses the raw Node `http` module — but the bump clears the `npm audit --audit-level=moderate` gate in CI. `npm audit` now reports 0 vulnerabilities.

## [0.2.2] - 2026-06-14

### Added
- Nightly builds: on nights `main` changes, the `publish.yml` workflow now also publishes an unstable prerelease to npm (`nightly` dist-tag), Docker (`ghcr.io/daften/fireflyiii-mcp:nightly`), and a GitHub pre-release. Release and nightly share one workflow file so they share the single npm trusted-publisher (OIDC) configuration. Default installs (`@latest` / `:latest`) are never affected. Install unreleased changes via `@daften/fireflyiii-mcp@nightly`.

### Security
- Upgraded the docs toolchain from `vitepress@1.6.4` to `vitepress@2.0.0-alpha.17`, which moves the docs build onto Vite 7. This resolves two Dependabot alerts in `devDependencies`: a path-traversal in Vite's optimized-deps `.map` handling (`vite ≤6.4.1`) and an esbuild dev-server request issue (`esbuild ≤0.24.2`). vitepress 2 is still pre-release but is required to reach a Vite version compatible with the patched esbuild; the version is pinned exactly and the docs build is verified.
- Pinned `esbuild` to `^0.28.1` across the whole `devDependencies` tree via an `overrides` entry, closing the remaining two Dependabot alerts: a high-severity binary-integrity / RCE-via-`NPM_CONFIG_REGISTRY` issue (`esbuild <0.28.1`) and a Windows dev-server file-read issue (`esbuild ≥0.27.3 <0.28.1`). `npm audit` now reports 0 vulnerabilities. The override only takes effect once on Vite 7 (above), since esbuild 0.28.1 is incompatible with the Vite 5 that vitepress 1.x used.

## [0.2.1] - 2026-06-11

### Added
- Test coverage reporting via `@vitest/coverage-v8`: new `npm run test:coverage` script, and CI posts a sticky coverage comment on every PR (via `vitest-coverage-report-action`, Node 22 job) in addition to the log summary.

### Docs
- New VitePress documentation site published to GitHub Pages, with guides (stdio, HTTP/OAuth, Docker, git checkout), reference pages (tools, filtering, autocomplete, env vars), and contributing pages. The README is slimmed to a quickstart that links to the site.
- New "Architecture at a glance" diagram in AGENTS.md showing the path from MCP client through transports, tool registration, the HTTP client, and the transform layer to the Firefly III API.
- README now states the Node.js 20+ requirement next to the setup options table.
- Export tool descriptions mention the `text/csv` output format.

### Fixed
- `trigger_rule` and `trigger_rule_group` no longer fail with HTTP 415. They sent a bodyless POST, so the client omitted the `Content-Type: application/json` header and Firefly III rejected the request. They now send an empty `{}` JSON body (trigger parameters are read from the query string), matching the other parameterless POST tools. _Contributed by [@carmelom](https://github.com/carmelom) in [#20](https://github.com/daften/fireflyiii-mcp/pull/20)._

### Changed
- Tool handlers are now fully type-safe: `defineTool`/`defineContentTool` infer handler argument types from the tool's Zod `inputSchema`, removing ~200 `as` casts across all tool files. Biome's `noExplicitAny` rule is re-enabled, and the `@modelcontextprotocol/sdk` minimum is raised to `^1.29.0` (already required by the lockfile) for its zod v4-aware types. No runtime behavior change.

## [0.2.0] - 2026-05-30

### Added
- Nightly integration tests run automatically against a live Firefly III instance (latest release) via GitHub Actions, covering the transform layer, six tool groups (accounts, transactions, budgets, categories, currencies, tags, summary), and full account and transaction CRUD cycles.
- [Experimental] Add autocompletion support for account, budget, and category parameters using the MCP Completion API. Note: Standard tool argument completions are not supported by the MCP specification directly, so this is implemented via native Prompts (`category-transactions`, `account-transactions`, `budget-transactions`). This is supported primarily by clients that support Prompt argument autocomplete (such as Claude Code) and may not function in other MCP clients. Suggestions are cached in memory (60s TTL) and scoped per authenticated user, so the cache is safe under multi-user HTTP/OAuth deployments. Set `FIREFLY_DEBUG=true` for verbose autocomplete tracing on stderr.
- Support tool presets, group filters, and read-only mode via environment variables (`MCP_PRESET`, `MCP_GROUPS`, `MCP_READ_ONLY`).

### Fixed
- `create_account` now accepts `account_role`, which Firefly III requires when creating asset accounts.
- `download_attachment` no longer corrupts binary files (PDFs, images): content is read as raw bytes and Base64-encoded instead of decoded as UTF-8 text. Images are now returned as a native MCP image block (rendered by the client); other files as their filename, MIME type, and Base64 content.

## [0.1.1] - 2026-05-23

### Fixed
- Insight filter query params now use clean keys (brackets stripped from `[]`-suffixed params).
- OAuth metadata `issuer` now correctly reflects `baseUrl` per RFC 8414.

### Security
- Base Docker image upgraded from `node:20-alpine` to `node:24-alpine`, resolving 11 HIGH CVEs.
- `GITHUB_TOKEN` permissions restricted to least-privilege across all GitHub Actions workflows.

### Docs
- Fixed OAuth client field name ("Keep a secret?") in README.
- Fixed Firefly III navigation path for Personal Access Tokens and OAuth clients in README.

## [0.1.0] - 2026-05-23

### Added
- Initial release of the MCP server for Firefly III.
- 140 tools across 14 groups: accounts, transactions, budgets, categories, bills, piggy banks, reports (tags + insights), automation rules, recurring transactions, attachments, currencies, data exports, object groups, transaction links.
- Two transports: stdio (Personal Access Token auth) and HTTP (OAuth 2.0 + PKCE with a built-in proxy for redirect-URI substitution).
- Tool filtering via `--preset`, `--groups`, and `--read-only` CLI flags. Presets: `minimal`, `default`, `budgeting`, `insights`, `automation`, `full`.
- Published as the `@daften/fireflyiii-mcp` npm package and the `ghcr.io/daften/fireflyiii-mcp` multi-arch Docker image (linux/amd64, linux/arm64).
- npm publish provenance via GitHub OIDC.
- GitHub Release auto-created from the tag annotation on each `v*` tag push.

[Unreleased]: https://github.com/daften/fireflyiii-mcp/compare/v0.3.4...HEAD
[0.3.4]: https://github.com/daften/fireflyiii-mcp/compare/v0.3.3...v0.3.4
[0.3.3]: https://github.com/daften/fireflyiii-mcp/compare/v0.3.2...v0.3.3
[0.3.2]: https://github.com/daften/fireflyiii-mcp/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/daften/fireflyiii-mcp/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/daften/fireflyiii-mcp/compare/v0.2.2...v0.3.0
[0.2.2]: https://github.com/daften/fireflyiii-mcp/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/daften/fireflyiii-mcp/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/daften/fireflyiii-mcp/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/daften/fireflyiii-mcp/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/daften/fireflyiii-mcp/releases/tag/v0.1.0
