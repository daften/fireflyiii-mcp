# Firefly III MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a read-only TypeScript MCP server that exposes 15 Firefly III financial data tools to Claude Code via stdio transport, structured for future HTTP/SSE transport and write-operation expansion.

**Architecture:** Modular TypeScript ESM project using `@modelcontextprotocol/sdk`. Each Firefly III domain (accounts, transactions, budgets, etc.) is a separate tool module exporting plain fetch functions (testable in isolation) and a tool-registration function. A shared `FireflyClient` class handles all HTTP via the native `fetch` API with Personal Access Token auth.

**Tech Stack:** TypeScript 5, Node.js 18+ (ESM), `@modelcontextprotocol/sdk` ^1.0, `zod` ^3.22, `vitest` ^2.0, `tsx` ^4 (dev runner)

---

## File Map

| File | Responsibility |
|------|----------------|
| `src/index.ts` | Entry point: validates env vars, creates client + server, connects stdio transport |
| `src/server.ts` | Creates `McpServer`, delegates tool registration to `tools/index.ts` |
| `src/client.ts` | `FireflyClient` class, `FireflyError`, `formatError` utility |
| `src/types.ts` | Shared `QueryParams` type |
| `src/tools/index.ts` | Calls all `register*Tools` functions |
| `src/tools/accounts.ts` | `fetchAccounts`, `fetchAccount`, `registerAccountTools` |
| `src/tools/transactions.ts` | `fetchTransactions`, `fetchTransaction`, `registerTransactionTools` |
| `src/tools/budgets.ts` | `fetchBudgets`, `fetchBudgetLimits`, `registerBudgetTools` |
| `src/tools/categories.ts` | `fetchCategories`, `fetchCategoryTransactions`, `registerCategoryTools` |
| `src/tools/bills.ts` | `fetchBills`, `registerBillTools` |
| `src/tools/piggy-banks.ts` | `fetchPiggyBanks`, `registerPiggyBankTools` |
| `src/tools/reports.ts` | `fetchTags`, `fetchTagTransactions`, `fetchSummary`, `fetchInsightExpenses`, `fetchInsightIncome`, `registerReportTools` |
| `src/tests/client.test.ts` | Unit tests for `FireflyClient` and `formatError` |
| `src/tests/accounts.test.ts` | Unit tests for account fetch functions |
| `src/tests/transactions.test.ts` | Unit tests for transaction fetch functions |
| `src/tests/budgets.test.ts` | Unit tests for budget fetch functions |
| `src/tests/categories.test.ts` | Unit tests for category fetch functions |
| `src/tests/bills.test.ts` | Unit tests for bill fetch functions |
| `src/tests/piggy-banks.test.ts` | Unit tests for piggy bank fetch functions |
| `src/tests/reports.test.ts` | Unit tests for report fetch functions |
| `src/tests/integration.test.ts` | Smoke test against live Firefly III (gated by `FIREFLY_INTEGRATION=true`) |

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `LICENSE`
- Create: `README.md`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "firefly-iii-mcp",
  "version": "0.1.0",
  "description": "MCP server for Firefly III personal finance manager",
  "type": "module",
  "bin": {
    "firefly-iii-mcp": "dist/index.js"
  },
  "scripts": {
    "build": "tsc && chmod +x dist/index.js",
    "dev": "tsx src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:integration": "FIREFLY_INTEGRATION=true vitest run src/tests/integration.test.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.0.0",
    "vitest": "^2.0.0"
  },
  "engines": {
    "node": ">=18"
  },
  "license": "MIT"
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "src/tests"]
}
```

- [ ] **Step 3: Create `.gitignore`**

```
node_modules/
dist/
.env
*.js.map
```

- [ ] **Step 4: Create `.env.example`**

```
# Base URL of your Firefly III instance (no trailing slash)
FIREFLY_URL=https://your-firefly-instance.example.com

# Personal Access Token — generate in Firefly III → Profile → OAuth → Personal Access Tokens
FIREFLY_TOKEN=your-personal-access-token-here
```

- [ ] **Step 5: Create `LICENSE`**

```
MIT License

Copyright (c) 2026

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 6: Create `README.md`**

```markdown
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

## Available Tools

| Tool | Description |
|------|-------------|
| `get_accounts` | List all accounts, filterable by type |
| `get_account` | Get a single account by ID with current balance |
| `get_transactions` | List transactions with filters (account, date, type, category) |
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
npm test            # Run unit tests
npm run test:watch  # Watch mode
npm run test:integration  # Run against live Firefly III (requires FIREFLY_URL + FIREFLY_TOKEN)
npm run dev         # Run without building (uses tsx)
```

## License

MIT
```

- [ ] **Step 7: Install dependencies**

```bash
npm install
```

Expected: `node_modules/` created, `package-lock.json` generated.

- [ ] **Step 8: Commit**

```bash
git add package.json tsconfig.json .gitignore .env.example LICENSE README.md package-lock.json
git commit -m "chore: project scaffold with TypeScript, MCP SDK, Vitest"
```

---

## Task 2: Shared Types and HTTP Client

**Files:**
- Create: `src/types.ts`
- Create: `src/client.ts`
- Create: `src/tests/client.test.ts`

- [ ] **Step 1: Create `src/types.ts`**

```typescript
export type QueryParams = Record<string, string | number | undefined>;
```

- [ ] **Step 2: Write the failing tests for `FireflyClient` first**

Create `src/tests/client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FireflyClient, FireflyError, formatError } from '../client.js';

describe('FireflyClient', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends request with correct Authorization header', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [] }), { status: 200 })
    );
    const client = new FireflyClient('https://firefly.example.com', 'my-token');
    await client.get('/accounts');
    expect(fetch).toHaveBeenCalledWith(
      'https://firefly.example.com/api/v1/accounts',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer my-token' }),
      })
    );
  });

  it('strips trailing slash from base URL', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 })
    );
    const client = new FireflyClient('https://firefly.example.com/', 'token');
    await client.get('/accounts');
    const calledUrl = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(calledUrl).toBe('https://firefly.example.com/api/v1/accounts');
  });

  it('appends query params to URL', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 })
    );
    const client = new FireflyClient('https://firefly.example.com', 'token');
    await client.get('/accounts', { page: 2, limit: 10 });
    const calledUrl = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(calledUrl).toContain('page=2');
    expect(calledUrl).toContain('limit=10');
  });

  it('omits undefined query params', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 })
    );
    const client = new FireflyClient('https://firefly.example.com', 'token');
    await client.get('/accounts', { page: 1, type: undefined });
    const calledUrl = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(calledUrl).not.toContain('type');
  });

  it('throws FireflyError on 401', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }));
    const client = new FireflyClient('https://firefly.example.com', 'bad-token');
    await expect(client.get('/accounts')).rejects.toThrow(FireflyError);
  });

  it('throws on network error with descriptive message', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('fetch failed'));
    const client = new FireflyClient('https://firefly.example.com', 'token');
    await expect(client.get('/accounts')).rejects.toThrow('fetch failed');
  });

  it('throws FireflyError on 404', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('Not Found', { status: 404 }));
    const client = new FireflyClient('https://firefly.example.com', 'token');
    await expect(client.get('/accounts/999')).rejects.toThrow(FireflyError);
  });

  it('throws FireflyError with correct status on 500', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('Server Error', { status: 500 }));
    const client = new FireflyClient('https://firefly.example.com', 'token');
    const err = await client.get('/accounts').catch((e) => e);
    expect(err).toBeInstanceOf(FireflyError);
    expect((err as FireflyError).status).toBe(500);
  });
});

describe('formatError', () => {
  it('returns auth message for 401', () => {
    const err = new FireflyError(401, 'https://example.com', 'Unauthorized');
    expect(formatError(err)).toBe('Authentication failed. Check your FIREFLY_TOKEN.');
  });

  it('returns not found message for 404', () => {
    const err = new FireflyError(404, 'https://example.com', 'Not Found');
    expect(formatError(err)).toBe('Resource not found.');
  });

  it('returns invalid params message for 422', () => {
    const err = new FireflyError(422, 'https://example.com', 'Unprocessable');
    expect(formatError(err)).toBe('Invalid request parameters.');
  });

  it('returns server error message for 500', () => {
    const err = new FireflyError(500, 'https://example.com', 'Internal Server Error');
    expect(formatError(err)).toBe('Firefly III server error. Try again later.');
  });

  it('returns message for generic Error', () => {
    expect(formatError(new Error('something went wrong'))).toBe('something went wrong');
  });

  it('returns fallback for unknown errors', () => {
    expect(formatError('oops')).toBe('An unknown error occurred.');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
npm test
```

Expected: Tests fail — `../client.js` not found.

- [ ] **Step 4: Create `src/client.ts`**

```typescript
import type { QueryParams } from './types.js';

export class FireflyError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
    body: string
  ) {
    super(`Firefly III API error ${status} at ${url}: ${body}`);
    this.name = 'FireflyError';
  }
}

export function formatError(err: unknown): string {
  if (err instanceof FireflyError) {
    if (err.status === 401) return 'Authentication failed. Check your FIREFLY_TOKEN.';
    if (err.status === 404) return 'Resource not found.';
    if (err.status === 422) return 'Invalid request parameters.';
    if (err.status >= 500) return 'Firefly III server error. Try again later.';
    return `API error ${err.status}.`;
  }
  if (err instanceof Error) return err.message;
  return 'An unknown error occurred.';
}

export class FireflyClient {
  private readonly baseUrl: string;
  private readonly timeoutMs = 30_000;

  constructor(baseUrl: string, private readonly token: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async get<T = unknown>(path: string, params?: QueryParams): Promise<T> {
    const url = new URL(`${this.baseUrl}/api/v1${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await fetch(url.toString(), {
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`Request to ${url} timed out after ${this.timeoutMs}ms.`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new FireflyError(response.status, url.toString(), body);
    }

    return response.json() as T;
  }
}
```

- [ ] **Step 5: Run the tests and verify they pass**

```bash
npm test
```

Expected: All `client.test.ts` tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/client.ts src/tests/client.test.ts
git commit -m "feat: add FireflyClient with error handling and unit tests"
```

---

## Task 3: Accounts Tools

**Files:**
- Create: `src/tools/accounts.ts`
- Create: `src/tests/accounts.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/tests/accounts.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import type { FireflyClient } from '../client.js';
import { fetchAccounts, fetchAccount } from '../tools/accounts.js';

const mockClient = { get: vi.fn() } as unknown as FireflyClient;

describe('fetchAccounts', () => {
  it('calls /accounts with type filter when type is not "all"', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce({ data: [] });
    await fetchAccounts(mockClient, { type: 'asset', page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/accounts', {
      type: 'asset',
      page: 1,
      limit: 50,
    });
  });

  it('omits type param when type is "all"', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce({ data: [] });
    await fetchAccounts(mockClient, { type: 'all', page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/accounts', { page: 1, limit: 50 });
  });

  it('omits type param when type is undefined', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce({ data: [] });
    await fetchAccounts(mockClient, { page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/accounts', { page: 1, limit: 50 });
  });
});

describe('fetchAccount', () => {
  it('calls /accounts/:id', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce({ data: {} });
    await fetchAccount(mockClient, '42');
    expect(mockClient.get).toHaveBeenCalledWith('/accounts/42');
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test
```

Expected: FAIL — `../tools/accounts.js` not found.

- [ ] **Step 3: Create `src/tools/accounts.ts`**

```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { type FireflyClient, formatError } from '../client.js';
import type { QueryParams } from '../types.js';

export async function fetchAccounts(
  client: FireflyClient,
  params: { type?: string; page?: number; limit?: number }
): Promise<unknown> {
  const query: QueryParams = { page: params.page, limit: params.limit };
  if (params.type && params.type !== 'all') query['type'] = params.type;
  return client.get('/accounts', query);
}

export async function fetchAccount(client: FireflyClient, id: string): Promise<unknown> {
  return client.get(`/accounts/${id}`);
}

export function registerAccountTools(server: McpServer, client: FireflyClient): void {
  server.tool(
    'get_accounts',
    'Get all accounts from Firefly III. Filter by type: asset (bank/cash accounts), expense (merchants), revenue (income sources), liability (loans/debts), or all.',
    {
      type: z
        .enum(['asset', 'expense', 'revenue', 'liability', 'all'])
        .optional()
        .default('all')
        .describe('Account type filter'),
      page: z.number().int().positive().optional().default(1).describe('Page number'),
      limit: z.number().int().positive().optional().default(50).describe('Results per page'),
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

  server.tool(
    'get_account',
    'Get a single Firefly III account by its numeric ID, including the current balance.',
    {
      id: z.string().describe('Account ID'),
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
}
```

- [ ] **Step 4: Run tests and verify they pass**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/tools/accounts.ts src/tests/accounts.test.ts
git commit -m "feat: add accounts tools (get_accounts, get_account)"
```

---

## Task 4: Transactions Tools

**Files:**
- Create: `src/tools/transactions.ts`
- Create: `src/tests/transactions.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/tests/transactions.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import type { FireflyClient } from '../client.js';
import { fetchTransactions, fetchTransaction } from '../tools/transactions.js';

const mockClient = { get: vi.fn() } as unknown as FireflyClient;

describe('fetchTransactions', () => {
  it('calls /transactions with all provided filters', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce({ data: [] });
    await fetchTransactions(mockClient, {
      type: 'withdrawal',
      accountId: '5',
      start: '2026-01-01',
      end: '2026-01-31',
      page: 1,
      limit: 50,
    });
    expect(mockClient.get).toHaveBeenCalledWith('/transactions', {
      type: 'withdrawal',
      account_id: '5',
      start: '2026-01-01',
      end: '2026-01-31',
      page: 1,
      limit: 50,
    });
  });

  it('omits undefined filters', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce({ data: [] });
    await fetchTransactions(mockClient, { page: 1, limit: 20 });
    expect(mockClient.get).toHaveBeenCalledWith('/transactions', { page: 1, limit: 20 });
  });
});

describe('fetchTransaction', () => {
  it('calls /transactions/:id', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce({ data: {} });
    await fetchTransaction(mockClient, '123');
    expect(mockClient.get).toHaveBeenCalledWith('/transactions/123');
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test
```

Expected: FAIL — `../tools/transactions.js` not found.

- [ ] **Step 3: Create `src/tools/transactions.ts`**

```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { type FireflyClient, formatError } from '../client.js';
import type { QueryParams } from '../types.js';

export async function fetchTransactions(
  client: FireflyClient,
  params: {
    type?: string;
    accountId?: string;
    start?: string;
    end?: string;
    page?: number;
    limit?: number;
  }
): Promise<unknown> {
  const query: QueryParams = { page: params.page, limit: params.limit };
  if (params.type) query['type'] = params.type;
  if (params.accountId) query['account_id'] = params.accountId;
  if (params.start) query['start'] = params.start;
  if (params.end) query['end'] = params.end;
  return client.get('/transactions', query);
}

export async function fetchTransaction(client: FireflyClient, id: string): Promise<unknown> {
  return client.get(`/transactions/${id}`);
}

export function registerTransactionTools(server: McpServer, client: FireflyClient): void {
  server.tool(
    'get_transactions',
    'Get transactions from Firefly III. Filter by transaction type (withdrawal/deposit/transfer/reconciliation), account ID, date range, and pagination. Dates must be YYYY-MM-DD format.',
    {
      type: z
        .enum(['withdrawal', 'deposit', 'transfer', 'reconciliation'])
        .optional()
        .describe('Transaction type filter'),
      accountId: z.string().optional().describe('Filter by account ID'),
      start: z.string().optional().describe('Start date (YYYY-MM-DD)'),
      end: z.string().optional().describe('End date (YYYY-MM-DD)'),
      page: z.number().int().positive().optional().default(1).describe('Page number'),
      limit: z.number().int().positive().optional().default(50).describe('Results per page'),
    },
    async ({ type, accountId, start, end, page, limit }) => {
      try {
        const result = await fetchTransactions(client, { type, accountId, start, end, page, limit });
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );

  server.tool(
    'get_transaction',
    'Get a single Firefly III transaction by its numeric ID, including all splits.',
    {
      id: z.string().describe('Transaction ID'),
    },
    async ({ id }) => {
      try {
        const result = await fetchTransaction(client, id);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );
}
```

- [ ] **Step 4: Run tests and verify they pass**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/tools/transactions.ts src/tests/transactions.test.ts
git commit -m "feat: add transactions tools (get_transactions, get_transaction)"
```

---

## Task 5: Budgets Tools

**Files:**
- Create: `src/tools/budgets.ts`
- Create: `src/tests/budgets.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/tests/budgets.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import type { FireflyClient } from '../client.js';
import { fetchBudgets, fetchBudgetLimits } from '../tools/budgets.js';

const mockClient = { get: vi.fn() } as unknown as FireflyClient;

describe('fetchBudgets', () => {
  it('calls /budgets with pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce({ data: [] });
    await fetchBudgets(mockClient, { page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/budgets', { page: 1, limit: 50 });
  });
});

describe('fetchBudgetLimits', () => {
  it('calls /budgets/:id/limits with date range', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce({ data: [] });
    await fetchBudgetLimits(mockClient, '3', '2026-01-01', '2026-01-31');
    expect(mockClient.get).toHaveBeenCalledWith('/budgets/3/limits', {
      start: '2026-01-01',
      end: '2026-01-31',
    });
  });

  it('calls /budgets/:id/limits without dates when not provided', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce({ data: [] });
    await fetchBudgetLimits(mockClient, '3');
    expect(mockClient.get).toHaveBeenCalledWith('/budgets/3/limits', {});
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test
```

Expected: FAIL — `../tools/budgets.js` not found.

- [ ] **Step 3: Create `src/tools/budgets.ts`**

```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { type FireflyClient, formatError } from '../client.js';
import type { QueryParams } from '../types.js';

export async function fetchBudgets(
  client: FireflyClient,
  params: { page?: number; limit?: number }
): Promise<unknown> {
  return client.get('/budgets', { page: params.page, limit: params.limit });
}

export async function fetchBudgetLimits(
  client: FireflyClient,
  budgetId: string,
  start?: string,
  end?: string
): Promise<unknown> {
  const query: QueryParams = {};
  if (start) query['start'] = start;
  if (end) query['end'] = end;
  return client.get(`/budgets/${budgetId}/limits`, query);
}

export function registerBudgetTools(server: McpServer, client: FireflyClient): void {
  server.tool(
    'get_budgets',
    'Get all budgets from Firefly III, including spent and available amounts for the current period.',
    {
      page: z.number().int().positive().optional().default(1).describe('Page number'),
      limit: z.number().int().positive().optional().default(50).describe('Results per page'),
    },
    async ({ page, limit }) => {
      try {
        const result = await fetchBudgets(client, { page, limit });
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );

  server.tool(
    'get_budget_limits',
    'Get the spending limits for a specific Firefly III budget. Optionally filter by date range (YYYY-MM-DD). Returns limits and how much has been spent against each.',
    {
      budgetId: z.string().describe('Budget ID'),
      start: z.string().optional().describe('Start date (YYYY-MM-DD)'),
      end: z.string().optional().describe('End date (YYYY-MM-DD)'),
    },
    async ({ budgetId, start, end }) => {
      try {
        const result = await fetchBudgetLimits(client, budgetId, start, end);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );
}
```

- [ ] **Step 4: Run tests and verify they pass**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/tools/budgets.ts src/tests/budgets.test.ts
git commit -m "feat: add budget tools (get_budgets, get_budget_limits)"
```

---

## Task 6: Categories Tools

**Files:**
- Create: `src/tools/categories.ts`
- Create: `src/tests/categories.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/tests/categories.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import type { FireflyClient } from '../client.js';
import { fetchCategories, fetchCategoryTransactions } from '../tools/categories.js';

const mockClient = { get: vi.fn() } as unknown as FireflyClient;

describe('fetchCategories', () => {
  it('calls /categories with pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce({ data: [] });
    await fetchCategories(mockClient, { page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/categories', { page: 1, limit: 50 });
  });
});

describe('fetchCategoryTransactions', () => {
  it('calls /categories/:id/transactions with all params', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce({ data: [] });
    await fetchCategoryTransactions(mockClient, '7', {
      start: '2026-01-01',
      end: '2026-01-31',
      page: 2,
      limit: 25,
    });
    expect(mockClient.get).toHaveBeenCalledWith('/categories/7/transactions', {
      start: '2026-01-01',
      end: '2026-01-31',
      page: 2,
      limit: 25,
    });
  });

  it('omits undefined date params', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce({ data: [] });
    await fetchCategoryTransactions(mockClient, '7', { page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/categories/7/transactions', {
      page: 1,
      limit: 50,
    });
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test
```

Expected: FAIL — `../tools/categories.js` not found.

- [ ] **Step 3: Create `src/tools/categories.ts`**

```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { type FireflyClient, formatError } from '../client.js';
import type { QueryParams } from '../types.js';

export async function fetchCategories(
  client: FireflyClient,
  params: { page?: number; limit?: number }
): Promise<unknown> {
  return client.get('/categories', { page: params.page, limit: params.limit });
}

export async function fetchCategoryTransactions(
  client: FireflyClient,
  categoryId: string,
  params: { start?: string; end?: string; page?: number; limit?: number }
): Promise<unknown> {
  const query: QueryParams = { page: params.page, limit: params.limit };
  if (params.start) query['start'] = params.start;
  if (params.end) query['end'] = params.end;
  return client.get(`/categories/${categoryId}/transactions`, query);
}

export function registerCategoryTools(server: McpServer, client: FireflyClient): void {
  server.tool(
    'get_categories',
    'Get all spending categories defined in Firefly III.',
    {
      page: z.number().int().positive().optional().default(1).describe('Page number'),
      limit: z.number().int().positive().optional().default(50).describe('Results per page'),
    },
    async ({ page, limit }) => {
      try {
        const result = await fetchCategories(client, { page, limit });
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );

  server.tool(
    'get_category_transactions',
    'Get all transactions belonging to a specific Firefly III category. Optionally filter by date range (YYYY-MM-DD).',
    {
      categoryId: z.string().describe('Category ID'),
      start: z.string().optional().describe('Start date (YYYY-MM-DD)'),
      end: z.string().optional().describe('End date (YYYY-MM-DD)'),
      page: z.number().int().positive().optional().default(1).describe('Page number'),
      limit: z.number().int().positive().optional().default(50).describe('Results per page'),
    },
    async ({ categoryId, start, end, page, limit }) => {
      try {
        const result = await fetchCategoryTransactions(client, categoryId, { start, end, page, limit });
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );
}
```

- [ ] **Step 4: Run tests and verify they pass**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/tools/categories.ts src/tests/categories.test.ts
git commit -m "feat: add category tools (get_categories, get_category_transactions)"
```

---

## Task 7: Bills Tools

**Files:**
- Create: `src/tools/bills.ts`
- Create: `src/tests/bills.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/tests/bills.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import type { FireflyClient } from '../client.js';
import { fetchBills } from '../tools/bills.js';

const mockClient = { get: vi.fn() } as unknown as FireflyClient;

describe('fetchBills', () => {
  it('calls /bills with pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce({ data: [] });
    await fetchBills(mockClient, { page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/bills', { page: 1, limit: 50 });
  });

  it('includes date range when provided', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce({ data: [] });
    await fetchBills(mockClient, { start: '2026-01-01', end: '2026-12-31', page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/bills', {
      start: '2026-01-01',
      end: '2026-12-31',
      page: 1,
      limit: 50,
    });
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test
```

Expected: FAIL — `../tools/bills.js` not found.

- [ ] **Step 3: Create `src/tools/bills.ts`**

```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { type FireflyClient, formatError } from '../client.js';
import type { QueryParams } from '../types.js';

export async function fetchBills(
  client: FireflyClient,
  params: { start?: string; end?: string; page?: number; limit?: number }
): Promise<unknown> {
  const query: QueryParams = { page: params.page, limit: params.limit };
  if (params.start) query['start'] = params.start;
  if (params.end) query['end'] = params.end;
  return client.get('/bills', query);
}

export function registerBillTools(server: McpServer, client: FireflyClient): void {
  server.tool(
    'get_bills',
    'Get all recurring bills from Firefly III, including the next expected match date and payment status. Optionally filter by date range (YYYY-MM-DD).',
    {
      start: z.string().optional().describe('Start date (YYYY-MM-DD)'),
      end: z.string().optional().describe('End date (YYYY-MM-DD)'),
      page: z.number().int().positive().optional().default(1).describe('Page number'),
      limit: z.number().int().positive().optional().default(50).describe('Results per page'),
    },
    async ({ start, end, page, limit }) => {
      try {
        const result = await fetchBills(client, { start, end, page, limit });
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );
}
```

- [ ] **Step 4: Run tests and verify they pass**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/tools/bills.ts src/tests/bills.test.ts
git commit -m "feat: add bills tool (get_bills)"
```

---

## Task 8: Piggy Banks Tools

**Files:**
- Create: `src/tools/piggy-banks.ts`
- Create: `src/tests/piggy-banks.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/tests/piggy-banks.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import type { FireflyClient } from '../client.js';
import { fetchPiggyBanks } from '../tools/piggy-banks.js';

const mockClient = { get: vi.fn() } as unknown as FireflyClient;

describe('fetchPiggyBanks', () => {
  it('calls /piggy-banks with pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce({ data: [] });
    await fetchPiggyBanks(mockClient, { page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/piggy-banks', { page: 1, limit: 50 });
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test
```

Expected: FAIL — `../tools/piggy-banks.js` not found.

- [ ] **Step 3: Create `src/tools/piggy-banks.ts`**

```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { type FireflyClient, formatError } from '../client.js';

export async function fetchPiggyBanks(
  client: FireflyClient,
  params: { page?: number; limit?: number }
): Promise<unknown> {
  return client.get('/piggy-banks', { page: params.page, limit: params.limit });
}

export function registerPiggyBankTools(server: McpServer, client: FireflyClient): void {
  server.tool(
    'get_piggy_banks',
    'Get all piggy banks (savings goals) from Firefly III, including current saved amount and target amount.',
    {
      page: z.number().int().positive().optional().default(1).describe('Page number'),
      limit: z.number().int().positive().optional().default(50).describe('Results per page'),
    },
    async ({ page, limit }) => {
      try {
        const result = await fetchPiggyBanks(client, { page, limit });
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );
}
```

- [ ] **Step 4: Run tests and verify they pass**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/tools/piggy-banks.ts src/tests/piggy-banks.test.ts
git commit -m "feat: add piggy banks tool (get_piggy_banks)"
```

---

## Task 9: Reports Tools (Tags, Summary, Insights)

**Files:**
- Create: `src/tools/reports.ts`
- Create: `src/tests/reports.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/tests/reports.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import type { FireflyClient } from '../client.js';
import {
  fetchTags,
  fetchTagTransactions,
  fetchSummary,
  fetchInsightExpenses,
  fetchInsightIncome,
} from '../tools/reports.js';

const mockClient = { get: vi.fn() } as unknown as FireflyClient;

describe('fetchTags', () => {
  it('calls /tags with pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce({ data: [] });
    await fetchTags(mockClient, { page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/tags', { page: 1, limit: 50 });
  });
});

describe('fetchTagTransactions', () => {
  it('calls /tags/:tag/transactions with all params', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce({ data: [] });
    await fetchTagTransactions(mockClient, 'vacation', {
      start: '2026-01-01',
      end: '2026-12-31',
      page: 1,
      limit: 50,
    });
    expect(mockClient.get).toHaveBeenCalledWith('/tags/vacation/transactions', {
      start: '2026-01-01',
      end: '2026-12-31',
      page: 1,
      limit: 50,
    });
  });

  it('omits undefined date params', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce({ data: [] });
    await fetchTagTransactions(mockClient, 'vacation', { page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/tags/vacation/transactions', {
      page: 1,
      limit: 50,
    });
  });
});

describe('fetchSummary', () => {
  it('calls /summary/basic with required date range', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce({});
    await fetchSummary(mockClient, '2026-01-01', '2026-12-31');
    expect(mockClient.get).toHaveBeenCalledWith('/summary/basic', {
      start: '2026-01-01',
      end: '2026-12-31',
    });
  });

  it('includes currency_code when provided', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce({});
    await fetchSummary(mockClient, '2026-01-01', '2026-12-31', 'EUR');
    expect(mockClient.get).toHaveBeenCalledWith('/summary/basic', {
      start: '2026-01-01',
      end: '2026-12-31',
      currency_code: 'EUR',
    });
  });
});

describe('fetchInsightExpenses', () => {
  it('calls /insight/expense/category with date range', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce([]);
    await fetchInsightExpenses(mockClient, '2026-01-01', '2026-01-31');
    expect(mockClient.get).toHaveBeenCalledWith('/insight/expense/category', {
      start: '2026-01-01',
      end: '2026-01-31',
    });
  });
});

describe('fetchInsightIncome', () => {
  it('calls /insight/income/category with date range', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce([]);
    await fetchInsightIncome(mockClient, '2026-01-01', '2026-01-31');
    expect(mockClient.get).toHaveBeenCalledWith('/insight/income/category', {
      start: '2026-01-01',
      end: '2026-01-31',
    });
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test
```

Expected: FAIL — `../tools/reports.js` not found.

- [ ] **Step 3: Create `src/tools/reports.ts`**

```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { type FireflyClient, formatError } from '../client.js';
import type { QueryParams } from '../types.js';

export async function fetchTags(
  client: FireflyClient,
  params: { page?: number; limit?: number }
): Promise<unknown> {
  return client.get('/tags', { page: params.page, limit: params.limit });
}

export async function fetchTagTransactions(
  client: FireflyClient,
  tag: string,
  params: { start?: string; end?: string; page?: number; limit?: number }
): Promise<unknown> {
  const query: QueryParams = { page: params.page, limit: params.limit };
  if (params.start) query['start'] = params.start;
  if (params.end) query['end'] = params.end;
  return client.get(`/tags/${encodeURIComponent(tag)}/transactions`, query);
}

export async function fetchSummary(
  client: FireflyClient,
  start: string,
  end: string,
  currencyCode?: string
): Promise<unknown> {
  const query: QueryParams = { start, end };
  if (currencyCode) query['currency_code'] = currencyCode;
  return client.get('/summary/basic', query);
}

export async function fetchInsightExpenses(
  client: FireflyClient,
  start: string,
  end: string
): Promise<unknown> {
  return client.get('/insight/expense/category', { start, end });
}

export async function fetchInsightIncome(
  client: FireflyClient,
  start: string,
  end: string
): Promise<unknown> {
  return client.get('/insight/income/category', { start, end });
}

export function registerReportTools(server: McpServer, client: FireflyClient): void {
  server.tool(
    'get_tags',
    'Get all tags defined in Firefly III.',
    {
      page: z.number().int().positive().optional().default(1).describe('Page number'),
      limit: z.number().int().positive().optional().default(50).describe('Results per page'),
    },
    async ({ page, limit }) => {
      try {
        const result = await fetchTags(client, { page, limit });
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );

  server.tool(
    'get_tag_transactions',
    'Get all transactions associated with a specific Firefly III tag. Optionally filter by date range (YYYY-MM-DD).',
    {
      tag: z.string().describe('Tag name'),
      start: z.string().optional().describe('Start date (YYYY-MM-DD)'),
      end: z.string().optional().describe('End date (YYYY-MM-DD)'),
      page: z.number().int().positive().optional().default(1).describe('Page number'),
      limit: z.number().int().positive().optional().default(50).describe('Results per page'),
    },
    async ({ tag, start, end, page, limit }) => {
      try {
        const result = await fetchTagTransactions(client, tag, { start, end, page, limit });
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );

  server.tool(
    'get_summary',
    'Get a basic financial summary from Firefly III for a date range, including total assets, liabilities, and net worth. Dates (YYYY-MM-DD) are required.',
    {
      start: z.string().describe('Start date (YYYY-MM-DD)'),
      end: z.string().describe('End date (YYYY-MM-DD)'),
      currencyCode: z.string().optional().describe('Currency code to filter by (e.g. EUR, USD)'),
    },
    async ({ start, end, currencyCode }) => {
      try {
        const result = await fetchSummary(client, start, end, currencyCode);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );

  server.tool(
    'get_insight_expenses',
    'Get expense insights grouped by category for a date range (YYYY-MM-DD required). Returns how much was spent in each category.',
    {
      start: z.string().describe('Start date (YYYY-MM-DD)'),
      end: z.string().describe('End date (YYYY-MM-DD)'),
    },
    async ({ start, end }) => {
      try {
        const result = await fetchInsightExpenses(client, start, end);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );

  server.tool(
    'get_insight_income',
    'Get income insights grouped by category for a date range (YYYY-MM-DD required). Returns how much was earned in each category.',
    {
      start: z.string().describe('Start date (YYYY-MM-DD)'),
      end: z.string().describe('End date (YYYY-MM-DD)'),
    },
    async ({ start, end }) => {
      try {
        const result = await fetchInsightIncome(client, start, end);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );
}
```

- [ ] **Step 4: Run tests and verify they pass**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/tools/reports.ts src/tests/reports.test.ts
git commit -m "feat: add report tools (get_tags, get_tag_transactions, get_summary, get_insight_expenses, get_insight_income)"
```

---

## Task 10: Tool Registry and MCP Server

**Files:**
- Create: `src/tools/index.ts`
- Create: `src/server.ts`

- [ ] **Step 1: Create `src/tools/index.ts`**

```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FireflyClient } from '../client.js';
import { registerAccountTools } from './accounts.js';
import { registerTransactionTools } from './transactions.js';
import { registerBudgetTools } from './budgets.js';
import { registerCategoryTools } from './categories.js';
import { registerBillTools } from './bills.js';
import { registerPiggyBankTools } from './piggy-banks.js';
import { registerReportTools } from './reports.js';

export function registerAllTools(server: McpServer, client: FireflyClient): void {
  registerAccountTools(server, client);
  registerTransactionTools(server, client);
  registerBudgetTools(server, client);
  registerCategoryTools(server, client);
  registerBillTools(server, client);
  registerPiggyBankTools(server, client);
  registerReportTools(server, client);
}
```

- [ ] **Step 2: Create `src/server.ts`**

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FireflyClient } from './client.js';
import { registerAllTools } from './tools/index.js';

export function createServer(client: FireflyClient): McpServer {
  const server = new McpServer({
    name: 'firefly-iii-mcp',
    version: '0.1.0',
  });

  registerAllTools(server, client);

  return server;
}
```

- [ ] **Step 3: Run all tests to verify nothing broke**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/tools/index.ts src/server.ts
git commit -m "feat: add tool registry and MCP server factory"
```

---

## Task 11: Entry Point

**Files:**
- Create: `src/index.ts`

- [ ] **Step 1: Create `src/index.ts`**

```typescript
#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { FireflyClient } from './client.js';
import { createServer } from './server.js';

const url = process.env['FIREFLY_URL'];
const token = process.env['FIREFLY_TOKEN'];

if (!url || !token) {
  process.stderr.write(
    'Error: FIREFLY_URL and FIREFLY_TOKEN environment variables are required.\n' +
    'See .env.example for configuration instructions.\n'
  );
  process.exit(1);
}

const client = new FireflyClient(url, token);
const server = createServer(client);
const transport = new StdioServerTransport();

await server.connect(transport);
```

- [ ] **Step 2: Build the project**

```bash
npm run build
```

Expected: `dist/` directory created with compiled JavaScript. No TypeScript errors.

- [ ] **Step 3: Run all tests one final time**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/index.ts dist/
git commit -m "feat: add stdio entry point, complete phase 1 build"
```

---

## Task 12: Integration Test

**Files:**
- Create: `src/tests/integration.test.ts`

- [ ] **Step 1: Create `src/tests/integration.test.ts`**

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { FireflyClient } from '../client.js';

const SKIP = !process.env['FIREFLY_INTEGRATION'];

describe.skipIf(SKIP)('Integration: Firefly III live connection', () => {
  let client: FireflyClient;

  beforeAll(() => {
    const url = process.env['FIREFLY_URL'];
    const token = process.env['FIREFLY_TOKEN'];
    if (!url || !token) {
      throw new Error('FIREFLY_URL and FIREFLY_TOKEN must be set for integration tests');
    }
    client = new FireflyClient(url, token);
  });

  it('can authenticate and fetch accounts', async () => {
    const result = await client.get<{ data: unknown[] }>('/accounts', { limit: 1 });
    expect(result).toHaveProperty('data');
    expect(Array.isArray(result.data)).toBe(true);
  });

  it('can fetch transactions', async () => {
    const result = await client.get<{ data: unknown[] }>('/transactions', { limit: 1 });
    expect(result).toHaveProperty('data');
    expect(Array.isArray(result.data)).toBe(true);
  });

  it('can fetch summary', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const start = `${today.slice(0, 4)}-01-01`;
    const result = await client.get('/summary/basic', { start, end: today });
    expect(result).toBeDefined();
  });
});
```

- [ ] **Step 2: Verify normal test run skips integration tests**

```bash
npm test
```

Expected: All tests pass. Integration tests show as skipped (not failed).

- [ ] **Step 3: (Optional) Run integration tests against your live instance**

```bash
FIREFLY_INTEGRATION=true FIREFLY_URL=https://your-instance.example.com FIREFLY_TOKEN=your-token npm run test:integration
```

Expected: All three integration tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/tests/integration.test.ts
git commit -m "test: add integration smoke test (gated by FIREFLY_INTEGRATION env var)"
```

---

## Task 13: Final Verification

- [ ] **Step 1: Clean build**

```bash
rm -rf dist && npm run build
```

Expected: `dist/` rebuilt cleanly. No errors.

- [ ] **Step 2: Run full test suite**

```bash
npm test
```

Expected: All tests pass. Integration tests skipped.

- [ ] **Step 3: Verify the binary is executable**

```bash
ls -la dist/index.js
```

Expected: `-rwxr-xr-x` (executable bit set).

- [ ] **Step 4: Smoke-test the server starts without errors**

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | FIREFLY_URL=https://placeholder.example.com FIREFLY_TOKEN=placeholder node dist/index.js
```

Expected: JSON response listing all 15 tools. No crash.

- [ ] **Step 5: Final commit with plan reference**

```bash
git add -A
git commit -m "chore: final build verification — all 15 tools registered and tested"
```
