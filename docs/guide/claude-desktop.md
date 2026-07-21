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

The `${AUTH_HEADER}` indirection matters most on Claude Desktop (Windows) and Cursor, where `mcp-remote`'s README documents a bug that mangles spaces inside `args` when it invokes `npx` — the header value contains a space, and the direct form silently breaks there. Keep the indirection on every platform anyway, so the config stays portable.

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

**"Couldn't register with … sign-in service"** — the connector's OAuth client registration was rejected. Confirm you are on a server version that allows Claude's hosted callbacks (`https://claude.ai/api/mcp/auth_callback` and the `claude.com` equivalent) by default; otherwise set [`MCP_ALLOWED_REDIRECT_PREFIXES`](/reference/env-vars) to the exact callback URI your Claude client uses.

**"Couldn't reach the MCP server"** — discovery failed. Run the two `curl` commands in Option 2 from outside your network.
