# P0 Security Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix five P0 security/correctness bugs in the Firefly III MCP server: OAuth concurrent-flow collision, missing redirect-URI validation, host-header spoofing risk, missing token-proxy timeout, and wrong bulk-update request shape.

**Architecture:** All OAuth fixes are in `src/http.ts` and tested in `src/tests/http.test.ts`. The bulk-update fix is in `src/tools/transactions.ts` and tested in `src/tests/transactions.test.ts`. No new files needed.

**Tech Stack:** TypeScript (ESM), Node.js `http`, Vitest, `vi.spyOn(Date, 'now')` for TTL tests.

---

## File map

| File | What changes |
|------|-------------|
| `src/http.ts` | Tasks 1–4: replace singleton with `Map`, add redirect-URI allow-list, add host-classification guard, add token-fetch timeout |
| `src/tests/http.test.ts` | Tasks 1–4: add new tests, update two existing tests that used registration→callback path |
| `src/tools/transactions.ts` | Task 5: send `query` as URL param (JSON-encoded) instead of request body |
| `src/tests/transactions.test.ts` | Task 5: update the `bulkUpdateTransactions` test |

---

## Task 1 — P0-1: Replace OAuth singleton with state-keyed `Map`

**Files:**
- Modify: `src/http.ts:27` (remove singleton), authorize handler (~line 56), callback handler (~line 128), register handler (~line 87)
- Modify: `src/tests/http.test.ts` — update 2 tests, add 3 new tests

**Background:** The current `let pendingClientRedirectUri: string | null = null` at module closure means two concurrent OAuth flows overwrite each other's callback URL. The fix is a `Map<state, { redirectUri, createdAt }>` keyed by the `state` query param that every MCP client must send on `/oauth/authorize`. Registration no longer stores into the map (the authorize step already captures the redirect_uri with a state). A 10-minute TTL eviction prevents unbounded memory growth.

- [ ] **Step 1: Write the new tests**

Open `src/tests/http.test.ts`.

**a) Update** the existing test `'redirects to stored client URI with forwarded query params after registration'` (currently in the "OAuth callback proxy" describe block). It uses registration→callback, which no longer works after this fix. Change it to use authorize→callback:

```typescript
it('redirects to stored client URI with forwarded query params after authorize', async () => {
  const mcpHandler = vi.fn();
  const handler = createOAuthHandler(
    'https://firefly.example.com',
    'client-id-123',
    mcpHandler as unknown as (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>
  );

  // Step 1: authorize proxy stores Claude's real redirect URI by state
  const authReq = mockReq(
    'GET',
    '/oauth/authorize?redirect_uri=http%3A%2F%2F127.0.0.1%3A9999%2Fcallback&state=xyz',
    { host: '127.0.0.1:3000' }
  );
  await handler(authReq as http.IncomingMessage, mockRes() as unknown as http.ServerResponse);

  // Step 2: Firefly III redirects to our stable callback
  const callbackReq = mockReq(
    'GET',
    '/oauth/callback?code=auth-code-abc&state=xyz',
    { host: '127.0.0.1:3000' }
  );
  const callbackRes = mockRes();
  await handler(callbackReq as http.IncomingMessage, callbackRes as unknown as http.ServerResponse);

  expect(callbackRes.statusCode).toBe(302);
  const location = callbackRes.writtenHeaders['Location'] as string;
  expect(location).toContain('http://127.0.0.1:9999/callback');
  expect(location).toContain('code=auth-code-abc');
  expect(location).toContain('state=xyz');
  expect(mcpHandler).not.toHaveBeenCalled();
});
```

**b) Update** the existing test `'clears pending redirect URI after first callback use'`. Change it to use authorize→callback:

```typescript
it('clears pending state entry after first callback use', async () => {
  const mcpHandler = vi.fn();
  const handler = createOAuthHandler(
    'https://firefly.example.com',
    'client-id-123',
    mcpHandler as unknown as (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>
  );

  // Authorize to set pending entry for state=abc
  const authReq = mockReq(
    'GET',
    '/oauth/authorize?redirect_uri=http%3A%2F%2F127.0.0.1%3A9999%2Fcallback&state=abc',
    { host: '127.0.0.1:3000' }
  );
  await handler(authReq as http.IncomingMessage, mockRes() as unknown as http.ServerResponse);

  // First callback — should succeed
  const cb1Req = mockReq('GET', '/oauth/callback?code=code1&state=abc', { host: '127.0.0.1:3000' });
  const cb1Res = mockRes();
  await handler(cb1Req as http.IncomingMessage, cb1Res as unknown as http.ServerResponse);
  expect(cb1Res.statusCode).toBe(302);

  // Second callback with same state — entry is deleted, should 400
  const cb2Req = mockReq('GET', '/oauth/callback?code=code2&state=abc', { host: '127.0.0.1:3000' });
  const cb2Res = mockRes();
  await handler(cb2Req as http.IncomingMessage, cb2Res as unknown as http.ServerResponse);
  expect(cb2Res.statusCode).toBe(400);
});
```

**c) Add** three new tests in a new `describe` block `'createOAuthHandler — concurrent OAuth flows (P0-1)'`:

```typescript
describe('createOAuthHandler — concurrent OAuth flows (P0-1)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('routes two interleaved authorize→callback pairs to the correct redirect URI each time', async () => {
    const mcpHandler = vi.fn();
    const handler = createOAuthHandler(
      'https://firefly.example.com',
      'client-id-123',
      mcpHandler as unknown as (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>
    );

    // Flow A: user A starts authorize with state=stateA
    await handler(
      mockReq('GET', '/oauth/authorize?redirect_uri=http%3A%2F%2F127.0.0.1%3A1111%2FcbA&state=stateA', { host: '127.0.0.1:3000' }) as http.IncomingMessage,
      mockRes() as unknown as http.ServerResponse
    );

    // Flow B: user B starts authorize with state=stateB
    await handler(
      mockReq('GET', '/oauth/authorize?redirect_uri=http%3A%2F%2F127.0.0.1%3A2222%2FcbB&state=stateB', { host: '127.0.0.1:3000' }) as http.IncomingMessage,
      mockRes() as unknown as http.ServerResponse
    );

    // Flow A completes its callback
    const resA = mockRes();
    await handler(
      mockReq('GET', '/oauth/callback?code=codeA&state=stateA', { host: '127.0.0.1:3000' }) as http.IncomingMessage,
      resA as unknown as http.ServerResponse
    );
    expect(resA.statusCode).toBe(302);
    expect(resA.writtenHeaders['Location']).toContain('127.0.0.1:1111/cbA');
    expect(resA.writtenHeaders['Location']).not.toContain('2222');

    // Flow B completes its callback
    const resB = mockRes();
    await handler(
      mockReq('GET', '/oauth/callback?code=codeB&state=stateB', { host: '127.0.0.1:3000' }) as http.IncomingMessage,
      resB as unknown as http.ServerResponse
    );
    expect(resB.statusCode).toBe(302);
    expect(resB.writtenHeaders['Location']).toContain('127.0.0.1:2222/cbB');
    expect(resB.writtenHeaders['Location']).not.toContain('1111');
  });

  it('returns 400 for callback with unknown state', async () => {
    const mcpHandler = vi.fn();
    const handler = createOAuthHandler(
      'https://firefly.example.com',
      'client-id-123',
      mcpHandler as unknown as (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>
    );

    const req = mockReq('GET', '/oauth/callback?code=x&state=unknown-state', { host: '127.0.0.1:3000' });
    const res = mockRes();
    await handler(req as http.IncomingMessage, res as unknown as http.ServerResponse);

    expect(res.statusCode).toBe(400);
  });

  it('rejects callback for a state entry that has exceeded the 10-minute TTL', async () => {
    const mcpHandler = vi.fn();
    const handler = createOAuthHandler(
      'https://firefly.example.com',
      'client-id-123',
      mcpHandler as unknown as (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>
    );

    const startTime = 1_000_000_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(startTime);

    // Authorize at startTime
    await handler(
      mockReq('GET', '/oauth/authorize?redirect_uri=http%3A%2F%2F127.0.0.1%3A9999%2Fcb&state=expiring', { host: '127.0.0.1:3000' }) as http.IncomingMessage,
      mockRes() as unknown as http.ServerResponse
    );

    // Advance time by 11 minutes (past the 10-minute TTL)
    vi.spyOn(Date, 'now').mockReturnValue(startTime + 11 * 60 * 1000);

    const callbackReq = mockReq('GET', '/oauth/callback?code=x&state=expiring', { host: '127.0.0.1:3000' });
    const callbackRes = mockRes();
    await handler(callbackReq as http.IncomingMessage, callbackRes as unknown as http.ServerResponse);

    expect(callbackRes.statusCode).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Volumes/Webdev/Personal/claude/fireflyiii-mcp && npm test -- --reporter=verbose 2>&1 | grep -E "(FAIL|PASS|✓|×|Error)" | head -40
```

Expected: the 3 new tests fail, the 2 updated tests may also fail.

- [ ] **Step 3: Implement the state-keyed Map in `src/http.ts`**

Replace lines 26–27 (the `let pendingClientRedirectUri` declaration) with:

```typescript
  const FLOW_TTL_MS = 10 * 60 * 1000;
  const pendingFlows = new Map<string, { redirectUri: string; createdAt: number }>();

  function evictExpiredFlows(): void {
    const now = Date.now();
    for (const [key, entry] of pendingFlows) {
      if (now - entry.createdAt > FLOW_TTL_MS) pendingFlows.delete(key);
    }
  }
```

Replace the authorize handler storage (lines 58–61, the block that sets `pendingClientRedirectUri`):

```typescript
      const clientRedirectUri = incomingUrl.searchParams.get('redirect_uri');
      const state = incomingUrl.searchParams.get('state');
      if (clientRedirectUri && state) {
        evictExpiredFlows();
        pendingFlows.set(state, { redirectUri: clientRedirectUri, createdAt: Date.now() });
      }
```

Remove the registration handler's storage of redirect URI (lines 87–89). Delete:

```typescript
      if (redirectUris[0]) {
        pendingClientRedirectUri = redirectUris[0];
      }
```

Replace the callback handler (lines 129–141) with state-keyed lookup:

```typescript
    if (req.method === 'GET' && req.url?.startsWith('/oauth/callback')) {
      const incomingUrl = new URL(req.url, baseUrl);
      const state = incomingUrl.searchParams.get('state');
      const entry = state ? pendingFlows.get(state) : null;
      if (!entry) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('No pending OAuth flow for this state. Start authorization from your MCP client.');
        return;
      }
      evictExpiredFlows();
      if (!pendingFlows.has(state!)) {
        // entry was evicted by TTL during this same eviction pass
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('OAuth flow expired. Start authorization again from your MCP client.');
        return;
      }
      pendingFlows.delete(state!);
      const target = new URL(entry.redirectUri);
      incomingUrl.searchParams.forEach((value, key) => target.searchParams.set(key, value));
      res.writeHead(302, { Location: target.toString() });
      res.end();
      return;
    }
```

Wait, the TTL check above is awkward. Let me simplify — check TTL right after reading the entry, before calling evictExpiredFlows:

```typescript
    if (req.method === 'GET' && req.url?.startsWith('/oauth/callback')) {
      const incomingUrl = new URL(req.url, baseUrl);
      const state = incomingUrl.searchParams.get('state');
      const entry = state ? pendingFlows.get(state) : null;
      const isExpired = entry ? Date.now() - entry.createdAt > FLOW_TTL_MS : false;
      if (!entry || isExpired) {
        evictExpiredFlows();
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end(
          entry
            ? 'OAuth flow expired. Start authorization again from your MCP client.'
            : 'No pending OAuth flow for this state. Start authorization from your MCP client.'
        );
        return;
      }
      pendingFlows.delete(state!);
      const target = new URL(entry.redirectUri);
      incomingUrl.searchParams.forEach((value, key) => target.searchParams.set(key, value));
      res.writeHead(302, { Location: target.toString() });
      res.end();
      return;
    }
```

- [ ] **Step 4: Run tests to verify all pass**

```bash
cd /Volumes/Webdev/Personal/claude/fireflyiii-mcp && npm test -- --reporter=verbose 2>&1 | tail -20
```

Expected: all tests pass, no failures.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/Webdev/Personal/claude/fireflyiii-mcp && git add src/http.ts src/tests/http.test.ts && git commit -m "$(cat <<'EOF'
fix(security): replace OAuth redirect-URI singleton with state-keyed Map (P0-1)

Concurrent OAuth flows no longer overwrite each other's callback URL.
Entries are keyed by the `state` query param and evicted after 10 minutes.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2 — P0-2: Redirect-URI allow-list validation

**Files:**
- Modify: `src/http.ts` — add `isRedirectUriAllowed`, apply in register and authorize handlers
- Modify: `src/tests/http.test.ts` — add 4 new tests

**Background:** Any string in `redirect_uris[0]` from a POST to `/oauth/register` was trusted verbatim and used as the callback target. An attacker could register `http://evil.example.com/steal` and receive authorization codes. The fix adds an allow-list: loopback addresses always pass; additional prefixes are accepted via `MCP_ALLOWED_REDIRECT_PREFIXES` env var.

- [ ] **Step 1: Write the new tests**

Add a new `describe` block in `src/tests/http.test.ts`:

```typescript
describe('createOAuthHandler — redirect URI allow-list (P0-2)', () => {
  afterEach(() => {
    delete process.env['MCP_ALLOWED_REDIRECT_PREFIXES'];
  });

  it('rejects registration with a non-loopback redirect URI (400 invalid_redirect_uri)', async () => {
    const mcpHandler = vi.fn();
    const handler = createOAuthHandler(
      'https://firefly.example.com',
      'client-id-123',
      mcpHandler as unknown as (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>
    );

    const body = JSON.stringify({ redirect_uris: ['http://evil.example.com/steal'] });
    const req = mockReq('POST', '/oauth/register', { host: '127.0.0.1:3000' }, body);
    const res = mockRes();

    await handler(req as http.IncomingMessage, res as unknown as http.ServerResponse);

    expect(res.statusCode).toBe(400);
    const parsed = JSON.parse(res.body) as Record<string, unknown>;
    expect(parsed['error']).toBe('invalid_redirect_uri');
  });

  it('accepts registration with a loopback redirect URI (127.0.0.1)', async () => {
    const mcpHandler = vi.fn();
    const handler = createOAuthHandler(
      'https://firefly.example.com',
      'client-id-123',
      mcpHandler as unknown as (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>
    );

    const body = JSON.stringify({ redirect_uris: ['http://127.0.0.1:54321/callback'] });
    const req = mockReq('POST', '/oauth/register', { host: '127.0.0.1:3000' }, body);
    const res = mockRes();

    await handler(req as http.IncomingMessage, res as unknown as http.ServerResponse);

    expect(res.statusCode).toBe(201);
  });

  it('accepts registration when redirect URI matches MCP_ALLOWED_REDIRECT_PREFIXES', async () => {
    process.env['MCP_ALLOWED_REDIRECT_PREFIXES'] = 'https://claude.ai';
    const mcpHandler = vi.fn();
    const handler = createOAuthHandler(
      'https://firefly.example.com',
      'client-id-123',
      mcpHandler as unknown as (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>
    );

    const body = JSON.stringify({ redirect_uris: ['https://claude.ai/api/mcp/callback'] });
    const req = mockReq('POST', '/oauth/register', { host: '127.0.0.1:3000' }, body);
    const res = mockRes();

    await handler(req as http.IncomingMessage, res as unknown as http.ServerResponse);

    expect(res.statusCode).toBe(201);
  });

  it('rejects authorize with a non-loopback redirect URI (400 invalid_redirect_uri)', async () => {
    const mcpHandler = vi.fn();
    const handler = createOAuthHandler(
      'https://firefly.example.com',
      'client-id-123',
      mcpHandler as unknown as (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>
    );

    const req = mockReq(
      'GET',
      '/oauth/authorize?redirect_uri=http%3A%2F%2Fevil.example.com%2Fsteal&state=abc',
      { host: '127.0.0.1:3000' }
    );
    const res = mockRes();

    await handler(req as http.IncomingMessage, res as unknown as http.ServerResponse);

    expect(res.statusCode).toBe(400);
    const parsed = JSON.parse(res.body) as Record<string, unknown>;
    expect(parsed['error']).toBe('invalid_redirect_uri');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Volumes/Webdev/Personal/claude/fireflyiii-mcp && npm test -- --reporter=verbose 2>&1 | grep -E "(FAIL|×)" | head -20
```

Expected: the 4 new tests fail.

- [ ] **Step 3: Implement the allow-list in `src/http.ts`**

Add the `isRedirectUriAllowed` helper immediately after the `readBody` function (before `createOAuthHandler`):

```typescript
const LOOPBACK_REDIRECT_PREFIXES = ['http://127.0.0.1:', 'http://localhost:', 'http://[::1]:'];

function isRedirectUriAllowed(uri: string): boolean {
  if (LOOPBACK_REDIRECT_PREFIXES.some((p) => uri.startsWith(p))) return true;
  const extra = process.env['MCP_ALLOWED_REDIRECT_PREFIXES']?.trim();
  if (!extra) return false;
  return extra.split(',').map((s) => s.trim()).some((p) => p && uri.startsWith(p));
}
```

In the authorize handler, add validation right after reading `clientRedirectUri`, before the state check:

```typescript
      const clientRedirectUri = incomingUrl.searchParams.get('redirect_uri');
      if (clientRedirectUri && !isRedirectUriAllowed(clientRedirectUri)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_redirect_uri', error_description: 'redirect_uri is not allowed' }));
        return;
      }
      const state = incomingUrl.searchParams.get('state');
      if (clientRedirectUri && state) {
        evictExpiredFlows();
        pendingFlows.set(state, { redirectUri: clientRedirectUri, createdAt: Date.now() });
      }
```

In the registration handler, add validation after parsing `redirectUris`:

```typescript
      if (redirectUris[0] && !isRedirectUriAllowed(redirectUris[0])) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_redirect_uri', error_description: 'redirect_uri is not allowed' }));
        return;
      }
```

Place this block right after the `try/catch` that parses `redirectUris` (before the `const registration = {...}` line).

- [ ] **Step 4: Run tests to verify all pass**

```bash
cd /Volumes/Webdev/Personal/claude/fireflyiii-mcp && npm test -- --reporter=verbose 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/Webdev/Personal/claude/fireflyiii-mcp && git add src/http.ts src/tests/http.test.ts && git commit -m "$(cat <<'EOF'
fix(security): validate redirect_uri against allow-list in register and authorize (P0-2)

Loopback addresses always allowed; additional prefixes via MCP_ALLOWED_REDIRECT_PREFIXES.
Rejects non-loopback URIs with 400 invalid_redirect_uri to prevent auth-code exfiltration.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3 — P0-3: Host-header spoofing guard for non-loopback deployments

**Files:**
- Modify: `src/http.ts` — export `classifyHost` helper, add guard in `startHttpServer`
- Modify: `src/tests/http.test.ts` — add tests for `classifyHost`

**Background:** When `MCP_BASE_URL` is unset, OAuth callback URLs are built from the `Host` header (`req.headers['host']`). If the server is bound to `0.0.0.0`, an attacker controlling the `Host` header can seed the OAuth flow with their own domain and intercept the authorization code. The fix: non-loopback bind without `MCP_BASE_URL` → hard exit. Loopback bind without `MCP_BASE_URL` → stderr warning.

- [ ] **Step 1: Write tests for `classifyHost`**

Add import at top of `src/tests/http.test.ts`:

```typescript
import { createOAuthHandler, requestContext, classifyHost } from '../http.js';
```

Add a new describe block at the end of `src/tests/http.test.ts`:

```typescript
describe('classifyHost', () => {
  it('classifies 127.0.0.1 as loopback', () => {
    expect(classifyHost('127.0.0.1')).toBe('loopback');
  });

  it('classifies ::1 as loopback', () => {
    expect(classifyHost('::1')).toBe('loopback');
  });

  it('classifies localhost as loopback', () => {
    expect(classifyHost('localhost')).toBe('loopback');
  });

  it('classifies 0.0.0.0 as non-loopback', () => {
    expect(classifyHost('0.0.0.0')).toBe('non-loopback');
  });

  it('classifies an arbitrary IP as non-loopback', () => {
    expect(classifyHost('192.168.1.10')).toBe('non-loopback');
  });

  it('classifies an arbitrary hostname as non-loopback', () => {
    expect(classifyHost('mcp.example.com')).toBe('non-loopback');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Volumes/Webdev/Personal/claude/fireflyiii-mcp && npm test -- --reporter=verbose 2>&1 | grep -E "(FAIL|×)" | head -10
```

Expected: the 6 new `classifyHost` tests fail (export not found yet).

- [ ] **Step 3: Add `classifyHost` export and guard in `src/http.ts`**

Add this function before `startHttpServer` (after `tryListen`):

```typescript
export function classifyHost(host: string): 'loopback' | 'non-loopback' {
  return ['127.0.0.1', '::1', 'localhost'].includes(host) ? 'loopback' : 'non-loopback';
}
```

Add the guard at the **very start** of the `startHttpServer` function body (before the `createOAuthHandler` call):

```typescript
  if (!process.env['MCP_BASE_URL']?.trim()) {
    if (classifyHost(host) === 'non-loopback') {
      process.stderr.write(
        `Error: MCP_BASE_URL must be set when binding to a non-loopback interface (--host ${host}).\n` +
        `Without it, the Host header controls OAuth callback URLs — an attacker can forge it.\n` +
        `Set MCP_BASE_URL to the public URL of this server, e.g.:\n` +
        `  MCP_BASE_URL=https://mcp.example.com\n`
      );
      process.exit(1);
    } else {
      process.stderr.write(
        `Warning: MCP_BASE_URL is not set. OAuth URLs use the Host header — safe for local use only.\n`
      );
    }
  }
```

- [ ] **Step 4: Run tests to verify all pass**

```bash
cd /Volumes/Webdev/Personal/claude/fireflyiii-mcp && npm test -- --reporter=verbose 2>&1 | tail -20
```

Expected: all tests pass (the guard in `startHttpServer` is not exercised by unit tests — it calls `process.exit`, which makes it unsuitable for standard unit testing; the helper `classifyHost` is tested instead).

- [ ] **Step 5: Commit**

```bash
cd /Volumes/Webdev/Personal/claude/fireflyiii-mcp && git add src/http.ts src/tests/http.test.ts && git commit -m "$(cat <<'EOF'
fix(security): exit(1) when bound to non-loopback without MCP_BASE_URL set (P0-3)

Prevents Host-header spoofing of OAuth callback URLs in public deployments.
Loopback-only binds emit a warning instead. Extracted classifyHost helper for testing.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4 — P0-4: Timeout on OAuth token-proxy `fetch`

**Files:**
- Modify: `src/http.ts` — wrap the token-proxy `fetch` with `AbortController` + 30 s timeout
- Modify: `src/tests/http.test.ts` — add one test for the 504 path

**Background:** The token endpoint at line 113 of `src/http.ts` calls `await fetch(...)` with no timeout. A slow or unresponsive Firefly III instance pins the request forever. `FireflyClient.rawFetch` already does this right with `AbortController`; the same pattern needs to be inlined in the OAuth proxy's token handler.

- [ ] **Step 1: Write the failing test**

Add to the `'createOAuthHandler — token proxy'` describe block in `src/tests/http.test.ts`:

```typescript
  it('returns 504 if Firefly III token endpoint does not respond within 30 seconds', async () => {
    vi.useFakeTimers();
    const neverResolve = new Promise<never>(() => { /* hangs */ });
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(neverResolve));

    const mcpHandler = vi.fn();
    const handler = createOAuthHandler(
      'https://firefly.example.com',
      'client-id-123',
      mcpHandler as unknown as (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>
    );

    const req = mockReq('POST', '/oauth/token', { host: '127.0.0.1:3000' }, 'grant_type=authorization_code');
    const res = mockRes();

    const handlerPromise = handler(req as http.IncomingMessage, res as unknown as http.ServerResponse);

    // Advance fake timers by 30 seconds to trigger the abort
    await vi.advanceTimersByTimeAsync(30_000);
    await handlerPromise;

    expect(res.statusCode).toBe(504);
    const parsed = JSON.parse(res.body) as Record<string, unknown>;
    expect(parsed['error']).toBe('timeout');

    vi.useRealTimers();
  });
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd /Volumes/Webdev/Personal/claude/fireflyiii-mcp && npm test -- --reporter=verbose 2>&1 | grep -E "(FAIL|×|504)" | head -10
```

Expected: the new test fails (fetch never resolves and no 504 is returned).

- [ ] **Step 3: Implement the timeout in `src/http.ts`**

Replace the token proxy `fetch` call (the `const tokenResponse = await fetch(...)` block, roughly lines 113–117) with:

```typescript
      const tokenController = new AbortController();
      const tokenTimer = setTimeout(() => tokenController.abort(), 30_000);
      let tokenResponse: Response;
      try {
        tokenResponse = await fetch(`${fireflyUrl}/oauth/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString(),
          signal: tokenController.signal,
        });
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          res.writeHead(504, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'timeout' }));
          return;
        }
        throw err;
      } finally {
        clearTimeout(tokenTimer);
      }
```

The two lines after the current fetch (`const responseBody = ...`, `const contentType = ...`) stay unchanged but now reference `tokenResponse` instead of the old `tokenResponse` variable.

- [ ] **Step 4: Run all tests to verify**

```bash
cd /Volumes/Webdev/Personal/claude/fireflyiii-mcp && npm test -- --reporter=verbose 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/Webdev/Personal/claude/fireflyiii-mcp && git add src/http.ts src/tests/http.test.ts && git commit -m "$(cat <<'EOF'
fix(security): add 30s AbortController timeout to OAuth token-proxy fetch (P0-4)

Returns HTTP 504 {"error":"timeout"} if Firefly III token endpoint hangs,
mirroring the timeout pattern already used in FireflyClient.rawFetch.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5 — P0-5: Fix `bulk_update_transactions` to match OpenAPI spec

**Files:**
- Modify: `src/tools/transactions.ts` — send `query` as URL query param (JSON-encoded), not request body
- Modify: `src/tests/transactions.test.ts` — update the `bulkUpdateTransactions` test

**Background:** The Firefly III OpenAPI spec (`/v1/data/bulk/transactions`) specifies `query` as an `in: query` parameter with `format: json` — meaning the POST body should be empty and the query JSON goes in the URL. The current implementation sends a JSON body `{ query, category_name, budget_id, tags, notes }` which Firefly III ignores/rejects. The correct shape is: POST with no body, URL param `?query=<json-string>` where the JSON is `{ "where": "<search-string>", "update": { <fields> } }`.

**Verification:** Run before implementing:
```bash
curl -s "https://api-docs.firefly-iii.org/firefly-iii-6.5.5-v1.yaml" -A "Mozilla/5.0" | grep -A 30 "/data/bulk/transactions"
```
The spec output shows `- in: query` / `name: query` / `format: json` confirming the URL-param approach.

- [ ] **Step 1: Update the existing test in `src/tests/transactions.test.ts`**

Find the `describe('bulkUpdateTransactions', ...)` block and replace the single test with:

```typescript
describe('bulkUpdateTransactions', () => {
  it('sends query as a JSON-encoded URL query param per the OpenAPI spec', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(undefined);
    await bulkUpdateTransactions(mockClient, { query: 'description:coffee', category_name: 'Food', budget_id: '3' });
    expect(mockClient.post).toHaveBeenCalledWith(
      '/data/bulk/transactions',
      undefined,
      { query: JSON.stringify({ where: 'description:coffee', update: { category_name: 'Food', budget_id: '3' } }) }
    );
  });

  it('omits undefined update fields from the JSON query', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(undefined);
    await bulkUpdateTransactions(mockClient, { query: 'description:groceries' });
    const call = (mockClient.post as ReturnType<typeof vi.fn>).mock.calls[0] as [string, unknown, Record<string, string>];
    const sentQuery = JSON.parse(call[2]['query']) as { where: string; update: Record<string, unknown> };
    expect(sentQuery.where).toBe('description:groceries');
    expect(Object.keys(sentQuery.update)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd /Volumes/Webdev/Personal/claude/fireflyiii-mcp && npm test -- --reporter=verbose src/tests/transactions.test.ts 2>&1 | grep -E "(FAIL|×|bulkUpdate)" | head -10
```

Expected: both new tests fail (wrong call shape).

- [ ] **Step 3: Implement the fix in `src/tools/transactions.ts`**

Replace the `bulkUpdateTransactions` function (lines 123–128):

```typescript
export async function bulkUpdateTransactions(
  client: FireflyClient,
  params: { query: string; category_name?: string; budget_id?: string; tags?: string[]; notes?: string }
): Promise<unknown> {
  const update: Record<string, unknown> = {};
  if (params.category_name !== undefined) update['category_name'] = params.category_name;
  if (params.budget_id !== undefined) update['budget_id'] = params.budget_id;
  if (params.tags !== undefined) update['tags'] = params.tags;
  if (params.notes !== undefined) update['notes'] = params.notes;
  return client.post('/data/bulk/transactions', undefined, {
    query: JSON.stringify({ where: params.query, update }),
  });
}
```

- [ ] **Step 4: Run all tests to verify**

```bash
cd /Volumes/Webdev/Personal/claude/fireflyiii-mcp && npm test -- --reporter=verbose 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 5: Build and commit**

```bash
cd /Volumes/Webdev/Personal/claude/fireflyiii-mcp && npm run build && git add src/tools/transactions.ts src/tests/transactions.test.ts dist/ && git commit -m "$(cat <<'EOF'
fix: send bulk_update_transactions query as JSON URL param per OpenAPI spec (P0-5)

The /data/bulk/transactions endpoint takes `query` as an in-query JSON param,
not a request body. Rebuilt from {where, update} object per the spec.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage check:**

| P0 task | Task # | Covered? |
|---------|--------|---------|
| P0-1: state-keyed Map, TTL eviction, two-flow test, unknown-state 400, expired-entry 400 | Task 1 | ✓ |
| P0-2: allow-list helper, register validation, authorize validation, env var override | Task 2 | ✓ |
| P0-3: non-loopback exit, loopback warning, `classifyHost` helper with tests | Task 3 | ✓ |
| P0-4: AbortController timeout, 504 response, unit test with fake timers | Task 4 | ✓ |
| P0-5: OpenAPI spec verification, URL-param shape, updated test, `undefined`-field omission | Task 5 | ✓ |

**Placeholder scan:** None found — all code blocks are complete.

**Type consistency:** `pendingFlows` is `Map<string, { redirectUri: string; createdAt: number }>` throughout. `classifyHost` returns `'loopback' | 'non-loopback'` consistently. `client.post('/data/bulk/transactions', undefined, {...})` matches the `post<T>(path, body, params?)` signature in `src/client.ts:106`.

**Existing-test impact:**
- Two tests in "OAuth callback proxy" describe are explicitly updated in Task 1 (registration→callback → authorize→callback).
- All other existing tests are unaffected: authorize tests use `localhost:9999` redirect_uri (allowed by P0-2), token tests stub `fetch` globally (timeout uses the same stubbing pattern), `classifyHost` is a new export (additive).
