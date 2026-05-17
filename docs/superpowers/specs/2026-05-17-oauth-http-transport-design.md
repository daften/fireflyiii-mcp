# OAuth for HTTP Transport — Design Spec

**Date:** 2026-05-17  
**Status:** Approved

---

## Overview

Add MCP-spec OAuth to the HTTP transport so that:

1. The HTTP endpoint is protected — unauthenticated requests are rejected with `401`.
2. The MCP server authenticates to Firefly III using the token the MCP client (Claude) presents, rather than a static Personal Access Token in env vars.

Firefly III acts as the OAuth provider. Claude handles the full OAuth lifecycle (Authorization Code + PKCE flow, token storage, refresh). The MCP server is stateless — it never stores tokens.

**stdio transport is unchanged.** It continues to use `FIREFLY_URL` + `FIREFLY_TOKEN` from env vars.

---

## Env Vars

| Variable | stdio | http |
|---|---|---|
| `FIREFLY_URL` | required | required |
| `FIREFLY_TOKEN` | required | not used |
| `FIREFLY_OAUTH_CLIENT_ID` | not used | required |

`FIREFLY_TOKEN` and `FIREFLY_OAUTH_CLIENT_ID` are mutually exclusive by transport. The server validates the correct set is present at startup and exits with a clear error if not.

`FIREFLY_OAUTH_CLIENT_ID` comes from a **public OAuth client** registered in Firefly III (Profile → OAuth → OAuth Clients → Create New Client, mark as public/without secret). No client secret is required because the flow uses PKCE.

---

## OAuth Discovery Endpoint

```
GET /.well-known/oauth-authorization-server
```

Returns JSON conforming to RFC 8414 (OAuth 2.0 Authorization Server Metadata), constructed from `FIREFLY_URL`:

```json
{
  "issuer": "<FIREFLY_URL>",
  "authorization_endpoint": "<FIREFLY_URL>/oauth/authorize",
  "token_endpoint": "<FIREFLY_URL>/oauth/token",
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code", "refresh_token"],
  "code_challenge_methods_supported": ["S256"],
  "client_id": "<FIREFLY_OAUTH_CLIENT_ID>"
}

`client_id` is an extension field (not in RFC 8414) that hints to MCP clients which pre-registered client to use. MCP clients that support OAuth discovery read this field to avoid requiring manual client ID configuration.
```

This endpoint requires **no auth** — Claude fetches it before it has a token.

---

## OAuth Flow

**First connection (no token):**

1. Claude sends a request to `POST /mcp`
2. Server returns `401 Unauthorized` with `WWW-Authenticate: Bearer resource="Firefly III MCP"`
3. Claude fetches `GET /.well-known/oauth-authorization-server`
4. Claude generates PKCE code verifier + S256 challenge
5. Claude opens the user's browser to `<FIREFLY_URL>/oauth/authorize?client_id=...&response_type=code&code_challenge=...&code_challenge_method=S256&redirect_uri=...`
6. User authorizes the application in Firefly III
7. Firefly III redirects to Claude's redirect URI with an authorization code
8. Claude exchanges code + verifier at `<FIREFLY_URL>/oauth/token`, receives access token + refresh token
9. Claude stores both tokens and sends `Authorization: Bearer <access_token>` on all subsequent MCP requests

**Subsequent requests:**

- `http.ts` extracts the Bearer token from the `Authorization` header
- Token is stored in `AsyncLocalStorage` for the duration of the request
- `FireflyClient` reads the token from `AsyncLocalStorage` on each API call

**Token expiry:**

- Firefly III returns `401` on an API call
- `FireflyClient` throws `FireflyError(401)`
- Tool returns `{ isError: true }` with auth failure message
- Claude catches the error, uses its stored refresh token to get a new access token from Firefly III, and retries the MCP request

---

## Components

### `src/http.ts` (modified)

Two new responsibilities added to the existing HTTP server handler:

1. **Metadata endpoint:** `GET /.well-known/oauth-authorization-server` — served before the Bearer check, no auth required. Constructed from `FIREFLY_URL` + `FIREFLY_OAUTH_CLIENT_ID`.

2. **Bearer guard:** All other requests must include `Authorization: Bearer <token>`. Missing or malformed header → `401` with `WWW-Authenticate: Bearer resource="Firefly III MCP"`. Valid header → token stored in `AsyncLocalStorage`, request proceeds to MCP transport handler.

The `startHttpServer` signature gains an `oauthClientId` parameter (only used in HTTP mode).

`http.ts` also exports the `AsyncLocalStorage` instance (`requestContext`) so `index.ts` can import it when constructing the per-request token resolver for `FireflyClient`.

### `src/client.ts` (modified)

The `token` constructor parameter changes from `string` to `string | (() => string)`:

```typescript
constructor(baseUrl: string, private readonly tokenResolver: string | (() => string)) {}

private getToken(): string {
  return typeof this.tokenResolver === 'function' ? this.tokenResolver() : this.tokenResolver;
}
```

`getToken()` is called inside the `request()` method to resolve the token at call time.

For stdio: `new FireflyClient(url, token)` — identical to today.  
For HTTP: `new FireflyClient(url, () => requestContext.getStore()!.token)` — reads from `AsyncLocalStorage` per request.

### `src/index.ts` (modified)

Transport-aware env var validation at startup:

- **stdio:** requires `FIREFLY_URL` + `FIREFLY_TOKEN`; exits with error if either is missing
- **http:** requires `FIREFLY_URL` + `FIREFLY_OAUTH_CLIENT_ID`; exits with error if either is missing; `FIREFLY_TOKEN` is ignored

For HTTP mode, `FireflyClient` is constructed with the `AsyncLocalStorage` resolver. `FIREFLY_TOKEN` is not read.

### `src/server.ts`, `src/tools/*` (unchanged)

No changes. Tools continue to call `client.get/post/put/delete` as today — the token resolution is transparent.

---

## Error Handling

| Situation | Response |
|---|---|
| HTTP request missing Bearer token | `401` + `WWW-Authenticate: Bearer resource="Firefly III MCP"` |
| Bearer token expired/invalid (Firefly III 401) | Tool returns `isError: true` with auth error message; Claude refreshes and retries |
| stdio started without `FIREFLY_TOKEN` | `process.exit(1)`: `"Error: FIREFLY_URL and FIREFLY_TOKEN are required for stdio transport."` |
| HTTP started without `FIREFLY_OAUTH_CLIENT_ID` | `process.exit(1)`: `"Error: FIREFLY_URL and FIREFLY_OAUTH_CLIENT_ID are required for HTTP transport."` |
| `AsyncLocalStorage` store missing (programming error) | `500` — should never happen in normal operation |

---

## Testing

**New: `src/tests/http.test.ts`**
- Metadata endpoint returns correct JSON shape with all required fields
- Request without `Authorization` header returns `401`
- Request with `Authorization: Bearer <token>` puts token in `AsyncLocalStorage` and proceeds
- Token is accessible from `AsyncLocalStorage` during request handling

**Modified: `src/tests/client.test.ts`**
- Token resolver function is called at request time (not at construction time)
- Static string token still works as before

**Unchanged:**
- All tool tests — they mock `client.get` directly, never touch transport
- Integration tests — they use `FIREFLY_TOKEN` via the stdio path (`FIREFLY_INTEGRATION=true`)

---

## Setup Instructions (for README)

1. In Firefly III: Profile → OAuth → OAuth Clients → Create New Client
   - Name: `Claude MCP` (or anything)
   - Redirect URL: the redirect URI Claude uses (Claude Code will provide this)
   - Check **Public client** (no secret required)
   - Save and copy the **Client ID**

2. Add to `.env`:
   ```
   FIREFLY_URL=https://your-firefly-instance.example.com
   FIREFLY_OAUTH_CLIENT_ID=<client-id-from-step-1>
   ```

3. Start with HTTP transport:
   ```bash
   npm run dev -- --transport http
   ```

4. Point Claude at the MCP server — it will handle the OAuth flow automatically on first connection.
