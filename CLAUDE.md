# Firefly III MCP Server — Project Documentation

## Project Overview

**Firefly III MCP** is a TypeScript implementation of an MCP (Model Context Protocol) server that bridges Claude Code to a running Firefly III personal finance instance. This is a greenfield, open-source project (MIT license).

Users can query their finances in natural language through Claude, getting answers about accounts, transactions, budgets, categories, bills, piggy banks, and financial insights without writing queries themselves.

**Phase 1 (complete):** Read-only tools for querying financial data.  
**Phase 2 (complete):** Full CRUD write tools and HTTP transport.  
**Phase 3 (complete):** OAuth via Firefly III for HTTP transport.

---

## Tech Stack

- **Language:** TypeScript (ESM modules, strict mode)
- **Runtime:** Node.js 18+ with tsx for development
- **MCP SDK:** `@modelcontextprotocol/sdk` v1.29.0+
- **Validation:** Zod for input schemas (inline in each tool file)
- **Testing:** Vitest for unit and integration tests
- **Build:** TypeScript compiler to ES2022 with source maps
- **Transport:** stdio (default) or HTTP (`--transport http`); HTTP is stateless StreamableHTTP with OAuth proxy

---

## Environment Variables

**stdio transport:**
```
FIREFLY_URL       String, required. Base URL of Firefly III instance (no trailing slash).
FIREFLY_TOKEN     String, required. Personal Access Token from Firefly III Profile → OAuth → Personal Access Tokens.
```

**HTTP transport:**
```
FIREFLY_URL                String, required. Base URL of Firefly III instance (no trailing slash).
FIREFLY_OAUTH_CLIENT_ID    String, required. OAuth client ID from Firefly III Profile → OAuth → Clients.
```

In HTTP mode, the Bearer token is resolved per-request from the Authorization header (set by the MCP client after completing the OAuth flow). `FIREFLY_TOKEN` is not used in HTTP mode.

Store credentials in `.env` file (which is gitignored). The `.env.example` template shows what's needed.

---

## File Structure

```
fireflyiii-mcp/
├── src/
│   ├── index.ts                 # MCP server entry point — validates env, wires client + server + transport
│   ├── server.ts                # Server factory: createServer(client) → McpServer
│   ├── client.ts                # Firefly III HTTP client (fetch wrapper + Bearer auth; accepts token string or getter fn)
│   ├── http.ts                  # HTTP server + OAuth proxy (authorize, token, callback, register stubs)
│   ├── transform.ts             # JSON:API response transforms (unwrapList, unwrapSingle, cleanSummary)
│   ├── types.ts                 # Shared utility types (QueryParams)
│   ├── tools/
│   │   ├── index.ts             # Aggregator: registerAllTools(server, client) calls each registerXxx
│   │   ├── accounts.ts          # get_accounts, get_account, create_account, update_account, delete_account
│   │   ├── transactions.ts      # get_transactions, get_transaction, create_transaction, update_transaction, delete_transaction
│   │   ├── budgets.ts           # get_budgets, get_budget_limits, create_budget, update_budget, delete_budget, create_budget_limit, update_budget_limit, delete_budget_limit
│   │   ├── categories.ts        # get_categories, get_category_transactions, create_category, update_category, delete_category
│   │   ├── bills.ts             # get_bills, create_bill, update_bill, delete_bill
│   │   ├── piggy-banks.ts       # get_piggy_banks, create_piggy_bank, update_piggy_bank, delete_piggy_bank
│   │   ├── reports.ts           # get_tags, get_tag_transactions, get_summary, get_insight_expenses, get_insight_income, create_tag, update_tag, delete_tag
│   │   ├── currencies.ts        # get_currencies, get_currency, create_currency, update_currency, delete_currency, enable_currency, disable_currency, set_primary_currency
│   │   ├── exports.ts           # export_transactions, export_accounts, export_bills, export_budgets, export_categories, export_tags, export_recurring, export_rules, export_piggy_banks
│   │   ├── object-groups.ts     # get_object_groups, get_object_group, create_object_group, update_object_group, delete_object_group, get_object_group_bills, get_object_group_piggy_banks
│   │   └── transaction-links.ts # get_link_types, get_transaction_links, get_transaction_link, create_transaction_link, update_transaction_link, delete_transaction_link
│   └── tests/
│       ├── accounts.test.ts
│       ├── bills.test.ts
│       ├── budgets.test.ts
│       ├── categories.test.ts
│       ├── client.test.ts
│       ├── http.test.ts
│       ├── integration.test.ts  # Live Firefly III tests (skipped unless FIREFLY_INTEGRATION=true)
│       ├── piggy-banks.test.ts
│       ├── reports.test.ts
│       ├── transactions.test.ts
│       └── transform.test.ts
├── dist/                        # Compiled output — committed to git (not gitignored)
├── package.json
├── tsconfig.json
├── .env.example
├── LICENSE
├── README.md
└── CLAUDE.md                    # This file
```

---

## Tool Pattern

Each tool file follows a consistent three-part structure.

### 1. Fetch Function

Calls `client.get()` and pipes the raw Firefly III response through a transform from `src/transform.ts`.

```typescript
import { unwrapList, type JsonApiListResponse, type UnwrappedList } from '../transform.js';
import type { FireflyClient } from '../client.js';

export async function fetchAccounts(
  client: FireflyClient,
  params: { type?: string; page?: number; limit?: number }
): Promise<UnwrappedList> {
  const query: QueryParams = { page: params.page, limit: params.limit };
  if (params.type) query['type'] = params.type;
  const response = await client.get<JsonApiListResponse>('/accounts', query);
  return unwrapList(response);
}
```

`client` is always passed as the first argument — never imported as a singleton.

### 2. Register Function

Each tool file exports a `registerXxxTools(server, client)` function that calls `server.registerTool()` for each tool it owns.

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { type FireflyClient, formatError } from '../client.js';

const READ_ANNOTATIONS = {
  readOnlyHint: true,
  openWorldHint: true,
  idempotentHint: true,
} as const;

export function registerAccountTools(server: McpServer, client: FireflyClient): void {
  server.registerTool(
    'get_accounts',
    {
      title: 'Get Accounts',
      description: 'Get all accounts from Firefly III.',
      inputSchema: {
        type: z.enum(['asset', 'liability', 'revenue', 'expense']).optional()
          .describe('Filter by account type'),
        page: z.number().int().positive().optional().default(1).describe('Page number'),
        limit: z.number().int().positive().max(100).optional().default(50)
          .describe('Results per page (max 100)'),
      },
      annotations: READ_ANNOTATIONS,
    },
    async ({ type, page, limit }) => {
      try {
        const result = await fetchAccounts(client, { type, page, limit });
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );
}
```

### 3. Wire into aggregator (`src/tools/index.ts`)

```typescript
import { registerAccountTools } from './accounts.js';
// ... other imports

export function registerAllTools(server: McpServer, client: FireflyClient): void {
  registerAccountTools(server, client);
  // ... other register calls
}
```

---

## Transform Layer (`src/transform.ts`)

Firefly III returns JSON:API envelopes (`data[].attributes`, `meta.pagination`, etc.). The transform layer strips the envelope so Claude receives flat, compact data.

### `unwrapList(response: JsonApiListResponse): UnwrappedList`

Merges each `data[i].attributes` with `data[i].id` (id pinned after the spread so attributes cannot overwrite it), strips `type` and `links`, and extracts compact pagination.

```typescript
// Input
{ data: [{ id: '1', type: 'accounts', attributes: { name: 'Checking', balance: '1000' }, links: {...} }],
  meta: { pagination: { current_page: 1, total_pages: 3, total: 120 } } }

// Output
{ data: [{ name: 'Checking', balance: '1000', id: '1' }],
  pagination: { page: 1, totalPages: 3, total: 120 } }
```

### `unwrapSingle(response: JsonApiSingleResponse): UnwrappedSingle`

Same flattening for a single-item response (`data` is an object, not an array).

### `cleanSummary(response: RawSummaryResponse): CleanSummaryItem[]`

The `/summary/basic` endpoint returns a **dict** keyed by currency slug (e.g. `"balance-in-EUR": {...}`), not an array. `cleanSummary` converts it to a flat array and strips UI-only fields (`local_icon`, `sub_title`, `currency_symbol`, `currency_decimal_places`).

```typescript
// RawSummaryResponse = Record<string, Record<string, unknown>>
// Input: { "balance-in-EUR": { key, title, monetary_value, ..., local_icon, sub_title } }
// Output: [{ key: "balance-in-EUR", value: { key, title, monetary_value, currency_id, currency_code, value_parsed } }]
```

---

## Tool Annotations

Read tools use:

```typescript
const READ_ANNOTATIONS = {
  readOnlyHint: true,    // tool does not modify state
  openWorldHint: true,   // results may vary (live data)
  idempotentHint: true,  // safe to call multiple times
} as const;
```

Write tools use:
- Create: `{ openWorldHint: true }`
- Update: `{ openWorldHint: true, idempotentHint: true }`
- Delete: `{ destructiveHint: true, openWorldHint: true }` — descriptions include "This action cannot be undone."

---

## HTTP Client (`src/client.ts`)

Wraps Firefly III's REST API with Bearer auth and error handling. Accepts either a static token string or a getter function (used in HTTP mode to read the per-request token from `AsyncLocalStorage`).

```typescript
const client = new FireflyClient(url, token);          // stdio: static PAT
const client = new FireflyClient(url, () => getToken()); // HTTP: per-request via AsyncLocalStorage
const response = await client.get<JsonApiListResponse>('/accounts', { page: 1, limit: 50 });
```

Query params are passed as a `QueryParams` object (`Record<string, string | number | undefined>`); `undefined` values are omitted automatically.

---

## OAuth Proxy (`src/http.ts`)

In HTTP mode, `createOAuthHandler` wraps the MCP request handler with an OAuth proxy that sits in front of Firefly III's own OAuth server. This solves the redirect URI mismatch problem: Firefly III requires exact URI matching, but MCP clients use a dynamic localhost port each session.

Routes handled by the proxy (no auth required):
- `GET /.well-known/oauth-authorization-server` — returns OAuth metadata pointing at our proxy endpoints
- `GET /oauth/authorize` — stores the MCP client's dynamic `redirect_uri`, substitutes our stable `/oauth/callback` URL, and 302s to Firefly III
- `POST /oauth/register` — RFC 7591 dynamic client registration stub (Firefly III doesn't support this; we return the configured `FIREFLY_OAUTH_CLIENT_ID`)
- `POST /oauth/token` — substitutes `redirect_uri` back to our stable callback, proxies token exchange to Firefly III
- `GET /oauth/callback` — receives Firefly III's redirect, forwards `code`+`state` to the MCP client's original dynamic callback URL

All other requests require a `Bearer` token in the `Authorization` header. The token is propagated via `AsyncLocalStorage` so `FireflyClient` can read it without it being passed through every call chain.

---

## Build & Test Commands

```bash
npm install                    # Install dependencies
npm run build                  # Compile TypeScript to dist/, chmod +x dist/index.js
npm run dev                    # Run with tsx (no build required)
npm test                       # Run unit tests (vitest run)
npm run test:watch             # Watch mode for unit tests
npm run test:integration       # Run integration tests against live Firefly III
npm run dev -- --transport http          # Run HTTP server in dev mode
npm run dev -- --transport http --port 4000  # Run on a specific port
```

**Important:** `dist/` is committed to git so the server can be used without a build step. Always run `npm run build` and commit `dist/` alongside source changes.

---

## Adding a New Tool

1. **Implement fetch function** in `src/tools/{category}.ts`. Call `client.get<JsonApiListResponse>(...)` and pipe through `unwrapList` (or `unwrapSingle` for single-item endpoints).
2. **Add `registerXxxTools` call** in `src/tools/index.ts`.
3. **Write test** in `src/tests/{category}.test.ts` — mock `client.get` with a realistic JSON:API envelope fixture, assert both call args and return value shape.
4. **Run `npm run build`** and commit source + dist together.

Example — adding `get_account` (single account by ID):

```typescript
// src/tools/accounts.ts
import { unwrapSingle, type JsonApiSingleResponse, type UnwrappedSingle } from '../transform.js';

export async function fetchAccount(client: FireflyClient, id: string): Promise<UnwrappedSingle> {
  const response = await client.get<JsonApiSingleResponse>(`/accounts/${id}`);
  return unwrapSingle(response);
}

// in registerAccountTools():
server.registerTool(
  'get_account',
  {
    title: 'Get Account',
    description: 'Get a single account by ID.',
    inputSchema: { id: z.string().describe('Account ID') },
    annotations: READ_ANNOTATIONS,
  },
  async ({ id }) => {
    try {
      const result = await fetchAccount(client, id);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  }
);

// src/tests/accounts.test.ts — use a JSON:API envelope fixture
const singleFixture: JsonApiSingleResponse = {
  data: { id: '1', type: 'accounts', attributes: { name: 'Checking', current_balance: '1000' }, links: {} },
};
mockClient.get = vi.fn().mockResolvedValueOnce(singleFixture);
const result = await fetchAccount(mockClient, '1');
expect(result).toEqual({ name: 'Checking', current_balance: '1000', id: '1' });
```

---

## Testing Strategy

- **Unit tests** in `src/tests/` test fetch functions in isolation (mock `client.get`).
- Fixtures use **realistic JSON:API envelopes** — the full `{ data: [{ id, type, attributes, links }], meta: { pagination } }` shape — so tests catch transform regressions.
- **Integration tests** in `src/tests/integration.test.ts` run against a real Firefly III instance (only when `FIREFLY_INTEGRATION=true`).
- Run unit tests in CI; integration tests manually or in a staging environment.

---

## Commits

After every meaningful work step, commit with:

```bash
git add [files...]
git commit -m "[type]: [subject]

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

**Commit types:**
- `feat:` New tool or feature
- `fix:` Bug fix
- `refactor:` Code cleanup without behavior change
- `test:` Add or update tests
- `chore:` Dependencies, config, scaffolding

---

## Security & Open Source

- **No hardcoded secrets.** All credentials come from environment variables.
- **Validate all input.** Use Zod schemas defined inline in each `server.registerTool()` call.
- **Error handling.** Every tool handler wraps in try/catch and returns `{ isError: true }` on failure.
- **Dependencies.** Keep them minimal and up-to-date.
- **License.** MIT — include LICENSE file.

---

## Completed Phases

**Phase 1 (complete):**
- Read-only tools only
- Stdio transport only
- All tools have `readOnlyHint: true, openWorldHint: true, idempotentHint: true`

**Phase 2 (complete):**
- Full CRUD write tools for all resources (transactions, accounts, budgets, budget limits, categories, bills, piggy banks, tags)
- Write tools: `{ openWorldHint: true }`
- Update tools: `{ openWorldHint: true, idempotentHint: true }`
- Delete tools: `{ destructiveHint: true, openWorldHint: true }` — descriptions include "This action cannot be undone."
- HTTP transport via `--transport http` (default: stdio)
- CLI flags: `--transport stdio|http`, `--host <host>` (default 127.0.0.1), `--port <n>` (default 3000, auto-increments if taken)

**Phase 3 (complete):**
- OAuth via Firefly III for HTTP transport — full proxy in `src/http.ts`
- `FIREFLY_OAUTH_CLIENT_ID` env var required for HTTP mode; `FIREFLY_TOKEN` used only for stdio
- Per-request Bearer token propagation via `AsyncLocalStorage`
- Dynamic client registration stub (RFC 7591) — Firefly III doesn't support it natively
- Redirect URI substitution proxy solves the dynamic-port mismatch between MCP clients and Firefly III's exact URI matching

---

## Inspiration

Feature coverage was informed by [fabianonetto/mcp-server-firefly-iii](https://github.com/fabianonetto/mcp-server-firefly-iii) and [etnperlong/firefly-iii-mcp](https://github.com/etnperlong/firefly-iii-mcp).

---

## Development Notes

- **Always verify new or changed tool fields against the Firefly III OpenAPI spec before implementing.** Fetch the YAML with `curl -s "https://api-docs.firefly-iii.org/firefly-iii-6.5.5-v1.yaml" -A "Mozilla/5.0"` and grep for the relevant schema (e.g. `grep -A 100 "TransactionSplitStore:"`). Field names, required/optional status, enums (especially `weekend`), and response shapes differ from what documentation summaries or memory suggest — the spec is authoritative.
- Use ESM imports with `.js` extension (`import ... from '../transform.js'`) — required for Node ESM.
- Use a single merged import from each module — avoid two `import` statements from the same path.
- Test files are in `src/tests/` (flat, not a `unit/` subdirectory) and excluded from the build by `tsconfig.json`.
- `dist/` is **committed to git**. Run `npm run build` and include `dist/` in commits that change source.
- The MCP SDK handles serialization; just return plain objects from tool handlers.
- Firefly III API is REST; pagination is via query params (`limit`, `page`).
- `/summary/basic` returns a dict (`Record<string, {...}>`), not an array — use `cleanSummary`.
- Insight endpoints (`/insight/expense/category`, `/insight/income/category`) return flat arrays with no JSON:API envelope — pass through directly.

---

## Useful Resources

- [Firefly III API Docs](https://api-docs.firefly-iii.org/) — Swagger UI listing all versions
- [Firefly III OpenAPI YAML (latest stable)](https://api-docs.firefly-iii.org/firefly-iii-6.5.5-v1.yaml) — machine-readable spec; fetch with `curl -s "https://api-docs.firefly-iii.org/firefly-iii-6.5.5-v1.yaml" -A "Mozilla/5.0"` (WebFetch is blocked by bot protection on this host)
- [MCP Documentation](https://modelcontextprotocol.io/)
- [TypeScript ESM Guide](https://nodejs.org/en/docs/guides/ecmascript-modules/)
