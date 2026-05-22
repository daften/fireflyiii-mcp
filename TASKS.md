# Quality Improvement Tasks

Derived from the 2026-05-22 repository audit. Items are grouped by priority. Each task is self-contained: file paths, current behavior, proposed change, and acceptance criteria.

**Completed:** P0 (security fixes), P1 (CI/release hygiene), P2 (documentation), P3 (code quality), P5 (nice to haves).

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

## Execution order

1. **P4 items** as separate PRs (each is independent).

Skip anything that no longer makes sense — the audit was a snapshot.
