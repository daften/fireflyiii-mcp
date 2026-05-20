# Firefly III MCP Server

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server that connects Claude Code to your [Firefly III](https://www.firefly-iii.org) personal finance instance. Ask Claude questions about your finances in natural language.

## Prerequisites

- Node.js 18+
- A running Firefly III instance
- A Firefly III Personal Access Token (Profile → OAuth → Personal Access Tokens)

## Install from npm

```bash
npx @daften/fireflyiii-mcp --transport http
```

Or install globally:

```bash
npm install -g @daften/fireflyiii-mcp
fireflyiii-mcp --transport http
```

## Installation

```bash
npm install
npm run build
```

## Configuration

Copy `.env.example` to `.env` and fill in your values:

```bash
FIREFLY_URL=https://your-firefly-instance.example.com
FIREFLY_TOKEN=your-personal-access-token-here
```

## Claude Code Integration

Add to your Claude Code MCP configuration (`.claude/mcp.json` or Claude Desktop config):

```json
{
  "mcpServers": {
    "fireflyiii": {
      "command": "node",
      "args": ["/absolute/path/to/firefly-iii-mcp/dist/index.js"],
      "env": {
        "FIREFLY_URL": "https://your-firefly-instance.example.com",
        "FIREFLY_TOKEN": "your-personal-access-token-here"
      }
    }
  }
}
```

## HTTP Transport with OAuth

The HTTP transport uses OAuth (Authorization Code + PKCE) instead of a Personal Access Token. The MCP client (e.g. Claude Desktop) handles the OAuth flow automatically — no manual token management needed.

### Step 1: Register an OAuth client in Firefly III

Go to **Profile → OAuth → OAuth Clients → Create New Client** and fill in:

| Field | Value |
|-------|-------|
| **Name** | Anything, e.g. `Claude MCP` |
| **Redirect URL** | `http://127.0.0.1:3000/oauth/callback` |
| **Confidential** | **Uncheck this box** |

> **Why uncheck Confidential?**  
> Confidential clients require a client secret stored securely on a server. Our flow uses PKCE precisely because the MCP client (Claude) cannot securely store a secret — it runs locally on your machine. Unchecking "Confidential" creates a *public client*, which is the correct and secure choice for PKCE-based flows.

> **Redirect URL note**  
> Claude uses a random port for its OAuth callback (e.g. `http://localhost:61234/callback`), but Firefly III requires an exact URI match. The MCP server acts as a full OAuth proxy:
> 1. It intercepts Claude's authorization request, substitutes `http://127.0.0.1:3000/oauth/callback` as the redirect URI, and forwards to Firefly III.
> 2. Firefly III redirects back to `http://127.0.0.1:3000/oauth/callback`, which forwards to Claude's real dynamic-port callback.
> 3. The same substitution is applied to the token exchange request.
>
> This means you register one fixed URL once and never touch it again.

Save the client and copy the **Client ID** (you do not need the secret).

### Step 2: Configure `.env` for HTTP mode

```bash
FIREFLY_URL=https://your-firefly-instance.example.com
FIREFLY_OAUTH_CLIENT_ID=your-client-id-here
# FIREFLY_TOKEN is not used in HTTP mode
```

### Step 3: Start the server in HTTP mode

```bash
npm run dev -- --transport http
# or on a specific port:
npm run dev -- --transport http --port 4000
```

### Step 4: Point Claude at the server

Add to your MCP config (`.mcp.json` or `~/.claude.json`):
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

Or via the CLI:
```bash
claude mcp add --transport http fireflyiii http://127.0.0.1:3000
```

The `type: "http"` field is required — without it Claude Code assumes a stdio server and fails with `command: expected string`.

The URL has no `/mcp` path — Claude Code uses the base URL as-is for all MCP protocol requests. The server accepts MCP messages at any path after the Bearer guard.

On first connection Claude opens a browser window to authorize with Firefly III. After that, tokens are managed automatically (including refresh).

### OAuth discovery

The server exposes `GET /.well-known/oauth-authorization-server` (no auth required) which returns RFC 8414 metadata pointing to your Firefly III instance. MCP clients use this to discover the authorization and token endpoints automatically — no manual OAuth configuration needed in Claude.

## Docker

### Pull and run

```bash
docker pull ghcr.io/daften/fireflyiii-mcp:latest
docker run \
  -e FIREFLY_URL=https://your-firefly-instance.example.com \
  -e FIREFLY_OAUTH_CLIENT_ID=your-client-id \
  -e MCP_BASE_URL=https://mcp.example.com \
  -p 3000:3000 \
  ghcr.io/daften/fireflyiii-mcp:latest
```

`MCP_BASE_URL` must be the **externally reachable URL** of your container — this is what the MCP client uses to reach the server and what gets registered as the OAuth redirect URI. If omitted, the server falls back to the `Host` request header (fine for local dev, unreliable behind a reverse proxy).

### docker-compose

Copy `docker-compose.yml` from the repo, set your env vars, and run:

```bash
FIREFLY_URL=https://firefly.example.com \
FIREFLY_OAUTH_CLIENT_ID=your-client-id \
MCP_BASE_URL=https://mcp.example.com \
docker compose up -d
```

### Register the OAuth redirect URI in Firefly III

When running in Docker, register `${MCP_BASE_URL}/oauth/callback` as the redirect URI in Firefly III (Profile → OAuth → OAuth Clients). For example: `https://mcp.example.com/oauth/callback`.

### Build locally

```bash
docker build -t fireflyiii-mcp .
docker run \
  -e FIREFLY_URL=... \
  -e FIREFLY_OAUTH_CLIENT_ID=... \
  -e MCP_BASE_URL=http://localhost:3000 \
  -p 3000:3000 \
  fireflyiii-mcp
```

## Available Tools

### Accounts
| Tool | Description |
|------|-------------|
| `get_accounts` | List all accounts, filterable by type |
| `get_account` | Get a single account by ID with current balance |
| `create_account` | Create a new account |
| `update_account` | Update an existing account |
| `delete_account` | Delete an account. This action cannot be undone. |

### Transactions
| Tool | Description |
|------|-------------|
| `get_transactions` | List transactions with filters (account, date, type) |
| `get_transaction` | Get a single transaction by ID with all splits |
| `search_transactions` | Keyword search across transactions |
| `create_transaction` | Create a new transaction |
| `create_split_transaction` | Create a split transaction (one receipt across multiple categories/budgets) |
| `update_transaction` | Update an existing transaction |
| `delete_transaction` | Delete a transaction. This action cannot be undone. |

### Budgets
| Tool | Description |
|------|-------------|
| `get_budgets` | List all budgets with spent/available amounts |
| `get_budget_limits` | Get budget limits for a specific budget and period |
| `create_budget` | Create a new budget |
| `update_budget` | Update an existing budget |
| `delete_budget` | Delete a budget. This action cannot be undone. |
| `create_budget_limit` | Create a budget limit for a specific period |
| `update_budget_limit` | Update an existing budget limit |
| `delete_budget_limit` | Delete a budget limit. This action cannot be undone. |

### Categories
| Tool | Description |
|------|-------------|
| `get_categories` | List all categories |
| `get_category_transactions` | Get transactions for a specific category |
| `create_category` | Create a new category |
| `update_category` | Update an existing category |
| `delete_category` | Delete a category. This action cannot be undone. |

### Bills
| Tool | Description |
|------|-------------|
| `get_bills` | List all bills with next expected match date |
| `create_bill` | Create a new bill |
| `update_bill` | Update an existing bill |
| `delete_bill` | Delete a bill. This action cannot be undone. |

### Piggy Banks
| Tool | Description |
|------|-------------|
| `get_piggy_banks` | List all piggy banks with current/target amounts |
| `create_piggy_bank` | Create a new piggy bank |
| `update_piggy_bank` | Update an existing piggy bank |
| `delete_piggy_bank` | Delete a piggy bank. This action cannot be undone. |

### Recurring Transactions
| Tool | Description |
|------|-------------|
| `get_recurring` | List all recurring transaction rules |
| `get_recurrence` | Get a single recurring transaction rule by ID |
| `create_recurring` | Create a new recurring transaction rule |
| `update_recurring` | Update an existing recurring transaction rule |
| `delete_recurring` | Delete a recurring transaction rule. This action cannot be undone. |

### Tags & Reports
| Tool | Description |
|------|-------------|
| `get_tags` | List all tags |
| `get_tag_transactions` | Get transactions for a specific tag |
| `create_tag` | Create a new tag |
| `update_tag` | Update an existing tag |
| `delete_tag` | Delete a tag. This action cannot be undone. |
| `get_summary` | Basic balance summary (total assets, net worth) |
| `get_insight_expenses` | Expense insights grouped by category for a date range |
| `get_insight_income` | Income insights grouped by category for a date range |
| `get_insight_expenses_no_bill` | Expense totals for transactions with no bill attached |
| `get_insight_expenses_no_budget` | Expense totals for transactions with no budget attached |
| `get_insight_expenses_no_category` | Expense totals for transactions with no category attached |
| `get_insight_expenses_no_tag` | Expense totals for transactions with no tag attached |
| `get_insight_income_no_category` | Income totals for transactions with no category attached |
| `get_insight_income_no_tag` | Income totals for transactions with no tag attached |
| `get_insight_transfer_no_category` | Transfer totals for transactions with no category attached |
| `get_insight_transfer_no_tag` | Transfer totals for transactions with no tag attached |

## Development

```bash
npm test                  # Run unit tests
npm run test:watch        # Watch mode
npm run test:integration  # Run against live Firefly III (requires FIREFLY_URL + FIREFLY_TOKEN)
npm run dev               # Run without building (uses tsx)
npm run build             # Compile TypeScript to dist/
```

## Roadmap

**High priority:**
- ~~Split transactions (one receipt, multiple categories)~~ ✓ done — `create_split_transaction`
- ~~Transaction keyword search~~ ✓ done — `search_transactions`
- ~~Recurring transactions (full CRUD)~~ ✓ done — `get_recurring`, `get_recurrence`, `create_recurring`, `update_recurring`, `delete_recurring`
- ~~Insight tools for uncategorized/untagged/unbilled/unbudgeted transactions~~ ✓ done — `get_insight_expenses_no_bill`, `get_insight_expenses_no_budget`, `get_insight_expenses_no_category`, `get_insight_expenses_no_tag`, `get_insight_income_no_category`, `get_insight_income_no_tag`, `get_insight_transfer_no_category`, `get_insight_transfer_no_tag`
- ~~Docker container for self-hosted HTTP deployment~~ ✓ done — `Dockerfile`, `docker-compose.yml`, `ghcr.io/daften/fireflyiii-mcp`
- ~~npm package~~ ✓ done — `@daften/fireflyiii-mcp`

**Medium priority:**
- Automation rules and rule groups
- File attachments
- Tool preset system (limit exposed tools to reduce context window usage)

**Low priority:**
- Currency management
- Net worth summary and account chart data
- Available budgets
- Piggy bank deposit/withdrawal events
- Data export (CSV per entity type)
- System info (`get_about`)
- Object groups

**Won't implement:**
- Destroy/purge data (too destructive for a natural-language interface)
- User preferences
- Cloudflare Workers deployment
- Webhooks (better managed in the Firefly III UI)
- HTTP API key auth (PAT and OAuth already cover authentication)

## Resources

- [Firefly III API Documentation](https://api-docs.firefly-iii.org/) — interactive Swagger UI for all API versions
- [Firefly III OpenAPI YAML](https://api-docs.firefly-iii.org/firefly-iii-6.5.5-v1.yaml) — machine-readable spec; fetch with `curl -s "https://api-docs.firefly-iii.org/firefly-iii-6.5.5-v1.yaml" -A "Mozilla/5.0"` (direct browser access blocked by bot protection)
- [Firefly III Docs](https://docs.firefly-iii.org/)
- [MCP Documentation](https://modelcontextprotocol.io/)

## Acknowledgements

Feature comparison informed by [fabianonetto/mcp-server-firefly-iii](https://github.com/fabianonetto/mcp-server-firefly-iii) and [etnperlong/firefly-iii-mcp](https://github.com/etnperlong/firefly-iii-mcp).

## License

MIT
