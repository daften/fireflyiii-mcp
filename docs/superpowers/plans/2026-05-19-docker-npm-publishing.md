# Docker + npm Publishing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Docker container for self-hosted HTTP deployment and configure the project for publishing to npm (`@daften/fireflyiii-mcp`) and GitHub Container Registry (`ghcr.io/daften/fireflyiii-mcp`).

**Architecture:** A multi-stage Dockerfile compiles TypeScript fresh and produces a minimal Alpine image that starts the server in HTTP mode. `src/http.ts` gains a `MCP_BASE_URL` env var override so OAuth callback URLs use the externally reachable address instead of the internal `Host` header. npm and Docker image publishing both fire from a single GitHub Actions workflow on `v*` tag push.

**Tech Stack:** Node.js 18 Alpine, Docker multi-stage build, GitHub Actions (`docker/login-action`, `docker/build-push-action`, `actions/setup-node`), ghcr.io, npm scoped packages.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `src/http.ts` | Modify | Replace `host`-derived URLs with `baseUrl` from `MCP_BASE_URL` env var or `Host` header fallback |
| `src/tests/http.test.ts` | Modify | Add `MCP_BASE_URL` override tests |
| `Dockerfile` | Create | Multi-stage Alpine build; CMD starts HTTP mode |
| `docker-compose.yml` | Create | Single-service compose; pulls from ghcr.io by default |
| `package.json` | Modify | Rename to `@daften/fireflyiii-mcp`; add `files`, `publishConfig`, `prepublishOnly`, metadata |
| `.github/workflows/publish.yml` | Create | On `v*` tag: publish to npm + build+push Docker image |
| `README.md` | Modify | Add Docker section; add npm install instructions; update roadmap |

---

## Task 1: Add failing tests for `MCP_BASE_URL` override

**Files:**
- Modify: `src/tests/http.test.ts`

- [ ] **Step 1: Add the new describe block at the end of `src/tests/http.test.ts`**

Append after line 472 (after the closing `});` of the `Bearer guard` describe):

```typescript
describe('createOAuthHandler — MCP_BASE_URL override', () => {
  afterEach(() => {
    delete process.env['MCP_BASE_URL'];
    vi.restoreAllMocks();
  });

  it('uses MCP_BASE_URL for OAuth metadata endpoints when set', async () => {
    process.env['MCP_BASE_URL'] = 'https://mcp.example.com';
    const mcpHandler = vi.fn();
    const handler = createOAuthHandler(
      'https://firefly.example.com',
      'client-id-123',
      mcpHandler as unknown as (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>
    );

    const req = mockReq('GET', '/.well-known/oauth-authorization-server', { host: '127.0.0.1:3000' });
    const res = mockRes();

    await handler(req as http.IncomingMessage, res as unknown as http.ServerResponse);

    const parsed = JSON.parse(res.body) as Record<string, unknown>;
    expect(parsed['authorization_endpoint']).toBe('https://mcp.example.com/oauth/authorize');
    expect(parsed['token_endpoint']).toBe('https://mcp.example.com/oauth/token');
    expect(parsed['registration_endpoint']).toBe('https://mcp.example.com/oauth/register');
  });

  it('uses MCP_BASE_URL for stable redirect_uri in authorize proxy', async () => {
    process.env['MCP_BASE_URL'] = 'https://mcp.example.com';
    const mcpHandler = vi.fn();
    const handler = createOAuthHandler(
      'https://firefly.example.com',
      'client-id-123',
      mcpHandler as unknown as (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>
    );

    const req = mockReq(
      'GET',
      '/oauth/authorize?response_type=code&redirect_uri=http%3A%2F%2Flocalhost%3A9999%2Fcallback',
      { host: '127.0.0.1:3000' }
    );
    const res = mockRes();

    await handler(req as http.IncomingMessage, res as unknown as http.ServerResponse);

    const location = res.writtenHeaders['Location'] as string;
    const locationUrl = new URL(location);
    expect(locationUrl.searchParams.get('redirect_uri')).toBe('https://mcp.example.com/oauth/callback');
  });

  it('strips trailing slash from MCP_BASE_URL', async () => {
    process.env['MCP_BASE_URL'] = 'https://mcp.example.com/';
    const mcpHandler = vi.fn();
    const handler = createOAuthHandler(
      'https://firefly.example.com',
      'client-id-123',
      mcpHandler as unknown as (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>
    );

    const req = mockReq('GET', '/.well-known/oauth-authorization-server', { host: '127.0.0.1:3000' });
    const res = mockRes();

    await handler(req as http.IncomingMessage, res as unknown as http.ServerResponse);

    const parsed = JSON.parse(res.body) as Record<string, unknown>;
    expect(parsed['authorization_endpoint']).toBe('https://mcp.example.com/oauth/authorize');
  });

  it('uses MCP_BASE_URL for redirect_uri in token proxy', async () => {
    process.env['MCP_BASE_URL'] = 'https://mcp.example.com';
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      text: () => Promise.resolve('{}'),
      headers: { get: () => 'application/json' },
    });
    vi.stubGlobal('fetch', mockFetch);

    const mcpHandler = vi.fn();
    const handler = createOAuthHandler(
      'https://firefly.example.com',
      'client-id-123',
      mcpHandler as unknown as (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>
    );

    const body = 'grant_type=authorization_code&code=abc&redirect_uri=http%3A%2F%2Flocalhost%3A9999%2Fcallback';
    const req = mockReq('POST', '/oauth/token', { host: '127.0.0.1:3000' }, body);
    const res = mockRes();

    await handler(req as http.IncomingMessage, res as unknown as http.ServerResponse);

    const [, fetchInit] = mockFetch.mock.calls[0] as [string, RequestInit];
    const sentParams = new URLSearchParams(fetchInit.body as string);
    expect(sentParams.get('redirect_uri')).toBe('https://mcp.example.com/oauth/callback');
  });
});
```

- [ ] **Step 2: Run tests to confirm the new tests fail**

```bash
npm test -- --reporter=verbose 2>&1 | grep -A 3 "MCP_BASE_URL"
```

Expected: 4 new tests fail — the metadata and authorize/token redirect_uri assertions see `http://127.0.0.1:3000/...` instead of `https://mcp.example.com/...`.

---

## Task 2: Implement `MCP_BASE_URL` in `src/http.ts`

**Files:**
- Modify: `src/http.ts`

The handler currently derives callback URLs from `const host = req.headers['host'] ?? '127.0.0.1:3000'` and prefixes with `http://`. Replace that variable with a `baseUrl` that reads `MCP_BASE_URL` first.

- [ ] **Step 1: Replace the `host` variable declaration (line 30)**

Find:
```typescript
    const host = req.headers['host'] ?? '127.0.0.1:3000';
```

Replace with:
```typescript
    const baseUrl =
      process.env['MCP_BASE_URL']?.replace(/\/$/, '') ??
      `http://${req.headers['host'] ?? '127.0.0.1:3000'}`;
```

- [ ] **Step 2: Update the OAuth metadata endpoint (lines 38–40)**

Find:
```typescript
        authorization_endpoint: `http://${host}/oauth/authorize`,
        token_endpoint: `http://${host}/oauth/token`,
        registration_endpoint: `http://${host}/oauth/register`,
```

Replace with:
```typescript
        authorization_endpoint: `${baseUrl}/oauth/authorize`,
        token_endpoint: `${baseUrl}/oauth/token`,
        registration_endpoint: `${baseUrl}/oauth/register`,
```

- [ ] **Step 3: Update the authorize proxy redirect_uri (line 64)**

Find:
```typescript
          key === 'redirect_uri' ? `http://${host}/oauth/callback` : value
```

Replace with:
```typescript
          key === 'redirect_uri' ? `${baseUrl}/oauth/callback` : value
```

- [ ] **Step 4: Update the registration stub redirect_uris (line 95)**

Find:
```typescript
        redirect_uris: redirectUris.length > 0 ? [`http://${host}/oauth/callback`] : [],
```

Replace with:
```typescript
        redirect_uris: redirectUris.length > 0 ? [`${baseUrl}/oauth/callback`] : [],
```

- [ ] **Step 5: Update the token proxy redirect_uri (line 109)**

Find:
```typescript
        params.set('redirect_uri', `http://${host}/oauth/callback`);
```

Replace with:
```typescript
        params.set('redirect_uri', `${baseUrl}/oauth/callback`);
```

- [ ] **Step 6: Update the callback URL parser (line 127)**

Find:
```typescript
      const incomingUrl = new URL(req.url, `http://${host}`);
```

Replace with:
```typescript
      const incomingUrl = new URL(req.url, baseUrl);
```

- [ ] **Step 7: Run all tests and confirm they all pass**

```bash
npm test
```

Expected: all tests pass, including the 4 new `MCP_BASE_URL` tests.

- [ ] **Step 8: Commit**

```bash
git add src/http.ts src/tests/http.test.ts
git commit -m "feat: support MCP_BASE_URL for OAuth callback URLs in HTTP mode

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Create `Dockerfile`

**Files:**
- Create: `Dockerfile`

- [ ] **Step 1: Create `Dockerfile` at the project root**

```dockerfile
# Stage 1: build
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: runtime
FROM node:18-alpine AS runtime
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/index.js", "--transport", "http", "--host", "0.0.0.0"]
```

- [ ] **Step 2: Build the image to confirm it compiles cleanly**

```bash
docker build -t fireflyiii-mcp-test .
```

Expected: build completes with no errors; two stages visible in output.

- [ ] **Step 3: Verify the image starts and prints the expected error when env vars are missing**

```bash
docker run --rm fireflyiii-mcp-test 2>&1 || true
```

Expected output contains:
```
Error: FIREFLY_URL and FIREFLY_OAUTH_CLIENT_ID environment variables are required for HTTP transport.
```

- [ ] **Step 4: Commit**

```bash
git add Dockerfile
git commit -m "feat: add multi-stage Dockerfile for HTTP mode deployment

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Create `docker-compose.yml`

**Files:**
- Create: `docker-compose.yml`

- [ ] **Step 1: Create `docker-compose.yml` at the project root**

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

- [ ] **Step 2: Validate the compose file**

```bash
docker compose config
```

Expected: outputs the resolved config with no errors.

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml
git commit -m "feat: add docker-compose.yml for self-hosted HTTP deployment

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 5: Update `package.json` for npm publishing

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Apply all changes to `package.json`**

Replace the entire file with:

```json
{
  "name": "@daften/fireflyiii-mcp",
  "version": "0.1.0",
  "description": "MCP server for Firefly III personal finance manager",
  "type": "module",
  "bin": {
    "fireflyiii-mcp": "dist/index.js"
  },
  "files": [
    "dist",
    "README.md",
    "LICENSE",
    ".env.example"
  ],
  "scripts": {
    "build": "tsc && chmod +x dist/index.js",
    "prepublishOnly": "npm run build",
    "dev": "dotenv -e .env -- tsx src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:integration": "dotenv -e .env.test -- vitest run src/tests/integration.test.ts"
  },
  "publishConfig": {
    "access": "public"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/daften/fireflyiii-mcp.git"
  },
  "keywords": [
    "firefly-iii",
    "mcp",
    "finance",
    "model-context-protocol",
    "claude"
  ],
  "homepage": "https://github.com/daften/fireflyiii-mcp",
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "dotenv-cli": "^11.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.0.0",
    "vitest": "^2.0.0"
  },
  "engines": {
    "node": ">=18"
  },
  "license": "MIT"
}
```

- [ ] **Step 2: Verify the published file list with a dry run**

```bash
npm pack --dry-run
```

Expected output lists only: `dist/` files, `README.md`, `LICENSE`, `.env.example`. Should NOT include `src/`, `node_modules/`, `docs/`, `.env`.

- [ ] **Step 3: Run tests to confirm nothing broke**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "feat: configure package.json for npm publishing as @daften/fireflyiii-mcp

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 6: Create GitHub Actions publish workflow

**Files:**
- Create: `.github/workflows/publish.yml`

- [ ] **Step 1: Create the workflows directory and file**

```bash
mkdir -p .github/workflows
```

- [ ] **Step 2: Create `.github/workflows/publish.yml`**

```yaml
name: Publish

on:
  push:
    tags:
      - 'v*'

jobs:
  publish-npm:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 18
          registry-url: 'https://registry.npmjs.org'

      - run: npm ci

      - run: npm run build

      - run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

  publish-docker:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4

      - name: Log in to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract version from tag
        id: version
        run: echo "version=${GITHUB_REF_NAME#v}" >> $GITHUB_OUTPUT

      - name: Build and push Docker image
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: |
            ghcr.io/daften/fireflyiii-mcp:${{ steps.version.outputs.version }}
            ghcr.io/daften/fireflyiii-mcp:latest
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/publish.yml
git commit -m "ci: add publish workflow for npm and Docker on version tag

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 7: Update README with Docker and npm install instructions

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add npm install section**

After the `## Prerequisites` section and before `## Installation`, insert:

```markdown
## Install from npm

```bash
npx @daften/fireflyiii-mcp --transport http
```

Or install globally:

```bash
npm install -g @daften/fireflyiii-mcp
fireflyiii-mcp --transport http
```
```

- [ ] **Step 2: Add Docker section**

After the `## HTTP Transport with OAuth` section (around line 117, after the OAuth discovery block) and before `## Available Tools`, insert:

```markdown
## Docker

### Pull and run

```bash
docker pull ghcr.io/daften/fireflyiii-mcp:latest
docker run \
  -e FIREFLY_URL=https://your-firefly-instance.example.com \
  -e FIREFLY_OAUTH_CLIENT_ID=your-client-id \
  -e MCP_BASE_URL=https://mcp.example.com \
  -p 3000:3000 \
  ghcr.io/daften/fireflyiii-mcp:latest
```

`MCP_BASE_URL` must be the **externally reachable URL** of your container — this is what the MCP client uses to reach the server and what gets registered as the OAuth redirect URI. If omitted, the server falls back to the `Host` request header (fine for local dev, unreliable behind a reverse proxy).

### docker-compose

Copy `docker-compose.yml` from the repo, set your env vars, and run:

```bash
FIREFLY_URL=https://firefly.example.com \
FIREFLY_OAUTH_CLIENT_ID=your-client-id \
MCP_BASE_URL=https://mcp.example.com \
docker compose up -d
```

### Register the OAuth redirect URI in Firefly III

When running in Docker, register `${MCP_BASE_URL}/oauth/callback` as the redirect URI in Firefly III (Profile → OAuth → OAuth Clients). For example: `https://mcp.example.com/oauth/callback`.

### Build locally

```bash
docker build -t fireflyiii-mcp .
docker run \
  -e FIREFLY_URL=... \
  -e FIREFLY_OAUTH_CLIENT_ID=... \
  -e MCP_BASE_URL=http://localhost:3000 \
  -p 3000:3000 \
  fireflyiii-mcp
```
```

- [ ] **Step 3: Update the roadmap section**

Find:
```markdown
- Docker container for self-hosted HTTP deployment
- npm package
```

Replace with:
```markdown
- ~~Docker container for self-hosted HTTP deployment~~ ✓ done — `Dockerfile`, `docker-compose.yml`, `ghcr.io/daften/fireflyiii-mcp`
- ~~npm package~~ ✓ done — `@daften/fireflyiii-mcp`
```

- [ ] **Step 4: Run tests one final time to confirm everything still passes**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 5: Build dist/ and commit everything**

```bash
npm run build
git add README.md dist/
git commit -m "docs: add Docker and npm install instructions; mark roadmap items done

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Publishing Checklist (manual steps after merging)

Before pushing a version tag, ensure:

1. **Add `NPM_TOKEN` secret** to GitHub repo: Settings → Secrets and variables → Actions → New repository secret
   - Get token from: npmjs.com → Account → Access Tokens → Generate New Token (Automation)

2. **Bump the version**: `npm version patch` (or `minor`/`major`) — this updates `package.json` and creates a git tag

3. **Push with tags**: `git push && git push --tags` — this triggers the publish workflow
