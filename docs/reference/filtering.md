# Tool filtering

With 140 tools across 14 groups, loading everything consumes significant context window space. Three flags let you control exactly which tools are registered.

## --preset \<name\>

Load a named subset of tool groups:

| Preset | Groups included | Tools |
|--------|----------------|-------|
| `minimal` | accounts, transactions | 15 |
| `default` | accounts, transactions, budgets, categories, bills | 37 |
| `budgeting` | accounts, transactions, budgets, categories, bills, piggy-banks | 44 |
| `insights` | accounts, transactions, categories, reports | 57 |
| `automation` | accounts, transactions, rules, recurring | 37 |
| `full` | all 14 groups | 140 |

```bash
node dist/index.js --preset default
npx @daften/fireflyiii-mcp --preset budgeting
```

## --groups \<list\>

Comma-separated list of specific groups. Cannot combine with `--preset`.

Valid group names: `accounts`, `transactions`, `budgets`, `categories`, `bills`, `piggy-banks`, `reports`, `rules`, `recurring`, `attachments`, `currencies`, `exports`, `object-groups`, `transaction-links`

```bash
node dist/index.js --groups accounts,transactions,reports
```

## --read-only

Filter any selection down to read-only tools (`get_*`, `search_*`, `test_*`). All create, update, delete, trigger, and upload tools are excluded. Can combine with `--preset` or `--groups`.

```bash
node dist/index.js --preset default --read-only
node dist/index.js --groups rules --read-only
```

Without any filter flags the server registers all 140 tools (equivalent to `--preset full`).

## Environment variable equivalents

Each flag has an environment variable fallback, useful for npm/stdio and Docker setups where there's no natural place to pass CLI flags. The CLI flag always takes precedence.

| Variable | Equivalent flag | Example |
|----------|-----------------|---------|
| `MCP_PRESET` | `--preset <name>` | `MCP_PRESET=default` |
| `MCP_GROUPS` | `--groups <list>` | `MCP_GROUPS=accounts,transactions` |
| `MCP_READ_ONLY` | `--read-only` | `MCP_READ_ONLY=true` (also accepts `1`) |

`MCP_PRESET` and `MCP_GROUPS` are mutually exclusive.

### In stdio MCP config

```json
"env": {
  "FIREFLY_URL": "https://your-firefly-instance.example.com",
  "FIREFLY_TOKEN": "your-personal-access-token-here",
  "MCP_PRESET": "default",
  "MCP_READ_ONLY": "true"
}
```

### In Docker

```bash
docker run \
  -e FIREFLY_URL=https://... \
  -e FIREFLY_OAUTH_CLIENT_ID=... \
  -e MCP_BASE_URL=https://... \
  -e MCP_PRESET=default \
  -e MCP_READ_ONLY=true \
  -p 3000:3000 \
  ghcr.io/daften/fireflyiii-mcp:latest
```
