# P5 Nice-to-Haves Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Four small improvements — Dockerfile healthcheck, docker-compose env_file support, README OAuth replica warning, and URL query-string scrubbing from error messages.

**Architecture:** Three are config/doc changes (touch one file each, no logic). P5-4 (URL scrubbing) modifies one line in `src/client.ts` and adds one test in `src/tests/client.test.ts`; TDD order applies to that task only.

**Tech Stack:** TypeScript, Vitest, Docker, Markdown

---

## File Map

| File | Task | Change |
|------|------|--------|
| `Dockerfile` | P5-1 | Add `HEALTHCHECK` instruction |
| `docker-compose.yml` | P5-2 | Add `env_file: .env` |
| `README.md` | P5-3 | Add single-replica note to Docker section |
| `src/tests/client.test.ts` | P5-4 | Add test: query string absent from error message |
| `src/client.ts` | P5-4 | Strip query string from URL in `FireflyError` constructor |

---

## Task 1: Add HEALTHCHECK to Dockerfile (P5-1)

**Files:**
- Modify: `Dockerfile`

- [ ] **Step 1: Add the HEALTHCHECK instruction**

Open `Dockerfile`. The current runtime stage ends with:

```dockerfile
# Stage 2: runtime
FROM node:22-alpine AS runtime
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/index.js", "--transport", "http", "--host", "0.0.0.0"]
```

Replace `EXPOSE 3000` line with:

```dockerfile
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/.well-known/oauth-authorization-server || exit 1
```

(Alpine includes `wget`; no extra install needed. The health endpoint requires no auth.)

- [ ] **Step 2: Verify the Dockerfile parses cleanly**

Run: `docker build --check . 2>&1 || docker build -f Dockerfile . --dry-run 2>&1 || echo "No dry-run support — build would be needed to verify"`

If Docker is available locally: `docker build -t fireflyiii-mcp-test . --no-cache 2>&1 | tail -5`

Expected: build completes without errors. (Skip if Docker is not available in this environment.)

- [ ] **Step 3: Commit**

```bash
git add Dockerfile
git commit -m "feat: add HEALTHCHECK to Dockerfile

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Add env_file support to docker-compose.yml (P5-2)

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: Add env_file directive**

Current `docker-compose.yml`:

```yaml
services:
  fireflyiii-mcp:
    image: ghcr.io/daften/fireflyiii-mcp:latest
    # build: .  # Uncomment to build locally instead of pulling from registry
    ports:
      - "3000:3000"
    environment:
      FIREFLY_URL: ${FIREFLY_URL}
      FIREFLY_OAUTH_CLIENT_ID: ${FIREFLY_OAUTH_CLIENT_ID}
      MCP_BASE_URL: ${MCP_BASE_URL}
    restart: unless-stopped
```

Replace with:

```yaml
services:
  fireflyiii-mcp:
    image: ghcr.io/daften/fireflyiii-mcp:latest
    # build: .  # Uncomment to build locally instead of pulling from registry
    ports:
      - "3000:3000"
    env_file:
      - path: .env
        required: false
    environment:
      FIREFLY_URL: ${FIREFLY_URL}
      FIREFLY_OAUTH_CLIENT_ID: ${FIREFLY_OAUTH_CLIENT_ID}
      MCP_BASE_URL: ${MCP_BASE_URL}
    restart: unless-stopped
```

`required: false` prevents compose from failing if `.env` is absent (environment variables exported in the shell still work).

- [ ] **Step 2: Update README docker-compose usage example**

In `README.md`, find the docker-compose run block (around line 133-138):

```bash
FIREFLY_URL=https://your-firefly-instance.example.com \
FIREFLY_OAUTH_CLIENT_ID=your-client-id \
MCP_BASE_URL=https://mcp.example.com \
docker compose up -d
```

Replace it with:

```bash
# Option A: use a .env file (copy .env.example and fill in values)
cp .env.example .env   # then edit .env
docker compose up -d

# Option B: export variables in your shell
FIREFLY_URL=https://your-firefly-instance.example.com \
FIREFLY_OAUTH_CLIENT_ID=your-client-id \
MCP_BASE_URL=https://mcp.example.com \
docker compose up -d
```

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml README.md
git commit -m "feat: add env_file support to docker-compose

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Document single-replica OAuth constraint in README (P5-3)

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add the constraint note**

In `README.md`, find the end of the Docker Step 2 section — the paragraph ending with:

```
To build the image locally instead of pulling from the registry, uncomment `build: .` in `docker-compose.yml`.
```

Insert a new note directly after that line (before `### Step 3: Connect Claude`):

```markdown
> **Note:** OAuth state is held in-process. Run only a single replica — multiple replicas will break the OAuth flow because the callback may land on a different instance than the one that initiated authorization.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: warn about single-replica OAuth constraint in Docker section

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Scrub query strings from FireflyError messages (P5-4, TDD)

**Files:**
- Modify: `src/tests/client.test.ts` (write test first)
- Modify: `src/client.ts` (one-line fix)

- [ ] **Step 1: Write the failing test**

In `src/tests/client.test.ts`, find the `describe('formatError — updated cases'` block at the bottom (around line 283). Add a new test at the end of that block:

```typescript
it('does not include query string in error message', () => {
  const err = new FireflyError(
    404,
    'https://firefly.example.com/api/v1/accounts?page=1&secret=abc',
    'Not Found'
  );
  expect(err.message).not.toContain('secret=abc');
  expect(err.message).not.toContain('?page=1');
  expect(err.message).toContain('/api/v1/accounts');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --reporter=verbose 2>&1 | grep -A 5 "does not include query string"`

Expected: test fails because the current `FireflyError` constructor includes the full URL with query string.

- [ ] **Step 3: Implement the fix**

In `src/client.ts`, find the `FireflyError` constructor (line 8-11):

```typescript
constructor(
  public readonly status: number,
  public readonly url: string,
  public readonly body: string
) {
  super(`Firefly III API error ${status} at ${url}: ${body}`);
  this.name = 'FireflyError';
}
```

Replace the `super(...)` line:

```typescript
constructor(
  public readonly status: number,
  public readonly url: string,
  public readonly body: string
) {
  super(`Firefly III API error ${status} at ${url.split('?')[0]}: ${body}`);
  this.name = 'FireflyError';
}
```

(`url` property is unchanged — only the message string is scrubbed. Callers that need the raw URL for logging can still read `err.url`.)

- [ ] **Step 4: Run all tests to verify they pass**

Run: `npm test 2>&1 | tail -20`

Expected: all tests pass, including the new one.

- [ ] **Step 5: Commit**

```bash
git add src/client.ts src/tests/client.test.ts
git commit -m "fix: strip query string from FireflyError message to prevent secret leaks

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- P5-1 Dockerfile HEALTHCHECK → Task 1 ✓
- P5-2 docker-compose env_file → Task 2 ✓ (includes README update for the compose example)
- P5-3 README single-replica warning → Task 3 ✓
- P5-4 URL query scrub + test → Task 4 ✓

**Placeholder scan:** No TBDs, all code is complete, exact file paths given, commands included.

**Type consistency:** `FireflyError` constructor signature unchanged; only the `super(...)` message string changes. All existing tests that check `err.url` or `err.status` or `err.body` continue to pass because those properties are unaffected.
