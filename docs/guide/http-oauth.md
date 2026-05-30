# npm + HTTP/OAuth

HTTP mode uses OAuth 2.0 (Authorization Code + PKCE) instead of a Personal Access Token. Your MCP client handles the OAuth flow automatically on first connection.

**Requires:** Node.js 20+.

## Step 1: Register an OAuth client in Firefly III

Go to **Options → Remote access and tokens → Create New Client**:

| Field | Value |
|-------|-------|
| **Name** | Anything, e.g. `MCP Server` |
| **Redirect URL** | `http://127.0.0.1:3000/oauth/callback` |
| **Keep a secret?** | **Uncheck this box** |

Save and copy the **Client ID**. You do not need the client secret.

::: tip Why uncheck "Keep a secret?"
Unchecking creates a *public client*, which uses a code verifier instead of a stored secret. This is the correct and secure choice for clients like AI assistants that cannot safely store a secret.
:::

::: tip Why this specific redirect URL?
MCP clients use a random port for their OAuth callback. This server acts as a proxy: it intercepts the request, substitutes its own stable callback URL, and forwards the authorization code back. Register this URL once.
:::

## Step 2: Start the server

```bash
FIREFLY_URL=https://your-firefly-instance.example.com \
FIREFLY_OAUTH_CLIENT_ID=your-client-id \
npx @daften/fireflyiii-mcp --transport http
```

To use a different port: add `--port 4000`.

## Step 3: Connect your AI client

```json
{
  "mcpServers": {
    "fireflyiii": {
      "type": "http",
      "url": "http://127.0.0.1:3000"
    }
  }
}
```

Or via the Claude Code CLI:

```bash
claude mcp add --transport http fireflyiii http://127.0.0.1:3000
```

::: warning
The `type: "http"` field is required. Without it, Claude Code assumes stdio and fails to connect.
:::

On first connection your AI client opens a browser to authorize with Firefly III. Tokens are managed automatically after that.

## OAuth discovery

The server exposes `GET /.well-known/oauth-authorization-server` (no auth required), which returns RFC 8414 metadata. MCP clients use this to discover OAuth endpoints automatically.
