# npm + HTTP/PAT

HTTP mode normally uses OAuth 2.0 (see [npm + HTTP/OAuth](/guide/http-oauth)), which requires an interactive browser-based authorization step. That works well for AI clients running on your own machine, but it has no equivalent for headless callers — a server-side gateway, automation script, or anything else that talks to this server without a human or a browser in the loop.

For those cases, omit `FIREFLY_OAUTH_CLIENT_ID` and the server runs in **PAT-only mode** instead: no OAuth proxy is exposed, and every request just needs a Firefly III Personal Access Token as a Bearer token.

**Requires:** Node.js 20+, a Firefly III Personal Access Token (Options → Remote access and tokens → Create new token).

## Step 1: Start the server

```bash
FIREFLY_URL=https://your-firefly-instance.example.com \
npx @daften/fireflyiii-mcp --transport http
```

No OAuth client registration needed. To use a different port, add `--port 4000`.

## Step 2: Connect your client

Configure your MCP client (or gateway) to call this server over HTTP, sending your Firefly III PAT as a Bearer token on every request:

```
Authorization: Bearer <your-firefly-iii-personal-access-token>
```

For example, in a gateway that lets you configure a static bearer token per backend MCP server, point it at `http://127.0.0.1:3000` (or wherever you're hosting this) with that header — no separate client-side OAuth configuration is needed.

::: tip Why does this work?
The Bearer token on each request is forwarded to Firefly III's API exactly as given — that's true whether it came from an OAuth-issued access token or a PAT, since the server doesn't need to know which. PAT-only mode just stops advertising and serving the OAuth surface (`/.well-known/oauth-authorization-server`, `/oauth/*`), since there's no OAuth client configured to back it.
:::

::: warning
PAT-only mode skips the `MCP_BASE_URL` requirement that OAuth mode enforces on non-loopback hosts, since there's no OAuth redirect URI to construct. If you later add `FIREFLY_OAUTH_CLIENT_ID` to also support interactive clients, see [npm + HTTP/OAuth](/guide/http-oauth) for `MCP_BASE_URL` guidance.
:::
