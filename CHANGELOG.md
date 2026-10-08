# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `object_group_title` on `create_bill`, `update_bill`, `create_piggy_bank` and `update_piggy_bank`. Firefly III has no API to create an object group; setting a new title is how one gets created. ([#117](https://github.com/daften/fireflyiii-mcp/issues/117))
- `create_rule` / `update_rule` accept the `manual-activation` trigger (a rule that only runs through `trigger_rule` / `trigger_rule_group`). ([#117](https://github.com/daften/fireflyiii-mcp/issues/117))
- A contract test (`src/tests/firefly-contract.test.ts`) that calls every tool and checks each request's method and path against snapshots of Firefly III's route table for v6.4.0 and v6.7.7 (`scripts/update-firefly-routes.mjs` refreshes them), plus live integration tests for every request shape fixed below. ([#117](https://github.com/daften/fireflyiii-mcp/issues/117))

### Changed

- Deduped six maintainability items flagged in the v0.4.6..develop pre-release review (#103): `get_transactions`' account-scoped delegation and `get_account_transactions` now share one query-builder helper; `create_account` and `update_account` now share one `liabilityFields()` schema factory instead of repeating the six-field liability block; the OAuth pending-flow expiry check in `src/http.ts` is defined once and used by both the periodic sweep and the read-time check; `GROUP_ID_HINT` and `groupIdField` in `transactions.ts` now derive from one shared warning fragment instead of two independently-worded copies; and `exports.ts`'s dated/undated tool variants are now registered through a single `defineTool` call instead of two near-identical branches. No behavior change to any tool's request/response shape or validation.
- **Breaking:** `update_budget_limit` and `delete_budget_limit` take the limit's `budget_id`, since Firefly III only routes budget-limit writes under their budget. ([#117](https://github.com/daften/fireflyiii-mcp/issues/117))
- **Breaking:** `create_piggy_bank` takes `accounts` (or the `account_id` shortcut), `target_amount` and `currency_code`, matching what Firefly III has required since v6.2.0; `start_date` defaults to today. `update_piggy_bank` replaces its ignored `account_id` with `accounts`, merged over the existing links so accounts you don't mention keep their link and saved amount (Firefly III itself would unlink them). Set `accounts[].current_amount` to put money in or take it out. ([#117](https://github.com/daften/fireflyiii-mcp/issues/117))
- **Breaking:** `create_split_transaction` requires `group_title`, which Firefly III rejects a multi-split transaction without. ([#117](https://github.com/daften/fireflyiii-mcp/issues/117))
- `get_net_worth_summary` now reads the net-worth entries of `/summary/basic`; Firefly III v1 has no net-worth endpoint. ([#117](https://github.com/daften/fireflyiii-mcp/issues/117))
- The documented minimum Firefly III version is now v6.4.0, the oldest release that serves every route the tools call. ([#117](https://github.com/daften/fireflyiii-mcp/issues/117))
- **Breaking:** unrecognized command-line arguments are now an error instead of being skipped. A typo of `--read-only` (`--readonly`, `--read_only`) used to start the server with full write access and no warning; it now stops with "Did you mean --read-only?". Value flags without a value, a non-numeric `--port` and an empty `--groups` are errors too, and value flags also accept `--flag=value`. ([#118](https://github.com/daften/fireflyiii-mcp/issues/118))
- **Breaking:** `MCP_READ_ONLY` accepts `true`/`1` (on) and `false`/`0`/empty (off); any other value is now an error rather than silently meaning "off". ([#118](https://github.com/daften/fireflyiii-mcp/issues/118))
- `--read-only` now keeps every tool annotated `readOnlyHint: true` instead of selecting by name, so the `export_*` tools and `download_attachment` (all read-only) are no longer dropped: 84 tools instead of 74. A test keeps tool names and annotations consistent. ([#118](https://github.com/daften/fireflyiii-mcp/issues/118))
- `download_attachment` refuses images over 3 MiB and other files over 256 KiB (checked from the stored size before downloading, and again while streaming), and every `export_*` tool refuses CSV over 512 KiB, instead of returning arbitrarily large payloads into the model's context. ([#118](https://github.com/daften/fireflyiii-mcp/issues/118))
- Tool results are serialized as compact JSON. Indentation made a typical 50-row transaction page 38% larger for no benefit to the model. ([#118](https://github.com/daften/fireflyiii-mcp/issues/118))

### Removed

- `create_piggy_bank_event`, `delete_piggy_bank_event` and `create_object_group`, which called routes no Firefly III v6 release has ever had. Use `update_piggy_bank` (`accounts[].current_amount`) and an `object_group_title` on a bill or piggy bank instead. The server now has 137 tools. ([#117](https://github.com/daften/fireflyiii-mcp/issues/117))

### Fixed

- `createOAuthHandler`'s pending-flow eviction timer no longer starts unconditionally for the life of every handler instance. It now starts lazily, only once an OAuth flow is actually pending, and clears itself again once the pending-flow map drains — harmless in production (the handler is created once), but it was leaking one live interval per instantiation in the test suite, which creates the handler dozens of times per run.
- The Firefly III request timeout now also covers reading the response body. `fetch()` resolves once the headers arrive, so the 30-second timer used to be cleared before a large or stalled body (an attachment download, an export) was read, and such a call could hang indefinitely. The timeout message no longer includes the URL's query string. ([#116](https://github.com/daften/fireflyiii-mcp/issues/116))
- The autocomplete cache now sweeps expired entries and holds at most 256 identities. In HTTP mode every refreshed OAuth token is a new cache key, so a long-running server used to keep one stale entry (up to 1,000 records) per token it had ever seen. ([#116](https://github.com/daften/fireflyiii-mcp/issues/116))
- A 401 from Firefly III no longer tells HTTP-mode users to check `FIREFLY_TOKEN`, which HTTP mode never reads; the message now covers both transports. ([#116](https://github.com/daften/fireflyiii-mcp/issues/116))
- **`update_transaction` no longer destroys split transactions.** It sent its fields as a single `transactions[]` entry without a `transaction_journal_id`, which Firefly III treats as a new split, then deletes every split the request didn't mention: on a two-split group, an amount/description/account update replaced both splits with one, and a category-only update silently did nothing while reporting success. It now re-reads the group and sends every split by ID, changing only the chosen one; `transaction_journal_id` picks the split and is required when there are several. A type change applies to every split, as Firefly requires. ([#117](https://github.com/daften/fireflyiii-mcp/issues/117))
- `bulk_update_transactions` never worked: Firefly III's `/data/bulk/transactions` only moves transactions between accounts and rejected (with a 500) the search-query payload the tool sent. It is now done client-side: search, re-read each matched group, and change only the matched splits (search returns partial groups, so sending them back as-is would delete the rest). It refuses to change anything when the query matches more than `max_transactions` (default 50). ([#117](https://github.com/daften/fireflyiii-mcp/issues/117))
- `update_budget_limit`, `delete_budget_limit` and `get_net_worth_summary` called routes that do not exist (404 on every call). ([#117](https://github.com/daften/fireflyiii-mcp/issues/117))
- The account filters of `get_insight_expenses_by_asset`, `get_insight_income_by_asset`, `get_insight_transfers_by_asset` and `get_insight_income_by_revenue` were silently ignored: they were sent as `assets[]` / `revenue[]`, but Firefly III only reads `accounts[]`, so filtered calls returned the unfiltered totals. ([#117](https://github.com/daften/fireflyiii-mcp/issues/117))
- `download_attachment` never returned an image as an image block against a real Firefly III: Firefly serves every download as `application/octet-stream`, so the tool's image check never matched. It now takes the type (and file name) from the attachment's metadata. ([#118](https://github.com/daften/fireflyiii-mcp/issues/118))
- Dated `export_*` calls returned Firefly III's HTML home page as if it were CSV. Firefly answers a rejected non-JSON request with a 302 to its home page, and the client followed it. The client now never follows redirects (a 3xx is reported as an error) and asks for JSON on text and binary requests, so Firefly's actual validation message comes back; the export tools also require `start` and `end` together. ([#118](https://github.com/daften/fireflyiii-mcp/issues/118))
- `--preset toString` (or any other name inherited from `Object.prototype`) passed validation and then crashed tool registration; in HTTP mode `/health` stayed green while every MCP request failed. ([#118](https://github.com/daften/fireflyiii-mcp/issues/118))

### Security

- HTTP transport: `/oauth/register` and `/oauth/token` read request bodies with no size limit, so a single unauthenticated ~600 MB POST crashed the server (`RangeError: Invalid string length`) in OAuth mode. OAuth request bodies over 64 KiB are now rejected with `413`. MCP requests are capped at 16 MiB (room for `upload_attachment` payloads of about 12 MB) instead of being buffered in full, which let any caller with any Bearer string make the server hold arbitrarily large bodies in memory. ([#116](https://github.com/daften/fireflyiii-mcp/issues/116))
- `MCP_ALLOWED_REDIRECT_PREFIXES` entries are now compared in canonical form. A prefix spelled non-canonically (`https://Example.com`, an explicit `:443`, an IDN) fell back to a raw string-prefix match, so `https://Example.com` also admitted `https://Example.com.attacker.test/...`. A redirect URI must now share the entry's parsed origin and start with its normalized URL; the trailing-colon form (`http://192.168.1.10:`) explicitly means "this scheme and host, any port". ([#116](https://github.com/daften/fireflyiii-mcp/issues/116))
- At most 1,000 OAuth flows can be pending at once (the oldest is dropped beyond that), so unauthenticated `/oauth/authorize` traffic can no longer grow the pending-flow map without bound. ([#116](https://github.com/daften/fireflyiii-mcp/issues/116))
- The Docker image now runs the server as the unprivileged `node` user instead of root. ([#116](https://github.com/daften/fireflyiii-mcp/issues/116))
- Tool ID arguments could address other resources: `parseId` passed non-numeric input through, and `new URL()` resolves dot segments, so `delete_account` with id `../budgets/5` sent `DELETE /api/v1/budgets/5`, and enough `../` left `/api/v1` with the token attached. Under prompt injection this let an enabled tool act outside the groups selected with `--preset`/`--groups`. Every path ID is now validated as a number (`idSchema`, a strict `parseId`), other path segments are percent-encoded, and `FireflyClient` refuses any API path containing dot segments (including `%2e%2e`), `?`, `#`, backslashes or control characters. ([#118](https://github.com/daften/fireflyiii-mcp/issues/118))

## [0.5.2] - 2026-09-29

### Security

- chore(deps): Bump ip-address from 10.4.0 to 10.7.2 in the security-fixes group across 1 directory (automated security release)

## [0.5.1] - 2026-09-29

### Security

- chore(deps): Bump ip-address from 10.4.0 to 10.7.2 in the security-fixes group across 1 directory (automated security release)

## [0.5.0] - 2026-09-13

### Added

- `scripts/changelog-guard.mjs`, which fails the build when `CHANGELOG.md`'s `merge=union` driver has resolved a merge cleanly but wrongly, or when a real three-way merge (two releases landing on `main` at once) interleaves two dated sections. Union keeps both sides of a conflicting hunk by concatenating lines, with no notion of which release section a bullet belongs to, so it can splice a stale branch's entries into an already-published section, absorb pending `[Unreleased]` entries into the release that just shipped (emptying `[Unreleased]` in the process), or leave two `### Fixed` headings in one section — all reported by git as a clean merge. The guard treats released sections as immutable (compared against the newest prior tag, or against `origin/main` in `backmerge.yml` before it pushes), requires dated sections in strictly descending version order, and rejects a repeated `[label]:` link definition. Deliberate edits to a published section are exempted per-version via `scripts/changelog-guard-allowed-edits.json`, checked in alongside the edit's PR, rather than a PR-title skip that only silences that one run. Runs on pull requests, on pushes (back-merges reach `develop` without a PR), inside `backmerge.yml` itself before it pushes, and again before publishing.
- `create_account` and `update_account` now also accept the rest of Firefly III's liability terms: `liability_amount`, `liability_start_date`, `interest`, and `interest_period`. Without them a liability could be created but not given the balance and interest terms that make it useful, and there was no way to correct them afterwards. `interest_period` deliberately offers six periods on create and only `daily`/`monthly`/`yearly` on update, because Firefly III validates the two endpoints against different lists.

### Changed

- Tool handlers are now fully type-safe: `defineTool` and `defineContentTool` infer their handler's argument types from the tool's Zod `inputSchema`, which removed ~190 `as string` / `as number` / `as Parameters<...>[n]` casts across all 14 tool group files and both `(server as any).registerTool` workarounds. Biome's `noExplicitAny` rule is enforced again as a result. The `@modelcontextprotocol/sdk` floor is raised to `^1.29.0` for its zod v4-aware compat types, which the new generics rely on; the lockfile already resolved past it. No runtime behaviour change — 13 of the 15 tool modules compile to byte-identical JavaScript, and the two that do not are `_helpers.ts` itself and `exports.ts`, which now builds its date-filtered and parameterless variants from statically known schemas instead of a mutated schema record.
- **Node.js 22.12 is now the minimum supported version** (was 20). Node 20 reached end-of-life in April 2026, and Vitest 5 — the test runner this repo builds on — requires `^22.12.0 || ^24.0.0 || >=26.0.0`. `engines.node` is now `>=22.12.0`, so npm warns Node 20 users on install. The published server has no Node-20-specific code, but 20 is no longer tested and is no longer supported.
- Update Vitest and `@vitest/coverage-v8` to 5.0.0. No test or source changes were needed: the suite uses no removed API (`sequential`, `test.for`, `expect.poll`, deprecated `vitest/*` entry points) and builds its mocks per test, so v5's clear-mocks-by-default has no effect. Coverage still writes `coverage/coverage-summary.json`, so the PR coverage comment is unaffected.
- CI's test matrix is now Node 22, 24 and 26 (was 20, 22, 24). The coverage job stays on 22.
- Dependabot now groups `vitest` and `@vitest/*` into a single PR for *all* update types, majors included. They are version-locked on each other, so the previous config — which grouped only minor and patch — split major bumps into two PRs that each failed `npm ci` with `ERESOLVE`. Note this takes effect only once the config reaches `main`, which Dependabot reads it from.
- `get_transaction`, `create_transaction`, `update_transaction`, and `delete_transaction` now warn in their descriptions that update and delete take the transaction response's top-level group `id`, not the `transaction_journal_id` nested inside each item of its `transactions` array. The two are usually adjacent numbers, so passing the journal id silently edited or deleted a real but unrelated transaction instead of failing. It stays a warning rather than a check because nothing at write time can tell a group id from a journal id. _Contributed by [@lesha198a](https://github.com/lesha198a) in [#77](https://github.com/daften/fireflyiii-mcp/pull/77)._
- Every tool field that takes a category *name* — `name` on `create_category`/`update_category` and `category_name` on `create_transaction`, `update_transaction`, `create_split_transaction`, and `bulk_update_transactions` — now warns that Firefly III matches and stores the string verbatim. A name copied out of a rendered web page ("Restaurants &amp; cafés") silently becomes a second category next to the real "Restaurants & cafés", and the two render identically everywhere. Decoding entities on the way out was considered and rejected: it is lossy and cannot be turned off, so a category legitimately named "Restaurants &amp; cafés" would become unreachable. _Reported by [@lesha198a](https://github.com/lesha198a) in [#77](https://github.com/daften/fireflyiii-mcp/pull/77)._
- Releases are now cut on a short-lived `release/X.Y.Z` branch that reaches `main` as a single PR, instead of a promotion merge followed by a separate release commit on `main`. Since `backmerge.yml` runs on every push to `main`, the old shape back-merged twice per release; this shape does it once, puts the release commit through CI, and leaves `auto-release.yml` as the only thing committing directly to `main`. `backmerge.yml` itself now merges and pushes to `develop` directly, opening a PR only when the merge conflicts and needs manual resolution.
- `CHANGELOG.md` now has a `merge=union` driver (`.gitattributes`), so `develop`'s pending `[Unreleased]` entries and `main`'s freshly-cut dated release sections no longer conflict on every back-merge — git keeps both sides automatically instead of failing.

### Fixed

- The security-PR alert matcher now reports missing Dependabot metadata as such, before querying the alert API. An empty `updated-dependencies-json` previously reached a bare `JSON.parse` and failed a real security PR with `SyntaxError: "undefined" is not valid JSON`, which reads like a crash in the script rather than the missing metadata it is.
- Abandoned OAuth flows are now swept out of memory every 10 minutes instead of only when new authorize/callback traffic arrives. Lazy eviction already kept the map trimmed on a busy server, so this is about an idle one: a server that sees a burst of abandoned authorizations and then goes quiet used to hold those pending `redirect_uri` values indefinitely.
- Match Dependabot security alerts using both bare and equals-prefixed versions, check all grouped dependencies and alert pages, and distinguish API failures from unmatched advisories.
- Distinguish back-merge conflicts from other Git failures and retry rejected pushes only when `develop` actually moved. Allow manually retrying the back-merge workflow.
- `create_account` and `update_account` were missing `liability_type` and `liability_direction`, which the Firefly III API requires when `type` is `liability`. Creating or updating a debt/loan/mortgage account failed with a validation error and no way to supply the required fields. Both are now accepted as optional enums on both tools. _Contributed by [@lesha198a](https://github.com/lesha198a) in [#77](https://github.com/daften/fireflyiii-mcp/pull/77)._
- `update_account` described its liability fields as "required when type is liability", a condition it can never meet — the tool has no `type` field and never sends one. They now read "Only applies to liability accounts", so a model does not skip them expecting a `type` to trigger them.
- `get_transactions`' `accountId` filter now actually filters. Firefly III's `/transactions` endpoint has no `account_id` query parameter and silently ignores it, so every call returned the same unfiltered results for the date range regardless of which account was requested. `get_transactions` now delegates to `/accounts/{id}/transactions` (the endpoint `get_account_transactions` already uses) whenever `accountId` is passed.

## [0.4.6] - 2026-09-11

### Security

- chore(deps): update Vitest to patched 4.1.11 and fix CI install retries (automated security release)

### Security

- Update Vitest and its coverage plugin to 4.1.11 to pick up the patched mocker while retaining Node 20 support.

### Fixed

- Fail CI and nightly dependency installation when all retries fail, instead of continuing without the required tools.

## [0.4.5] - 2026-09-11

### Security

- chore(deps): Bump hono from 4.13.0 to 4.13.7 in the security-fixes group across 1 directory (automated security release)

## [0.4.4] - 2026-09-05

### Security

- chore(deps): Bump qs from 6.15.2 to 6.16.0 in the security-fixes group across 1 directory (automated security release)

### Fixed
- `auto-merge.yml` still never enabled auto-merge on Dependabot security PRs. `alert-lookup` was being passed the default `GITHUB_TOKEN`, which cannot read the Dependabot alerts API; `dependabot/fetch-metadata` reports that by returning an empty `alert-state` instead of failing, so the merge step's guard stayed false while the job reported success. The metadata step now uses the `RELEASE_TOKEN` PAT (which needs `Dependabot alerts: Read only`), and a new guard step fails the job outright when a `security-fixes`-group PR produces no `alert-state`, so an expired or under-scoped token can no longer masquerade as a passing check. ([#86](https://github.com/daften/fireflyiii-mcp/pull/86))

## [0.4.3] - 2026-09-03

### Security

- chore(deps): Bump fast-uri from 3.1.5 to 3.1.7 in the security-fixes group across 1 directory (automated security release)

## [0.4.2] - 2026-08-04

### Security

- chore(deps): Bump the security-fixes group across 1 directory with 2 updates (automated security release)

## [0.4.1] - 2026-08-04

### Security

- chore(deps): Bump ip-address from 10.2.0 to 10.4.0 in the security-fixes group across 1 directory (automated security release)

### Fixed
- `auto-merge.yml` never actually enabled auto-merge on Dependabot security PRs: the `dependabot/fetch-metadata` step omitted `alert-lookup: true`, so `alert-state` was always empty and the merge step's guard condition was never true. Added `alert-lookup: true` to populate it.

## [0.4.0] - 2026-08-02

### Added
- RFC 9728 protected resource metadata at `/.well-known/oauth-protected-resource`, and a `resource_metadata` pointer on the `401` challenge, so MCP clients can discover the authorization server without a legacy fallback probe.
- Transaction writes now accept a full date-time, not only a date. `create_transaction`, `update_transaction`, and `create_split_transaction` take either `YYYY-MM-DD` or an RFC 3339 date-time carrying an explicit timezone offset (e.g. `2026-08-02T14:30:00+02:00`), so the time of day survives into Firefly III instead of being dropped. Date-only values behave exactly as before. _Contributed by [@Itsakaseru](https://github.com/Itsakaseru) in [#61](https://github.com/daften/fireflyiii-mcp/pull/61)._
- Claude Desktop setup guide covering stdio, custom connectors, and the `mcp-remote` bridge.
- `MCP_ALLOWED_REDIRECT_PREFIXES` is now documented in the environment variable reference and `.env.example`.

### Changed
- Bumped the runtime `@modelcontextprotocol/sdk` dependency from 1.29.0 to 1.30.0.
- All pull requests now merge as merge commits — squash merging is no longer used anywhere, including Dependabot security auto-merges. Since the merge commit is authored by whoever merged rather than by Dependabot, `auto-release.yml` now recognises these merges by their `daften/dependabot/…` branch prefix and takes the changelog bullet from the merged PR's title. Automated `main` → `develop` back-merge PRs are merged directly rather than through auto-merge, which GitHub refuses on a branch that has no required status checks to wait for.
- Split development onto a `develop` integration branch: feature PRs and routine dependency updates target `develop` (which feeds the nightly channel), while `main` stays always-releasable. Dependabot security fixes on `main` now auto-merge and ship as automated patch releases; the PR dependency audit is now relative to the base branch, with the strict audit moved to the nightly workflow.

### Fixed
- Claude custom connectors could not complete OAuth: the redirect URI allow-list rejected `https://claude.ai/api/mcp/auth_callback` unless an undocumented environment variable was set. Both `https://claude.ai/api/mcp/auth_callback` and the `claude.com` equivalent are now allowed by default, matched exactly on origin and path, ahead of Anthropic's claude.ai → claude.com domain migration. ([#43](https://github.com/daften/fireflyiii-mcp/issues/43))
- `400 invalid_redirect_uri` responses now name `MCP_ALLOWED_REDIRECT_PREFIXES` so the override is discoverable.

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

[Unreleased]: https://github.com/daften/fireflyiii-mcp/compare/v0.5.2...HEAD
[0.5.2]: https://github.com/daften/fireflyiii-mcp/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/daften/fireflyiii-mcp/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/daften/fireflyiii-mcp/compare/v0.4.6...v0.5.0
[0.4.6]: https://github.com/daften/fireflyiii-mcp/compare/v0.4.5...v0.4.6
[0.4.5]: https://github.com/daften/fireflyiii-mcp/compare/v0.4.4...v0.4.5
[0.4.4]: https://github.com/daften/fireflyiii-mcp/compare/v0.4.3...v0.4.4
[0.4.3]: https://github.com/daften/fireflyiii-mcp/compare/v0.4.2...v0.4.3
[0.4.2]: https://github.com/daften/fireflyiii-mcp/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/daften/fireflyiii-mcp/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/daften/fireflyiii-mcp/compare/v0.3.4...v0.4.0
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
