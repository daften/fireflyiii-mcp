# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

### Changed

### Fixed

## [0.1.0] - 2026-05-23

### Added
- Initial release of the Firefly III MCP server.
- 140 tools across 14 groups: accounts, transactions, budgets, categories, bills, piggy banks, reports (tags + insights), automation rules, recurring transactions, attachments, currencies, data exports, object groups, transaction links.
- Two transports: stdio (Personal Access Token auth) and HTTP (OAuth 2.0 + PKCE with a built-in proxy for redirect-URI substitution).
- Tool filtering via `--preset`, `--groups`, and `--read-only` CLI flags. Presets: `minimal`, `default`, `budgeting`, `insights`, `automation`, `full`.
- Published as the `@daften/fireflyiii-mcp` npm package and the `ghcr.io/daften/fireflyiii-mcp` multi-arch Docker image (linux/amd64, linux/arm64).
- npm publish provenance via GitHub OIDC.
- GitHub Release auto-created from the tag annotation on each `v*` tag push.

[Unreleased]: https://github.com/daften/fireflyiii-mcp/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/daften/fireflyiii-mcp/releases/tag/v0.1.0
