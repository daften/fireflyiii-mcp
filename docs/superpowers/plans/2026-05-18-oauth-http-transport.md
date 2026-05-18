# OAuth HTTP Transport Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add MCP-spec OAuth to the HTTP transport so the endpoint is protected and Firefly III tokens come from Claude's OAuth flow rather than a static env var.

**Architecture:** `http.ts` gains a `createOAuthHandler` factory (exported for tests) that serves the discovery endpoint and enforces Bearer auth via `AsyncLocalStorage`. `client.ts` accepts `string | (() => string)` for the token so the resolver reads from `AsyncLocalStorage` per request. `index.ts` branches env-var validation by transport. stdio is untouched.

**Tech Stack:** Node.js `AsyncLocalStorage` (`node:async_hooks`), RFC 8414 metadata JSON, Vitest, existing MCP SDK + Firefly III client.

---

## File Map

| File | Change |
|---|---|
| `src/http.ts` | Export `requestContext` (AsyncLocalStorage) + `createOAuthHandler`; update `startHttpServer` signature |
| `src/client.ts` | `token` param: `string → string \| (() => string)`; add `getToken()` |
| `src/index.ts` | Transport-aware env var validation; HTTP path uses AsyncLocalStorage resolver |
| `src/tests/http.test.ts` | New — tests for metadata endpoint and Bearer guard |
| `src/tests/client.test.ts` | Add two tests for token resolver |
| `.env.example` | Add `FIREFLY_OAUTH_CLIENT_ID` entry |
| `README.md` | Add HTTP OAuth setup section |
| `dist/` | Rebuilt after all source changes |

---

## Task 1: Create feature branch

- [ ] **Step 1: Create and check out the feature branch**

```bash
git checkout -b feature/oauth-http-transport
```

Expected: `Switched to a new branch 'feature/oauth-http-transport'`

---

## Task 2: Update `FireflyClient` to support a token resolver function

**Files:**
- Modify: `src/client.ts`
- Modify: `src/tests/client.test.ts`

- [ ] **Step 1: Add two failing tests to `src/tests/client.test.ts`**

Add these two `it` blocks inside the existing `describe('FireflyClient', () => {` block, after the last existing test in that block (after the `'throws FireflyError with correct status on 500'` test):

```typescript
  it('calls token resolver function at request time', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [] }), { status: 200 })
    );
    const resolver = vi.fn().mockReturnValue('resolved-token');
    const client = new FireflyClient('https://firefly.example.com', resolver);
    await client.get('/accounts');
    expect(resolver).toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer resolved-token' }),
      })
    );
  });

  it('resolver is called on every request, not just construction', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }));
    let callCount = 0;
    const resolver = vi.fn().mockImplementation(() => `token-${++callCount}`);
    const client = new FireflyClient('https://firefly.example.com', resolver);
    await client.get('/accounts');
    await client.get('/budgets');
    expect(resolver).toHaveBeenCalledTimes(2);
    const firstCall = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    const secondCall = vi.mocked(fetch).mock.calls[1][1] as RequestInit;
    expect((firstCall.headers as Record<string, string>)['Authorization']).toBe('Bearer token-1');
    expect((secondCall.headers as Record<string, string>)['Authorization']).toBe('Bearer token-2');
  });
```

- [ ] **Step 2: Run the new tests to confirm they fail**

```bash
cd /Volumes/Webdev/Personal/claude/fireflyiii-mcp && npm test -- --reporter=verbose src/tests/client.test.ts
```

Expected: Both new tests fail with a TypeScript or runtime error (FireflyClient constructor does not accept a function yet).

- [ ] **Step 3: Update `src/client.ts` — change constructor and add `getToken()`**

Replace the entire `FireflyClient` class with:

```typescript
export class FireflyClient {
  private readonly baseUrl: string;
  private readonly timeoutMs = 30_000;

  constructor(baseUrl: string, private readonly tokenResolver: string | (() => string)) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  private getToken(): string {
    return typeof this.tokenResolver === 'function' ? this.tokenResolver() : this.tokenResolver;
  }

  private async request<T>(method: string, url: string, body?: unknown): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await fetch(url, {
        method,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.getToken()}`,
          Accept: 'application/json',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`Request to ${url} timed out after ${this.timeoutMs}ms.`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) {
      const responseBody = await response.text().catch(() => '');
      throw new FireflyError(response.status, url, responseBody);
    }
    if (response.status === 204) return undefined as T;
    return response.json() as T;
  }

  async get<T = unknown>(path: string, params?: QueryParams): Promise<T> {
    const url = new URL(`${this.baseUrl}/api/v1${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    }
    return this.request<T>('GET', url.toString());
  }

  async post<T = unknown>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', `${this.baseUrl}/api/v1${path}`, body);
  }

  async put<T = unknown>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PUT', `${this.baseUrl}/api/v1${path}`, body);
  }

  async delete(path: string): Promise<void> {
    await this.request<void>('DELETE', `${this.baseUrl}/api/v1${path}`);
  }
}
```

- [ ] **Step 4: Run all client tests to verify all pass**

```bash
npm test -- --reporter=verbose src/tests/client.test.ts
```

Expected: All tests pass (existing tests still work because `string` is still accepted).

- [ ] **Step 5: Commit**

```bash
git add src/client.ts src/tests/client.test.ts
git commit -m "$(cat <<'EOF'
feat: support token resolver function in FireflyClient

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Add `createOAuthHandler` to `http.ts` and write tests

**Files:**
- Modify: `src/http.ts`
- Create: `src/tests/http.test.ts`

- [ ] **Step 1: Create `src/tests/http.test.ts` with failing tests**

```typescript
import { describe, it, expect, vi } from 'vitest';
import * as http from 'node:http';
import { createOAuthHandler, requestContext } from '../http.js';

function mockReq(
  method: string,
  url: string,
  headers: Record<string, string> = {}
): http.IncomingMessage {
  return { method, url, headers } as unknown as http.IncomingMessage;
}

function mockRes() {
  const result = {
    statusCode: 200,
    writtenHeaders: {} as Record<string, string | string[]>,
    body: '',
    headersSent: false,
    writeHead(code: number, hdrs?: Record<string, string>) {
      result.statusCode = code;
      if (hdrs) Object.assign(result.writtenHeaders, hdrs);
      result.headersSent = true;
    },
    end(data?: string) {
      if (data) result.body = data;
    },
  };
  return result;
}

describe('createOAuthHandler — metadata endpoint', () => {
  it('returns OAuth metadata JSON for GET /.well-known/oauth-authorization-server', async () => {
    const mcpHandler = vi.fn();
    const handler = createOAuthHandler(
      'https://firefly.example.com',
      'client-id-123',
      mcpHandler as unknown as (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>
    );

    const req = mockReq('GET', '/.well-known/oauth-authorization-server');
    const res = mockRes();

    await handler(req as http.IncomingMessage, res as unknown as http.ServerResponse);

    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body) as Record<string, unknown>;
    expect(parsed['issuer']).toBe('https://firefly.example.com');
    expect(parsed['authorization_endpoint']).toBe('https://firefly.example.com/oauth/authorize');
    expect(parsed['token_endpoint']).toBe('https://firefly.example.com/oauth/token');
    expect(parsed['response_types_supported']).toEqual(['code']);
    expect(parsed['grant_types_supported']).toEqual(['authorization_code', 'refresh_token']);
    expect(parsed['code_challenge_methods_supported']).toEqual(['S256']);
    expect(parsed['client_id']).toBe('client-id-123');
    expect(mcpHandler).not.toHaveBeenCalled();
  });

  it('does not require Authorization header for metadata endpoint', async () => {
    const mcpHandler = vi.fn();
    const handler = createOAuthHandler(
      'https://firefly.example.com',
      'client-id-123',
      mcpHandler as unknown as (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>
    );

    const req = mockReq('GET', '/.well-known/oauth-authorization-server');
    const res = mockRes();

    await handler(req as http.IncomingMessage, res as unknown as http.ServerResponse);

    expect(res.statusCode).toBe(200);
  });
});

describe('createOAuthHandler — Bearer guard', () => {
  it('returns 401 with WWW-Authenticate when Authorization header is missing', async () => {
    const mcpHandler = vi.fn();
    const handler = createOAuthHandler(
      'https://firefly.example.com',
      'client-id-123',
      mcpHandler as unknown as (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>
    );

    const req = mockReq('POST', '/mcp');
    const res = mockRes();

    await handler(req as http.IncomingMessage, res as unknown as http.ServerResponse);

    expect(res.statusCode).toBe(401);
    expect(res.writtenHeaders['WWW-Authenticate']).toBe('Bearer resource="Firefly III MCP"');
    expect(mcpHandler).not.toHaveBeenCalled();
  });

  it('returns 401 when Authorization header is not a Bearer token', async () => {
    const mcpHandler = vi.fn();
    const handler = createOAuthHandler(
      'https://firefly.example.com',
      'client-id-123',
      mcpHandler as unknown as (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>
    );

    const req = mockReq('POST', '/mcp', { authorization: 'Basic dXNlcjpwYXNz' });
    const res = mockRes();

    await handler(req as http.IncomingMessage, res as unknown as http.ServerResponse);

    expect(res.statusCode).toBe(401);
    expect(mcpHandler).not.toHaveBeenCalled();
  });

  it('calls mcpHandler and stores Bearer token in requestContext', async () => {
    let capturedToken: string | undefined;
    const mcpHandler = vi.fn().mockImplementation(async () => {
      capturedToken = requestContext.getStore()?.token;
    });
    const handler = createOAuthHandler(
      'https://firefly.example.com',
      'client-id-123',
      mcpHandler as unknown as (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>
    );

    const req = mockReq('POST', '/mcp', { authorization: 'Bearer test-token-xyz' });
    const res = mockRes();

    await handler(req as http.IncomingMessage, res as unknown as http.ServerResponse);

    expect(mcpHandler).toHaveBeenCalled();
    expect(capturedToken).toBe('test-token-xyz');
  });

  it('token in requestContext is not available outside the request', async () => {
    const mcpHandler = vi.fn().mockResolvedValue(undefined);
    const handler = createOAuthHandler(
      'https://firefly.example.com',
      'client-id-123',
      mcpHandler as unknown as (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>
    );

    const req = mockReq('POST', '/mcp', { authorization: 'Bearer isolated-token' });
    const res = mockRes();

    await handler(req as http.IncomingMessage, res as unknown as http.ServerResponse);

    expect(requestContext.getStore()).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the new tests to confirm they fail**

```bash
npm test -- --reporter=verbose src/tests/http.test.ts
```

Expected: All 6 tests fail — `createOAuthHandler` and `requestContext` are not exported from `http.ts` yet.

- [ ] **Step 3: Rewrite `src/http.ts` with OAuth handler**

Replace the entire contents of `src/http.ts` with:

```typescript
import * as http from 'node:http';
import { AsyncLocalStorage } from 'node:async_hooks';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

interface RequestContext {
  token: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

export function createOAuthHandler(
  fireflyUrl: string,
  oauthClientId: string,
  mcpHandler: (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>
): (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void> {
  return async (req, res) => {
    if (req.method === 'GET' && req.url === '/.well-known/oauth-authorization-server') {
      const metadata = {
        issuer: fireflyUrl,
        authorization_endpoint: `${fireflyUrl}/oauth/authorize`,
        token_endpoint: `${fireflyUrl}/oauth/token`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        code_challenge_methods_supported: ['S256'],
        client_id: oauthClientId,
      };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(metadata));
      return;
    }

    const authHeader = req.headers['authorization'];
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
      res.writeHead(401, {
        'WWW-Authenticate': 'Bearer resource="Firefly III MCP"',
        'Content-Type': 'application/json',
      });
      res.end(JSON.stringify({ error: 'unauthorized', error_description: 'Bearer token required' }));
      return;
    }

    await requestContext.run({ token }, () => mcpHandler(req, res));
  };
}

async function tryListen(httpServer: http.Server, host: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, host, () => {
      httpServer.removeListener('error', reject);
      resolve();
    });
  });
}

export async function startHttpServer(
  server: McpServer,
  host: string,
  requestedPort: number,
  portWasExplicit: boolean,
  oauthClientId: string,
  fireflyUrl: string
): Promise<void> {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  const oauthHandler = createOAuthHandler(fireflyUrl, oauthClientId, (req, res) =>
    transport.handleRequest(req, res)
  );

  const httpServer = http.createServer(async (req, res) => {
    try {
      await oauthHandler(req, res);
    } catch (err) {
      process.stderr.write(`HTTP request handler error: ${err}\n`);
      if (!res.headersSent) {
        res.writeHead(500);
        res.end('Internal server error');
      }
    }
  });

  let port = requestedPort;
  let moved = false;

  while (true) {
    try {
      await tryListen(httpServer, host, port);
      break;
    } catch (err: unknown) {
      const nodeErr = err as NodeJS.ErrnoException;
      if (nodeErr.code !== 'EADDRINUSE') {
        throw err;
      }
      if (portWasExplicit) {
        process.stderr.write(`Error: Port ${port} on ${host} is already in use. Choose a different port with --port.\n`);
        process.exit(1);
      }
      const attempted = port - requestedPort;
      if (attempted >= 10) {
        process.stderr.write(
          `Error: Ports ${requestedPort}–${requestedPort + 10} on ${host} are all in use. Specify an available port with --port.\n`
        );
        process.exit(1);
      }
      port++;
      moved = true;
    }
  }

  httpServer.on('error', (err) => {
    process.stderr.write(`HTTP server error: ${err}\n`);
  });

  await server.connect(transport);

  process.stdout.write(`Firefly III MCP server listening on http://${host}:${port}\n`);
  if (moved) {
    process.stdout.write(`(port ${requestedPort} was in use — moved up automatically)\n`);
  }
}
```

- [ ] **Step 4: Run all tests to verify http tests pass and nothing else broke**

```bash
npm test -- --reporter=verbose
```

Expected: All tests pass including the 6 new http tests.

- [ ] **Step 5: Commit**

```bash
git add src/http.ts src/tests/http.test.ts
git commit -m "$(cat <<'EOF'
feat: add OAuth discovery endpoint and Bearer guard to HTTP transport

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Update `index.ts` for transport-aware env var validation

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Replace the contents of `src/index.ts`**

```typescript
#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { FireflyClient } from './client.js';
import { createServer } from './server.js';
import { startHttpServer, requestContext } from './http.js';

interface ParsedArgs {
  transport: 'stdio' | 'http';
  host: string;
  port: number;
  portWasExplicit: boolean;
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  let transport: 'stdio' | 'http' = 'stdio';
  let host = '127.0.0.1';
  let port = 3000;
  let portWasExplicit = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--transport' && args[i + 1]) {
      const val = args[++i];
      if (val !== 'stdio' && val !== 'http') {
        process.stderr.write(`Error: --transport must be "stdio" or "http", got "${val}"\n`);
        process.exit(1);
      }
      transport = val;
    } else if (args[i] === '--host' && args[i + 1]) {
      host = args[++i];
    } else if (args[i] === '--port' && args[i + 1]) {
      const parsed = parseInt(args[++i], 10);
      if (isNaN(parsed) || parsed < 1 || parsed > 65535) {
        process.stderr.write('Error: --port must be a valid port number (1–65535)\n');
        process.exit(1);
      }
      port = parsed;
      portWasExplicit = true;
    }
  }

  return { transport, host, port, portWasExplicit };
}

const { transport, host, port, portWasExplicit } = parseArgs();

const url = process.env['FIREFLY_URL'];

if (transport === 'http') {
  const oauthClientId = process.env['FIREFLY_OAUTH_CLIENT_ID'];
  if (!url || !oauthClientId) {
    process.stderr.write(
      'Error: FIREFLY_URL and FIREFLY_OAUTH_CLIENT_ID environment variables are required for HTTP transport.\n' +
      'See .env.example for configuration instructions.\n'
    );
    process.exit(1);
  }
  const client = new FireflyClient(url, () => {
    const store = requestContext.getStore();
    if (!store) throw new Error('No request context — Bearer token was not set before this call');
    return store.token;
  });
  const server = createServer(client);
  await startHttpServer(server, host, port, portWasExplicit, oauthClientId, url);
} else {
  const token = process.env['FIREFLY_TOKEN'];
  if (!url || !token) {
    process.stderr.write(
      'Error: FIREFLY_URL and FIREFLY_TOKEN environment variables are required for stdio transport.\n' +
      'See .env.example for configuration instructions.\n'
    );
    process.exit(1);
  }
  const client = new FireflyClient(url, token);
  const server = createServer(client);
  const stdioTransport = new StdioServerTransport();
  await server.connect(stdioTransport);
}
```

- [ ] **Step 2: Run all tests to confirm nothing broke**

```bash
npm test -- --reporter=verbose
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "$(cat <<'EOF'
feat: transport-aware env var validation in index.ts

HTTP transport now requires FIREFLY_OAUTH_CLIENT_ID instead of FIREFLY_TOKEN.
stdio transport validation error messages now name the transport explicitly.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Update `.env.example`

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Read the current `.env.example`**

Read the file at `/Volumes/Webdev/Personal/claude/fireflyiii-mcp/.env.example` first.

- [ ] **Step 2: Replace the contents of `.env.example`**

```
# Required for both transports
FIREFLY_URL=https://your-firefly-instance.example.com

# Required for stdio transport (default)
FIREFLY_TOKEN=your-personal-access-token-here

# Required for HTTP transport (--transport http)
# Create a public OAuth client in Firefly III: Profile → OAuth → OAuth Clients → Create New Client
# Mark as "Public client" (no secret required — uses PKCE).
# Copy the Client ID here:
# FIREFLY_OAUTH_CLIENT_ID=your-oauth-client-id-here
```

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "$(cat <<'EOF'
chore: add FIREFLY_OAUTH_CLIENT_ID to .env.example

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Update `README.md` with HTTP OAuth setup instructions

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Read the current `README.md`**

Read the file at `/Volumes/Webdev/Personal/claude/fireflyiii-mcp/README.md`.

- [ ] **Step 2: Add an HTTP transport section after the existing "Claude Code Integration" section**

Insert the following block after the existing `## Claude Code Integration` section and before `## Available Tools`:

```markdown
## HTTP Transport with OAuth

The HTTP transport requires OAuth instead of a Personal Access Token. The MCP client (e.g. Claude Desktop) handles the OAuth flow automatically.

### Setup

1. **Register a public OAuth client in Firefly III**
   - Go to Profile → OAuth → OAuth Clients → Create New Client
   - Name: anything (e.g. `Claude MCP`)
   - Redirect URL: the redirect URI your MCP client uses (Claude will provide this on first connect)
   - Check **Public client** — no secret required, uses PKCE
   - Save and copy the **Client ID**

2. **Configure `.env` for HTTP mode**

   ```bash
   FIREFLY_URL=https://your-firefly-instance.example.com
   FIREFLY_OAUTH_CLIENT_ID=your-client-id-here
   ```

3. **Start the server in HTTP mode**

   ```bash
   npm run dev -- --transport http
   # or on a specific port:
   npm run dev -- --transport http --port 4000
   ```

4. **Point Claude at the server**

   Add to your MCP config:
   ```json
   {
     "mcpServers": {
       "fireflyiii": {
         "url": "http://127.0.0.1:3000/mcp"
       }
     }
   }
   ```

   On first connection Claude will open a browser window to authorize with Firefly III. After that, tokens are managed automatically.

### OAuth discovery

The server exposes `GET /.well-known/oauth-authorization-server` (no auth required) which returns RFC 8414 metadata pointing to your Firefly III instance. MCP clients use this to discover the authorization and token endpoints.
```

- [ ] **Step 3: Run all tests one more time to confirm everything still passes**

```bash
npm test -- --reporter=verbose
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "$(cat <<'EOF'
docs: add HTTP transport OAuth setup instructions to README

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Build and commit `dist/`

- [ ] **Step 1: Build**

```bash
npm run build
```

Expected: No TypeScript errors. `dist/` files updated.

- [ ] **Step 2: Verify the build output looks right**

```bash
ls dist/
```

Expected: `index.js`, `server.js`, `client.js`, `http.js`, `transform.js`, `types.js`, `tools/` directory — same as before.

- [ ] **Step 3: Commit dist alongside source**

```bash
git add dist/
git commit -m "$(cat <<'EOF'
chore: build dist for oauth-http-transport feature

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Checklist

- **Spec coverage:**
  - ✅ `/.well-known/oauth-authorization-server` endpoint — Task 3
  - ✅ Bearer guard → 401 with `WWW-Authenticate` — Task 3
  - ✅ Token in `AsyncLocalStorage` per request — Task 3
  - ✅ `FireflyClient` token resolver — Task 2
  - ✅ HTTP requires `FIREFLY_URL` + `FIREFLY_OAUTH_CLIENT_ID` — Task 4
  - ✅ stdio requires `FIREFLY_URL` + `FIREFLY_TOKEN` (unchanged behaviour, clearer error) — Task 4
  - ✅ `requestContext` exported from `http.ts` for `index.ts` — Task 3
  - ✅ `.env.example` updated — Task 5
  - ✅ README setup instructions — Task 6
  - ✅ `dist/` committed — Task 7

- **Type consistency:** `requestContext` is `AsyncLocalStorage<{ token: string }>` throughout. `tokenResolver` field name used consistently in `client.ts`. `createOAuthHandler` signature matches its usage in `startHttpServer` and in tests.

- **No placeholders:** All steps contain full code.
