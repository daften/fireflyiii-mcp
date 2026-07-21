# Claude Connector Support & Client Setup Docs — Design Spec

**Date:** 2026-07-21
**Project:** fireflyiii-mcp
**Status:** Approved
**Issue:** [#43 — Documentation: Docker & Claude Setup](https://github.com/daften/fireflyiii-mcp/issues/43)

---

## Overview

Issue #43 reported that a Docker-hosted HTTP deployment could not be connected to Claude Desktop. The reporter eventually worked around it with an `mcp-remote` stdio bridge and a PAT.

Investigation showed the report surfaced three separate defects in the OAuth surface that together make the Claude custom-connector path fail by default, plus a documentation gap that gives users no way to decide which setup method they need.

This spec covers both: the `src/http.ts` changes needed for Claude's connector infrastructure to complete OAuth, and the documentation restructure that tells users which of the three connection methods applies to them.

---

## Background: what Claude actually requires

Verified against Anthropic's connector authentication specification and Claude Desktop `1.22209.3` (macOS).

### Claude Desktop's config schema does not accept HTTP servers

`claude_desktop_config.json` validates each `mcpServers` entry against:

```js
z.object({
  command:     z.string(),                       // required
  args:        z.array(z.string()).optional(),
  env:         z.record(z.string(), z.string()).optional(),
  extensionId: z.string().optional()
})
```

There is no `type`, `url`, or `headers` field, and no `remoteMcpServers` key at the top level. Entries that fail validation are dropped individually and logged as `Skipped invalid MCP server config entries` in `~/Library/Logs/Claude/main.log`; the rest of the config still loads.

The `{"type": "http", "url": "..."}` form currently shown in our guides is **Claude Code** syntax. In Claude Desktop it is silently discarded.

This schema is version-specific and may change. Documentation should state the version it was verified against.

### Claude's OAuth requirements for remote servers

| Requirement | Current state |
|---|---|
| `401` + `WWW-Authenticate: Bearer resource_metadata="…"` | ❌ sends `Bearer resource="MCP server for Firefly III"` (`http.ts:238`) |
| `/.well-known/oauth-protected-resource` (RFC 9728) | ❌ not implemented; the origin-probe fallback also 404s |
| AS metadata with `code_challenge_methods_supported: ["S256"]` | ✅ `http.ts:89-104` |
| DCR at `registration_endpoint` | ⚠️ implemented, but rejects Claude's redirect URI |
| Redirect URI `https://claude.ai/api/mcp/auth_callback` | ❌ rejected in both `/oauth/register` and `/oauth/authorize` |
| `/token` accepts form-urlencoded; `/register` accepts JSON | ✅ |

Additional facts that inform the design:

- Anthropic's outbound traffic originates from `160.79.104.0/21`. The server must be publicly reachable from that range — a custom connector is driven by Anthropic's backend, not by the local Claude app.
- Anthropic recommends CIMD or Anthropic-held credentials over DCR for high-traffic servers, because DCR normally registers a new client per connection. **This does not apply here:** our `/oauth/register` is a stub that returns the same static `client_id` every time. CIMD is therefore out of scope.

### Root cause of the reported failure

Discovery fell through to the legacy `/.well-known/oauth-authorization-server` probe, which the server does serve. Claude then attempted DCR, and `POST /oauth/register` carrying `redirect_uris: ["https://claude.ai/api/mcp/auth_callback"]` hit the non-loopback check at `http.ts:146` and returned `400 invalid_redirect_uri`. Claude surfaced this as *"Couldn't register with Fireflyiii MCP's sign-in service."*

The allow-list is configurable via `MCP_ALLOWED_REDIRECT_PREFIXES`, but that variable appears only in `src/http.ts` and `src/tests/http.test.ts` — it is in no guide, no reference page, and not in `.env.example`. The user had no way to discover it.

---

## The three-branch decision rule

The documentation restructure is organised around one rule, which did not previously exist anywhere:

| Situation | Method | Why |
|---|---|---|
| The client machine can reach Firefly III | **stdio** | Simplest. One process, no bridge, no server to host. |
| Remote server, publicly reachable from `160.79.104.0/21` | **Custom connector + OAuth** | The only option where no client device holds a long-lived credential. |
| Remote server, LAN/VPN-only | **`mcp-remote` bridge** | Fallback. Moves the "who can reach Firefly III" requirement off the client. |

The middle branch is the one this spec repairs in code. It is also the most secure option, and today it is the one that silently fails.

`mcp-remote` must be documented as a fallback, not as *the* Claude Desktop method. For a user whose machine can already reach Firefly III it is strictly worse than stdio: it still requires Node.js on the client (it is an `npx` package) and still puts a plaintext PAT in the client config, while adding a second process to the path. Its sole advantage is removing the client's need to reach Firefly III directly — which is exactly why it was right for the #43 reporter, whose Firefly III sits behind Authelia and whose container reaches it via an internal `http://firefly` hostname.

---

## Part 1 — `src/http.ts`

### 1.1 Allow Claude's hosted callback by default

Add a module-level constant for `https://claude.ai/api/mcp/auth_callback` and accept it in `isRedirectUriAllowed`, which governs both `/oauth/register` and `/oauth/authorize`.

Matching is on **`origin + pathname`**, parsed via `URL`, not string prefix. A prefix match on this value would also admit `https://claude.ai/api/mcp/auth_callbackEVIL`. Query and fragment are ignored so an incidental parameter does not break the match. A URI that fails to parse is rejected.

`MCP_ALLOWED_REDIRECT_PREFIXES` keeps its existing prefix semantics, unchanged, for every other value.

**Security rationale.** Commit `12f1ab9` (P0-2) introduced this allow-list to stop arbitrary attacker-controlled redirect targets from exfiltrating authorization codes. Admitting one fixed HTTPS URI on an Anthropic-controlled origin, matched exactly, does not reopen that threat model — an attacker cannot register a redirect they control. The relaxation is bounded and deliberate.

### 1.2 Serve `/.well-known/oauth-protected-resource`

New `GET` route, no authentication, returning RFC 9728 metadata:

```json
{
  "resource": "<baseUrl>",
  "authorization_servers": ["<baseUrl>"],
  "bearer_methods_supported": ["header"]
}
```

`resource` must match the server URL exactly as the user types it into Claude, which makes correct `MCP_BASE_URL` configuration load-bearing for this branch. `scopes_supported` is omitted: Firefly III's Passport implementation does not use meaningful scopes, and advertising an empty list would cause Claude to request nothing rather than defaulting sensibly.

Add the path to `isOAuthProxyPath` so PAT-only mode 404s it alongside the rest of the OAuth surface. PAT-only mode must not advertise an authorization server it cannot back.

### 1.3 Fix the 401 challenge

In OAuth mode:

```
WWW-Authenticate: Bearer resource_metadata="<baseUrl>/.well-known/oauth-protected-resource"
```

The current `resource="MCP server for Firefly III"` is not a parameter Claude recognises. In PAT-only mode, emit a bare `Bearer` — there is no resource metadata to point at.

With 1.2 and 1.3 in place, discovery succeeds on the first attempt rather than relying on legacy origin probing.

### 1.4 Name the variable in the rejection body

`400 invalid_redirect_uri` currently gives an operator nothing to act on. Extend `error_description` to name `MCP_ALLOWED_REDIRECT_PREFIXES` and state that the URI must be added to it. The error code stays `invalid_redirect_uri` for RFC compliance.

### Out of scope

CIMD (`client_id_metadata_document_supported`) and `oauth_anthropic_creds`. Both exist to avoid per-connection client proliferation, which our static-`client_id` registration stub already avoids.

---

## Part 2 — Documentation

| File | Change |
|---|---|
| `docs/guide/index.md` | Add the three-branch decision rule to "Choose your setup". |
| `docs/guide/http-oauth.md` (~line 47) | Label the `{type,url}` block **Claude Code only**; state that Claude Desktop rejects it. |
| `docs/guide/docker.md` (~line 84) | Same fix, plus a connector section: public reachability, `160.79.104.0/21`, `MCP_BASE_URL` correctness. |
| `docs/guide/claude-desktop.md` *(new)* | Per-client page: stdio as the default answer; connector setup; `mcp-remote` fallback with the `${AUTH_HEADER}` indirection explained; the log-based diagnostic. |
| `docs/.vitepress/config.ts` | Register the new page in the `/guide/` sidebar. |
| `docs/reference/env-vars.md` | Document `MCP_ALLOWED_REDIRECT_PREFIXES`, noting the claude.ai default. |
| `.env.example` | Same, commented out. |
| `README.md` | Point the Claude Desktop reader at the new guide page. |

The `mcp-remote` `${AUTH_HEADER}` env-var indirection is not cosmetic and must be explained: the header value contains a space, which does not survive being passed directly in `args`.

---

## Testing

Unit tests in `src/tests/http.test.ts`, extending the existing `createOAuthHandler — redirect URI allow-list (P0-2)` block. Written test-first.

**Redirect allow-list**
- `https://claude.ai/api/mcp/auth_callback` → `201` at `/oauth/register` with no env var set
- Same URI → `302` at `/oauth/authorize`
- `https://claude.ai/api/mcp/auth_callbackEVIL` → `400` (guards the exact-match decision)
- `https://claude.ai/api/mcp/auth_callback?x=1` → `201` (query ignored)
- `https://evil.example.com/steal` → still `400`
- Malformed URI → `400`
- `400` body names `MCP_ALLOWED_REDIRECT_PREFIXES`
- Existing loopback and `MCP_ALLOWED_REDIRECT_PREFIXES` cases still pass

**Protected resource metadata**
- `GET /.well-known/oauth-protected-resource` in OAuth mode → `200`, `resource` and `authorization_servers[0]` both equal `MCP_BASE_URL`
- Same request in PAT-only mode → `404`
- Requires no `Authorization` header

**401 challenge**
- OAuth mode: header contains `resource_metadata="<baseUrl>/.well-known/oauth-protected-resource"`
- PAT-only mode: bare `Bearer`, no `resource_metadata`

Full suite green plus `npm run build` before completion. End-to-end connector verification against live Claude infrastructure requires a publicly reachable deployment and is a manual post-merge step, not a CI gate.

---

## Risks

- **Claude Desktop's config schema is version-specific.** Documented as verified against `1.22209.3`; a future version could add HTTP support and make the guidance stale.
- **The callback URL is external and could change.** It is a documented, stable Anthropic endpoint, and `MCP_ALLOWED_REDIRECT_PREFIXES` remains available as an override if it ever moves.
- **`MCP_BASE_URL` becomes load-bearing for the connector branch.** A mismatch between it and the URL the user types into Claude breaks the `resource` match. The docs must call this out explicitly.
