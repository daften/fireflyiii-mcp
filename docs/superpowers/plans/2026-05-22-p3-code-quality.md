# P3 Code Quality Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate try/catch boilerplate across 140 tools, centralise shared annotation constants, add a validated date schema, fix the proxy `this`-binding bug, drop `dist/` from git, and downgrade hand-maintained rule enums to forward-compatible strings.

**Architecture:** Two phases. Phase 1 creates `src/tools/_annotations.ts` and `src/tools/_helpers.ts`, then migrates all 14 tool files to use them (covers P3-1, P3-2, P3-4). Phase 2 applies three focused fixes: `this`-binding in `makeReadOnlyProxy` (P3-3), `dist/` removal from git (P3-5), and rule enum downgrade (P3-6). Each task ends with a full `npm test` to catch regressions early.

**Tech Stack:** TypeScript strict mode, Zod v3, `@modelcontextprotocol/sdk` v1.29+, Vitest, Node 22, ESM imports with `.js` extensions.

---

## PHASE 1 — Shared infrastructure + migrations

---

### Task 1: Create `src/tools/_annotations.ts`

**Files:**
- Create: `src/tools/_annotations.ts`

- [ ] **Step 1: Create the file**

```typescript
export const READ_ANNOTATIONS = {
  readOnlyHint: true,
  openWorldHint: true,
  idempotentHint: true,
} as const;

export const WRITE_ANNOTATIONS = { openWorldHint: true } as const;
export const UPDATE_ANNOTATIONS = { openWorldHint: true, idempotentHint: true } as const;
export const DELETE_ANNOTATIONS = { destructiveHint: true, openWorldHint: true } as const;
```

- [ ] **Step 2: Verify it compiles**

```bash
npm run build
```

Expected: exits 0, no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/tools/_annotations.ts dist/
git commit -m "refactor: add shared _annotations.ts module

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Create `src/tools/_helpers.ts` with tests (TDD)

**Files:**
- Create: `src/tests/helpers.test.ts`
- Create: `src/tools/_helpers.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/tests/helpers.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { FireflyError } from '../client.js';
import { defineTool, dateSchema } from '../tools/_helpers.js';

function makeServer() {
  let capturedHandler: ((args: Record<string, unknown>) => Promise<unknown>) | null = null;
  const server = {
    registerTool: vi.fn((_name: string, _config: unknown, handler: (args: Record<string, unknown>) => Promise<unknown>) => {
      capturedHandler = handler;
    }),
    getHandler: () => capturedHandler!,
  };
  return server;
}

describe('defineTool', () => {
  it('serialises object result to pretty-printed JSON', async () => {
    const server = makeServer();
    defineTool(server as unknown as McpServer, 'test_tool', { title: 'Test' },
      async () => ({ foo: 'bar', n: 1 }));
    const result = await server.getHandler()({});
    expect(result).toEqual({
      content: [{ type: 'text', text: '{\n  "foo": "bar",\n  "n": 1\n}' }],
    });
  });

  it('passes string result through without double-encoding', async () => {
    const server = makeServer();
    defineTool(server as unknown as McpServer, 'test_tool', { title: 'Test' },
      async () => 'col1,col2\n1,2');
    const result = await server.getHandler()({});
    expect(result).toEqual({
      content: [{ type: 'text', text: 'col1,col2\n1,2' }],
    });
  });

  it('wraps thrown FireflyError into { isError: true }', async () => {
    const server = makeServer();
    defineTool(server as unknown as McpServer, 'test_tool', { title: 'Test' },
      async () => { throw new FireflyError(404, '/test', ''); });
    const result = await server.getHandler()({});
    expect(result).toMatchObject({
      isError: true,
      content: [{ type: 'text', text: 'Resource not found.' }],
    });
  });

  it('wraps generic Error into { isError: true }', async () => {
    const server = makeServer();
    defineTool(server as unknown as McpServer, 'test_tool', { title: 'Test' },
      async () => { throw new Error('boom'); });
    const result = await server.getHandler()({});
    expect(result).toMatchObject({ isError: true, content: [{ type: 'text', text: 'boom' }] });
  });
});

describe('dateSchema', () => {
  it('accepts YYYY-MM-DD', () => {
    expect(() => dateSchema.parse('2026-01-15')).not.toThrow();
    expect(() => dateSchema.parse('2000-12-31')).not.toThrow();
  });

  it('rejects slash-separated dates', () => {
    expect(() => dateSchema.parse('2026/01/15')).toThrow('Date must be YYYY-MM-DD');
  });

  it('rejects US-format dates', () => {
    expect(() => dateSchema.parse('01-15-2026')).toThrow('Date must be YYYY-MM-DD');
  });

  it('rejects natural-language dates', () => {
    expect(() => dateSchema.parse('Jan 15 2026')).toThrow('Date must be YYYY-MM-DD');
  });
});
```

- [ ] **Step 2: Run to confirm tests fail**

```bash
npx vitest run src/tests/helpers.test.ts
```

Expected: error — `Cannot find module '../tools/_helpers.js'`.

- [ ] **Step 3: Create `src/tools/_helpers.ts`**

```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { formatError } from '../client.js';

type ToolConfig = {
  title?: string;
  description?: string;
  inputSchema?: Record<string, z.ZodTypeAny>;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
};

export function defineTool(
  server: McpServer,
  name: string,
  config: ToolConfig,
  fetch: (args: Record<string, unknown>) => Promise<unknown>,
): void {
  server.registerTool(name, config, async (args) => {
    try {
      const result = await fetch(args as Record<string, unknown>);
      return {
        content: [{
          type: 'text' as const,
          text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
        }],
      };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  });
}

export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');
```

- [ ] **Step 4: Run tests — expect all to pass**

```bash
npx vitest run src/tests/helpers.test.ts
```

Expected: `8 passed`.

- [ ] **Step 5: Run full suite to check nothing broke**

```bash
npm test
```

Expected: all existing tests pass.

- [ ] **Step 6: Build and commit**

```bash
npm run build
git add src/tools/_helpers.ts src/tests/helpers.test.ts dist/
git commit -m "feat: add _helpers.ts with defineTool and dateSchema

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Migrate `accounts.ts` — proof of concept

**Files:**
- Modify: `src/tools/accounts.ts`

This is the canonical example. Apply the same pattern to every subsequent tool file.

The migration rules are:
1. Remove `formatError` from the `'../client.js'` import (keep `FireflyClient`).
2. Add two new imports: `_annotations.js` and `_helpers.js`.
3. Delete the four local annotation `const` blocks near the top of `registerAccountTools`.
4. Replace every `server.registerTool(name, config, async (args) => { try {...} catch {...} })` with `defineTool(server, name, config, fetchFn)`.
5. Replace `z.string().optional().describe('... (YYYY-MM-DD)')` with `dateSchema.optional().describe('... (YYYY-MM-DD)')` (and `z.string().describe(...)` with `dateSchema.describe(...)` for required date fields).
6. For fetch functions that take a single id, cast: `({ id }) => fetchFoo(client, id as string)`.
7. For fetch functions that take an id + params spread, cast: `({ id, ...params }) => updateFoo(client, id as string, params as Parameters<typeof updateFoo>[2])`.
8. For fetch functions that take only a params object, cast: `(params) => createFoo(client, params as Parameters<typeof createFoo>[1])`.

- [ ] **Step 1: Update the imports block**

Replace lines 1–5 of `src/tools/accounts.ts`:

```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { FireflyClient } from '../client.js';
import type { QueryParams } from '../types.js';
import { unwrapList, unwrapSingle, type JsonApiListResponse, type JsonApiSingleResponse, type UnwrappedList, type UnwrappedSingle } from '../transform.js';
import { READ_ANNOTATIONS, WRITE_ANNOTATIONS, UPDATE_ANNOTATIONS, DELETE_ANNOTATIONS } from './_annotations.js';
import { defineTool, dateSchema } from './_helpers.js';
```

- [ ] **Step 2: Replace `registerAccountTools` with the migrated version**

Replace the entire `registerAccountTools` function (lines 98–267 of the original) with:

```typescript
export function registerAccountTools(server: McpServer, client: FireflyClient): void {
  defineTool(server, 'get_accounts', {
    title: 'Get Accounts',
    description: 'Get all accounts from Firefly III. Filter by type: asset (bank/cash accounts), expense (merchants), revenue (income sources), liability (loans/debts), or all. Use get_account to fetch a single account by ID.',
    inputSchema: {
      type: z.enum(['asset', 'expense', 'revenue', 'liability', 'all']).optional().default('all').describe('Account type filter'),
      page: z.number().int().positive().optional().default(1).describe('Page number'),
      limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
    },
    annotations: READ_ANNOTATIONS,
  }, ({ type, page, limit }) => fetchAccounts(client, { type: type as string | undefined, page: page as number | undefined, limit: limit as number | undefined }));

  defineTool(server, 'get_account', {
    title: 'Get Account',
    description: 'Get a single Firefly III account by its numeric ID, including the current balance. Use get_accounts to find valid account IDs.',
    inputSchema: { id: z.string().describe('Account ID') },
    annotations: READ_ANNOTATIONS,
  }, ({ id }) => fetchAccount(client, id as string));

  defineTool(server, 'create_account', {
    title: 'Create Account',
    description: 'Create a new account in Firefly III.',
    inputSchema: {
      name: z.string().describe('Account name'),
      type: z.enum(['asset', 'expense', 'revenue', 'liability']).describe('Account type'),
      currency_code: z.string().optional().describe('Currency code (e.g. EUR, USD)'),
      iban: z.string().optional().describe('IBAN number'),
      opening_balance: z.string().optional().describe('Opening balance as a number string'),
      opening_balance_date: dateSchema.optional().describe('Opening balance date (YYYY-MM-DD)'),
      include_net_worth: z.boolean().optional().describe('Include in net worth calculations'),
      notes: z.string().optional().describe('Notes'),
    },
    annotations: WRITE_ANNOTATIONS,
  }, (params) => createAccount(client, params as Parameters<typeof createAccount>[1]));

  defineTool(server, 'update_account', {
    title: 'Update Account',
    description: 'Update an existing account in Firefly III. Only fields provided will be changed. Use get_account to confirm the ID.',
    inputSchema: {
      id: z.string().describe('Account ID — use get_accounts to find valid IDs'),
      name: z.string().optional().describe('Account name'),
      currency_code: z.string().optional().describe('Currency code (e.g. EUR, USD)'),
      iban: z.string().optional().describe('IBAN number'),
      opening_balance: z.string().optional().describe('Opening balance as a number string'),
      opening_balance_date: dateSchema.optional().describe('Opening balance date (YYYY-MM-DD)'),
      include_net_worth: z.boolean().optional().describe('Include in net worth calculations'),
      active: z.boolean().optional().describe('Whether the account is active'),
      notes: z.string().optional().describe('Notes'),
    },
    annotations: UPDATE_ANNOTATIONS,
  }, ({ id, ...params }) => updateAccount(client, id as string, params as Parameters<typeof updateAccount>[2]));

  defineTool(server, 'delete_account', {
    title: 'Delete Account',
    description: 'Permanently delete an account from Firefly III. **This action cannot be undone.** Accounts with linked transactions cannot be deleted. Use get_account to confirm before deleting.',
    inputSchema: { id: z.string().describe('Account ID — use get_accounts to find valid IDs') },
    annotations: DELETE_ANNOTATIONS,
  }, ({ id }) => deleteAccount(client, id as string));

  defineTool(server, 'get_account_transactions', {
    title: 'Get Account Transactions',
    description: 'Get all transactions for a specific account. Use get_accounts to find valid account IDs.',
    inputSchema: {
      id: z.string().describe('Account ID'),
      start: dateSchema.optional().describe('Start date (YYYY-MM-DD)'),
      end: dateSchema.optional().describe('End date (YYYY-MM-DD)'),
      type: z.enum(['all', 'withdrawal', 'deposit', 'transfer', 'opening_balance', 'reconciliation', 'special', 'default']).optional().describe('Filter by transaction type'),
      page: z.number().int().positive().optional().default(1).describe('Page number'),
      limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
    },
    annotations: READ_ANNOTATIONS,
  }, ({ id, start, end, type, page, limit }) =>
    fetchAccountTransactions(client, id as string, { start: start as string | undefined, end: end as string | undefined, type: type as string | undefined, page: page as number | undefined, limit: limit as number | undefined }));

  defineTool(server, 'search_accounts', {
    title: 'Search Accounts',
    description: 'Search for accounts by name, IBAN, account number, or ID.',
    inputSchema: {
      query: z.string().describe('Search query'),
      field: z.enum(['all', 'id', 'name', 'iban', 'number', 'account_number']).optional().default('all').describe('Field to search in'),
      page: z.number().int().positive().optional().default(1).describe('Page number'),
      limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
    },
    annotations: READ_ANNOTATIONS,
  }, ({ query, field, page, limit }) =>
    searchAccounts(client, { query: query as string, field: field as string | undefined, page: page as number | undefined, limit: limit as number | undefined }));
}
```

- [ ] **Step 3: Run `accounts.ts` tests**

```bash
npx vitest run src/tests/accounts.test.ts
```

Expected: all accounts tests pass.

- [ ] **Step 4: Run full suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 5: Build and commit**

```bash
npm run build
git add src/tools/accounts.ts dist/
git commit -m "refactor: migrate accounts.ts to defineTool

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 4: Migrate `transactions.ts`

**Files:**
- Modify: `src/tools/transactions.ts`

Date fields: `date` (required in `create_transaction`), `date` (optional in `update_transaction`), `start`/`end` (optional in `get_transactions` and `get_account_transactions`).

- [ ] **Step 1: Update imports** (same pattern as accounts.ts — remove `formatError`, add `_annotations.js` and `_helpers.js`)

Replace the import block at the top of `src/tools/transactions.ts`:

```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { FireflyClient } from '../client.js';
import type { QueryParams } from '../types.js';
import { unwrapList, unwrapSingle, type JsonApiListResponse, type JsonApiSingleResponse, type UnwrappedList, type UnwrappedSingle } from '../transform.js';
import { READ_ANNOTATIONS, WRITE_ANNOTATIONS, UPDATE_ANNOTATIONS, DELETE_ANNOTATIONS } from './_annotations.js';
import { defineTool, dateSchema } from './_helpers.js';
```

- [ ] **Step 2: Delete the four local annotation constants** — find the four `const READ_ANNOTATIONS = ...` / `WRITE_ANNOTATIONS` / etc. lines near the top of the `registerTransactionTools` function and delete them.

- [ ] **Step 3: Replace the `registerTransactionTools` function body**

The key date-field changes:
- `get_transactions`: `start` and `end` → `dateSchema.optional()`
- `search_transactions`: `start` and `end` → `dateSchema.optional()`
- `get_transaction`: no date fields
- `create_transaction`: `date` is required → `dateSchema.describe('Transaction date (YYYY-MM-DD)')`
- `update_transaction`: `date` is optional → `dateSchema.optional().describe('Transaction date (YYYY-MM-DD)')`
- `bulk_update_transactions`: `start` and `end` → `dateSchema.optional()`
- `delete_transaction`: no date fields

Convert each `server.registerTool(...)` call to `defineTool(...)` following the pattern from Task 3. Example for `create_transaction` (the most complex tool):

```typescript
defineTool(server, 'create_transaction', {
  title: 'Create Transaction',
  description: '...',  // keep existing description unchanged
  inputSchema: {
    type: z.enum(['withdrawal', 'deposit', 'transfer']).describe('Transaction type'),
    date: dateSchema.describe('Transaction date (YYYY-MM-DD)'),
    amount: z.string().describe('Transaction amount as a number string'),
    description: z.string().describe('Transaction description'),
    source_id: z.string().optional().describe('Source account ID (required for withdrawals and transfers)'),
    destination_id: z.string().optional().describe('Destination account ID (required for deposits and transfers)'),
    category_name: z.string().optional().describe('Category name'),
    budget_id: z.string().optional().describe('Budget ID'),
    currency_code: z.string().optional().describe('Currency code (e.g. EUR, USD)'),
    notes: z.string().optional().describe('Notes'),
    tags: z.array(z.string()).optional().describe('Tags'),
  },
  annotations: WRITE_ANNOTATIONS,
}, (params) => createTransaction(client, params as Parameters<typeof createTransaction>[1]));
```

- [ ] **Step 4: Run tests and full suite**

```bash
npx vitest run src/tests/transactions.test.ts && npm test
```

Expected: all pass.

- [ ] **Step 5: Build and commit**

```bash
npm run build
git add src/tools/transactions.ts dist/
git commit -m "refactor: migrate transactions.ts to defineTool

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 5: Migrate `budgets.ts`

**Files:**
- Modify: `src/tools/budgets.ts`

Date fields:
- `get_budget_limits`: `start`/`end` → `dateSchema.optional()`
- `create_budget_limit`: `start`/`end` are **required** → `dateSchema.describe('Start date (YYYY-MM-DD)')` (no `.optional()`)
- `update_budget_limit`: `start`/`end` → `dateSchema.optional()`
- `get_budget_transactions`: `start`/`end` → `dateSchema.optional()`
- `get_transactions_without_budget`: `start`/`end` → `dateSchema.optional()`

- [ ] **Step 1: Update imports** (same pattern — remove `formatError`, add `_annotations.js` and `_helpers.js`)

```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { FireflyClient } from '../client.js';
import type { QueryParams } from '../types.js';
import { unwrapList, unwrapSingle, type JsonApiListResponse, type JsonApiSingleResponse, type UnwrappedList, type UnwrappedSingle } from '../transform.js';
import { READ_ANNOTATIONS, WRITE_ANNOTATIONS, UPDATE_ANNOTATIONS, DELETE_ANNOTATIONS } from './_annotations.js';
import { defineTool, dateSchema } from './_helpers.js';
```

- [ ] **Step 2: Delete the four local annotation constants** (lines 144–152 in the original file).

- [ ] **Step 3: Replace all `server.registerTool(...)` calls with `defineTool(...)` calls**

The `get_budget_limits` handler is special — it passes `start` and `end` as positional args, not a spread:

```typescript
defineTool(server, 'get_budget_limits', {
  title: 'Get Budget Limits',
  description: 'Get spending limits for a specific Firefly III budget...',
  inputSchema: {
    budgetId: z.string().describe('Budget ID — use get_budgets to find valid IDs'),
    start: dateSchema.optional().describe('Start date (YYYY-MM-DD)'),
    end: dateSchema.optional().describe('End date (YYYY-MM-DD)'),
  },
  annotations: READ_ANNOTATIONS,
}, ({ budgetId, start, end }) =>
  fetchBudgetLimits(client, budgetId as string, start as string | undefined, end as string | undefined));
```

The `create_budget_limit` handler splits `budget_id` from the rest:

```typescript
defineTool(server, 'create_budget_limit', {
  title: 'Create Budget Limit',
  description: 'Create a spending limit for a budget in Firefly III for a specific date range.',
  inputSchema: {
    budget_id: z.string().describe('Budget ID — use get_budgets to find valid IDs'),
    start: dateSchema.describe('Start date (YYYY-MM-DD)'),
    end: dateSchema.describe('End date (YYYY-MM-DD)'),
    amount: z.string().describe('Limit amount as a number string'),
    currency_code: z.string().optional().describe('Currency code (e.g. EUR, USD)'),
    period: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'half_year', 'yearly']).optional().describe('Budget period'),
  },
  annotations: WRITE_ANNOTATIONS,
}, ({ budget_id, ...params }) =>
  createBudgetLimit(client, budget_id as string, params as Parameters<typeof createBudgetLimit>[2]));
```

Apply the same pattern to all remaining budget tools (`get_budgets`, `get_budget`, `create_budget`, `update_budget`, `delete_budget`, `update_budget_limit`, `delete_budget_limit`, `get_available_budgets`, `get_available_budget`, `get_budget_transactions`, `get_transactions_without_budget`).

- [ ] **Step 4: Run tests and full suite**

```bash
npx vitest run src/tests/budgets.test.ts && npm test
```

Expected: all pass.

- [ ] **Step 5: Build and commit**

```bash
npm run build
git add src/tools/budgets.ts dist/
git commit -m "refactor: migrate budgets.ts to defineTool

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 6: Migrate `categories.ts`, `bills.ts`, `piggy-banks.ts`

**Files:**
- Modify: `src/tools/categories.ts`
- Modify: `src/tools/bills.ts`
- Modify: `src/tools/piggy-banks.ts`

**Date fields per file:**

`categories.ts`:
- `get_category_transactions`: `start`/`end` → `dateSchema.optional()`

`bills.ts`:
- `get_bills`: `start`/`end` → `dateSchema.optional()`
- `create_bill`: `date` is **required** → `dateSchema.describe('Bill start date (YYYY-MM-DD)')`, `end_date` → `dateSchema.optional()`
- `update_bill`: `date` → `dateSchema.optional()`, `end_date` → `dateSchema.optional()`

`piggy-banks.ts`:
- `create_piggy_bank`: `start_date` → `dateSchema.optional()`, `target_date` → `dateSchema.optional()`
- `update_piggy_bank`: `start_date` → `dateSchema.optional()`, `target_date` → `dateSchema.optional()`

For each file, follow the same four steps as previous tasks (update imports, delete local annotation constants, convert `server.registerTool` → `defineTool`, test).

- [ ] **Step 1: Update imports in `categories.ts`**

```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { FireflyClient } from '../client.js';
import type { QueryParams } from '../types.js';
import { unwrapList, unwrapSingle, type JsonApiListResponse, type JsonApiSingleResponse, type UnwrappedList, type UnwrappedSingle } from '../transform.js';
import { READ_ANNOTATIONS, WRITE_ANNOTATIONS, UPDATE_ANNOTATIONS, DELETE_ANNOTATIONS } from './_annotations.js';
import { defineTool, dateSchema } from './_helpers.js';
```

Delete local annotation constants. Convert all `server.registerTool(...)` calls. The `get_category_transactions` tool passes `categoryId` separately:

```typescript
defineTool(server, 'get_category_transactions', {
  title: 'Get Category Transactions',
  description: '...',
  inputSchema: {
    id: z.string().describe('Category ID'),
    start: dateSchema.optional().describe('Start date (YYYY-MM-DD)'),
    end: dateSchema.optional().describe('End date (YYYY-MM-DD)'),
    page: z.number().int().positive().optional().default(1).describe('Page number'),
    limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
  },
  annotations: READ_ANNOTATIONS,
}, ({ id, start, end, page, limit }) =>
  fetchCategoryTransactions(client, id as string, { start: start as string | undefined, end: end as string | undefined, page: page as number | undefined, limit: limit as number | undefined }));
```

- [ ] **Step 2: Update imports in `bills.ts`** (same pattern, include `dateSchema`)

Delete local annotation constants. Convert all `server.registerTool(...)` calls. The `create_bill` handler uses a params cast:

```typescript
defineTool(server, 'create_bill', {
  title: 'Create Bill',
  description: '...',
  inputSchema: {
    name: z.string().describe('Bill name'),
    amount_min: z.string().describe('Minimum expected amount'),
    amount_max: z.string().describe('Maximum expected amount'),
    date: dateSchema.describe('Bill start date (YYYY-MM-DD)'),
    repeat_freq: z.enum(['weekly', 'monthly', 'quarterly', 'half-year', 'yearly']).describe('Repeat frequency'),
    currency_code: z.string().optional().describe('Currency code (e.g. EUR, USD)'),
    end_date: dateSchema.optional().describe('Bill end date (YYYY-MM-DD)'),
    active: z.boolean().optional().describe('Whether the bill is active'),
    notes: z.string().optional().describe('Notes'),
  },
  annotations: WRITE_ANNOTATIONS,
}, (params) => createBill(client, params as Parameters<typeof createBill>[1]));
```

- [ ] **Step 3: Update imports in `piggy-banks.ts`** (same pattern, include `dateSchema`)

Delete local annotation constants. Convert all tools. `create_piggy_bank` and `update_piggy_bank` use `dateSchema.optional()` for `start_date` and `target_date`:

```typescript
defineTool(server, 'create_piggy_bank', {
  title: 'Create Piggy Bank',
  description: '...',
  inputSchema: {
    name: z.string().describe('Piggy bank name'),
    account_id: z.string().describe('Asset account ID to link to'),
    target_amount: z.string().optional().describe('Savings target as a number string'),
    start_date: dateSchema.optional().describe('Start date (YYYY-MM-DD)'),
    target_date: dateSchema.optional().describe('Target date (YYYY-MM-DD)'),
    notes: z.string().optional().describe('Notes'),
  },
  annotations: WRITE_ANNOTATIONS,
}, (params) => createPiggyBank(client, params as Parameters<typeof createPiggyBank>[1]));
```

- [ ] **Step 4: Run tests and full suite**

```bash
npx vitest run src/tests/categories.test.ts src/tests/bills.test.ts src/tests/piggy-banks.test.ts && npm test
```

Expected: all pass.

- [ ] **Step 5: Build and commit**

```bash
npm run build
git add src/tools/categories.ts src/tools/bills.ts src/tools/piggy-banks.ts dist/
git commit -m "refactor: migrate categories, bills, piggy-banks to defineTool

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 7: Migrate `reports.ts` and `recurring.ts`

**Files:**
- Modify: `src/tools/reports.ts`
- Modify: `src/tools/recurring.ts`

**Date fields:**

`reports.ts`:
- `get_tag_transactions`: `start`/`end` → `dateSchema.optional()`
- `get_summary`: `start`/`end` are **required** → `dateSchema.describe('Start date (YYYY-MM-DD)')`
- `get_insight_expenses`: `start`/`end` are **required** → `dateSchema.describe(...)`
- `get_insight_income`: `start`/`end` are **required** → `dateSchema.describe(...)`
- All `get_insight_no_*` tools: `start`/`end` are **required** → `dateSchema.describe(...)`
- `create_tag`: `date` → `dateSchema.optional()`

`recurring.ts`:
- `create_recurring`: `first_date` is **required** → `dateSchema.describe('First recurrence date (YYYY-MM-DD)')`, `repeat_until` → `dateSchema.optional().nullable()`

- [ ] **Step 1: Update imports in `reports.ts`**

```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { FireflyClient } from '../client.js';
import type { QueryParams } from '../types.js';
import { unwrapList, unwrapSingle, cleanSummary, type JsonApiListResponse, type JsonApiSingleResponse, type RawSummaryResponse, type CleanSummaryItem, type UnwrappedList, type UnwrappedSingle } from '../transform.js';
import { READ_ANNOTATIONS, WRITE_ANNOTATIONS, UPDATE_ANNOTATIONS, DELETE_ANNOTATIONS } from './_annotations.js';
import { defineTool, dateSchema } from './_helpers.js';
```

Delete local annotation constants. Convert all `server.registerTool(...)` calls. The `get_summary` tool passes `start`/`end` positionally to `fetchSummary`:

```typescript
defineTool(server, 'get_summary', {
  title: 'Get Summary',
  description: '...',
  inputSchema: {
    start: dateSchema.describe('Start date (YYYY-MM-DD)'),
    end: dateSchema.describe('End date (YYYY-MM-DD)'),
    currency_code: z.string().optional().describe('Filter by currency code'),
  },
  annotations: READ_ANNOTATIONS,
}, ({ start, end, currency_code }) =>
  fetchSummary(client, start as string, end as string, currency_code as string | undefined));
```

The `get_tag_transactions` tool passes `tag` positionally:

```typescript
defineTool(server, 'get_tag_transactions', {
  title: 'Get Tag Transactions',
  description: '...',
  inputSchema: {
    tag: z.string().describe('Tag name'),
    start: dateSchema.optional().describe('Start date (YYYY-MM-DD)'),
    end: dateSchema.optional().describe('End date (YYYY-MM-DD)'),
    page: z.number().int().positive().optional().default(1).describe('Page number'),
    limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
  },
  annotations: READ_ANNOTATIONS,
}, ({ tag, start, end, page, limit }) =>
  fetchTagTransactions(client, tag as string, { start: start as string | undefined, end: end as string | undefined, page: page as number | undefined, limit: limit as number | undefined }));
```

- [ ] **Step 2: Update imports in `recurring.ts`**

```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { FireflyClient } from '../client.js';
import type { QueryParams } from '../types.js';
import { unwrapList, unwrapSingle, type JsonApiListResponse, type JsonApiSingleResponse, type UnwrappedList, type UnwrappedSingle } from '../transform.js';
import { READ_ANNOTATIONS, WRITE_ANNOTATIONS, UPDATE_ANNOTATIONS, DELETE_ANNOTATIONS } from './_annotations.js';
import { defineTool, dateSchema } from './_helpers.js';
```

Delete local annotation constants. The `create_recurring` tool has a `first_date` (required) and `repeat_until` (optional, nullable):

```typescript
defineTool(server, 'create_recurring', {
  title: 'Create Recurring Transaction',
  description: '...',
  inputSchema: {
    type: z.enum(['withdrawal', 'deposit', 'transfer']).describe('Transaction type'),
    title: z.string().describe('Recurrence title'),
    description: z.string().optional().describe('Description'),
    notes: z.string().optional().describe('Notes'),
    first_date: dateSchema.describe('First recurrence date (YYYY-MM-DD)'),
    repeat_until: dateSchema.optional().nullable().describe('Stop repeating after this date (YYYY-MM-DD), or null to repeat indefinitely'),
    nr_of_repetitions: z.number().int().positive().optional().describe('Number of times to repeat (alternative to repeat_until)'),
    apply_rules: z.boolean().optional().describe('Apply rules to generated transactions'),
    active: z.boolean().optional().describe('Whether the recurrence is active'),
    repeat_type: z.enum(['daily', 'weekly', 'monthly', 'ndom', 'yearly']).describe('Repetition type'),
    repeat_moment: z.string().describe('Repetition moment (day number, weekday, etc.)'),
    skip: z.number().int().min(0).optional().describe('Number of repetitions to skip'),
    weekend: z.number().int().min(1).max(4).optional().describe('Weekend handling: 1=skip, 2=use Friday, 3=use Monday, 4=use nearest weekday'),
    amount: z.string().describe('Transaction amount as a number string'),
    transaction_description: z.string().describe('Description for each generated transaction'),
    source_id: z.string().describe('Source account ID'),
    destination_id: z.string().describe('Destination account ID'),
    category_id: z.string().optional().describe('Category ID'),
    budget_id: z.string().optional().describe('Budget ID'),
    currency_code: z.string().optional().describe('Currency code'),
    tags: z.array(z.string()).optional().describe('Tags'),
    transaction_notes: z.string().optional().describe('Notes for generated transactions'),
  },
  annotations: WRITE_ANNOTATIONS,
}, (params) => createRecurrence(client, params as Parameters<typeof createRecurrence>[1]));
```

- [ ] **Step 3: Run tests and full suite**

```bash
npx vitest run src/tests/reports.test.ts src/tests/recurring.test.ts && npm test
```

Expected: all pass.

- [ ] **Step 4: Build and commit**

```bash
npm run build
git add src/tools/reports.ts src/tools/recurring.ts dist/
git commit -m "refactor: migrate reports and recurring to defineTool

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 8: Migrate `rules.ts` + replace trigger/action enums (P3-6)

**Files:**
- Modify: `src/tools/rules.ts`

This task combines the migration with P3-6: replace the two hand-maintained `z.enum([...])` schema variables with `z.string()` plus `.describe()` listing common values.

No date fields in this file.

- [ ] **Step 1: Update imports**

```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { FireflyClient } from '../client.js';
import { unwrapList, unwrapSingle, type JsonApiListResponse, type JsonApiSingleResponse, type UnwrappedList, type UnwrappedSingle } from '../transform.js';
import { READ_ANNOTATIONS, WRITE_ANNOTATIONS, UPDATE_ANNOTATIONS, DELETE_ANNOTATIONS } from './_annotations.js';
import { defineTool } from './_helpers.js';
```

- [ ] **Step 2: Replace `triggerTypeSchema` with `z.string()`**

Find `const triggerTypeSchema = z.enum([...])` (lines 209–221 approximately) and replace with:

```typescript
const triggerTypeSchema = z.string().describe(
  'Trigger type. Common values: from_account_starts, from_account_ends, from_account_is, from_account_contains, to_account_starts, to_account_ends, to_account_is, to_account_contains, amount_less, amount_exactly, amount_more, description_starts, description_ends, description_contains, description_is, transaction_type, category_is, budget_is, tag_is, currency_is, has_attachments, has_no_category, has_any_category, has_no_budget, has_any_budget, has_no_tag, has_any_tag, notes_contains, notes_starts, notes_end, notes_are, no_notes, any_notes, source_account_is, destination_account_is, source_account_starts'
);
```

- [ ] **Step 3: Replace `actionTypeSchema` with `z.string()`**

Find `const actionTypeSchema = z.enum([...])` and replace with:

```typescript
const actionTypeSchema = z.string().describe(
  'Action type. Common values: user_action, set_category, clear_category, set_budget, clear_budget, add_tag, remove_tag, remove_all_tags, set_description, append_description, prepend_description, set_source_account, set_destination_account, set_notes, append_notes, prepend_notes, clear_notes, link_to_bill, convert_withdrawal, convert_deposit, convert_transfer, delete_transaction'
);
```

- [ ] **Step 4: Delete the four local annotation constants** and convert all `server.registerTool(...)` calls to `defineTool(...)` following the same pattern as previous tasks.

- [ ] **Step 5: Run tests and full suite**

```bash
npx vitest run src/tests/rules.test.ts && npm test
```

Expected: all pass.

- [ ] **Step 6: Build and commit**

```bash
npm run build
git add src/tools/rules.ts dist/
git commit -m "refactor: migrate rules.ts to defineTool; replace trigger/action enums with z.string()

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 9: Migrate `attachments.ts`

**Files:**
- Modify: `src/tools/attachments.ts`

No date fields. Special case: `download_attachment` calls `downloadAttachment` which returns `Promise<string>` — `defineTool` detects the string return and passes it through directly without JSON-encoding.

- [ ] **Step 1: Update imports**

```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { FireflyClient } from '../client.js';
import { unwrapList, unwrapSingle, type JsonApiListResponse, type JsonApiSingleResponse, type UnwrappedList, type UnwrappedSingle } from '../transform.js';
import { READ_ANNOTATIONS, WRITE_ANNOTATIONS, UPDATE_ANNOTATIONS, DELETE_ANNOTATIONS } from './_annotations.js';
import { defineTool } from './_helpers.js';
```

- [ ] **Step 2: Delete the four local annotation constants** (lines 63–66 in the original).

- [ ] **Step 3: Convert all `server.registerTool(...)` calls**

`download_attachment` — string return just works:

```typescript
defineTool(server, 'download_attachment', {
  title: 'Download Attachment',
  description: 'Download the raw content of an attachment as text. Useful for reading receipts or notes. Use get_attachments to find valid IDs.',
  inputSchema: { id: z.string().describe('Attachment ID') },
  annotations: READ_ANNOTATIONS,
}, ({ id }) => downloadAttachment(client, id as string));
```

`upload_attachment` — `content_base64` needs a cast to string for `Buffer.from`:

```typescript
defineTool(server, 'upload_attachment', {
  title: 'Upload Attachment File',
  description: 'Upload the binary content for an existing attachment record...',
  inputSchema: {
    id: z.string().describe('Attachment ID from create_attachment'),
    content_base64: z.string().describe('File content encoded as base64'),
  },
  annotations: { openWorldHint: true },
}, ({ id, content_base64 }) =>
  uploadAttachment(client, id as string, Buffer.from(content_base64 as string, 'base64')));
```

Apply the same `defineTool` pattern to all other attachment tools.

- [ ] **Step 4: Run tests and full suite**

```bash
npx vitest run src/tests/attachments.test.ts && npm test
```

Expected: all pass.

- [ ] **Step 5: Build and commit**

```bash
npm run build
git add src/tools/attachments.ts dist/
git commit -m "refactor: migrate attachments.ts to defineTool

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 10: Migrate `currencies.ts`, `object-groups.ts`, `transaction-links.ts`

**Files:**
- Modify: `src/tools/currencies.ts`
- Modify: `src/tools/object-groups.ts`
- Modify: `src/tools/transaction-links.ts`

No date fields in any of these files. Pure mechanical migration: update imports, delete local annotation constants, convert `server.registerTool(...)` to `defineTool(...)`.

- [ ] **Step 1: Update imports in each file** (same pattern — remove `formatError`, add `_annotations.js` and `_helpers.js`)

For `currencies.ts`:
```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { FireflyClient } from '../client.js';
import { unwrapList, unwrapSingle, type JsonApiListResponse, type JsonApiSingleResponse, type UnwrappedList, type UnwrappedSingle } from '../transform.js';
import { READ_ANNOTATIONS, WRITE_ANNOTATIONS, UPDATE_ANNOTATIONS, DELETE_ANNOTATIONS } from './_annotations.js';
import { defineTool } from './_helpers.js';
```

Apply the same import update to `object-groups.ts` and `transaction-links.ts`.

- [ ] **Step 2: Delete the four local annotation constants in each file** and convert all `server.registerTool(...)` calls to `defineTool(...)`.

Example for `currencies.ts` — `get_currency` (single-param pattern):
```typescript
defineTool(server, 'get_currency', {
  title: 'Get Currency',
  description: '...',
  inputSchema: { code: z.string().describe('Currency code (e.g. EUR, USD)') },
  annotations: READ_ANNOTATIONS,
}, ({ code }) => fetchCurrency(client, code as string));
```

Example for `object-groups.ts` — `create_object_group` (params spread pattern):
```typescript
defineTool(server, 'create_object_group', {
  title: 'Create Object Group',
  description: '...',
  inputSchema: {
    title: z.string().describe('Group title'),
    order: z.number().int().optional().describe('Display order'),
  },
  annotations: WRITE_ANNOTATIONS,
}, (params) => createObjectGroup(client, params as Parameters<typeof createObjectGroup>[1]));
```

Apply the same pattern to all remaining tools in all three files.

- [ ] **Step 3: Run tests and full suite**

```bash
npx vitest run src/tests/currencies.test.ts src/tests/object-groups.test.ts src/tests/transaction-links.test.ts && npm test
```

Expected: all pass.

- [ ] **Step 4: Build and commit**

```bash
npm run build
git add src/tools/currencies.ts src/tools/object-groups.ts src/tools/transaction-links.ts dist/
git commit -m "refactor: migrate currencies, object-groups, transaction-links to defineTool

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 11: Migrate `exports.ts`

**Files:**
- Modify: `src/tools/exports.ts`

`exports.ts` uses a loop (`for (const { name, title, entity, hasDates } of EXPORT_TOOLS)`) to register tools dynamically. All export tools return `string` (from `client.getText`). Only `export_transactions` has `hasDates: true` (uses `start`/`end`).

- [ ] **Step 1: Update imports**

```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { FireflyClient } from '../client.js';
import type { QueryParams } from '../types.js';
import { READ_ANNOTATIONS } from './_annotations.js';
import { defineTool, dateSchema } from './_helpers.js';
```

Note: only `READ_ANNOTATIONS` is needed (no write/update/delete in this file).

- [ ] **Step 2: Replace the `registerExportTools` function body**

The loop body changes from `server.registerTool(...)` to `defineTool(...)`, and `start`/`end` switch to `dateSchema.optional()`:

```typescript
export function registerExportTools(server: McpServer, client: FireflyClient): void {
  for (const { name, title, entity, hasDates } of EXPORT_TOOLS) {
    const inputSchema: Record<string, z.ZodTypeAny> = {};
    if (hasDates) {
      inputSchema['start'] = dateSchema.optional().describe('Start date (YYYY-MM-DD)');
      inputSchema['end'] = dateSchema.optional().describe('End date (YYYY-MM-DD)');
    }

    defineTool(server, name, {
      title,
      description: `Export all ${entity} as a CSV file. Returns raw CSV text.${hasDates ? ' Optionally filter by date range.' : ''}`,
      inputSchema,
      annotations: READ_ANNOTATIONS,
    }, ({ start, end }) =>
      exportEntity(client, entity, { start: start as string | undefined, end: end as string | undefined }));
  }
}
```

- [ ] **Step 3: Run tests and full suite**

```bash
npx vitest run src/tests/exports.test.ts && npm test
```

Expected: all pass.

- [ ] **Step 4: Build and commit**

```bash
npm run build
git add src/tools/exports.ts dist/
git commit -m "refactor: migrate exports.ts to defineTool

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## PHASE 2 — Focused fixes

---

### Task 12: Fix `makeReadOnlyProxy` `this`-binding (P3-3)

**Files:**
- Modify: `src/tools/index.ts`
- Modify: `src/tests/tool-filter.test.ts`

The bug: line 68 of `src/tools/index.ts` returns non-`registerTool` properties unbound. If the SDK calls any method on the proxy that depends on `this` (e.g. after a future SDK upgrade), it will fail with a wrong `this` context.

The fix: return functions bound to `target`.

- [ ] **Step 1: Export `makeReadOnlyProxy` so it can be unit-tested**

In `src/tools/index.ts`, change line 58 from:

```typescript
function makeReadOnlyProxy(server: McpServer): McpServer {
```

to:

```typescript
export function makeReadOnlyProxy(server: McpServer): McpServer {
```

- [ ] **Step 2: Write the failing test**

In `src/tests/tool-filter.test.ts`, update the existing import on line 4 to add `makeReadOnlyProxy`:

```typescript
import { registerAllTools, PRESETS, TOOL_GROUPS, makeReadOnlyProxy } from '../tools/index.js';
```

Then add this `describe` block at the end of the file:

```typescript
describe('makeReadOnlyProxy — this-binding', () => {
  it('non-registerTool methods are bound to the underlying server, not the proxy', () => {
    const inner = {
      value: 42,
      getValue(this: typeof inner) { return this.value; },
      registerTool: vi.fn(),
    };
    const proxy = makeReadOnlyProxy(inner as unknown as McpServer);
    const method = (proxy as unknown as typeof inner).getValue;
    expect(method()).toBe(42);
  });
});
```

- [ ] **Step 3: Run the test to confirm it fails**

```bash
npx vitest run src/tests/tool-filter.test.ts
```

Expected: the new test fails — in strict mode `this` is `undefined` when calling an unbound method, so `method()` throws `TypeError: Cannot read properties of undefined (reading 'value')`.

- [ ] **Step 4: Apply the fix**

In `src/tools/index.ts`, replace lines 66–68 (the `return` inside the `get` trap):

```typescript
// Before:
      return (target as unknown as Record<string | symbol, unknown>)[prop];
```

```typescript
// After:
      const v = (target as unknown as Record<string | symbol, unknown>)[prop];
      return typeof v === 'function' ? (v as (...args: unknown[]) => unknown).bind(target) : v;
```

The full `makeReadOnlyProxy` after the fix:

```typescript
export function makeReadOnlyProxy(server: McpServer): McpServer {
  return new Proxy(server, {
    get(target, prop) {
      if (prop === 'registerTool') {
        return (name: string, config: unknown, handler: unknown) => {
          if (isReadOnlyTool(name)) {
            (target.registerTool as (n: string, c: unknown, h: unknown) => void)(name, config, handler);
          }
        };
      }
      const v = (target as unknown as Record<string | symbol, unknown>)[prop];
      return typeof v === 'function' ? (v as (...args: unknown[]) => unknown).bind(target) : v;
    },
  });
}
```

- [ ] **Step 5: Run the test to confirm it passes**

```bash
npx vitest run src/tests/tool-filter.test.ts
```

Expected: all tool-filter tests pass, including the new one.

- [ ] **Step 6: Run full suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 7: Build and commit**

```bash
npm run build
git add src/tools/index.ts src/tests/tool-filter.test.ts dist/
git commit -m "fix: bind non-registerTool proxy methods to underlying server (P3-3)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 13: Drop `dist/` from git (P3-5)

**Files:**
- Modify: `.gitignore`
- Modify: `README.md` (git checkout install instructions)
- Modify: `CLAUDE.md` (dist policy note)

- [ ] **Step 1: Add `dist/` to `.gitignore`**

In `.gitignore`, find the comment on line 4 (`# Build artifacts (dist/ is committed so users can run without building)`) and replace lines 4–5 with:

```
# Build artifacts
dist/
```

- [ ] **Step 2: Remove dist/ from git tracking**

```bash
git rm -r --cached dist/
```

Expected: output lists ~dozen `rm 'dist/...'` lines. This stages the deletions without touching your filesystem.

- [ ] **Step 3: Update README.md git-checkout install instructions**

Find the section in `README.md` that describes running via git checkout (Option 4 or equivalent). Change the instructions from running `node dist/index.js` directly to first running `npm run build`:

The updated steps should read:

```markdown
**Option 4: Clone and run from source**
```bash
git clone https://github.com/daften/fireflyiii-mcp.git
cd fireflyiii-mcp
npm install
npm run build
node dist/index.js
```
```

- [ ] **Step 4: Update `CLAUDE.md` development notes section**

In `CLAUDE.md`, find the line:

```
- `dist/` is **committed to git**. Run `npm run build` and include `dist/` in commits that change source.
```

Replace with:

```
- `dist/` is **not committed to git** (it is in `.gitignore`). Run `npm run build` locally before testing with `node dist/index.js`. The npm publish workflow runs `prepublishOnly` which builds automatically.
```

Also in the "Build & Test Commands" section, find the note about dist/ and update accordingly.

Also in the "Adding a New Tool" section, find step 6 (`**Run `npm run build`** and commit source + dist together.`) and update to:

```
6. **Run `npm run build`** to verify no TypeScript errors. Commit only source files — `dist/` is gitignored.
```

Also in the "Releasing a New Version" section, find step 2 (`Run npm run build and commit the bump together with dist/.`) and update to:

```
2. Run `npm run build` and commit the version bump (source files only — `dist/` is gitignored).
```

Note: The TASKS.md acceptance criterion "CI prevents drift" is automatically satisfied by Option B — there is nothing to drift when `dist/` is not tracked. No CI step needed.

- [ ] **Step 5: Run tests (dist/ is gone from tracking but still exists on disk)**

```bash
npm test
```

Expected: all pass (the compiled JS in `dist/` on disk is still there; tests use ts imports via vitest, not dist/).

- [ ] **Step 6: Commit**

```bash
git add .gitignore README.md CLAUDE.md
git commit -m "chore: drop dist/ from git tracking (P3-5)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---
