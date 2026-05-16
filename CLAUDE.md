# Firefly III MCP Server — Project Documentation

## Project Overview

**Firefly III MCP** is a TypeScript implementation of an MCP (Model Context Protocol) server that bridges Claude Code to a running Firefly III personal finance instance. This is a greenfield, open-source project (MIT license).

Users can query their finances in natural language through Claude, getting answers about accounts, transactions, budgets, categories, bills, piggy banks, and financial insights without writing queries themselves.

**Phase 1 (current):** Read-only tools for querying financial data.  
**Phase 2 (future):** Write tools for creating/updating transactions, budgets, etc.

---

## Tech Stack

- **Language:** TypeScript (ESM modules, strict mode)
- **Runtime:** Node.js 18+ with tsx for development
- **MCP SDK:** `@modelcontextprotocol/sdk` v1.0.0+
- **Validation:** Zod for request/response schema validation
- **Testing:** Vitest for unit and integration tests
- **Build:** TypeScript compiler to ES2022 with source maps
- **Transport:** stdio transport only (Phase 1); HTTP support to be added in Phase 2

---

## Environment Variables

```
FIREFLY_URL       String, required. Base URL of Firefly III instance (no trailing slash).
FIREFLY_TOKEN     String, required. Personal Access Token from Firefly III Profile → OAuth → Personal Access Tokens.
```

Both are required to start the server. Store in `.env` file (which is gitignored). The `.env.example` template shows what's needed.

---

## File Structure

```
fireflyiii-mcp/
├── src/
│   ├── index.ts                 # MCP server entry point (stdio transport)
│   ├── client.ts                # Firefly III HTTP client (fetch wrapper + auth)
│   ├── types.ts                 # Shared types, validation schemas (Zod)
│   ├── tools/
│   │   ├── accounts.ts          # Account-related tools (get_accounts, get_account)
│   │   ├── transactions.ts      # Transaction tools (get_transactions, get_transaction)
│   │   ├── budgets.ts           # Budget tools (get_budgets, get_budget_limits)
│   │   ├── categories.ts        # Category tools (get_categories, get_category_transactions)
│   │   ├── bills.ts             # Bill tools (get_bills)
│   │   ├── piggybanks.ts        # Piggy bank tools (get_piggy_banks)
│   │   ├── tags.ts              # Tag tools (get_tags, get_tag_transactions)
│   │   ├── insights.ts          # Insights tools (get_insight_expenses, get_insight_income)
│   │   ├── summary.ts           # Summary tool (get_summary)
│   │   └── registry.ts          # Tool registration (exports all tools to MCP server)
│   ├── tests/
│   │   ├── unit/
│   │   │   ├── accounts.test.ts
│   │   │   ├── transactions.test.ts
│   │   │   └── ...
│   │   └── integration.test.ts   # Live Firefly III integration tests
│   └── http.ts                  # HTTP transport entry point (Phase 2)
├── dist/                        # Compiled output (gitignored)
├── package.json                 # Dependencies and scripts
├── tsconfig.json                # TypeScript configuration
├── .env.example                 # Environment variable template
├── LICENSE                      # MIT license
├── README.md                    # User documentation
├── CLAUDE.md                    # This file
└── .gitignore                   # Already exists, comprehensive
```

---

## Tool Pattern

All tools follow a consistent structure:

### 1. Define Request/Response Schemas (in `types.ts`)

```typescript
export const GetAccountsRequestSchema = z.object({
  type: z.enum(['asset', 'liability', 'revenue', 'expense']).optional(),
});
export type GetAccountsRequest = z.infer<typeof GetAccountsRequestSchema>;

export const AccountSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  balance: z.number(),
});
export type Account = z.infer<typeof AccountSchema>;
```

### 2. Implement Fetch Function (in tool file, e.g., `tools/accounts.ts`)

```typescript
import { Account, GetAccountsRequest } from '../types.js';

export async function fetchAccounts(
  request: GetAccountsRequest
): Promise<Account[]> {
  const params = new URLSearchParams();
  if (request.type) params.set('type', request.type);
  
  const response = await client.get(`/accounts?${params.toString()}`);
  return response.data.map((account: any) => ({
    id: account.id,
    name: account.attributes.name,
    type: account.attributes.type,
    balance: account.attributes.current_balance,
  }));
}
```

### 3. Test the Fetch Function (in `tests/unit/accounts.test.ts`)

```typescript
import { describe, it, expect, vi } from 'vitest';
import { fetchAccounts } from '../../tools/accounts.js';

describe('fetchAccounts', () => {
  it('should fetch accounts and filter by type', async () => {
    // Mock the client
    const accounts = await fetchAccounts({ type: 'asset' });
    expect(accounts).toHaveLength(2);
  });
});
```

### 4. Register Tool (in `tools/registry.ts`)

```typescript
import { fetchAccounts } from './accounts.js';

export function registerTools(server: StdioServer) {
  server.tool('get_accounts', GetAccountsRequestSchema, async (request) => {
    const accounts = await fetchAccounts(request);
    return {
      content: [{ type: 'text', text: JSON.stringify(accounts, null, 2) }],
    };
  });
}
```

---

## Tool Annotations

Use the optional `readOnlyHint` and `destructiveHint` fields in tool definitions:

- **Read tools:** `readOnlyHint: true` — tells Claude the tool doesn't modify state.
- **Write tools (Phase 2):** `destructiveHint: true` — tells Claude the tool modifies state.

```typescript
server.tool(
  'get_accounts',
  {
    description: 'List all accounts',
    schema: GetAccountsRequestSchema,
    readOnlyHint: true, // Phase 1: all tools are read-only
  },
  async (request) => {
    // ...
  }
);
```

---

## HTTP Client (`src/client.ts`)

Wraps Firefly III's REST API with authentication and error handling.

```typescript
// Node 18+ has global fetch — no import needed

class FireflyClient {
  private baseUrl: string;
  private token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  async get(path: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/v1${path}`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (!response.ok) throw new Error(`API error: ${response.statusText}`);
    return response.json();
  }
}

export const client = new FireflyClient(
  process.env.FIREFLY_URL!,
  process.env.FIREFLY_TOKEN!
);
```

---

## Build & Test Commands

```bash
npm install                    # Install dependencies
npm run build                  # Compile TypeScript to dist/, chmod +x dist/index.js
npm run dev                    # Run with tsx (no build required)
npm test                       # Run unit tests (vitest run)
npm run test:watch             # Watch mode for unit tests
npm run test:integration       # Run integration tests against live Firefly III
```

**Important:** The `build` script runs `chmod +x` on the compiled index.js so it can be executed directly as an executable.

---

## Adding a New Tool

1. **Define schemas** in `src/types.ts` (request + response).
2. **Implement fetch function** in `src/tools/{category}.ts`.
3. **Test the fetch function** in `src/tests/unit/{category}.test.ts`.
4. **Register the tool** in `src/tools/registry.ts`.

Example: Adding `get_account_details` tool:

```typescript
// 1. types.ts
export const GetAccountDetailsRequestSchema = z.object({
  id: z.string(),
});

// 2. tools/accounts.ts
export async function fetchAccountDetails(
  request: GetAccountDetailsRequest
): Promise<AccountDetail> {
  const response = await client.get(`/accounts/${request.id}`);
  return parseAccountDetail(response.data);
}

// 3. tests/unit/accounts.test.ts
it('should fetch account details by ID', async () => {
  const detail = await fetchAccountDetails({ id: '123' });
  expect(detail.id).toBe('123');
});

// 4. tools/registry.ts
server.tool('get_account_details', GetAccountDetailsRequestSchema, async (request) => {
  const detail = await fetchAccountDetails(request);
  return { content: [{ type: 'text', text: JSON.stringify(detail, null, 2) }] };
});
```

---

## Testing Strategy

- **Unit tests** test fetch functions in isolation (mock HTTP).
- **Integration tests** run against a real Firefly III instance (only when `FIREFLY_INTEGRATION=true`).
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
- **Validate all input.** Use Zod schemas for strict type checking.
- **Error handling.** Catch and log errors; never expose raw API responses in logs.
- **Dependencies.** Keep them minimal and up-to-date.
- **License.** MIT — include LICENSE file and header comments where appropriate.

---

## Phase 1 vs Phase 2

**Phase 1 (current):**
- Read-only tools only
- Stdio transport only
- All tools have `readOnlyHint: true`

**Phase 2 (future):**
- Add write tools (create/update transactions, budgets, etc.)
- Add HTTP transport (`src/http.ts`)
- Write tools have `destructiveHint: true`
- Implement request validation and user confirmation for destructive actions

---

## Development Notes

- Use ESM imports (`import ... from '...js'`) — Node's default for `"type": "module"`.
- Keep test files in `src/tests/` and they're excluded from the build by `tsconfig.json`.
- The MCP SDK handles serialization; just return plain objects from tool handlers.
- Firefly III API is REST; pagination is via query params (`limit`, `page`).
- All monetary amounts are returned as floats; handle precision carefully.

---

## Useful Resources

- [Firefly III API Docs](https://api-docs.firefly-iii.org/)
- [MCP Documentation](https://modelcontextprotocol.io/)
- [TypeScript ESM Guide](https://nodejs.org/en/docs/guides/ecmascript-modules/)
