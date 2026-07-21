# Docker + HTTP (self-hosted)

Docker runs in HTTP mode only. Suitable for hosting on a server or home lab where your AI client connects over the network.

The container image is published to GitHub Container Registry:
**[ghcr.io/daften/fireflyiii-mcp](https://github.com/daften/fireflyiii-mcp/pkgs/container/fireflyiii-mcp)**

::: tip Headless caller? Use PAT-only mode instead
The steps below set up OAuth, which needs a browser and a human to approve it on first connection. If this container is fronted by something that can't do that — a gateway, an automation script — skip straight to [npm + HTTP/PAT](/guide/http-pat) instead: omit `FIREFLY_OAUTH_CLIENT_ID` and `MCP_BASE_URL`, and authenticate with a Bearer-token Personal Access Token instead.
:::

## Step 1: Register an OAuth client in Firefly III

Go to **Options → Remote access and tokens → Create New Client**:

| Field | Value |
|-------|-------|
| **Name** | Anything, e.g. `MCP Server` |
| **Redirect URL** | `https://mcp.example.com/oauth/callback` |
| **Keep a secret?** | **Uncheck** |

Replace `https://mcp.example.com` with your actual `MCP_BASE_URL`.

## Step 2: Run the container

```bash
docker run \
  -e FIREFLY_URL=https://your-firefly-instance.example.com \
  -e FIREFLY_OAUTH_CLIENT_ID=your-client-id \
  -e MCP_BASE_URL=https://mcp.example.com \
  -p 3000:3000 \
  ghcr.io/daften/fireflyiii-mcp:latest
```

`MCP_BASE_URL` is the externally reachable URL of your container, used to build OAuth redirect URIs. If omitted, the server falls back to the `Host` request header, which is unreliable behind a reverse proxy.

### Limit which tools are loaded

```bash
docker run \
  -e FIREFLY_URL=https://your-firefly-instance.example.com \
  -e FIREFLY_OAUTH_CLIENT_ID=your-client-id \
  -e MCP_BASE_URL=https://mcp.example.com \
  -e MCP_PRESET=default \
  -e MCP_READ_ONLY=true \
  -p 3000:3000 \
  ghcr.io/daften/fireflyiii-mcp:latest
```

See [Tool filtering](/reference/filtering) for the full list of presets and groups.

### With docker-compose

Copy `docker-compose.yml` from the repository:

```bash
# Option A: use a .env file
cp .env.example .env   # then edit .env
docker compose up -d

# Option B: export variables in your shell
FIREFLY_URL=https://your-firefly-instance.example.com \
FIREFLY_OAUTH_CLIENT_ID=your-client-id \
MCP_BASE_URL=https://mcp.example.com \
docker compose up -d
```

::: warning Single replica only
OAuth state is held in-process. Run only one container replica — multiple replicas will break the OAuth flow because the callback may land on a different instance than the one that initiated authorization.
:::

### Health check

The image ships a Docker `HEALTHCHECK` that probes `GET /health`, which returns `200 {"status":"ok"}` in both OAuth and PAT-only mode (it requires no authentication). Use the same endpoint for orchestrator liveness/readiness probes (Kubernetes, compose `depends_on: { condition: service_healthy }`, etc.).

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

No extra configuration is needed for Claude's OAuth callbacks (`https://claude.ai/api/mcp/auth_callback` and the `claude.com` equivalent) — both are allowed by default. Other clients with non-loopback callbacks need [`MCP_ALLOWED_REDIRECT_PREFIXES`](/reference/env-vars).
