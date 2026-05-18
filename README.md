# Firefly III MCP Server

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server that connects Claude Code to your [Firefly III](https://www.firefly-iii.org) personal finance instance. Ask Claude questions about your finances in natural language.

## Prerequisites

- Node.js 18+
- A running Firefly III instance
- A Firefly III Personal Access Token (Profile → OAuth → Personal Access Tokens)

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

The HTTP transport requires OAuth instead of a Personal Access Token. The MCP client (e.g. Claude Desktop) handles the OAuth flow automatically.

### Setup

1. **Register a public OAuth client in Firefly III**
   - Go to Profile → OAuth → OAuth Clients → Create New Client
   - Name: anything (e.g. `Claude MCP`)
   - Redirect URL: the redirect URI your MCP client uses (Claude will provide this on first connect)
   - Check **Public client** — no secret required, uses PKCE
   - Save and copy the **Client ID**

2. **Configure `.env` for HTTP mode**

   ```bash
   FIREFLY_URL=https://your-firefly-instance.example.com
   FIREFLY_OAUTH_CLIENT_ID=your-client-id-here
   ```

3. **Start the server in HTTP mode**

   ```bash
   npm run dev -- --transport http
   # or on a specific port:
   npm run dev -- --transport http --port 4000
   ```

4. **Point Claude at the server**

   Add to your MCP config:
   ```json
   {
     "mcpServers": {
       "fireflyiii": {
         "url": "http://127.0.0.1:3000/mcp"
       }
     }
   }
   ```

   On first connection Claude will open a browser window to authorize with Firefly III. After that, tokens are managed automatically.

### OAuth discovery

The server exposes `GET /.well-known/oauth-authorization-server` (no auth required) which returns RFC 8414 metadata pointing to your Firefly III instance. MCP clients use this to discover the authorization and token endpoints.

## Available Tools

| Tool | Description |
|------|-------------|
| `get_accounts` | List all accounts, filterable by type |
| `get_account` | Get a single account by ID with current balance |
| `get_transactions` | List transactions with filters (account, date, type) |
| `get_transaction` | Get a single transaction by ID with all splits |
| `get_budgets` | List all budgets with spent/available amounts |
| `get_budget_limits` | Get budget limits for a specific budget and period |
| `get_categories` | List all categories |
| `get_category_transactions` | Get transactions for a specific category |
| `get_bills` | List all bills with next expected match date |
| `get_piggy_banks` | List all piggy banks with current/target amounts |
| `get_tags` | List all tags |
| `get_tag_transactions` | Get transactions for a specific tag |
| `get_summary` | Basic balance summary (total assets, net worth) |
| `get_insight_expenses` | Expense insights grouped by category for a date range |
| `get_insight_income` | Income insights grouped by category for a date range |

## Development

```bash
npm test                  # Run unit tests
npm run test:watch        # Watch mode
npm run test:integration  # Run against live Firefly III (requires FIREFLY_URL + FIREFLY_TOKEN)
npm run dev               # Run without building (uses tsx)
npm run build             # Compile TypeScript to dist/
```

## License

MIT
