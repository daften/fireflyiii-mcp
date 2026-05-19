# Docker + npm Publishing — Design Spec

**Date:** 2026-05-19  
**Status:** Approved

---

## Overview

Add a Docker container for self-hosting the MCP server in HTTP mode, and configure the project for publishing to npm and GitHub Container Registry (ghcr.io). Both artifacts are built and pushed automatically via a single GitHub Actions workflow on version tag push.

---

## 1. Docker

### Dockerfile (multi-stage, `node:18-alpine`)

**Builder stage:**
- Base: `node:18-alpine`
- Copy `package.json`, `package-lock.json`, all source
- `npm ci` (all deps including devDependencies)
- `npm run build` — compiles TypeScript to `dist/`

**Runtime stage:**
- Base: `node:18-alpine`
- Copy `dist/` and `package*.json` from builder
- `npm ci --omit=dev` — production deps only (~150MB final image)
- Expose port `3000`
- `CMD ["node", "dist/index.js", "--transport", "http", "--host", "0.0.0.0"]`

### docker-compose.yml

Single service `fireflyiii-mcp`:
- Image: `ghcr.io/daften/fireflyiii-mcp:latest` (default); include a commented-out `build: .` for local dev override
- Port mapping: `3000:3000`
- Environment variables (required placeholders):
  - `FIREFLY_URL` — base URL of your Firefly III instance
  - `FIREFLY_OAUTH_CLIENT_ID` — OAuth client ID from Firefly III
  - `MCP_BASE_URL` — externally reachable URL of this container (e.g. `https://mcp.example.com`)
- No Firefly III service — assumes it runs externally

### src/http.ts change

The only source code change. Currently the handler derives OAuth callback URLs from the `Host` request header:

```typescript
const host = req.headers['host'] ?? '127.0.0.1:3000';
// then uses: `http://${host}/oauth/callback` etc.
```

In Docker, the `Host` header reflects the internal address, not the external URL. Fix: introduce a `baseUrl` derived from `MCP_BASE_URL` env var when set, falling back to the `Host` header:

```typescript
const baseUrl =
  process.env['MCP_BASE_URL']?.replace(/\/$/, '') ??
  `http://${req.headers['host'] ?? '127.0.0.1:3000'}`;
```

Replace all `http://${host}/...` occurrences with `${baseUrl}/...`. This allows `MCP_BASE_URL=https://mcp.example.com` to produce correct `https://` OAuth URLs while preserving existing local dev behaviour when the env var is absent.

`MCP_BASE_URL` is **optional** — local dev without Docker needs no change.

---

## 2. npm Package

### package.json changes

| Field | Before | After |
|---|---|---|
| `name` | `firefly-iii-mcp` | `@daften/fireflyiii-mcp` |
| `bin` key | `"firefly-iii-mcp"` | `"fireflyiii-mcp"` |

Additional fields to add:
- `"files": ["dist", "README.md", "LICENSE", ".env.example"]` — lean published tarball
- `"publishConfig": { "access": "public" }` — required for scoped packages to be publicly installable
- `"prepublishOnly": "npm run build"` — ensures `dist/` is fresh before any publish
- `"repository"`: GitHub URL
- `"keywords"`: `["firefly-iii", "mcp", "finance", "model-context-protocol"]`
- `"homepage"`: GitHub repo URL

Version is not bumped here — managed manually via `npm version` before tagging.

---

## 3. GitHub Actions Workflow

**File:** `.github/workflows/publish.yml`  
**Trigger:** `push` with tags matching `v*`

### Job 1: `publish-npm`

1. Checkout
2. Setup Node 18 with `npmjs` registry
3. `npm ci`
4. `npm run build`
5. `npm publish` — uses `NPM_TOKEN` repository secret

### Job 2: `publish-docker`

1. Checkout
2. Login to `ghcr.io` using `GITHUB_TOKEN` (automatic, no extra secret)
3. Extract semver from tag (strip leading `v`)
4. Build and push `ghcr.io/daften/fireflyiii-mcp` with tags: `{version}` and `latest`

Jobs run in parallel.

### Required secrets

| Secret | Where to get it |
|---|---|
| `NPM_TOKEN` | npm → Access Tokens → Automation token |
| `GITHUB_TOKEN` | Automatic — no setup needed |

---

## 4. Local Build Instructions (README addition)

```bash
# Build image locally
docker build -t fireflyiii-mcp .

# Run
docker run \
  -e FIREFLY_URL=https://your-firefly-instance.example.com \
  -e FIREFLY_OAUTH_CLIENT_ID=your-client-id \
  -e MCP_BASE_URL=http://localhost:3000 \
  -p 3000:3000 \
  fireflyiii-mcp

# Or pull from registry
docker pull ghcr.io/daften/fireflyiii-mcp:latest
docker run \
  -e FIREFLY_URL=... \
  -e FIREFLY_OAUTH_CLIENT_ID=... \
  -e MCP_BASE_URL=... \
  -p 3000:3000 \
  ghcr.io/daften/fireflyiii-mcp:latest
```

---

## Files Changed / Created

| File | Action |
|---|---|
| `Dockerfile` | Create |
| `docker-compose.yml` | Create |
| `src/http.ts` | Modify — `baseUrl` from `MCP_BASE_URL` or `Host` header |
| `package.json` | Modify — name, bin, files, publishConfig, prepublishOnly, metadata |
| `.github/workflows/publish.yml` | Create |
| `README.md` | Modify — add Docker section with local build instructions |
