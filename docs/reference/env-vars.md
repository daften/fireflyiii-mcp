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
| `FIREFLY_OAUTH_CLIENT_ID` | Yes | OAuth client ID from Firefly III Options → Remote access and tokens → Create New Client. |
| `MCP_BASE_URL` | Required when not on loopback | Public base URL of this server. Used to build OAuth redirect URIs. Required when hosting on a server; omit for local `127.0.0.1` setups. |

In HTTP mode, `FIREFLY_TOKEN` is not used. The Bearer token is resolved per-request from the `Authorization` header after the OAuth flow.

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
