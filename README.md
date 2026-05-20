# Firefly III MCP Server

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server that connects Claude to your [Firefly III](https://www.firefly-iii.org) personal finance instance. Ask Claude questions about your finances in natural language.

Choose your setup method:

| Method | Transport | Best for |
|--------|-----------|----------|
| [npm — stdio](#option-1-npm-package--stdio-simplest) | stdio | Simplest setup, Claude on the same machine |
| [npm — HTTP](#option-2-npm-package--http-oauth) | HTTP + OAuth | Claude.ai or when you prefer OAuth over a PAT |
| [Docker — HTTP](#option-3-docker--http-self-hosted) | HTTP + OAuth | Self-hosted on a server or home lab |
| [Git checkout](#option-4-git-checkout-development) | stdio or HTTP | Contributing or local development |

---

## Option 1: npm package — stdio (simplest)

**Requires:** Node.js 18+, a Firefly III Personal Access Token (Profile → OAuth → Personal Access Tokens).

Add to your Claude MCP config (`.claude/mcp.json` or Claude Desktop `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "fireflyiii": {
      "command": "npx",
      "args": ["-y", "@daften/fireflyiii-mcp"],
      "env": {
        "FIREFLY_URL": "https://your-firefly-instance.example.com",
        "FIREFLY_TOKEN": "your-personal-access-token-here"
      }
    }
  }
}
```

Claude downloads and starts the server automatically on first use. No separate install step needed.

---

## Option 2: npm package — HTTP (OAuth)

HTTP mode uses OAuth (Authorization Code + PKCE) instead of a Personal Access Token. The MCP client handles the OAuth flow automatically on first connection.

**Requires:** Node.js 18+.

### Step 1: Register an OAuth client in Firefly III

Go to **Profile → OAuth → OAuth Clients → Create New Client**:

| Field | Value |
|-------|-------|
| **Name** | Anything, e.g. `Claude MCP` |
| **Redirect URL** | `http://127.0.0.1:3000/oauth/callback` |
| **Confidential** | **Uncheck this box** |

Save and copy the **Client ID** (you do not need the secret).

> **Why uncheck Confidential?**  
> Confidential clients require a secret stored securely on a server. PKCE-based flows use a code verifier instead, which is safe for clients (like Claude) that cannot securely store a secret. Unchecking "Confidential" creates a *public client* — the correct choice here.

> **Why this specific redirect URL?**  
> Claude uses a random port for its OAuth callback (e.g. `http://localhost:61234/callback`), but Firefly III requires an exact URI match. This server acts as an OAuth proxy: it intercepts the request, substitutes its own stable callback URL (`http://127.0.0.1:3000/oauth/callback`), and forwards the authorization code back to Claude's real callback. Register this URL once and never touch it again.

### Step 2: Start the server

```bash
FIREFLY_URL=https://your-firefly-instance.example.com \
FIREFLY_OAUTH_CLIENT_ID=your-client-id \
npx @daften/fireflyiii-mcp --transport http
```

To use a different port: add `--port 4000`. Or install globally and omit `npx`:

```bash
npm install -g @daften/fireflyiii-mcp
FIREFLY_URL=... FIREFLY_OAUTH_CLIENT_ID=... fireflyiii-mcp --transport http
```

### Step 3: Connect Claude

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

The `type: "http"` field is required — without it Claude Code assumes stdio and fails. On first connection Claude opens a browser to authorize with Firefly III; tokens are managed automatically after that.

---

## Option 3: Docker — HTTP (self-hosted)

Docker runs in HTTP mode only. Suitable for hosting on a server or home lab where Claude connects over the network.

### Step 1: Register an OAuth client in Firefly III

Same as Option 2, Step 1, but use your container's public URL as the redirect URI:

| Field | Value |
|-------|-------|
| **Redirect URL** | `https://mcp.example.com/oauth/callback` |
| **Confidential** | **Uncheck** |

Replace `https://mcp.example.com` with your actual `MCP_BASE_URL`.

### Step 2: Run the container

```bash
docker run \
  -e FIREFLY_URL=https://your-firefly-instance.example.com \
  -e FIREFLY_OAUTH_CLIENT_ID=your-client-id \
  -e MCP_BASE_URL=https://mcp.example.com \
  -p 3000:3000 \
  ghcr.io/daften/fireflyiii-mcp:latest
```

`MCP_BASE_URL` is the externally reachable URL of your container — used to build OAuth redirect URIs. If omitted the server falls back to the `Host` request header, which is unreliable behind a reverse proxy.

Or with docker-compose (copy `docker-compose.yml` from the repo):

```bash
FIREFLY_URL=https://your-firefly-instance.example.com \
FIREFLY_OAUTH_CLIENT_ID=your-client-id \
MCP_BASE_URL=https://mcp.example.com \
docker compose up -d
```

To build the image locally instead of pulling from the registry, uncomment `build: .` in `docker-compose.yml`.

### Step 3: Connect Claude

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

---

## Option 4: Git checkout (development)

### Setup

```bash
git clone https://github.com/daften/fireflyiii-mcp.git
cd fireflyiii-mcp
npm install
npm run build
```

### stdio mode

Create `.env` from `.env.example`:

```bash
FIREFLY_URL=https://your-firefly-instance.example.com
FIREFLY_TOKEN=your-personal-access-token-here
```

Add to your Claude MCP config:

```json
{
  "mcpServers": {
    "fireflyiii": {
      "command": "node",
      "args": ["/absolute/path/to/fireflyiii-mcp/dist/index.js"],
      "env": {
        "FIREFLY_URL": "https://your-firefly-instance.example.com",
        "FIREFLY_TOKEN": "your-personal-access-token-here"
      }
    }
  }
}
```

Use `npm run dev` instead of `node dist/index.js` during development to skip the build step.

### HTTP mode

Register an OAuth client in Firefly III as described in Option 2, Step 1, then add to `.env`:

```bash
FIREFLY_URL=https://your-firefly-instance.example.com
FIREFLY_OAUTH_CLIENT_ID=your-client-id-here
```

Start the server:

```bash
npm run dev -- --transport http
# or after building:
node dist/index.js --transport http
```

Connect Claude as in Option 2, Step 3.

---

## OAuth discovery

The server exposes `GET /.well-known/oauth-authorization-server` (no auth required) which returns RFC 8414 metadata. MCP clients use this to discover OAuth endpoints automatically — no manual OAuth configuration needed in the client.

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
