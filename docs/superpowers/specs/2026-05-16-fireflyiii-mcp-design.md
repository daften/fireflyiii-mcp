# Firefly III MCP Server — Design Spec

**Date:** 2026-05-16  
**Status:** Approved

## Overview

A TypeScript MCP server that exposes a Firefly III personal finance instance to Claude Code via the Model Context Protocol. Phase 1 is read-only. Transport is stdio (with HTTP/SSE expansion possible later). Authentication uses a Personal Access Token.

---

## Architecture

```
fireflyiii-mcp/
├── src/
│   ├── index.ts           # Entry point — wires StdioServerTransport + server
│   ├── server.ts          # MCP server setup, tool registration
│   ├── client.ts          # Firefly III HTTP client (fetch + PAT auth)
│   ├── tools/
│   │   ├── accounts.ts
│   │   ├── transactions.ts
│   │   ├── budgets.ts
│   │   ├── categories.ts
│   │   ├── bills.ts
│   │   ├── piggy-banks.ts
│   │   ├── reports.ts
│   │   └── index.ts       # Registers all tool modules with the server
│   └── types.ts           # Shared TypeScript types
├── src/tests/
│   ├── accounts.test.ts
│   ├── transactions.test.ts
│   ├── budgets.test.ts
│   ├── categories.test.ts
│   ├── bills.test.ts
│   ├── piggy-banks.test.ts
│   └── reports.test.ts
├── package.json
└── tsconfig.json
```

**Data flow:**
1. Claude Code launches the server as a child process via stdio
2. `index.ts` creates a `StdioServerTransport` and connects it to the MCP server
3. Each tool module registers its tools against the server and delegates to `client.ts`
4. `client.ts` holds the base URL and PAT, handles request construction, pagination pass-through, and error normalization

**Transport expansion:** `index.ts` is the only file that references stdio. Adding HTTP/SSE transport later means adding an `http.ts` entry point — no other files change.

---

## Tools

All tools are read-only. Common optional parameters across all tools: `page` (default 1), `limit` (default 50). Date-range tools accept `start` and `end` as `YYYY-MM-DD` strings.

| Tool | Description |
|------|-------------|
| `get_accounts` | All accounts, filterable by type (`asset`, `expense`, `revenue`, `liability`) |
| `get_account` | Single account by ID including current balance |
| `get_transactions` | Transactions with filters: account ID, date range, type, category |
| `get_transaction` | Single transaction by ID with all splits |
| `get_budgets` | All budgets with spent/available amounts |
| `get_budget_limits` | Budget limits for a specific budget and period |
| `get_categories` | All categories |
| `get_category_transactions` | Transactions for a specific category |
| `get_bills` | All bills with next expected match date |
| `get_piggy_banks` | All piggy banks with current/target amounts |
| `get_tags` | All tags |
| `get_tag_transactions` | Transactions for a specific tag |
| `get_summary` | Basic balance summary (total assets, net worth, etc.) |
| `get_insight_expenses` | Expense insights by category/account for a date range |
| `get_insight_income` | Income insights for a date range |

**Total: 15 tools**

---

## Configuration

Environment variables (both required at startup — server exits with a clear error if either is missing):

| Variable | Description |
|----------|-------------|
| `FIREFLY_URL` | Base URL of your Firefly III instance (e.g. `https://firefly.example.com`) |
| `FIREFLY_TOKEN` | Personal Access Token generated in Firefly III settings |

**Claude Code / MCP config example:**
```json
{
  "mcpServers": {
    "fireflyiii": {
      "command": "node",
      "args": ["dist/index.js"],
      "env": {
        "FIREFLY_URL": "https://your-firefly-instance.com",
        "FIREFLY_TOKEN": "your-pat-here"
      }
    }
  }
}
```

---

## Error Handling

- HTTP 401 → "Authentication failed. Check your FIREFLY_TOKEN."
- HTTP 404 → "Resource not found: [resource type] [id]"
- HTTP 422 → "Invalid request parameters: [Firefly error message]"
- HTTP 5xx → "Firefly III server error. Try again later."
- Network timeout → "Request to [url] timed out."
- All errors are returned as MCP error responses (not thrown), so Claude sees a readable message.

---

## Testing

- **Framework:** Vitest
- **Unit tests:** One test file per tool module under `src/tests/`. `client.ts` is mocked — no live API calls.
- **Integration test:** A single smoke test (`src/tests/integration.test.ts`) that hits the real Firefly III instance using env vars. Skipped in CI by default (guarded by an env flag `FIREFLY_INTEGRATION=true`).
- **Coverage target:** All tool parameter handling and response shaping covered by unit tests.

---

## Key Dependencies

| Package | Purpose |
|---------|---------|
| `@modelcontextprotocol/sdk` | Official MCP TypeScript SDK (latest stable) |
| `zod` | Schema validation for tool input parameters |
| `vitest` | Test framework |

---

## Out of Scope (Phase 1)

- Write operations (create/update/delete) — added in a later phase
- HTTP/SSE transport — architecture supports it; deferred
- Multi-user / OAuth2 — PAT only for now
- Webhooks / real-time data
