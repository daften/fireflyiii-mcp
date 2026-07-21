# Claude Connector Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Claude custom-connector OAuth path work against a self-hosted `fireflyiii-mcp` server out of the box, and give users a documented rule for choosing between stdio, connector, and `mcp-remote`.

**Architecture:** Three small, independent additions to the single-file OAuth proxy in `src/http.ts` — allow Claude's hosted redirect URI by default, serve RFC 9728 protected-resource metadata, and emit a spec-correct `401` challenge — followed by a documentation restructure around a three-branch decision rule.

**Tech Stack:** TypeScript (strict, ESM), Node.js 20+, Vitest, Biome, VitePress.

**Spec:** `docs/design/2026-07-21-claude-connector-support-design.md`

## Global Constraints

- ESM only — all relative imports carry a `.js` extension (e.g. `from '../http.js'`).
- Strict TypeScript. `npm run check` must pass: `biome ci src/ && tsc --noEmit && vitest run`.
- **Run `npm install` before Task 1.** As of writing, this clone has no `node_modules`, so no test or build command works until you do. It also runs `npm run prepare`, which installs the `simple-git-hooks` pre-commit hook.
- Once that hook is installed it runs `npm run check` on every commit, so **commit only at the green step of each TDD cycle, never at red.** Do not assume the hook is active — verify with `ls .git/hooks/pre-commit`, and run `npm run check` manually before each commit if it is missing.
- Commit format: `[type]: [subject]` with a blank line and the trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Types: `feat:`, `fix:`, `refactor:`, `test:`, `chore:`, `docs:`.
- Claude's hosted callback URI, used verbatim: `https://claude.ai/api/mcp/auth_callback`
- Anthropic egress range, used verbatim in docs: `160.79.104.0/21`
- Claude Desktop schema facts are verified against version `1.22209.3` (macOS) — cite that version wherever documented.
- Do not add dependencies.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/http.ts` | Modify. All three server-side changes. Already the single home for the OAuth proxy surface; no split warranted at its current size. |
| `src/tests/http.test.ts` | Modify. Extends existing describe blocks; test helpers `mockReq`/`mockRes` already exist at the top of the file. |
| `docs/reference/env-vars.md` | Modify. Document `MCP_ALLOWED_REDIRECT_PREFIXES`. |
| `.env.example` | Modify. Same, commented out. |
| `docs/guide/index.md` | Modify. Three-branch decision rule. |
| `docs/guide/claude-desktop.md` | Create. Per-client setup page. |
| `docs/.vitepress/config.ts` | Modify. Register the new page in the `/guide/` sidebar. |
| `docs/guide/http-oauth.md` | Modify. Label the `{type,url}` block Claude Code–only. |
| `docs/guide/docker.md` | Modify. Same, plus connector requirements. |
| `README.md` | Modify. Point Claude Desktop readers at the new guide. |

---

## Task 0: Install dependencies

**Files:** none (no commit).

- [ ] **Step 1: Install**

Run: `npm install`

Expected: `node_modules/` is created and `npm run prepare` installs the pre-commit hook.

- [ ] **Step 2: Confirm the baseline is green before changing anything**

Run: `npm run check`

Expected: Biome clean, `tsc --noEmit` clean, full Vitest suite passing. If the baseline is already red, stop and report it — do not start Task 1 on top of a failing suite.

- [ ] **Step 3: Confirm the hook installed**

Run: `ls .git/hooks/pre-commit`

Expected: the file exists. If it does not, run `npm run check` manually before every commit in this plan.

---

## Task 1: Allow Claude's hosted redirect URI by default

**Files:**
- Modify: `src/http.ts:23-33` (`LOOPBACK_REDIRECT_PREFIXES`, `isRedirectUriAllowed`), `src/http.ts:114-118` and `src/http.ts:146-150` (the two rejection sites)
- Test: `src/tests/http.test.ts` — extend the existing `describe('createOAuthHandler — redirect URI allow-list (P0-2)')` block

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `isRedirectUriAllowed(uri: string): boolean` (module-private, behaviour change only) and a module-private `rejectRedirectUri(res: http.ServerResponse): void` helper used by Tasks 1 only.

- [ ] **Step 1: Write the failing tests**

Add these six tests inside the existing `describe('createOAuthHandler — redirect URI allow-list (P0-2)', ...)` block in `src/tests/http.test.ts`, after the existing `MCP_ALLOWED_REDIRECT_PREFIXES` test:

```typescript
  it("accepts registration with Claude's hosted callback and no env var set", async () => {
    const mcpHandler = vi.fn();
    const handler = createOAuthHandler(
      'https://firefly.example.com',
      'client-id-123',
      mcpHandler as unknown as (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>,
    );

    const body = JSON.stringify({ redirect_uris: ['https://claude.ai/api/mcp/auth_callback'] });
    const req = mockReq('POST', '/oauth/register', { host: '127.0.0.1:3000' }, body);
    const res = mockRes();

    await handler(req as http.IncomingMessage, res as unknown as http.ServerResponse);

    expect(res.statusCode).toBe(201);
  });

  it("accepts authorize with Claude's hosted callback and no env var set", async () => {
    const mcpHandler = vi.fn();
    const handler = createOAuthHandler(
      'https://firefly.example.com',
      'client-id-123',
      mcpHandler as unknown as (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>,
    );

    const req = mockReq(
      'GET',
      `/oauth/authorize?redirect_uri=${encodeURIComponent('https://claude.ai/api/mcp/auth_callback')}&state=abc`,
      { host: '127.0.0.1:3000' },
    );
    const res = mockRes();

    await handler(req as http.IncomingMessage, res as unknown as http.ServerResponse);

    expect(res.statusCode).toBe(302);
  });

  it('rejects a redirect URI that merely starts with the Claude callback', async () => {
    const mcpHandler = vi.fn();
    const handler = createOAuthHandler(
      'https://firefly.example.com',
      'client-id-123',
      mcpHandler as unknown as (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>,
    );

    const body = JSON.stringify({ redirect_uris: ['https://claude.ai/api/mcp/auth_callbackEVIL'] });
    const req = mockReq('POST', '/oauth/register', { host: '127.0.0.1:3000' }, body);
    const res = mockRes();

    await handler(req as http.IncomingMessage, res as unknown as http.ServerResponse);

    expect(res.statusCode).toBe(400);
  });

  it('ignores query and fragment when matching the Claude callback', async () => {
    const mcpHandler = vi.fn();
    const handler = createOAuthHandler(
      'https://firefly.example.com',
      'client-id-123',
      mcpHandler as unknown as (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>,
    );

    const body = JSON.stringify({ redirect_uris: ['https://claude.ai/api/mcp/auth_callback?x=1'] });
    const req = mockReq('POST', '/oauth/register', { host: '127.0.0.1:3000' }, body);
    const res = mockRes();

    await handler(req as http.IncomingMessage, res as unknown as http.ServerResponse);

    expect(res.statusCode).toBe(201);
  });

  it('rejects a malformed redirect URI', async () => {
    const mcpHandler = vi.fn();
    const handler = createOAuthHandler(
      'https://firefly.example.com',
      'client-id-123',
      mcpHandler as unknown as (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>,
    );

    const body = JSON.stringify({ redirect_uris: ['not a valid uri'] });
    const req = mockReq('POST', '/oauth/register', { host: '127.0.0.1:3000' }, body);
    const res = mockRes();

    await handler(req as http.IncomingMessage, res as unknown as http.ServerResponse);

    expect(res.statusCode).toBe(400);
  });

  it('names MCP_ALLOWED_REDIRECT_PREFIXES in the rejection body', async () => {
    const mcpHandler = vi.fn();
    const handler = createOAuthHandler(
      'https://firefly.example.com',
      'client-id-123',
      mcpHandler as unknown as (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>,
    );

    const body = JSON.stringify({ redirect_uris: ['https://evil.example.com/steal'] });
    const req = mockReq('POST', '/oauth/register', { host: '127.0.0.1:3000' }, body);
    const res = mockRes();

    await handler(req as http.IncomingMessage, res as unknown as http.ServerResponse);

    expect(res.statusCode).toBe(400);
    const parsed = JSON.parse(res.body) as Record<string, unknown>;
    expect(parsed.error).toBe('invalid_redirect_uri');
    expect(parsed.error_description).toContain('MCP_ALLOWED_REDIRECT_PREFIXES');
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/tests/http.test.ts -t 'redirect URI allow-list'`

Expected: FAIL. The two "accepts … Claude's hosted callback" tests get `400` instead of `201`/`302`; the query-and-fragment test gets `400` instead of `201`; the rejection-body test fails on `expect(parsed.error_description).toContain('MCP_ALLOWED_REDIRECT_PREFIXES')`. The `…auth_callbackEVIL` and malformed-URI tests already pass (nothing allows them today) — that is expected and correct; they are regression guards for the exact-match decision.

- [ ] **Step 3: Implement**

In `src/http.ts`, replace the `LOOPBACK_REDIRECT_PREFIXES` constant and `isRedirectUriAllowed` function (lines 23-33) with:

```typescript
const LOOPBACK_REDIRECT_PREFIXES = ['http://127.0.0.1:', 'http://localhost:', 'http://[::1]:'];

// Claude's hosted surfaces (claude.ai web, Desktop, mobile, Cowork) all complete
// OAuth against this single callback. Matched exactly on origin+pathname — a prefix
// match would also admit https://claude.ai/api/mcp/auth_callbackEVIL.
const CLAUDE_HOSTED_REDIRECT_URI = 'https://claude.ai/api/mcp/auth_callback';

function isRedirectUriAllowed(uri: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return false;
  }
  if (LOOPBACK_REDIRECT_PREFIXES.some((p) => uri.startsWith(p))) return true;
  if (`${parsed.origin}${parsed.pathname}` === CLAUDE_HOSTED_REDIRECT_URI) return true;
  const extra = process.env.MCP_ALLOWED_REDIRECT_PREFIXES?.trim();
  if (!extra) return false;
  return extra
    .split(',')
    .map((s) => s.trim())
    .some((p) => p && uri.startsWith(p));
}

// Both /oauth/authorize and /oauth/register reject with the same shape. The error
// code stays RFC-compliant; the description names the escape hatch so an operator
// can act on it without reading the source.
function rejectRedirectUri(res: http.ServerResponse): void {
  res.writeHead(400, { 'Content-Type': 'application/json' });
  res.end(
    JSON.stringify({
      error: 'invalid_redirect_uri',
      error_description:
        "redirect_uri is not allowed. Loopback addresses and Claude's hosted callback are allowed by default; " +
        'add any other prefix to MCP_ALLOWED_REDIRECT_PREFIXES (comma-separated).',
    }),
  );
}
```

Then replace the authorize rejection (currently lines 114-118):

```typescript
      if (clientRedirectUri && !isRedirectUriAllowed(clientRedirectUri)) {
        rejectRedirectUri(res);
        return;
      }
```

And the register rejection (currently lines 146-150):

```typescript
      if (redirectUris[0] && !isRedirectUriAllowed(redirectUris[0])) {
        rejectRedirectUri(res);
        return;
      }
```

- [ ] **Step 4: Run the full suite to verify green**

Run: `npm run check`

Expected: Biome clean, `tsc --noEmit` clean, all Vitest tests pass — including the two pre-existing allow-list tests (`http://evil.example.com/steal` still rejected, `MCP_ALLOWED_REDIRECT_PREFIXES=https://claude.ai` with `https://claude.ai/api/mcp/callback` still accepted via the env prefix branch).

- [ ] **Step 5: Commit**

```bash
git add src/http.ts src/tests/http.test.ts
git commit -m "fix: allow Claude's hosted OAuth callback by default

Claude custom connectors register redirect_uri
https://claude.ai/api/mcp/auth_callback, which the P0-2 allow-list
rejected with 400 invalid_redirect_uri unless the operator set an
undocumented env var. Matched on origin+pathname so a suffix cannot
widen it, and the rejection body now names the override.

Refs #43

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Serve RFC 9728 protected-resource metadata

**Files:**
- Modify: `src/http.ts:37-45` (`isOAuthProxyPath`), and add a route beside the existing metadata route at `src/http.ts:89`
- Test: `src/tests/http.test.ts` — new describe block

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `GET /.well-known/oauth-protected-resource` returning `{resource: string, authorization_servers: string[], bearer_methods_supported: string[]}`. Task 3 points its `WWW-Authenticate` header at this path.

- [ ] **Step 1: Write the failing tests**

Append this describe block to `src/tests/http.test.ts`:

```typescript
describe('createOAuthHandler — protected resource metadata (RFC 9728)', () => {
  afterEach(() => {
    delete process.env.MCP_BASE_URL;
  });

  it('returns resource metadata JSON in OAuth mode', async () => {
    process.env.MCP_BASE_URL = 'https://mcp.example.com';
    const mcpHandler = vi.fn();
    const handler = createOAuthHandler(
      'https://firefly.example.com',
      'client-id-123',
      mcpHandler as unknown as (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>,
    );

    const req = mockReq('GET', '/.well-known/oauth-protected-resource', { host: '127.0.0.1:3000' });
    const res = mockRes();

    await handler(req as http.IncomingMessage, res as unknown as http.ServerResponse);

    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body) as Record<string, unknown>;
    expect(parsed.resource).toBe('https://mcp.example.com');
    expect(parsed.authorization_servers).toEqual(['https://mcp.example.com']);
    expect(parsed.bearer_methods_supported).toEqual(['header']);
    expect(mcpHandler).not.toHaveBeenCalled();
  });

  it('404s the resource metadata endpoint in PAT-only mode', async () => {
    const mcpHandler = vi.fn();
    const handler = createOAuthHandler(
      'https://firefly.example.com',
      undefined,
      mcpHandler as unknown as (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>,
    );

    const req = mockReq('GET', '/.well-known/oauth-protected-resource', { host: '127.0.0.1:3000' });
    const res = mockRes();

    await handler(req as http.IncomingMessage, res as unknown as http.ServerResponse);

    expect(res.statusCode).toBe(404);
  });
});
```

The `expect(mcpHandler).not.toHaveBeenCalled()` assertion is the one that proves the endpoint needs no `Authorization` header — without the new route the request falls through to the `401` branch, so it is worth asserting explicitly rather than trusting the status code alone.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/tests/http.test.ts -t 'protected resource metadata'`

Expected: FAIL. The OAuth-mode test gets `401` (unauthenticated fall-through) instead of `200`. The PAT-only test also gets `401` instead of `404`, because the path is not yet in `isOAuthProxyPath`.

- [ ] **Step 3: Implement**

In `src/http.ts`, add the path to `isOAuthProxyPath`:

```typescript
function isOAuthProxyPath(url: string): boolean {
  return (
    url === '/.well-known/oauth-authorization-server' ||
    url === '/.well-known/oauth-protected-resource' ||
    url.startsWith('/oauth/authorize') ||
    url === '/oauth/register' ||
    url === '/oauth/token' ||
    url.startsWith('/oauth/callback')
  );
}
```

Then add this route immediately before the existing `'/.well-known/oauth-authorization-server'` branch:

```typescript
    // RFC 9728 protected resource metadata — no auth required.
    // Claude's connector flow starts here: it reads the 401 challenge, fetches this
    // document to learn which authorization server guards the resource, then fetches
    // that server's own metadata. `resource` must match the URL the user typed into
    // Claude exactly, which is what makes MCP_BASE_URL load-bearing for connectors.
    if (req.method === 'GET' && req.url === '/.well-known/oauth-protected-resource') {
      const metadata = {
        resource: baseUrl,
        authorization_servers: [baseUrl],
        bearer_methods_supported: ['header'],
      };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(metadata));
      return;
    }
```

`scopes_supported` is deliberately omitted — Firefly III's Passport implementation does not use meaningful scopes, and advertising an empty array would make Claude request no scopes rather than fall back sensibly.

- [ ] **Step 4: Run the full suite to verify green**

Run: `npm run check`

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/http.ts src/tests/http.test.ts
git commit -m "feat: serve RFC 9728 protected resource metadata

Claude's connector OAuth flow discovers the authorization server by
fetching this document. Without it, discovery only worked via a legacy
origin probe of the authorization-server metadata path. PAT-only mode
404s it alongside the rest of the OAuth surface.

Refs #43

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Emit a spec-correct 401 challenge

**Files:**
- Modify: `src/http.ts:234-243` (the unauthenticated branch)
- Test: `src/tests/http.test.ts` — new describe block

**Interfaces:**
- Consumes: the `/.well-known/oauth-protected-resource` path from Task 2.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing tests**

Append this describe block to `src/tests/http.test.ts`:

```typescript
describe('createOAuthHandler — 401 challenge', () => {
  afterEach(() => {
    delete process.env.MCP_BASE_URL;
  });

  it('points at the resource metadata document in OAuth mode', async () => {
    process.env.MCP_BASE_URL = 'https://mcp.example.com';
    const mcpHandler = vi.fn();
    const handler = createOAuthHandler(
      'https://firefly.example.com',
      'client-id-123',
      mcpHandler as unknown as (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>,
    );

    const req = mockReq('POST', '/', { host: '127.0.0.1:3000' });
    const res = mockRes();

    await handler(req as http.IncomingMessage, res as unknown as http.ServerResponse);

    expect(res.statusCode).toBe(401);
    expect(res.writtenHeaders['WWW-Authenticate']).toBe(
      'Bearer resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource"',
    );
  });

  it('omits resource_metadata in PAT-only mode', async () => {
    const mcpHandler = vi.fn();
    const handler = createOAuthHandler(
      'https://firefly.example.com',
      undefined,
      mcpHandler as unknown as (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>,
    );

    const req = mockReq('POST', '/', { host: '127.0.0.1:3000' });
    const res = mockRes();

    await handler(req as http.IncomingMessage, res as unknown as http.ServerResponse);

    expect(res.statusCode).toBe(401);
    expect(res.writtenHeaders['WWW-Authenticate']).toBe('Bearer');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/tests/http.test.ts -t '401 challenge'`

Expected: FAIL. Both get the current `Bearer resource="MCP server for Firefly III"`.

- [ ] **Step 3: Implement**

In `src/http.ts`, replace the unauthenticated branch:

```typescript
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
      // RFC 9728 §5.1: the resource_metadata parameter is how a client discovers
      // where to authenticate. PAT-only mode serves no metadata document, so it
      // sends a bare challenge rather than pointing at a 404.
      const challenge = oauthClientId
        ? `Bearer resource_metadata="${baseUrl}/.well-known/oauth-protected-resource"`
        : 'Bearer';
      res.writeHead(401, {
        'WWW-Authenticate': challenge,
        'Content-Type': 'application/json',
      });
      res.end(JSON.stringify({ error: 'unauthorized', error_description: 'Bearer token required' }));
      return;
    }
```

- [ ] **Step 4: Run the full suite to verify green**

Run: `npm run check`

Expected: all green. If any pre-existing test asserted the old `resource="MCP server for Firefly III"` header, update it to the new value — grep first with `grep -n 'MCP server for Firefly III' src/tests/http.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/http.ts src/tests/http.test.ts
git commit -m "fix: point 401 challenge at resource metadata

The previous challenge used a 'resource' parameter that no MCP client
consumes. Clients need resource_metadata to locate the authorization
server. PAT-only mode keeps a bare Bearer challenge.

Refs #43

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Document `MCP_ALLOWED_REDIRECT_PREFIXES`

**Files:**
- Modify: `docs/reference/env-vars.md` (HTTP transport table), `.env.example`

**Interfaces:**
- Consumes: the default-allow behaviour from Task 1.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the row to the reference table**

In `docs/reference/env-vars.md`, add this row to the **HTTP transport** table, directly after the `MCP_BASE_URL` row:

```markdown
| `MCP_ALLOWED_REDIRECT_PREFIXES` | No | Comma-separated list of extra OAuth `redirect_uri` prefixes to accept. Loopback addresses and Claude's hosted callback (`https://claude.ai/api/mcp/auth_callback`) are always allowed — you only need this for other clients. Ignored in PAT-only mode. |
```

- [ ] **Step 2: Add the block to `.env.example`**

In `.env.example`, insert after the `MCP_BASE_URL` block and before the `FIREFLY_DEBUG` comment:

```bash
# Optional for HTTP transport with OAuth: extra redirect_uri prefixes to accept
# during OAuth client registration, comma-separated. Loopback addresses and
# Claude's hosted callback (https://claude.ai/api/mcp/auth_callback) are always
# allowed, so most setups never need this. Anything else is rejected with
# 400 invalid_redirect_uri.
# MCP_ALLOWED_REDIRECT_PREFIXES=https://my-other-client.example.com
```

- [ ] **Step 3: Verify the docs build**

Run: `npm run docs:build`

Expected: build succeeds with no dead-link warnings.

- [ ] **Step 4: Commit**

```bash
git add docs/reference/env-vars.md .env.example
git commit -m "docs: document MCP_ALLOWED_REDIRECT_PREFIXES

Refs #43

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Add the Claude Desktop guide and the decision rule

**Files:**
- Create: `docs/guide/claude-desktop.md`
- Modify: `docs/guide/index.md` ("Choose your setup" section), `docs/.vitepress/config.ts` (guide sidebar)

**Interfaces:**
- Consumes: `MCP_ALLOWED_REDIRECT_PREFIXES` documented in Task 4 (linked from the new page).
- Produces: the route `/guide/claude-desktop`, linked from Task 6's edits and the README.

- [ ] **Step 1: Create the new guide page**

Create `docs/guide/claude-desktop.md`:

````markdown
# Claude Desktop

Claude Desktop connects to this server in one of three ways. Pick by answering one question: **can the machine running Claude Desktop reach your Firefly III instance directly?**

| Your situation | Use | Why |
|---|---|---|
| Yes, it can reach Firefly III | **[stdio](/guide/stdio)** | One process, no server to host. |
| No — but you can expose this server publicly | **[Custom connector](#option-2-custom-connector-oauth)** | No long-lived token on any device. |
| No, and the server is LAN/VPN-only | **[`mcp-remote` bridge](#option-3-mcp-remote-bridge)** | Fallback when neither of the above fits. |

::: warning `type: "http"` does not work in Claude Desktop
`claude_desktop_config.json` accepts **only** local (stdio) servers. Each entry is validated against `{command, args?, env?, extensionId?}` — there is no `type`, `url`, or `headers` field. An entry using them is dropped at startup and logged as `Skipped invalid MCP server config entries`; the rest of your config still loads.

The `{"type": "http", "url": "..."}` form is **Claude Code** syntax. Verified against Claude Desktop `1.22209.3`.
:::

## Option 1: stdio (recommended)

If the machine running Claude Desktop can reach Firefly III, use [npm + stdio](/guide/stdio). Nothing on this page improves on it.

## Option 2: Custom connector (OAuth)

The only setup where no client device stores a long-lived credential. Requires this server to be reachable **from the public internet** — a custom connector is driven by Anthropic's backend, not by the Claude app on your machine.

**Requirements:**

- Served over HTTPS at a public hostname.
- Reachable from Anthropic's egress range `160.79.104.0/21`. A WAF or IP allow-list in front of either this server *or* your Firefly III instance will break the flow.
- `FIREFLY_OAUTH_CLIENT_ID` set (OAuth mode — see [Docker + HTTP](/guide/docker)).
- `MCP_BASE_URL` set to **exactly** the URL you type into Claude, with no trailing slash. The server publishes it as the `resource` value in its metadata, and Claude requires an exact match.

**Setup:** in Claude Desktop, **Settings → Connectors → Add custom connector**, enter your `MCP_BASE_URL`, and complete the Firefly III sign-in when prompted. Leave the OAuth Client ID and Secret fields empty — this server registers Claude automatically.

::: tip Verifying discovery
```bash
curl -s https://mcp.example.com/.well-known/oauth-protected-resource
curl -sI https://mcp.example.com/ | grep -i www-authenticate
```
The first returns a `resource` matching your URL; the second returns a `resource_metadata` pointer. If either fails, Claude cannot discover where to authenticate.
:::

## Option 3: `mcp-remote` bridge

For a server reachable over LAN or VPN but not publicly. `mcp-remote` runs locally and bridges stdio to your HTTP server.

Run this server in [PAT-only mode](/guide/http-pat) — `FIREFLY_URL` set, `FIREFLY_OAUTH_CLIENT_ID` omitted — then add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "fireflyiii": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://mcp.example.com",
        "--header",
        "Authorization:${AUTH_HEADER}"
      ],
      "env": {
        "AUTH_HEADER": "Bearer your-personal-access-token-here"
      }
    }
  }
}
```

The `${AUTH_HEADER}` indirection is required, not cosmetic: the header value contains a space, which does not survive being passed directly inside `args`.

::: warning
This needs Node.js on the client and puts a Personal Access Token in a plaintext config file — the same costs as [stdio](/guide/stdio), plus an extra process. Use it only when the client genuinely cannot reach Firefly III directly, for example when Firefly III sits behind an auth proxy that a PAT cannot satisfy and this server reaches it over an internal hostname.
:::

## Troubleshooting

Claude Desktop logs MCP activity to `~/Library/Logs/Claude/` (macOS) or `%APPDATA%\Claude\logs` (Windows).

```bash
# Was your config entry accepted?
grep "Skipped invalid MCP server config" ~/Library/Logs/Claude/main.log

# Follow server connection activity
tail -n 20 -f ~/Library/Logs/Claude/mcp*.log
```

**"Couldn't register with … sign-in service"** — the connector's OAuth client registration was rejected. Confirm you are on a server version that allows Claude's callback by default; otherwise set [`MCP_ALLOWED_REDIRECT_PREFIXES`](/reference/env-vars) to `https://claude.ai`.

**"Couldn't reach the MCP server"** — discovery failed. Run the two `curl` commands in Option 2 from outside your network.
````

- [ ] **Step 2: Add the decision rule to the guide index**

In `docs/guide/index.md`, replace the line beginning `**Not sure which to pick?**` with:

```markdown
**Not sure which to pick?** Answer one question: can the machine running your AI client reach Firefly III directly?

- **Yes** → [npm — stdio](./stdio). One process, no server to host, no bridge.
- **No, but you can host this server publicly** → [Docker — HTTP](./docker) with OAuth. The only option where no client device stores a long-lived token.
- **No, and the server stays on your LAN/VPN** → host it over HTTP and bridge with `mcp-remote`.

Using Claude Desktop? See [Claude Desktop](./claude-desktop) — its config file does **not** accept HTTP servers.
```

- [ ] **Step 3: Register the page in the sidebar**

In `docs/.vitepress/config.ts`, add this entry to the `'/guide/'` sidebar `items` array, immediately after the `Git checkout` entry:

```typescript
            { text: 'Claude Desktop', link: '/guide/claude-desktop' },
```

- [ ] **Step 4: Verify the docs build**

Run: `npm run docs:build`

Expected: build succeeds. Confirm no dead-link warnings for `/guide/claude-desktop`, `/guide/http-pat`, `/guide/stdio`, `/guide/docker`, or `/reference/env-vars`.

- [ ] **Step 5: Commit**

```bash
git add docs/guide/claude-desktop.md docs/guide/index.md docs/.vitepress/config.ts
git commit -m "docs: add Claude Desktop guide and setup decision rule

Claude Desktop's config file accepts stdio servers only, which was not
documented anywhere. Adds a per-client page covering all three routes
and a decision rule keyed on whether the client can reach Firefly III.

Refs #43

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Correct the client-config snippets

**Files:**
- Modify: `docs/guide/http-oauth.md` (the "Step 3: Connect your AI client" block, ~line 47), `docs/guide/docker.md` (the "Step 3: Connect your AI client" block, ~line 84), `README.md` (Option 1 section)

**Interfaces:**
- Consumes: the `/guide/claude-desktop` route created in Task 5.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Fix `http-oauth.md`**

In `docs/guide/http-oauth.md`, replace the `::: warning` block that currently reads "The `type: \"http\"` field is required. Without it, Claude Code assumes stdio and fails to connect." with:

```markdown
::: warning Claude Code syntax — not Claude Desktop
The JSON above is for **Claude Code** (`.claude/mcp.json`). The `type: "http"` field is required there; without it Claude Code assumes stdio and fails to connect.

**Claude Desktop does not accept this form.** Its `claude_desktop_config.json` handles stdio servers only, and silently drops entries containing `type` or `url`. See [Claude Desktop](/guide/claude-desktop).
:::
```

- [ ] **Step 2: Fix `docker.md`**

In `docs/guide/docker.md`, replace the entire `## Step 3: Connect your AI client` section (the heading and the JSON block that follows it, through end of file) with:

````markdown
## Step 3: Connect your AI client

For **Claude Code** (`.claude/mcp.json`):

```json
{
  "mcpServers": {
    "fireflyiii": {
      "type": "http",
      "url": "https://mcp.example.com"
    }
  }
}
```

For **Claude Desktop**, this form does not work — its config file accepts stdio servers only. Use a [custom connector or the `mcp-remote` bridge](/guide/claude-desktop).

### Connecting via a custom connector

A custom connector is driven by Anthropic's backend rather than by the Claude app on your machine, so the container must be reachable **from the public internet** — specifically from Anthropic's egress range `160.79.104.0/21`. A WAF or IP allow-list in front of this container, or in front of Firefly III itself, will break the OAuth flow.

`MCP_BASE_URL` must match the URL you type into Claude exactly, with no trailing slash: the server publishes it as the `resource` value in its OAuth metadata, and Claude requires an exact match.

No extra configuration is needed for Claude's OAuth callback — it is allowed by default. Other clients with non-loopback callbacks need [`MCP_ALLOWED_REDIRECT_PREFIXES`](/reference/env-vars).
````

- [ ] **Step 3: Fix the README**

In `README.md`, at the end of the "Option 1: npm package — stdio (simplest)" section, after the line "Your MCP client downloads and starts the server automatically on first use. No separate install step needed.", add:

```markdown
**Claude Desktop users:** this stdio form is the recommended setup. Claude Desktop's config file does *not* accept HTTP servers — see the [Claude Desktop guide](https://daften.github.io/fireflyiii-mcp/guide/claude-desktop) if you need a remote setup.
```

- [ ] **Step 4: Verify the docs build**

Run: `npm run docs:build`

Expected: build succeeds, no dead-link warnings.

- [ ] **Step 5: Commit**

```bash
git add docs/guide/http-oauth.md docs/guide/docker.md README.md
git commit -m "docs: mark HTTP client config as Claude Code syntax

The {type,url} block was presented under a generic 'Connect your AI
client' heading, but Claude Desktop silently discards it. Also documents
the connector reachability and MCP_BASE_URL requirements.

Refs #43

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Changelog

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add entries**

Add to the `Unreleased` section of `CHANGELOG.md` (create the section following the file's existing heading style if absent):

```markdown
### Added
- RFC 9728 protected resource metadata at `/.well-known/oauth-protected-resource`, and a `resource_metadata` pointer on the `401` challenge, so MCP clients can discover the authorization server without a legacy fallback probe.
- Claude Desktop setup guide covering stdio, custom connectors, and the `mcp-remote` bridge.
- `MCP_ALLOWED_REDIRECT_PREFIXES` is now documented in the environment variable reference and `.env.example`.

### Fixed
- Claude custom connectors could not complete OAuth: the redirect URI allow-list rejected `https://claude.ai/api/mcp/auth_callback` unless an undocumented environment variable was set. It is now allowed by default, matched exactly on origin and path. ([#43](https://github.com/daften/fireflyiii-mcp/issues/43))
- `400 invalid_redirect_uri` responses now name `MCP_ALLOWED_REDIRECT_PREFIXES` so the override is discoverable.
```

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: changelog for Claude connector support

Refs #43

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification

- [ ] Run `npm run check` — Biome, `tsc --noEmit`, and the full Vitest suite all green.
- [ ] Run `npm run build` — compiles to `dist/`.
- [ ] Run `npm run docs:build` — VitePress builds with no dead links.
- [ ] Confirm PAT-only mode is unchanged: `npx vitest run src/tests/http.test.ts -t 'PAT'`.

**Manual, post-merge, not a CI gate:** end-to-end connector verification requires a publicly reachable deployment on `160.79.104.0/21`. Deploy, add it as a custom connector in Claude Desktop, and confirm the OAuth flow completes. The unit tests cover this server's half of the handshake only — they cannot prove Anthropic's backend completes it.
