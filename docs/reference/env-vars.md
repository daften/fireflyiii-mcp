# Environment variables

Store credentials in a `.env` file (gitignored). Copy `.env.example` from the repository as a starting point.

## stdio transport

| Variable | Required | Description |
|----------|----------|-------------|
| `FIREFLY_URL` | Yes | Base URL of your Firefly III instance. No trailing slash. |
| `FIREFLY_TOKEN` | Yes | Personal Access Token from Firefly III Options → Remote access and tokens → Create new token. |

## HTTP transport

| Variable | Required | Description |
|----------|----------|-------------|
| `FIREFLY_URL` | Yes | Base URL of your Firefly III instance. No trailing slash. |
| `FIREFLY_OAUTH_CLIENT_ID` | No | OAuth client ID from Firefly III Options → Remote access and tokens → Create New Client. Omit to run in [PAT-only mode](/guide/http-pat) instead of OAuth. |
| `MCP_BASE_URL` | Required when not on loopback, and only if `FIREFLY_OAUTH_CLIENT_ID` is set | Public base URL of this server. Used to build OAuth redirect URIs. Not used in PAT-only mode. |
| `MCP_ALLOWED_REDIRECT_PREFIXES` | No | Comma-separated list of extra OAuth `redirect_uri` prefixes to accept. Loopback addresses and Claude's hosted callback (`https://claude.ai/api/mcp/auth_callback`) are always allowed — you only need this for other clients. Ignored in PAT-only mode. |

In HTTP mode, `FIREFLY_TOKEN` is not used. The Bearer token is resolved per-request from the `Authorization` header instead — either set by the MCP client after completing the OAuth flow, or supplied directly as your Firefly III Personal Access Token when `FIREFLY_OAUTH_CLIENT_ID` is omitted. See [npm + HTTP/OAuth](/guide/http-oauth) and [npm + HTTP/PAT](/guide/http-pat).

## Tool filtering (both transports)

| Variable | Equivalent CLI flag | Description |
|----------|---------------------|-------------|
| `MCP_PRESET` | `--preset <name>` | Named tool subset. See [Tool filtering](/reference/filtering). Mutually exclusive with `MCP_GROUPS`. |
| `MCP_GROUPS` | `--groups <list>` | Comma-separated group names. Mutually exclusive with `MCP_PRESET`. |
| `MCP_READ_ONLY` | `--read-only` | Set to `true` or `1` (case-insensitive) to restrict to read-only tools. |

The CLI flag always takes precedence over its environment variable equivalent.

## Debug

| Variable | Description |
|----------|-------------|
| `FIREFLY_DEBUG` | Set to `true` or `1` to emit verbose autocomplete tracing to stderr. Off by default. |
