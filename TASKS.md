# Quality Improvement Tasks

Derived from the 2026-05-22 repository audit. Items are grouped by priority. Each task is self-contained: file paths, current behavior, proposed change, and acceptance criteria.

---

## P0 — Security & correctness (fix before next release)

### P0-1. OAuth `pendingClientRedirectUri` is a singleton — concurrent flows collide

**Where:** `src/http.ts:27`, used at lines 56–72 (authorize), 76–102 (register), 128–141 (callback).

**Current:** A single module-level `let pendingClientRedirectUri: string | null = null` stores the MCP client's dynamic callback URL across the authorize → callback → token round trip. If two users start OAuth flows concurrently, user A's callback gets routed to user B's `redirect_uri`, leaking the authorization `code` to the wrong client.

**Change:**
- Replace the singleton with `Map<state, { redirectUri: string; createdAt: number }>`.
- Key entries by the `state` query param the MCP client provides on `/oauth/authorize` (already forwarded to Firefly III, will come back unchanged on `/oauth/callback`).
- On `/oauth/callback`, look up by `state` from the incoming query, forward `code`+`state` to the stored `redirectUri`, then delete the entry.
- Add TTL eviction (e.g., 10 min) on each insert/lookup to bound memory.
- For the `/oauth/register` path (no `state` yet), either store under a synthetic key tied to the registration response and require the client to use `state` on the subsequent `/authorize`, or document that registration must precede authorize within the same flow.

**Acceptance:**
- New unit tests in `src/tests/http.test.ts`:
  - Two interleaved authorize → callback pairs with different `state` route to the correct redirect URI each time.
  - Callback with unknown `state` returns 400.
  - Entries older than the TTL are not honored.

---

### P0-2. No redirect-URI validation on registration

**Where:** `src/http.ts:76-102` (registration handler), specifically the trust of `redirectUris[0]` at line 88.

**Current:** Whatever a client posts in `redirect_uris[0]` is stored as the eventual callback target. Combined with P0-1, this is an open-redirect / auth-code-exfiltration path.

**Change:**
- Define an allow-list: `http://127.0.0.1:*`, `http://localhost:*` (loopback always OK), plus any prefix configured via a new env var `MCP_ALLOWED_REDIRECT_PREFIXES` (comma-separated).
- Reject (`400 invalid_redirect_uri`) any registration whose first redirect URI does not match.
- Apply the same check on `/oauth/authorize` when storing `clientRedirectUri`.

**Acceptance:**
- Unit test: registration with `http://evil.example.com/cb` returns 400.
- Unit test: registration with `http://127.0.0.1:54321/cb` returns 201.
- Unit test: with `MCP_ALLOWED_REDIRECT_PREFIXES=https://claude.ai`, registration with `https://claude.ai/api/mcp/cb` returns 201.

---

### P0-3. Host-header spoofing when `MCP_BASE_URL` is unset

**Where:** `src/http.ts:30-32`.

**Current:**
```ts
const baseUrl =
  (process.env['MCP_BASE_URL']?.trim().replace(/\/$/, '') || null) ??
  `http://${req.headers['host'] ?? '127.0.0.1:3000'}`;
```
A server bound to `0.0.0.0` without `MCP_BASE_URL` will use whatever `Host:` header the client sends — an attacker can seed the OAuth flow with their own callback origin.

**Change:**
- In `startHttpServer`, if `host === '0.0.0.0'` (or any non-loopback bind) AND `MCP_BASE_URL` is unset, **exit with a hard error** explaining why `MCP_BASE_URL` is required for non-loopback deployments.
- If bound to loopback (`127.0.0.1`/`::1`) and `MCP_BASE_URL` is unset, keep the current fallback but write a warning to stderr.

**Acceptance:**
- Manual: `--host 0.0.0.0` without `MCP_BASE_URL` exits 1 with a clear message.
- Manual: `--host 127.0.0.1` without `MCP_BASE_URL` starts with a warning.
- Add a unit test for the host-classification helper if one is extracted.

---

### P0-4. No timeout on the OAuth token-proxy `fetch`

**Where:** `src/http.ts:113-117`.

**Current:** `await fetch(\`${fireflyUrl}/oauth/token\`, ...)` has no `signal` — a slow or hanging Firefly III pins the request thread indefinitely. `FireflyClient` already wraps `fetch` in a 30s `AbortController` (`src/client.ts:67-86`).

**Change:**
- Extract the timeout pattern from `FireflyClient.rawFetch` into a small helper (e.g., `fetchWithTimeout(url, init, timeoutMs = 30_000)`), OR
- Inline an `AbortController` with `setTimeout(() => controller.abort(), 30_000)` in `http.ts`.
- On abort, return HTTP 504 to the MCP client with a JSON `{ error: "timeout" }` body.

**Acceptance:**
- Unit test that stubs `fetch` to never resolve and asserts the token endpoint returns 504 within timeout + epsilon.

---

### P0-5. Verify `bulk_update_transactions` request shape against the OpenAPI spec

**Where:** `src/tools/transactions.ts:123-128`, registered at `367-388`.

**Current:**
```ts
return client.post('/data/bulk/transactions', params);
```
where `params` is `{ query, category_name?, budget_id?, tags?, notes? }`. Per the Firefly III OpenAPI spec, `/data/bulk/transactions` expects a single `query` field whose value is a **JSON-encoded `{ "where": {...}, "update": {...} }`** — not the keyed fields the tool currently sends.

**Change:**
1. Fetch the spec: `curl -s "https://api-docs.firefly-iii.org/firefly-iii-6.5.5-v1.yaml" -A "Mozilla/5.0" | grep -A 60 "/data/bulk/transactions"`.
2. If the spec confirms the JSON-encoded shape, rebuild the body:
   ```ts
   const body = {
     query: JSON.stringify({
       where: { /* parse from params.query */ },
       update: { category_name, budget_id, tags, notes },
     }),
   };
   ```
3. Update the tool description and Zod schema to match the real API.
4. If the spec disagrees with both interpretations, document what it actually accepts.

**Acceptance:**
- Updated unit test in `src/tests/transactions.test.ts` asserting the exact body shape per the spec.
- Manual: run against a live instance via `npm run test:integration` (extend if needed).

---

## P1 — CI / release hygiene

### P1-1. Add a CI workflow that runs tests on every PR and push to `main`

**Where:** New file `.github/workflows/ci.yml`.

**Current:** Only `.github/workflows/publish.yml` exists, runs only on `v*` tags, runs no tests. A broken commit can ship to npm and ghcr.

**Change:** Create `.github/workflows/ci.yml`:
```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npx tsc --noEmit
      - run: npm test
```

**Acceptance:**
- A failing test on a PR blocks the merge button (after enabling branch protection — note this in the PR description, the user does that step manually).

---

### P1-2. Gate publish on CI passing

**Where:** `.github/workflows/publish.yml`.

**Current:** `publish-npm` and `publish-docker` run on `v*` tags without verifying tests.

**Change:** Either
- Add a `test` job inside `publish.yml` and make both publish jobs `needs: test`, OR
- Use `workflow_run` to require the `CI` workflow on the tag commit before allowing publish.

The first is simpler and recommended.

**Acceptance:** Pushing a tag whose commit has failing tests does not produce an npm or Docker release.

---

### P1-3. Bump Dockerfile to Node 20 (or 22)

**Where:** `Dockerfile:2`, `Dockerfile:10` (both `FROM node:18-alpine`).

**Current:** Node 18 is in maintenance / nearing EOL.

**Change:**
- Switch both stages to `node:22-alpine` (current LTS) or `node:20-alpine`.
- Bump `engines.node` in `package.json:50` to match (`>=20`).
- Update CI `setup-node` to the same major.

**Acceptance:**
- `docker build .` succeeds.
- `docker run --rm -e FIREFLY_URL=http://x -e FIREFLY_OAUTH_CLIENT_ID=y ghcr.io/daften/fireflyiii-mcp` starts and listens on 3000.

---

### P1-4. Add `SECURITY.md`

**Where:** New file `SECURITY.md` at repo root.

**Change:** One-page disclosure policy with:
- Contact email for security reports.
- Expected response time.
- Scope: this server, not Firefly III itself.
- A note that the project handles auth tokens and financial data, so coordinated disclosure is appreciated.

**Acceptance:** File exists and is linked from `README.md`.

---

## P2 — Documentation

### P2-1. Rewrite `CLAUDE.md` to match shipped state

**Where:** `CLAUDE.md`.

**Current:** Lists 7 tool files and ~30 tools. Codebase ships 14 tool files and 140 tools. No mention of `args.ts`, `tool-filter.test.ts`, `--preset`/`--groups`/`--read-only`, Docker, npm publishing, `MCP_BASE_URL`, or attachments/recurring/rules/currencies/exports/object-groups/transaction-links.

**Change:**
- Update the "File Structure" section to list every file under `src/`.
- Replace "Phase 1/2/3" wording with current capability inventory.
- Add a "CLI Flags" section covering `--transport`, `--host`, `--port`, `--preset`, `--groups`, `--read-only`.
- Add a "Filtering" subsection explaining `TOOL_GROUPS`, `PRESETS`, and the read-only proxy in `src/tools/index.ts`.
- Update the "Adding a New Tool" steps to include (a) adding the group to `TOOL_GROUPS`, (b) considering preset membership, (c) updating the README tool table.
- Cross-check the tool inventory list against `registerAllTools` output (test reports 140).

**Acceptance:** `CLAUDE.md` lists every file in `src/`, every CLI flag in `args.ts`, and the tool count matches the test assertion (`registered.length === 140`).

---

### P2-2. Bump `package.json` version

**Where:** `package.json:3`.

**Current:** `"version": "0.1.0"`.

**Change:** Move to at least `0.3.0` — OAuth, HTTP transport, Docker, presets, and 14 tool groups all shipped since the initial 0.1.0 tag. Pick a number consistent with whatever has actually been published to npm (`npm view @daften/fireflyiii-mcp versions`).

**Acceptance:** Version reflects shipped feature set; no regression in `npm publish` dry-run.

---

### P2-3. Add `CONTRIBUTING.md`

**Where:** New file `CONTRIBUTING.md` at repo root.

**Change:** Cover:
- `npm install` → `npm test` → `npm run build` loop.
- The `dist/` rule (commit alongside source changes — or, if P3-5 lands, "do not commit `dist/`").
- The tool-add checklist (mirroring CLAUDE.md "Adding a New Tool").
- Commit message conventions (`feat:`/`fix:`/`refactor:`/`test:`/`chore:`).
- How to run integration tests locally.

**Acceptance:** File exists and is linked from `README.md`.

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
- Add `src/tools/_helpers.ts` (or extend `src/tools/index.ts`) with:
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

**Where:** Repo root `dist/` (currently committed), `.gitignore:5` (commented exclusion).

**Current:** `dist/` is committed so `node dist/index.js` works for Option 4 (git checkout) without a build step. Every PR touching tools has a noisy doubled diff.

**Change:** Two options — pick one.

**Option A: Keep `dist/` committed, add a freshness check.** Add a CI step that runs `npm run build`, then `git diff --exit-code dist/`. PRs whose `dist/` is stale fail CI.

**Option B: Drop `dist/` from git.** Add `dist/` to `.gitignore`, document `npm run build` as a required step for Option 4 in `README.md`, and rely on `prepublishOnly` for the npm package.

**Recommendation:** Option B is cleaner long-term; Option A preserves the current UX.

**Acceptance:** Whichever path, the README and CLAUDE.md reflect the choice, and CI prevents drift.

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

### P5-3. Document the single-replica OAuth constraint (or fix it)

**Where:** `README.md` Docker section, OR `src/http.ts`.

**Current:** OAuth state lives in `pendingClientRedirectUri` (or, after P0-1, in an in-process `Map`). Horizontal scaling breaks the auth flow.

**Change:** Either
- Add a "Note: single replica only — OAuth state is in-process" line to the Docker README, OR
- Store the pending state in a signed cookie / JWT keyed by `state`, eliminating server-side state entirely. (This is a deeper refactor; lift to its own design doc if pursued.)

**Acceptance:** Either README warns clearly, or multi-replica deploys work.

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

## Suggested execution order

1. **P0 batch as one PR** — security fixes belong together. After this lands, cut a patched release.
2. **P1-1 + P1-2 + P1-3 as a CI/infra PR.**
3. **P2-1 + P2-2** as a docs PR (CLAUDE.md is most stale; version bump signals the new release).
4. **P3-1 + P3-2** as a refactor PR — defineTool migration is mechanical but touches many files, so isolate.
5. **P3-3, P3-4, P3-5, P3-6** as individual smaller PRs.
6. **P4 batch** as separate PRs per item (each is independent).
7. **P5 items** as opportunistic cleanup.

Skip anything that no longer makes sense by the time it comes up — the audit was a snapshot.
