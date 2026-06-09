# MCP server for Firefly III — Project Documentation

## Project Overview

**MCP server for Firefly III** is a TypeScript implementation of an MCP (Model Context Protocol) server that bridges Claude Code to a running Firefly III personal finance instance. This is a greenfield, open-source project (MIT license).

Users can query their finances in natural language through Claude, getting answers about accounts, transactions, budgets, categories, bills, piggy banks, and financial insights without writing queries themselves.

**Current state:** 140 tools across 14 groups, full CRUD, stdio and HTTP/OAuth transports, tool filtering via `--preset`/`--groups`/`--read-only`.

### Architecture at a glance

```
MCP client (Claude Code / Desktop / ...)
        │
        │  stdio                          HTTP (StreamableHTTP, stateless)
        ▼                                 ▼
  StdioServerTransport          OAuth proxy (src/http.ts)
        │                         · /.well-known metadata, /oauth/{authorize,token,register,callback}
        │                         · substitutes redirect_uri, Bearer guard
        │                         · per-request token via AsyncLocalStorage
        └────────────┬────────────┘
                     ▼
            McpServer (src/server.ts)
                     │  registerAllTools (src/tools/index.ts)
                     │  · TOOL_GROUPS / PRESETS filtering, read-only proxy
                     ▼
      Tool groups (src/tools/*.ts, 14 groups / 140 tools)
        · defineTool wrapper: zod validation, error formatting (src/tools/_helpers.ts)
        · autocomplete prompts with per-user TTL cache
                     │
                     ▼
        FireflyClient (src/client.ts)
        · Bearer auth, 30s timeout, FireflyError → friendly messages
                     │
                     ▼
        Transform layer (src/transform.ts)
        · unwraps JSON:API envelopes → flat objects + pagination
                     │
                     ▼
            Firefly III REST API (/api/v1)
```

---

## Tech Stack

- **Language:** TypeScript (ESM modules, strict mode)
- **Runtime:** Node.js 20+ with tsx for development
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
FIREFLY_TOKEN     String, required. Personal Access Token from Firefly III Options → Remote access and tokens → Create new token.
```

**HTTP transport:**
```
FIREFLY_URL                String, required. Base URL of Firefly III instance (no trailing slash).
FIREFLY_OAUTH_CLIENT_ID    String, required. OAuth client ID from Firefly III Options → Remote access and tokens → Create New Client.
MCP_BASE_URL               String, required when not listening on loopback. Public base URL of this server.
```

In HTTP mode, the Bearer token is resolved per-request from the Authorization header (set by the MCP client after completing the OAuth flow). `FIREFLY_TOKEN` is not used in HTTP mode.

**Optional (both transports):**
```
FIREFLY_DEBUG     Set to "true" or "1" to emit verbose autocomplete tracing to stderr. Off by default.
```

**Tool-filtering fallbacks (both transports)** for the `--preset`/`--groups`/`--read-only` flags. The CLI flag always wins when both are set.
```
MCP_PRESET      String. Named preset; same values as --preset. Mutually exclusive with MCP_GROUPS.
MCP_GROUPS      String. Comma-separated group names; same values as --groups. Empty/whitespace-only is treated as unset.
MCP_READ_ONLY   "true" or "1" (case-insensitive, trimmed) enables read-only mode; any other value is ignored.
```

Store credentials in `.env` file (which is gitignored). The `.env.example` template shows what's needed.

---

## CLI Flags

Parsed by `src/args.ts` and passed to `createServer` as `filterOptions`.

| Flag | Default | Description |
|------|---------|-------------|
| `--transport stdio|http` | `stdio` | Transport mode |
| `--host <host>` | `127.0.0.1` | Bind address (HTTP only) |
| `--port <n>` | `3000` | Listen port (HTTP only; auto-increments on EADDRINUSE) |
| `--preset <name>` | — | Load a named tool subset (see Filtering) |
| `--groups <list>` | — | Comma-separated group names; cannot combine with `--preset` |
| `--read-only` | false | Filter any selection to read-only tools (`get_*`, `search_*`, `test_*`) |

---

## File Structure

```
fireflyiii-mcp/
├── src/
│   ├── index.ts                 # Entry point — validates env, wires client + server + transport
│   ├── server.ts                # Server factory: createServer(client, filterOptions) → McpServer
│   ├── client.ts                # Firefly III HTTP client (fetch wrapper + Bearer auth; accepts token string or getter fn)
│   ├── http.ts                  # HTTP server + OAuth proxy (authorize, token, callback, register stubs)
│   ├── args.ts                  # CLI argument parser (--transport, --host, --port, --preset, --groups, --read-only)
│   ├── transform.ts             # JSON:API response transforms (unwrapList, unwrapSingle, cleanSummary)
│   ├── types.ts                 # Shared utility types (QueryParams)
│   ├── tools/
│   │   ├── index.ts             # TOOL_GROUPS, PRESETS, ToolFilterOptions, makeReadOnlyProxy, registerAllTools
│   │   ├── accounts.ts          # get_accounts, get_account, create_account, update_account, delete_account
│   │   ├── transactions.ts      # get_transactions, get_transaction, create_transaction, update_transaction, delete_transaction, bulk_update_transactions
│   │   ├── budgets.ts           # get_budgets, get_budget, get_budget_limits, create_budget, update_budget, delete_budget, create_budget_limit, update_budget_limit, delete_budget_limit
│   │   ├── categories.ts        # get_categories, get_category, get_category_transactions, create_category, update_category, delete_category
│   │   ├── bills.ts             # get_bills, get_bill, create_bill, update_bill, delete_bill
│   │   ├── piggy-banks.ts       # get_piggy_banks, get_piggy_bank, create_piggy_bank, update_piggy_bank, delete_piggy_bank
│   │   ├── reports.ts           # get_tags, get_tag, get_tag_transactions, get_summary, get_insight_expenses, get_insight_income, create_tag, update_tag, delete_tag
│   │   ├── rules.ts             # get_rule_groups, get_rule_group, create_rule_group, update_rule_group, delete_rule_group, get_rules, get_rule, create_rule, update_rule, delete_rule, get_rule_group_rules, trigger_rule_group, trigger_rule, test_rule_group, test_rule
│   │   ├── recurring.ts         # get_recurring, get_recurrence, create_recurring, update_recurring, delete_recurring, get_recurrence_transactions, trigger_recurrence
│   │   ├── attachments.ts       # get_attachments, get_attachment, create_attachment, update_attachment, delete_attachment, upload_attachment, download_attachment
│   │   ├── currencies.ts        # get_currencies, get_currency, create_currency, update_currency, delete_currency, enable_currency, disable_currency, set_primary_currency
│   │   ├── exports.ts           # export_transactions, export_accounts, export_bills, export_budgets, export_categories, export_tags, export_recurring, export_rules, export_piggy_banks
│   │   ├── object-groups.ts     # get_object_groups, get_object_group, create_object_group, update_object_group, delete_object_group, get_object_group_bills, get_object_group_piggy_banks
│   │   └── transaction-links.ts # get_link_types, get_transaction_links, get_transaction_link, create_transaction_link, update_transaction_link, delete_transaction_link
│   └── tests/
│       ├── accounts.test.ts
│       ├── args.test.ts
│       ├── attachments.test.ts
│       ├── bills.test.ts
│       ├── budgets.test.ts
│       ├── categories.test.ts
│       ├── client.test.ts
│       ├── currencies.test.ts
│       ├── exports.test.ts
│       ├── http.test.ts
│       ├── integration.test.ts  # Live Firefly III tests (skipped unless FIREFLY_INTEGRATION=true)
│       ├── object-groups.test.ts
│       ├── piggy-banks.test.ts
│       ├── recurring.test.ts
│       ├── reports.test.ts
│       ├── rules.test.ts
│       ├── tool-filter.test.ts
│       ├── transaction-links.test.ts
│       ├── transactions.test.ts
│       └── transform.test.ts
├── dist/                        # Compiled output — gitignored (not committed)
├── .github/
│   └── workflows/
│       ├── ci.yml               # Runs tests on every PR and push to main
│       └── publish.yml          # Publishes npm + Docker on v* tags (gated on tests)
├── package.json
├── tsconfig.json
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── LICENSE
├── README.md
├── CONTRIBUTING.md
├── SECURITY.md
├── SUPPORT.md
├── biome.json
└── CLAUDE.md                    # References AGENTS.md
```

---

## Tool Filtering

`src/tools/index.ts` exports `TOOL_GROUPS` (the canonical ordered list), `PRESETS` (named subsets), and `registerAllTools(server, client, options)`.

### TOOL_GROUPS

```
accounts, transactions, budgets, categories, bills, piggy-banks, reports,
rules, recurring, attachments, currencies, exports, object-groups, transaction-links
```

### PRESETS

| Name | Groups | Tools |
|------|--------|-------|
| `minimal` | accounts, transactions | 15 |
| `default` | accounts, transactions, budgets, categories, bills | 37 |
| `budgeting` | accounts, transactions, budgets, categories, bills, piggy-banks | 44 |
| `insights` | accounts, transactions, categories, reports | 57 |
| `automation` | accounts, transactions, rules, recurring | 37 |
| `full` | all 14 groups | 140 |

### Read-only proxy

`makeReadOnlyProxy(server)` wraps the `McpServer` with a `Proxy` that silently drops any `registerTool` call whose name does not start with `get_`, `search_`, or `test_`. Applied when `--read-only` is passed.

---

## Experimental Autocomplete Prompts

The server implements standard **MCP Prompts** with **experimental autocomplete (completions)** support for common parameters (`account`, `budget`, and `category`) to avoid using numeric database IDs directly.

> [!WARNING]
> **Client Compatibility Warning:** Standard tool argument autocomplete is not supported by the MCP specification directly. Therefore, autocomplete is implemented using standard MCP Prompts. This feature is highly experimental and depends heavily on MCP client support (supported in **Claude Code**, but not in the standard **Claude Desktop App**).

### Prompts Implemented
* **`account-transactions`**: Fetches transactions for an account. Auto-completes from a single unfiltered accounts request (all types).
* **`budget-transactions`**: Fetches transactions for a specific budget.
* **`category-transactions`**: Fetches transactions for a specific category.

Each handler fetches up to `AUTOCOMPLETE_FETCH_LIMIT` (1,000) records and returns at most `AUTOCOMPLETE_MAX_SUGGESTIONS` (100) labels per keystroke.

### Completion Schema Pattern
Using Zod schema properties wrapped in `completable()` from `@modelcontextprotocol/sdk/server/completable.js`.
Autocomplete handlers share one in-memory TTL cache (`createTtlCache` in `tools/_helpers.ts`, 60-second TTL, promise-level caching to collapse the request burst during rapid typing). The cache is **keyed per identity** via `FireflyClient.cacheKey()` (a hash of the bearer token) — in HTTP mode a single client serves every request, so an unkeyed cache would leak one user's data to another.

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

Each tool file exports a `registerXxxTools(server, client)` function that calls `defineTool()` for each tool it owns. `defineTool` (`src/tools/_helpers.ts`) wraps `server.registerTool()` and supplies the `try/catch` + JSON serialization, so the handler just returns the fetch result. Annotation constants are imported from `./_annotations.js`.

```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { FireflyClient } from '../client.js';
import { READ_ANNOTATIONS } from './_annotations.js';
import { defineTool } from './_helpers.js';

export function registerAccountTools(server: McpServer, client: FireflyClient): void {
  defineTool(
    server,
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
    ({ type, page, limit }) => fetchAccounts(client, { type, page, limit }),
  );
}
```

For tools that must emit native content blocks (e.g. `download_attachment` returning an `image`), use `defineContentTool` and return a ready-made `{ content: [...] }` result instead.

### 3. Wire into aggregator (`src/tools/index.ts`)

```typescript
import { registerAccountTools } from './accounts.js';
// ... other imports

export function registerAllTools(server: McpServer, client: FireflyClient, options: ToolFilterOptions = {}): void {
  // resolve active groups from preset/groups/default-all
  // optionally wrap server with makeReadOnlyProxy
  if (activeGroups.has('accounts')) registerAccountTools(s, client);
  // ... other groups
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

These constants live in `src/tools/_annotations.ts` (`READ_ANNOTATIONS`, `WRITE_ANNOTATIONS`, `UPDATE_ANNOTATIONS`, `DELETE_ANNOTATIONS`) and are imported by each tool file.

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
- `GET /oauth/authorize` — stores the MCP client's dynamic `redirect_uri` in a state-keyed Map, substitutes our stable `/oauth/callback` URL, and 302s to Firefly III
- `POST /oauth/register` — RFC 7591 dynamic client registration stub (Firefly III doesn't support this; we return the configured `FIREFLY_OAUTH_CLIENT_ID`)
- `POST /oauth/token` — substitutes `redirect_uri` back to our stable callback, proxies token exchange to Firefly III (30 s AbortController timeout)
- `GET /oauth/callback` — receives Firefly III's redirect, forwards `code`+`state` to the MCP client's original dynamic callback URL

All other requests require a `Bearer` token in the `Authorization` header. The token is propagated via `AsyncLocalStorage` so `FireflyClient` can read it without it being passed through every call chain.

**Limitation:** OAuth state lives in-process — single replica only. Horizontal scaling breaks the auth flow.

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
npm run dev -- --preset default          # Load only the default tool subset
```

**Important:** `dist/` is gitignored and not committed. Always run `npm run build` before running or deploying the server.

---

## Adding a New Tool

1. **Implement fetch function** in `src/tools/{category}.ts`. Call `client.get<JsonApiListResponse>(...)` and pipe through `unwrapList` (or `unwrapSingle` for single-item endpoints).
2. **Add register call** in the `registerXxxTools` function in that file.
3. **If creating a new group file:**
   - Add the group name to `TOOL_GROUPS` in `src/tools/index.ts`.
   - Wire `registerXxxTools` inside `registerAllTools`.
   - Consider which presets it belongs in (`PRESETS` map in the same file).
4. **Write test** in `src/tests/{category}.test.ts` — mock `client.get` with a realistic JSON:API envelope fixture, assert both call args and return value shape.
5. **Update the tool table** in `docs/reference/tools.md` (the canonical tool reference; the README links to it and no longer keeps its own table). If the total or a preset count changed, bump the hardcoded numbers — the total appears in `README.md`, `docs/index.md`, `docs/guide/index.md`, `docs/guide/stdio.md`, `docs/reference/tools.md`, and `docs/reference/filtering.md`; preset counts live in `docs/reference/filtering.md`.
6. **Run `npm run build`** to verify the TypeScript compiles cleanly.

Example — adding `get_account` (single account by ID):

```typescript
// src/tools/accounts.ts
import { unwrapSingle, type JsonApiSingleResponse, type UnwrappedSingle } from '../transform.js';

export async function fetchAccount(client: FireflyClient, id: string): Promise<UnwrappedSingle> {
  const response = await client.get<JsonApiSingleResponse>(`/accounts/${id}`);
  return unwrapSingle(response);
}

// in registerAccountTools():
defineTool(
  server,
  'get_account',
  {
    title: 'Get Account',
    description: 'Get a single account by ID.',
    inputSchema: { id: z.string().describe('Account ID') },
    annotations: READ_ANNOTATIONS,
  },
  ({ id }) => fetchAccount(client, id), // args are typed from inputSchema — no casts needed
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

## Releasing a New Version

`CHANGELOG.md` is the single source of truth. Contributors add entries under `## [Unreleased]`; releases promote that section to a dated version and paste the same block into the tag annotation. The publish workflow validates the changelog before publishing, and the GitHub Release is auto-created from the tag annotation.

1. Move items from `## [Unreleased]` in `CHANGELOG.md` to a new `## [X.Y.Z] - YYYY-MM-DD` section. Update the link references at the bottom of the file.
2. Bump `version` in `package.json` (`src/server.ts` reads the version at runtime).
3. Run `npm run build` and commit the version bump + changelog update together.
4. Create an annotated git tag whose message is the same `## [X.Y.Z]` block from `CHANGELOG.md`. The publish workflow validates that this section exists before publishing.
5. Push the tag: `git push origin v<version>` — this triggers the publish workflow, which validates the changelog, runs tests, publishes to npm + GHCR, and auto-creates a GitHub Release from the tag annotation.

---

## Commits

After every meaningful work step, commit with a `Co-Authored-By` trailer reflecting the specific AI assistant model and design team that authored the change:

```bash
git add [files...]
git commit -m "[type]: [subject]

Co-Authored-By: [Agent model used] <[domain]>"
```

Use the correct developer attribution matching the model's originating company:
* **Anthropic / Claude commits:** Use `noreply@anthropic.com` (e.g., `Co-Authored-By: Claude Sonnet 3.5 <noreply@anthropic.com>`)
* **Google / Gemini commits:** Use `noreply@google.com` (e.g., `Co-Authored-By: Gemini 1.5 Pro <noreply@google.com>`)
* **OpenAI / GPT commits:** Use `noreply@openai.com` (e.g., `Co-Authored-By: GPT-4o <noreply@openai.com>`)

**Commit types:**
- `feat:` New tool or feature
- `fix:` Bug fix
- `refactor:` Code cleanup without behavior change
- `test:` Add or update tests
- `chore:` Dependencies, config, scaffolding
- `docs:` Documentation only

---

## Security & Open Source

- **No hardcoded secrets.** All credentials come from environment variables.
- **Validate all input.** Use Zod schemas defined inline in each `defineTool()` call.
- **Error handling.** Every tool handler wraps in try/catch and returns `{ isError: true }` on failure.
- **Dependencies.** Keep them minimal and up-to-date.
- **License.** MIT — include LICENSE file.
- See `SECURITY.md` for the vulnerability disclosure policy.

---

## Development Notes

- **Always verify new or changed tool fields against the Firefly III OpenAPI spec before implementing.** Fetch the YAML with `curl -s "https://api-docs.firefly-iii.org/firefly-iii-6.5.5-v1.yaml" -A "Mozilla/5.0"` and grep for the relevant schema (e.g. `grep -A 100 "TransactionSplitStore:"`). Field names, required/optional status, enums (especially `weekend`), and response shapes differ from what documentation summaries or memory suggest — the spec is authoritative.
- Use ESM imports with `.js` extension (`import ... from '../transform.js'`) — required for Node ESM.
- Use a single merged import from each module — avoid two `import` statements from the same path.
- Test files are in `src/tests/` (flat, not a `unit/` subdirectory) and excluded from the build by `tsconfig.json`.
- `dist/` is **gitignored** (not committed). Run `npm run build` to compile before running or deploying.
- The MCP SDK handles serialization; just return plain objects from tool handlers (via the `defineTool` helper, which JSON-stringifies the result into a text block). For tools that must emit native content blocks instead — e.g. `download_attachment` returns an `image` block for image attachments — use `defineContentTool` and return a ready-made `{ content: [...] }` result.
- Firefly III API is REST; pagination is via query params (`limit`, `page`).
- `/summary/basic` returns a dict (`Record<string, {...}>`), not an array — use `cleanSummary`.
- Insight endpoints (`/insight/expense/category`, `/insight/income/category`) return flat arrays with no JSON:API envelope — pass through directly.
- `MCP_BASE_URL` must be set when the HTTP server is not on loopback (e.g. Docker); the server exits with code 1 otherwise.

---

## Useful Resources

- [Firefly III API Docs](https://api-docs.firefly-iii.org/) — Swagger UI listing all versions
- [Firefly III OpenAPI YAML (latest stable)](https://api-docs.firefly-iii.org/firefly-iii-6.5.5-v1.yaml) — machine-readable spec; fetch with `curl -s "https://api-docs.firefly-iii.org/firefly-iii-6.5.5-v1.yaml" -A "Mozilla/5.0"` (WebFetch is blocked by bot protection on this host)
- [MCP Documentation](https://modelcontextprotocol.io/)
- [TypeScript ESM Guide](https://nodejs.org/en/docs/guides/ecmascript-modules/)
