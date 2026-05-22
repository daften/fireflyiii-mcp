# Quality Improvement Tasks

Derived from the 2026-05-22 repository audit. Items are grouped by priority. Each task is self-contained: file paths, current behavior, proposed change, and acceptance criteria.

**Completed:** P0 (security fixes), P1 (CI/release hygiene), P2 (documentation).

---

## P3 — Code quality & maintainability

### P3-1. Extract a `defineTool` helper to eliminate try/catch boilerplate

**Where:** Every file under `src/tools/`. ~140 instances of the pattern.

**Current:** Every tool handler is shaped like:
```ts
async (params) => {
  try {
    const result = await fetchXxx(client, params);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
  }
}
```

**Change:**
- Add `src/tools/_helpers.ts` with:
  ```ts
  export function defineTool<Args, Result>(
    server: McpServer,
    name: string,
    config: ToolConfig<Args>,
    fetch: (args: Args) => Promise<Result>,
  ): void {
    server.registerTool(name, config, async (args) => {
      try {
        const result = await fetch(args as Args);
        return {
          content: [{
            type: 'text' as const,
            text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
          }],
        };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    });
  }
  ```
- Migrate one tool file as a proof-of-concept (suggest `accounts.ts`), verify tests still pass, then convert the rest.
- Handle the string-return case for `export_*` and `download_attachment` tools so they don't double-encode CSV/raw text as JSON.

**Acceptance:**
- All existing tests pass without changes.
- LOC across `src/tools/*.ts` drops by ≥25%.
- One new test asserting `defineTool` wraps errors into `{ isError: true }`.

---

### P3-2. Lift annotation constants into a shared module

**Where:** Every file under `src/tools/` defines the same four `as const` blocks (`READ_ANNOTATIONS`, `WRITE_ANNOTATIONS`, `UPDATE_ANNOTATIONS`, `DELETE_ANNOTATIONS`).

**Change:** Move to `src/tools/_annotations.ts` and import everywhere.

**Acceptance:** No tool file declares these constants locally; tests still pass.

---

### P3-3. Fix `makeReadOnlyProxy` `this`-binding footgun

**Where:** `src/tools/index.ts:58-71`.

**Current:**
```ts
function makeReadOnlyProxy(server: McpServer): McpServer {
  return new Proxy(server, {
    get(target, prop) {
      if (prop === 'registerTool') { /* ... */ }
      return (target as unknown as Record<string | symbol, unknown>)[prop];
    },
  });
}
```
Non-`registerTool` methods are returned unbound. If the SDK ever calls a method on the proxy that depends on `this`, it breaks.

**Change:**
```ts
get(target, prop) {
  if (prop === 'registerTool') { /* unchanged */ }
  const v = (target as unknown as Record<string | symbol, unknown>)[prop];
  return typeof v === 'function' ? (v as Function).bind(target) : v;
}
```

**Acceptance:** Existing tests pass; add one test that calls a non-`registerTool` method on the proxy and asserts it behaves identically to calling it on the underlying server.

---

### P3-4. Shared `dateSchema` for YYYY-MM-DD inputs

**Where:** Every tool with date params (transactions, budgets, reports, exports, recurring, etc.) — search `z.string().*describe.*YYYY-MM-DD`.

**Change:**
- Add to `src/tools/_helpers.ts`:
  ```ts
  export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');
  ```
- Replace `z.string().describe('Start date (YYYY-MM-DD)')` with `dateSchema.describe('Start date (YYYY-MM-DD)')` everywhere.

**Acceptance:** Sending `"2026/01/01"` to any date param surfaces a Zod validation error before the request reaches Firefly III. Add one new test.

---

### P3-5. Decide on `dist/` policy

**Resolved:** Option B was implemented — `dist/` is now gitignored and not committed.

**Change:** Dropped `dist/` from git by adding it to `.gitignore`. Documentation in CONTRIBUTING.md, CLAUDE.md, and README.md has been updated to reflect that `npm run build` is a required step before running or testing source changes. The npm package relies on `prepublishOnly` for building during publication.

**Acceptance:** README and CLAUDE.md reflect the choice, CI prevents drift, and CONTRIBUTING.md documents the new workflow.

---

### P3-6. Generate or downgrade rule trigger/action enums

**Where:** `src/tools/rules.ts:208-228`.

**Current:** Two hand-maintained `z.enum([...])` lists for rule trigger and action types. Firefly III evolves these; the list will go stale silently.

**Change:** Either
- Replace both with `z.string().describe('Common values: ...')` (lose IDE autocompletion, gain forward-compat), OR
- Add a script (`scripts/sync-rule-enums.ts`) that fetches the OpenAPI YAML and regenerates the enums into a generated file. Document running it in CONTRIBUTING.md.

**Acceptance:** Either approach documented; tests pass.

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
