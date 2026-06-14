# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
- `trigger_rule` and `trigger_rule_group` no longer fail with HTTP 415. They sent a bodyless POST, so the client omitted the `Content-Type: application/json` header and Firefly III rejected the request. They now send an empty `{}` JSON body (trigger parameters are read from the query string), matching the other parameterless POST tools.

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

[Unreleased]: https://github.com/daften/fireflyiii-mcp/compare/v0.2.1...HEAD
[0.2.1]: https://github.com/daften/fireflyiii-mcp/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/daften/fireflyiii-mcp/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/daften/fireflyiii-mcp/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/daften/fireflyiii-mcp/releases/tag/v0.1.0
