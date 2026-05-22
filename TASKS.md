# Quality Improvement Tasks

Derived from the 2026-05-22 repository audit. Items are grouped by priority. Each task is self-contained: file paths, current behavior, proposed change, and acceptance criteria.

**Completed:** P0 (security fixes), P1 (CI/release hygiene), P2 (documentation), P3 (code quality).

---

## P3 — Code quality & maintainability ✓ Done

All six P3 items completed 2026-05-22.

- **P3-1:** `defineTool` helper extracted to `src/tools/_helpers.ts`; all 14 tool files migrated (~140 boilerplate try/catch blocks eliminated). String passthrough handles `export_*` and `download_attachment`.
- **P3-2:** Annotation constants lifted to `src/tools/_annotations.ts`; no tool file declares them locally.
- **P3-3:** `makeReadOnlyProxy` `get` trap now binds non-`registerTool` functions to `target` before returning. New test in `tool-filter.test.ts` verifies the binding.
- **P3-4:** `dateSchema` added to `_helpers.ts`; applied to all YYYY-MM-DD params across all 14 tool files.
- **P3-5:** `dist/` dropped from git (Option B). Added to `.gitignore`, `git rm -r --cached dist/` run. `README.md`, `CLAUDE.md`, `CONTRIBUTING.md` updated.
- **P3-6:** `triggerTypeSchema` and `actionTypeSchema` in `rules.ts` replaced with `z.string().describe(...)` listing common values.

---

## P4 — Tests

### P4-1. Add handler-level smoke tests per tool group

**Where:** New helper in `src/tests/_helpers.ts`, augmenting each existing tool test file.

**Current:** Tool tests exercise the `fetchXxx` functions directly. The actual MCP handler — the one inside `server.registerTool(...)` — is never invoked. A wrong content shape from a handler would not be caught.

**Change:**
- Build a mock `McpServer` that captures the handler alongside the name.
- For each tool group's test file, add a "handler smoke" describe block that:
  1. Calls `registerXxxTools(mockServer, mockClient)`.
  2. Invokes the captured handler with valid args.
  3. Asserts the return shape is `{ content: [{ type: 'text', text: ... }] }` (or `{ isError: true }` on a forced failure).

**Acceptance:** Each tool group has at least one handler-level test; total test count grows by ≥14.

---

### P4-2. Tests for `startHttpServer` port-bump and `EADDRINUSE` paths

**Where:** New tests in `src/tests/http.test.ts`.

**Change:** Mock `http.createServer().listen` to throw `EADDRINUSE` once then succeed; assert the server picks the next port and logs the move. Mock 10 consecutive `EADDRINUSE`s; assert exit code 1.

**Acceptance:** Both paths covered; refactor `startHttpServer` if needed to make it testable without binding real ports (e.g., inject the `tryListen` function).

---

### P4-3. `formatError` test for 400 with parseable JSON body

**Where:** `src/tests/client.test.ts`, in the `formatError` describe block.

**Current:** The 422 branch (`src/client.ts:19-32`) parses `errors` and produces a field-level message. The 400 branch (line 16) returns a generic message even when the body is parseable JSON with `errors`.

**Change:**
- Decide whether 400 should mirror 422's parsing (probably yes — Firefly III returns the same shape).
- Update `formatError` accordingly.
- Add a test that constructs a `FireflyError(400, url, JSON.stringify({errors: {field: ['msg']}}))` and asserts the formatted message includes the field name.

**Acceptance:** New test passes; existing 400 test still passes (may need an update if the message format changes).

---

### P4-4. Nightly integration test in CI

**Where:** New `.github/workflows/nightly.yml`.

**Change:** Run a `docker compose up` with a Firefly III instance and a seeded database (Firefly III publishes a test image), then run `FIREFLY_INTEGRATION=true npm run test:integration` against it. Schedule via cron.

**Acceptance:** Workflow runs nightly; failures notify via GitHub's default mechanism.

---

## P5 — Nice to haves

### P5-1. Add a `HEALTHCHECK` to the Dockerfile

**Where:** `Dockerfile`.

**Change:**
```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/.well-known/oauth-authorization-server || exit 1
```
(Use `wget` because `alpine` includes it; `curl` requires an extra install.)

**Acceptance:** `docker inspect` shows the healthcheck; container reports `healthy` after a few seconds.

---

### P5-2. `env_file: .env` in `docker-compose.yml`

**Where:** `docker-compose.yml:6-10`.

**Change:** Add `env_file: .env` so users can drop a local `.env` instead of exporting variables. Keep the `environment:` block as documentation of required keys.

**Acceptance:** `docker compose up` works with only a `.env` file present.

---

### P5-3. Document the single-replica OAuth constraint in README (or fix it)

**Where:** `README.md` Docker section.

**Current:** OAuth state lives in an in-process `Map`. Horizontal scaling breaks the auth flow. CLAUDE.md mentions it but users reading the Docker README won't see it.

**Change:** Either
- Add a "Note: single replica only — OAuth state is in-process" callout to the Docker README section, OR
- Store the pending state in a signed cookie / JWT keyed by `state`, eliminating server-side state entirely. (Deeper refactor; lift to its own design doc if pursued.)

**Acceptance:** README warns clearly, or multi-replica deploys work.

---

### P5-4. Scrub URLs from `FireflyError.message`

**Where:** `src/client.ts:8-11`.

**Current:**
```ts
super(`Firefly III API error ${status} at ${url}: ${body}`);
```
Auth is in headers today, but any future tool that puts secrets in query params would leak them through `formatError` and into MCP tool responses (and logs).

**Change:** Strip query string from `url` before interpolating: `const safeUrl = url.split('?')[0]`.

**Acceptance:** New test in `src/tests/client.test.ts` confirming query strings are not present in the error message.

---

## Execution order

1. **P3-1 + P3-2** as a refactor PR — `defineTool` migration is mechanical but touches many files, so isolate.
2. **P3-3, P3-4, P3-5, P3-6** as individual smaller PRs.
3. **P4 batch** as separate PRs per item (each is independent).
4. **P5 items** as opportunistic cleanup.

Skip anything that no longer makes sense — the audit was a snapshot.
