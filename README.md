# Firefly III MCP Server

[![npm version](https://img.shields.io/npm/v/@daften/fireflyiii-mcp.svg)](https://www.npmjs.com/package/@daften/fireflyiii-mcp)
[![npm downloads](https://img.shields.io/npm/dm/@daften/fireflyiii-mcp.svg)](https://www.npmjs.com/package/@daften/fireflyiii-mcp)
[![CI](https://github.com/daften/fireflyiii-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/daften/fireflyiii-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server that connects Claude to your [Firefly III](https://www.firefly-iii.org) personal finance instance. Ask Claude questions about your finances in natural language.

## What you can ask Claude

Once configured, you can ask things like:

- *"How much did I spend on groceries last month?"*
- *"Show me my budget status for this month."*
- *"Find any duplicate transactions in the last 30 days."*
- *"Set up a piggy bank for my vacation fund with a €2000 target."*
- *"What were my biggest expense categories this year?"*

Claude handles the translation to Firefly III API calls — you get answers in plain English.

---

Choose your setup method:

| Method | Transport | Best for |
|--------|-----------|----------|
| [npm — stdio](#option-1-npm-package--stdio-simplest) | stdio | Simplest setup, Claude on the same machine |
| [npm — HTTP](#option-2-npm-package--http-oauth) | HTTP + OAuth | Claude.ai or when you prefer OAuth over a PAT |
| [Docker — HTTP](#option-3-docker--http-self-hosted) | HTTP + OAuth | Self-hosted on a server or home lab |
| [Git checkout](#option-4-git-checkout-development) | stdio or HTTP | Contributing or local development |

---

## Option 1: npm package — stdio (simplest)

**Requires:** Node.js 20+, a Firefly III Personal Access Token (Options → Remote access and tokens → Create new token).

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

**Requires:** Node.js 20+.

### Step 1: Register an OAuth client in Firefly III

Go to **Options → Remote access and tokens → Create New Client**:

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
# Option A: use a .env file (copy .env.example and fill in values)
cp .env.example .env   # then edit .env
docker compose up -d

# Option B: export variables in your shell
FIREFLY_URL=https://your-firefly-instance.example.com \
FIREFLY_OAUTH_CLIENT_ID=your-client-id \
MCP_BASE_URL=https://mcp.example.com \
docker compose up -d
```

To build the image locally instead of pulling from the registry, uncomment `build: .` in `docker-compose.yml`.

> **Note:** OAuth state is held in-process. Run only a single replica — multiple replicas will break the OAuth flow because the callback may land on a different instance than the one that initiated authorization.

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

<details>
<summary><b>7 tools</b> — click to expand</summary>

| Tool | Description |
|------|-------------|
| `get_accounts` | List all accounts, filterable by type |
| `get_account` | Get a single account by ID with current balance |
| `create_account` | Create a new account |
| `update_account` | Update an existing account |
| `delete_account` | Delete an account. This action cannot be undone. |
| `get_account_transactions` | Get all transactions for a specific account, filterable by type and date range |
| `search_accounts` | Search accounts by name, IBAN, or account number |

</details>

### Transactions

<details>
<summary><b>8 tools</b> — click to expand</summary>

| Tool | Description |
|------|-------------|
| `get_transactions` | List transactions with filters (account, date, type) |
| `get_transaction` | Get a single transaction by ID with all splits |
| `search_transactions` | Keyword search across transactions |
| `create_transaction` | Create a new transaction |
| `create_split_transaction` | Create a split transaction (one receipt across multiple categories/budgets) |
| `update_transaction` | Update an existing transaction |
| `bulk_update_transactions` | Update multiple transactions at once using a search query |
| `delete_transaction` | Delete a transaction. This action cannot be undone. |

</details>

### Budgets

<details>
<summary><b>12 tools</b> — click to expand</summary>

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
| `get_available_budgets` | List all available budget periods with amounts available |
| `get_available_budget` | Get a single available budget period by ID |
| `get_budget_transactions` | Get all transactions assigned to a specific budget |
| `get_transactions_without_budget` | Get transactions that have no budget assigned |

</details>

### Categories

<details>
<summary><b>5 tools</b> — click to expand</summary>

| Tool | Description |
|------|-------------|
| `get_categories` | List all categories |
| `get_category_transactions` | Get transactions for a specific category |
| `create_category` | Create a new category |
| `update_category` | Update an existing category |
| `delete_category` | Delete a category. This action cannot be undone. |

</details>

### Bills

<details>
<summary><b>5 tools</b> — click to expand</summary>

| Tool | Description |
|------|-------------|
| `get_bills` | List all bills with next expected match date |
| `create_bill` | Create a new bill |
| `update_bill` | Update an existing bill |
| `delete_bill` | Delete a bill. This action cannot be undone. |
| `get_bill_transactions` | Get all transactions linked to a specific bill |

</details>

### Piggy Banks

<details>
<summary><b>7 tools</b> — click to expand</summary>

| Tool | Description |
|------|-------------|
| `get_piggy_banks` | List all piggy banks with current/target amounts |
| `create_piggy_bank` | Create a new piggy bank |
| `update_piggy_bank` | Update an existing piggy bank |
| `delete_piggy_bank` | Delete a piggy bank. This action cannot be undone. |
| `get_piggy_bank_events` | Get all deposit/withdrawal events for a piggy bank |
| `create_piggy_bank_event` | Add a deposit or withdrawal event to a piggy bank |
| `delete_piggy_bank_event` | Delete a piggy bank event. This action cannot be undone. |

</details>

### Recurring Transactions

<details>
<summary><b>7 tools</b> — click to expand</summary>

| Tool | Description |
|------|-------------|
| `get_recurring` | List all recurring transaction rules |
| `get_recurrence` | Get a single recurring transaction rule by ID |
| `create_recurring` | Create a new recurring transaction rule |
| `update_recurring` | Update an existing recurring transaction rule |
| `delete_recurring` | Delete a recurring transaction rule. This action cannot be undone. |
| `get_recurrence_transactions` | Get transactions created by a recurring transaction rule |
| `trigger_recurrence` | Manually fire a recurring rule to create its transaction immediately |

</details>

### Automation Rules

<details>
<summary><b>15 tools</b> — click to expand</summary>

| Tool | Description |
|------|-------------|
| `get_rule_groups` | List all rule groups |
| `get_rule_group` | Get a single rule group by ID |
| `create_rule_group` | Create a new rule group |
| `update_rule_group` | Update an existing rule group |
| `delete_rule_group` | Delete a rule group and all its rules. This action cannot be undone. |
| `get_rules` | List all automation rules |
| `get_rule` | Get a single rule by ID |
| `create_rule` | Create a new automation rule with trigger conditions and actions |
| `update_rule` | Update an existing automation rule |
| `delete_rule` | Delete an automation rule. This action cannot be undone. |
| `trigger_rule_group` | Manually run all rules in a group against existing transactions |
| `trigger_rule` | Manually run a single rule against existing transactions |
| `test_rule_group` | Dry-run a rule group and return matching transactions (no changes applied) |
| `test_rule` | Dry-run a single rule and return matching transactions (no changes applied) |
| `get_rule_group_rules` | Get all rules belonging to a specific rule group |

</details>

### Attachments

<details>
<summary><b>7 tools</b> — click to expand</summary>

| Tool | Description |
|------|-------------|
| `get_attachments` | List all file attachments |
| `get_attachment` | Get a single attachment by ID |
| `create_attachment` | Create attachment metadata (step 1 of 2 — use `upload_attachment` to send file content) |
| `update_attachment` | Update attachment metadata |
| `delete_attachment` | Delete an attachment and its file data. This action cannot be undone. |
| `upload_attachment` | Upload base64-encoded file content for an existing attachment record (step 2 of 2) |
| `download_attachment` | Download the raw content of an attachment as text |

</details>

### Tags & Reports

<details>
<summary><b>37 tools</b> — click to expand</summary>

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
| `get_about` | Get Firefly III server info (version, PHP version, OS) |
| `get_net_worth_summary` | Get net worth summary for a date range |
| `get_account_overview_chart` | Get account overview chart data for a date range |
| `get_balance_chart` | Get account balance chart data for a date range |
| `get_budget_chart` | Get budget overview chart data for a date range |
| `get_category_chart` | Get category overview chart data for a date range |
| `get_exchange_rate` | Get exchange rate between two currencies |
| `get_insight_expenses_by_bill` | Expense insights grouped by bill for a date range |
| `get_insight_expenses_by_budget` | Expense insights grouped by budget for a date range |
| `get_insight_expenses_by_tag` | Expense insights grouped by tag for a date range |
| `get_insight_expenses_by_asset` | Expense insights grouped by asset account |
| `get_insight_expenses_by_expense_account` | Expense insights grouped by expense account |
| `get_insight_expenses_total` | Total expense amount for a date range |
| `get_insight_income_by_revenue` | Income insights grouped by revenue account |
| `get_insight_income_by_tag` | Income insights grouped by tag |
| `get_insight_income_by_asset` | Income insights grouped by asset account |
| `get_insight_income_total` | Total income amount for a date range |
| `get_insight_transfers_by_category` | Transfer insights grouped by category |
| `get_insight_transfers_by_tag` | Transfer insights grouped by tag |
| `get_insight_transfers_by_asset` | Transfer insights grouped by asset account |
| `get_insight_transfers_total` | Total transfer amount for a date range |

</details>

### Currencies

<details>
<summary><b>8 tools</b> — click to expand</summary>

| Tool | Description |
|------|-------------|
| `get_currencies` | List all currencies configured in Firefly III |
| `get_currency` | Get a single currency by code (e.g. EUR, USD) |
| `create_currency` | Create a new currency |
| `update_currency` | Update an existing currency |
| `enable_currency` | Enable a currency for use in transactions |
| `disable_currency` | Disable a currency |
| `set_primary_currency` | Set a currency as the primary/default currency |
| `delete_currency` | Delete a currency. This action cannot be undone. |

</details>

### Data Export

<details>
<summary><b>9 tools</b> — click to expand</summary>

| Tool | Description |
|------|-------------|
| `export_transactions` | Export all transactions as CSV (supports date filters) |
| `export_accounts` | Export all accounts as CSV |
| `export_bills` | Export all bills as CSV |
| `export_budgets` | Export all budgets as CSV |
| `export_categories` | Export all categories as CSV |
| `export_tags` | Export all tags as CSV |
| `export_recurring` | Export all recurring transactions as CSV |
| `export_rules` | Export all rules as CSV |
| `export_piggy_banks` | Export all piggy banks as CSV |

</details>

### Object Groups

<details>
<summary><b>7 tools</b> — click to expand</summary>

| Tool | Description |
|------|-------------|
| `get_object_groups` | List all object groups (used to organise accounts and piggy banks) |
| `get_object_group` | Get a single object group by ID |
| `create_object_group` | Create a new object group |
| `update_object_group` | Update an existing object group |
| `delete_object_group` | Delete an object group. This action cannot be undone. |
| `get_object_group_bills` | Get all bills in a specific object group |
| `get_object_group_piggy_banks` | Get all piggy banks in a specific object group |

</details>

### Transaction Links

<details>
<summary><b>6 tools</b> — click to expand</summary>

| Tool | Description |
|------|-------------|
| `get_link_types` | List available transaction link types (Related, Refund, Paid, etc.) |
| `get_transaction_links` | Get all links attached to a transaction journal entry |
| `get_transaction_link` | Get a single transaction link by ID |
| `create_transaction_link` | Create a link between two transactions |
| `update_transaction_link` | Update an existing transaction link |
| `delete_transaction_link` | Delete a transaction link. This action cannot be undone. |

</details>

## Filtering Tools

With 140 tools across 14 groups, loading everything can consume significant context window space. Three flags let you control exactly which tools are registered:

### `--preset <name>`

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

### `--groups <list>`

Comma-separated list of specific groups to load. Cannot be combined with `--preset`.

Valid group names: `accounts`, `transactions`, `budgets`, `categories`, `bills`, `piggy-banks`, `reports`, `rules`, `recurring`, `attachments`, `currencies`, `exports`, `object-groups`, `transaction-links`

```bash
node dist/index.js --groups accounts,transactions,reports
```

### `--read-only`

Filter any selection down to read-only tools (`get_*`, `search_*`, `test_*`). All create, update, delete, trigger, and upload tools are excluded. Can be combined with `--preset` or `--groups`.

```bash
node dist/index.js --preset default --read-only
node dist/index.js --groups rules --read-only
```

Without any filter flags the server registers all 140 tools (equivalent to `--preset full`).

---

## Development

```bash
npm test                  # Run unit tests
npm run test:watch        # Watch mode
npm run test:integration  # Run against live Firefly III (requires FIREFLY_URL + FIREFLY_TOKEN)
npm run dev               # Run without building (uses tsx)
npm run build             # Compile TypeScript to dist/
```

## Resources

- [Firefly III API Documentation](https://api-docs.firefly-iii.org/) — interactive Swagger UI for all API versions
- [Firefly III OpenAPI YAML](https://api-docs.firefly-iii.org/firefly-iii-6.5.5-v1.yaml) — machine-readable spec; fetch with `curl -s "https://api-docs.firefly-iii.org/firefly-iii-6.5.5-v1.yaml" -A "Mozilla/5.0"` (direct browser access blocked by bot protection)
- [Firefly III Docs](https://docs.firefly-iii.org/)
- [MCP Documentation](https://modelcontextprotocol.io/)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the development loop, tool-add checklist, and commit conventions.

## Security

See [SECURITY.md](SECURITY.md) for the vulnerability disclosure policy.

## Acknowledgements

Feature comparison informed by [fabianonetto/mcp-server-firefly-iii](https://github.com/fabianonetto/mcp-server-firefly-iii) and [etnperlong/firefly-iii-mcp](https://github.com/etnperlong/firefly-iii-mcp).

## License

MIT
