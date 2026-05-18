# Roadmap Tasks 1–3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `search_transactions`, `create_split_transaction`, and full recurring transaction CRUD to the Firefly III MCP server.

**Architecture:** Two new fetch functions and tool registrations are added to `src/tools/transactions.ts`; a new `src/tools/recurring.ts` file handles all recurring transaction tools; `src/tools/index.ts` is updated to wire in the new file. All fetch functions follow the existing pattern: receive `client` as first arg, pipe through `unwrapList`/`unwrapSingle`, return plain objects. Tool registrations live in a `registerXxxTools(server, client)` function per file.

**Tech Stack:** TypeScript (ESM), `@modelcontextprotocol/sdk`, Zod, Vitest. Build with `npm run build` (tsc). Tests with `npm test` (vitest run).

---

### Task 1: `search_transactions` — fetch function + tool (TDD)

**Files:**
- Modify: `src/tests/transactions.test.ts`
- Modify: `src/tools/transactions.ts`

- [ ] **Step 1: Add failing test**

Append to `src/tests/transactions.test.ts`:

```typescript
describe('searchTransactions', () => {
  it('calls /search/transactions with query and pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    await searchTransactions(mockClient, { query: 'groceries', page: 1, limit: 20 });
    expect(mockClient.get).toHaveBeenCalledWith('/search/transactions', {
      query: 'groceries',
      page: 1,
      limit: 20,
    });
  });

  it('returns flat items with pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    const result = await searchTransactions(mockClient, { query: 'groceries' });
    expect(result.data[0]).toEqual({ description: 'Groceries', amount: '-45.00', date: '2026-01-15', id: '101' });
    expect(result.pagination).toEqual({ page: 1, totalPages: 3, total: 120 });
  });
});
```

Also update the import line at the top of the test file (line 3) to include `searchTransactions`:

```typescript
import { fetchTransactions, fetchTransaction, createTransaction, updateTransaction, deleteTransaction, searchTransactions } from '../tools/transactions.js';
```

- [ ] **Step 2: Run test — confirm it fails**

```bash
npx vitest run src/tests/transactions.test.ts 2>&1 | tail -20
```

Expected: Error — `searchTransactions` is not exported from `../tools/transactions.js`.

- [ ] **Step 3: Add `searchTransactions` fetch function and tool registration**

In `src/tools/transactions.ts`, add the fetch function after `deleteTransaction` (before the annotations block):

```typescript
export async function searchTransactions(
  client: FireflyClient,
  params: { query: string; page?: number; limit?: number }
): Promise<UnwrappedList> {
  const query: QueryParams = { query: params.query, page: params.page, limit: params.limit };
  const response = await client.get<JsonApiListResponse>('/search/transactions', query);
  return unwrapList(response);
}
```

In `registerTransactionTools`, add after the `delete_transaction` registration:

```typescript
  server.registerTool(
    'search_transactions',
    {
      title: 'Search Transactions',
      description: 'Search for transactions in Firefly III by keyword. Searches across descriptions, notes, and other fields.',
      inputSchema: {
        query: z.string().describe('Search query'),
        page: z.number().int().positive().optional().default(1).describe('Page number'),
        limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
      },
      annotations: READ_ANNOTATIONS,
    },
    async ({ query, page, limit }) => {
      try {
        const result = await searchTransactions(client, { query, page, limit });
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );
```

- [ ] **Step 4: Run test — confirm it passes**

```bash
npx vitest run src/tests/transactions.test.ts 2>&1 | tail -10
```

Expected: All tests pass, including the two new `searchTransactions` tests.

- [ ] **Step 5: Commit**

```bash
git add src/tools/transactions.ts src/tests/transactions.test.ts
git commit -m "feat: add search_transactions tool

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 2: `create_split_transaction` — fetch function + tool (TDD)

**Files:**
- Modify: `src/tests/transactions.test.ts`
- Modify: `src/tools/transactions.ts`

- [ ] **Step 1: Add failing tests**

Add import of `createSplitTransaction` to line 3 of `src/tests/transactions.test.ts`:

```typescript
import { fetchTransactions, fetchTransaction, createTransaction, updateTransaction, deleteTransaction, searchTransactions, createSplitTransaction } from '../tools/transactions.js';
```

Append to `src/tests/transactions.test.ts`:

```typescript
describe('createSplitTransaction', () => {
  it('posts to /transactions with shared fields copied into each split', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(writeSingleFixture);
    await createSplitTransaction(mockClient, {
      type: 'withdrawal',
      date: '2026-05-01',
      source_id: '1',
      splits: [
        { amount: '30.00', description: 'Groceries', category_name: 'Food' },
        { amount: '12.50', description: 'Cleaning supplies', category_name: 'Household' },
      ],
    });
    expect(mockClient.post).toHaveBeenCalledWith('/transactions', {
      apply_rules: true,
      fire_webhooks: true,
      transactions: [
        { type: 'withdrawal', date: '2026-05-01', source_id: '1', amount: '30.00', description: 'Groceries', category_name: 'Food' },
        { type: 'withdrawal', date: '2026-05-01', source_id: '1', amount: '12.50', description: 'Cleaning supplies', category_name: 'Household' },
      ],
    });
  });

  it('includes group_title when provided', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(writeSingleFixture);
    await createSplitTransaction(mockClient, {
      type: 'withdrawal',
      date: '2026-05-01',
      group_title: 'Supermarket run',
      splits: [
        { amount: '30.00', description: 'Groceries' },
        { amount: '12.50', description: 'Cleaning supplies' },
      ],
    });
    expect(mockClient.post).toHaveBeenCalledWith('/transactions', expect.objectContaining({
      group_title: 'Supermarket run',
    }));
  });

  it('returns unwrapped single', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(writeSingleFixture);
    const result = await createSplitTransaction(mockClient, {
      type: 'withdrawal',
      date: '2026-05-01',
      splits: [
        { amount: '30.00', description: 'Groceries' },
        { amount: '12.50', description: 'Cleaning supplies' },
      ],
    });
    expect(result).toEqual({ description: 'Groceries', amount: '42.50', type: 'withdrawal', id: '5' });
  });
});
```

- [ ] **Step 2: Run test — confirm it fails**

```bash
npx vitest run src/tests/transactions.test.ts 2>&1 | tail -20
```

Expected: Error — `createSplitTransaction` is not exported.

- [ ] **Step 3: Add `createSplitTransaction` fetch function and tool registration**

In `src/tools/transactions.ts`, add after `searchTransactions`:

```typescript
export async function createSplitTransaction(
  client: FireflyClient,
  params: {
    type: 'withdrawal' | 'deposit' | 'transfer';
    date: string;
    source_id?: string;
    destination_id?: string;
    currency_code?: string;
    group_title?: string;
    splits: Array<{
      amount: string;
      description: string;
      category_name?: string;
      budget_id?: string;
      tags?: string[];
      notes?: string;
    }>;
  }
): Promise<UnwrappedSingle> {
  const transactions = params.splits.map(split => {
    const item: Record<string, unknown> = {
      type: params.type,
      date: params.date,
      amount: split.amount,
      description: split.description,
    };
    if (params.source_id !== undefined) item.source_id = params.source_id;
    if (params.destination_id !== undefined) item.destination_id = params.destination_id;
    if (params.currency_code !== undefined) item.currency_code = params.currency_code;
    if (split.category_name !== undefined) item.category_name = split.category_name;
    if (split.budget_id !== undefined) item.budget_id = split.budget_id;
    if (split.tags !== undefined) item.tags = split.tags;
    if (split.notes !== undefined) item.notes = split.notes;
    return item;
  });
  const body: Record<string, unknown> = { apply_rules: true, fire_webhooks: true, transactions };
  if (params.group_title !== undefined) body.group_title = params.group_title;
  const response = await client.post<JsonApiSingleResponse>('/transactions', body);
  return unwrapSingle(response);
}
```

In `registerTransactionTools`, add after the `search_transactions` registration:

```typescript
  server.registerTool(
    'create_split_transaction',
    {
      title: 'Create Split Transaction',
      description: 'Create a split transaction in Firefly III — one receipt divided across multiple categories, budgets, or descriptions. All splits share the same type, date, and accounts. Use get_accounts to find source and destination account IDs.',
      inputSchema: {
        type: z.enum(['withdrawal', 'deposit', 'transfer']).describe('Transaction type (shared across all splits)'),
        date: z.string().describe('Transaction date (YYYY-MM-DD, shared across all splits)'),
        source_id: z.string().optional().describe('Source account ID (required for withdrawals and transfers)'),
        destination_id: z.string().optional().describe('Destination account ID (required for deposits and transfers)'),
        currency_code: z.string().optional().describe('Currency code (e.g. EUR, USD). Defaults to account currency.'),
        group_title: z.string().optional().describe('Optional label for the transaction group'),
        splits: z.array(z.object({
          amount: z.string().describe('Amount as a positive number string, e.g. "42.50"'),
          description: z.string().describe('Description for this split'),
          category_name: z.string().optional().describe('Category name'),
          budget_id: z.string().optional().describe('Budget ID — use get_budgets to find valid IDs'),
          tags: z.array(z.string()).optional().describe('Tags'),
          notes: z.string().optional().describe('Notes'),
        })).min(2).describe('At least 2 splits required'),
      },
      annotations: WRITE_ANNOTATIONS,
    },
    async ({ type, date, source_id, destination_id, currency_code, group_title, splits }) => {
      try {
        const result = await createSplitTransaction(client, { type, date, source_id, destination_id, currency_code, group_title, splits });
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );
```

- [ ] **Step 4: Run test — confirm it passes**

```bash
npx vitest run src/tests/transactions.test.ts 2>&1 | tail -10
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/tools/transactions.ts src/tests/transactions.test.ts
git commit -m "feat: add create_split_transaction tool

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Recurring read fetch functions — `fetchRecurrences` + `fetchRecurrence` (TDD)

**Files:**
- Create: `src/tests/recurring.test.ts`
- Create: `src/tools/recurring.ts`

- [ ] **Step 1: Create failing test file**

Create `src/tests/recurring.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import type { FireflyClient } from '../client.js';
import { fetchRecurrences, fetchRecurrence } from '../tools/recurring.js';

const mockClient = { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } as unknown as FireflyClient;

const listFixture = {
  data: [
    {
      id: '1',
      type: 'recurrences',
      attributes: { title: 'Monthly rent', type: 'withdrawal', first_date: '2026-06-01', active: true },
      links: { self: 'https://firefly.example.com/api/v1/recurrences/1' },
    },
  ],
  meta: { pagination: { current_page: 1, total_pages: 1, total: 1 } },
};

const singleFixture = {
  data: {
    id: '1',
    type: 'recurrences',
    attributes: { title: 'Monthly rent', type: 'withdrawal', first_date: '2026-06-01', active: true },
    links: { self: 'https://firefly.example.com/api/v1/recurrences/1' },
  },
};

describe('fetchRecurrences', () => {
  it('calls /recurrences with pagination params', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    await fetchRecurrences(mockClient, { page: 1, limit: 20 });
    expect(mockClient.get).toHaveBeenCalledWith('/recurrences', { page: 1, limit: 20 });
  });

  it('returns flat items with pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    const result = await fetchRecurrences(mockClient, { page: 1, limit: 50 });
    expect(result.data[0]).toEqual({ title: 'Monthly rent', type: 'withdrawal', first_date: '2026-06-01', active: true, id: '1' });
    expect(result.pagination).toEqual({ page: 1, totalPages: 1, total: 1 });
  });
});

describe('fetchRecurrence', () => {
  it('calls /recurrences/:id', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(singleFixture);
    await fetchRecurrence(mockClient, '1');
    expect(mockClient.get).toHaveBeenCalledWith('/recurrences/1');
  });

  it('returns flat item', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(singleFixture);
    const result = await fetchRecurrence(mockClient, '1');
    expect(result).toEqual({ title: 'Monthly rent', type: 'withdrawal', first_date: '2026-06-01', active: true, id: '1' });
  });
});
```

- [ ] **Step 2: Run test — confirm it fails**

```bash
npx vitest run src/tests/recurring.test.ts 2>&1 | tail -20
```

Expected: Error — `../tools/recurring.js` not found.

- [ ] **Step 3: Create `src/tools/recurring.ts` with read fetch functions**

Create `src/tools/recurring.ts`:

```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { type FireflyClient, formatError } from '../client.js';
import type { QueryParams } from '../types.js';
import { unwrapList, unwrapSingle, type JsonApiListResponse, type JsonApiSingleResponse, type UnwrappedList, type UnwrappedSingle } from '../transform.js';

export async function fetchRecurrences(
  client: FireflyClient,
  params: { page?: number; limit?: number }
): Promise<UnwrappedList> {
  const query: QueryParams = { page: params.page, limit: params.limit };
  const response = await client.get<JsonApiListResponse>('/recurrences', query);
  return unwrapList(response);
}

export async function fetchRecurrence(client: FireflyClient, id: string): Promise<UnwrappedSingle> {
  const response = await client.get<JsonApiSingleResponse>(`/recurrences/${id}`);
  return unwrapSingle(response);
}

export function registerRecurringTools(_server: McpServer, _client: FireflyClient): void {
  // tool registrations added in Task 5
}
```

- [ ] **Step 4: Run test — confirm it passes**

```bash
npx vitest run src/tests/recurring.test.ts 2>&1 | tail -10
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/tools/recurring.ts src/tests/recurring.test.ts
git commit -m "feat: add recurring transaction read functions (fetchRecurrences, fetchRecurrence)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 4: Recurring write fetch functions — `createRecurrence`, `updateRecurrence`, `deleteRecurrence` (TDD)

**Files:**
- Modify: `src/tests/recurring.test.ts`
- Modify: `src/tools/recurring.ts`

- [ ] **Step 1: Add failing tests**

Update the import line at the top of `src/tests/recurring.test.ts` to include write functions:

```typescript
import { fetchRecurrences, fetchRecurrence, createRecurrence, updateRecurrence, deleteRecurrence } from '../tools/recurring.js';
```

Add a write fixture and new `describe` blocks at the end of `src/tests/recurring.test.ts`:

```typescript
const writeSingleFixture = {
  data: {
    id: '2',
    type: 'recurrences',
    attributes: { title: 'Weekly groceries', type: 'withdrawal', first_date: '2026-06-07', active: true },
    links: {},
  },
};

describe('createRecurrence', () => {
  it('posts to /recurrences with correct body structure', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(writeSingleFixture);
    await createRecurrence(mockClient, {
      type: 'withdrawal',
      title: 'Monthly rent',
      first_date: '2026-06-01',
      repeat_type: 'monthly',
      repeat_moment: '1',
      amount: '950.00',
      transaction_description: 'Rent',
      source_id: '1',
      destination_id: '5',
      weekend: 4,
    });
    expect(mockClient.post).toHaveBeenCalledWith('/recurrences', {
      type: 'withdrawal',
      title: 'Monthly rent',
      first_date: '2026-06-01',
      repeat_until: null,
      apply_rules: true,
      active: true,
      repetitions: [{ type: 'monthly', moment: '1', weekend: 4 }],
      transactions: [{ description: 'Rent', amount: '950.00', source_id: '1', destination_id: '5' }],
    });
  });

  it('includes optional fields when provided', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(writeSingleFixture);
    await createRecurrence(mockClient, {
      type: 'withdrawal',
      title: 'Rent',
      first_date: '2026-06-01',
      description: 'Monthly rent recurrence',
      notes: 'Pay on time',
      repeat_until: '2027-06-01',
      repeat_type: 'monthly',
      repeat_moment: '1',
      skip: 0,
      amount: '950.00',
      transaction_description: 'Rent',
      source_id: '1',
      destination_id: '5',
      category_id: '12',
      budget_id: '3',
    });
    expect(mockClient.post).toHaveBeenCalledWith('/recurrences', expect.objectContaining({
      description: 'Monthly rent recurrence',
      notes: 'Pay on time',
      repeat_until: '2027-06-01',
      repetitions: [expect.objectContaining({ skip: 0 })],
      transactions: [expect.objectContaining({ category_id: '12', budget_id: '3' })],
    }));
  });

  it('returns unwrapped single', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(writeSingleFixture);
    const result = await createRecurrence(mockClient, {
      type: 'withdrawal',
      title: 'Weekly groceries',
      first_date: '2026-06-07',
      repeat_type: 'weekly',
      repeat_moment: '6',
      amount: '80.00',
      transaction_description: 'Groceries',
      source_id: '1',
      destination_id: '2',
    });
    expect(result).toEqual({ title: 'Weekly groceries', type: 'withdrawal', first_date: '2026-06-07', active: true, id: '2' });
  });
});

describe('updateRecurrence', () => {
  it('puts to /recurrences/:id with only changed header fields', async () => {
    mockClient.put = vi.fn().mockResolvedValueOnce(writeSingleFixture);
    await updateRecurrence(mockClient, '1', { title: 'Updated rent', active: false });
    expect(mockClient.put).toHaveBeenCalledWith('/recurrences/1', { title: 'Updated rent', active: false });
  });

  it('includes repetitions array when repeat fields are changed', async () => {
    mockClient.put = vi.fn().mockResolvedValueOnce(writeSingleFixture);
    await updateRecurrence(mockClient, '1', { repeat_type: 'weekly', repeat_moment: '5' });
    expect(mockClient.put).toHaveBeenCalledWith('/recurrences/1', {
      repetitions: [{ type: 'weekly', moment: '5' }],
    });
  });

  it('includes transactions array when transaction fields are changed', async () => {
    mockClient.put = vi.fn().mockResolvedValueOnce(writeSingleFixture);
    await updateRecurrence(mockClient, '1', { amount: '1000.00', transaction_description: 'Updated rent' });
    expect(mockClient.put).toHaveBeenCalledWith('/recurrences/1', {
      transactions: [{ amount: '1000.00', description: 'Updated rent' }],
    });
  });

  it('returns unwrapped single', async () => {
    mockClient.put = vi.fn().mockResolvedValueOnce(writeSingleFixture);
    const result = await updateRecurrence(mockClient, '1', { active: false });
    expect(result).toEqual({ title: 'Weekly groceries', type: 'withdrawal', first_date: '2026-06-07', active: true, id: '2' });
  });
});

describe('deleteRecurrence', () => {
  it('calls delete on /recurrences/:id', async () => {
    mockClient.delete = vi.fn().mockResolvedValueOnce(undefined);
    await deleteRecurrence(mockClient, '1');
    expect(mockClient.delete).toHaveBeenCalledWith('/recurrences/1');
  });

  it('returns deleted confirmation', async () => {
    mockClient.delete = vi.fn().mockResolvedValueOnce(undefined);
    const result = await deleteRecurrence(mockClient, '1');
    expect(result).toEqual({ deleted: true, id: '1' });
  });
});
```

- [ ] **Step 2: Run test — confirm new tests fail**

```bash
npx vitest run src/tests/recurring.test.ts 2>&1 | tail -20
```

Expected: 4 existing tests pass, new tests fail with `createRecurrence is not a function` (or similar).

- [ ] **Step 3: Add write fetch functions to `src/tools/recurring.ts`**

Add after `fetchRecurrence` (before `registerRecurringTools`):

```typescript
export async function createRecurrence(
  client: FireflyClient,
  params: {
    type: 'withdrawal' | 'deposit' | 'transfer';
    title: string;
    description?: string;
    notes?: string;
    first_date: string;
    repeat_until?: string | null;
    nr_of_repetitions?: number;
    apply_rules?: boolean;
    active?: boolean;
    repeat_type: 'daily' | 'weekly' | 'monthly' | 'ndom' | 'yearly';
    repeat_moment: string;
    skip?: number;
    weekend?: number;
    amount: string;
    transaction_description: string;
    source_id: string;
    destination_id: string;
    category_id?: string;
    budget_id?: string;
    currency_code?: string;
    tags?: string[];
    transaction_notes?: string;
  }
): Promise<UnwrappedSingle> {
  const repetition: Record<string, unknown> = { type: params.repeat_type, moment: params.repeat_moment };
  if (params.skip !== undefined) repetition.skip = params.skip;
  if (params.weekend !== undefined) repetition.weekend = params.weekend;

  const transaction: Record<string, unknown> = {
    description: params.transaction_description,
    amount: params.amount,
    source_id: params.source_id,
    destination_id: params.destination_id,
  };
  if (params.category_id !== undefined) transaction.category_id = params.category_id;
  if (params.budget_id !== undefined) transaction.budget_id = params.budget_id;
  if (params.currency_code !== undefined) transaction.currency_code = params.currency_code;
  if (params.tags !== undefined) transaction.tags = params.tags;
  if (params.transaction_notes !== undefined) transaction.notes = params.transaction_notes;

  const body: Record<string, unknown> = {
    type: params.type,
    title: params.title,
    first_date: params.first_date,
    repeat_until: params.repeat_until ?? null,
    apply_rules: params.apply_rules ?? true,
    active: params.active ?? true,
    repetitions: [repetition],
    transactions: [transaction],
  };
  if (params.description !== undefined) body.description = params.description;
  if (params.notes !== undefined) body.notes = params.notes;
  if (params.nr_of_repetitions !== undefined) body.nr_of_repetitions = params.nr_of_repetitions;

  const response = await client.post<JsonApiSingleResponse>('/recurrences', body);
  return unwrapSingle(response);
}

export async function updateRecurrence(
  client: FireflyClient,
  id: string,
  params: {
    type?: 'withdrawal' | 'deposit' | 'transfer';
    title?: string;
    description?: string;
    notes?: string;
    first_date?: string;
    repeat_until?: string | null;
    nr_of_repetitions?: number;
    apply_rules?: boolean;
    active?: boolean;
    repeat_type?: 'daily' | 'weekly' | 'monthly' | 'ndom' | 'yearly';
    repeat_moment?: string;
    skip?: number;
    weekend?: number;
    amount?: string;
    transaction_description?: string;
    source_id?: string;
    destination_id?: string;
    category_id?: string;
    budget_id?: string;
    currency_code?: string;
    tags?: string[];
    transaction_notes?: string;
  }
): Promise<UnwrappedSingle> {
  const body: Record<string, unknown> = {};
  if (params.type !== undefined) body.type = params.type;
  if (params.title !== undefined) body.title = params.title;
  if (params.description !== undefined) body.description = params.description;
  if (params.notes !== undefined) body.notes = params.notes;
  if (params.first_date !== undefined) body.first_date = params.first_date;
  if (params.repeat_until !== undefined) body.repeat_until = params.repeat_until;
  if (params.nr_of_repetitions !== undefined) body.nr_of_repetitions = params.nr_of_repetitions;
  if (params.apply_rules !== undefined) body.apply_rules = params.apply_rules;
  if (params.active !== undefined) body.active = params.active;

  const hasRepetitionFields = params.repeat_type !== undefined || params.repeat_moment !== undefined
    || params.skip !== undefined || params.weekend !== undefined;
  if (hasRepetitionFields) {
    const repetition: Record<string, unknown> = {};
    if (params.repeat_type !== undefined) repetition.type = params.repeat_type;
    if (params.repeat_moment !== undefined) repetition.moment = params.repeat_moment;
    if (params.skip !== undefined) repetition.skip = params.skip;
    if (params.weekend !== undefined) repetition.weekend = params.weekend;
    body.repetitions = [repetition];
  }

  const hasTransactionFields = params.amount !== undefined || params.transaction_description !== undefined
    || params.source_id !== undefined || params.destination_id !== undefined
    || params.category_id !== undefined || params.budget_id !== undefined
    || params.currency_code !== undefined || params.tags !== undefined
    || params.transaction_notes !== undefined;
  if (hasTransactionFields) {
    const transaction: Record<string, unknown> = {};
    if (params.amount !== undefined) transaction.amount = params.amount;
    if (params.transaction_description !== undefined) transaction.description = params.transaction_description;
    if (params.source_id !== undefined) transaction.source_id = params.source_id;
    if (params.destination_id !== undefined) transaction.destination_id = params.destination_id;
    if (params.category_id !== undefined) transaction.category_id = params.category_id;
    if (params.budget_id !== undefined) transaction.budget_id = params.budget_id;
    if (params.currency_code !== undefined) transaction.currency_code = params.currency_code;
    if (params.tags !== undefined) transaction.tags = params.tags;
    if (params.transaction_notes !== undefined) transaction.notes = params.transaction_notes;
    body.transactions = [transaction];
  }

  const response = await client.put<JsonApiSingleResponse>(`/recurrences/${id}`, body);
  return unwrapSingle(response);
}

export async function deleteRecurrence(
  client: FireflyClient,
  id: string
): Promise<{ deleted: true; id: string }> {
  await client.delete(`/recurrences/${id}`);
  return { deleted: true, id };
}
```

- [ ] **Step 4: Run test — confirm all tests pass**

```bash
npx vitest run src/tests/recurring.test.ts 2>&1 | tail -10
```

Expected: All 12 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/tools/recurring.ts src/tests/recurring.test.ts
git commit -m "feat: add recurring transaction write functions (create, update, delete)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 5: Register recurring tools + wire into `src/tools/index.ts`

**Files:**
- Modify: `src/tools/recurring.ts`
- Modify: `src/tools/index.ts`

- [ ] **Step 1: Replace stub `registerRecurringTools` with full implementation**

Replace the stub `registerRecurringTools` function in `src/tools/recurring.ts` with:

```typescript
const READ_ANNOTATIONS = {
  readOnlyHint: true,
  openWorldHint: true,
  idempotentHint: true,
} as const;

const WRITE_ANNOTATIONS = { openWorldHint: true } as const;
const UPDATE_ANNOTATIONS = { openWorldHint: true, idempotentHint: true } as const;
const DELETE_ANNOTATIONS = { destructiveHint: true, openWorldHint: true } as const;

export function registerRecurringTools(server: McpServer, client: FireflyClient): void {
  server.registerTool(
    'get_recurring',
    {
      title: 'Get Recurring Transactions',
      description: 'Get all recurring transactions from Firefly III.',
      inputSchema: {
        page: z.number().int().positive().optional().default(1).describe('Page number'),
        limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
      },
      annotations: READ_ANNOTATIONS,
    },
    async ({ page, limit }) => {
      try {
        const result = await fetchRecurrences(client, { page, limit });
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );

  server.registerTool(
    'get_recurrence',
    {
      title: 'Get Recurring Transaction',
      description: 'Get a single recurring transaction by its numeric ID. Use get_recurring to find valid IDs.',
      inputSchema: {
        id: z.string().describe('Recurrence ID'),
      },
      annotations: READ_ANNOTATIONS,
    },
    async ({ id }) => {
      try {
        const result = await fetchRecurrence(client, id);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );

  server.registerTool(
    'create_recurring',
    {
      title: 'Create Recurring Transaction',
      description: 'Create a new recurring transaction in Firefly III. Use get_accounts to find source and destination account IDs. Use get_categories to find category IDs.',
      inputSchema: {
        type: z.enum(['withdrawal', 'deposit', 'transfer']).describe('Transaction type for all generated transactions'),
        title: z.string().describe('Name of the recurring transaction'),
        description: z.string().optional().describe('Description of the recurrence (not the individual transactions)'),
        notes: z.string().optional().describe('Notes'),
        first_date: z.string().describe('Date of first occurrence (YYYY-MM-DD, must be in the future)'),
        repeat_until: z.string().nullable().optional().describe('Stop after this date (YYYY-MM-DD). Omit or pass null for no end date.'),
        nr_of_repetitions: z.number().int().positive().optional().describe('Stop after N occurrences. Do not combine with repeat_until.'),
        apply_rules: z.boolean().optional().default(true).describe('Apply rules to generated transactions'),
        active: z.boolean().optional().default(true).describe('Whether the recurrence is active'),
        repeat_type: z.enum(['daily', 'weekly', 'monthly', 'ndom', 'yearly']).describe('Repetition frequency'),
        repeat_moment: z.string().describe('Repetition moment: empty string for daily; 1–7 (Mon–Sun) for weekly; 1–31 for monthly; "week,day" e.g. "2,3" for ndom (2nd Wednesday); YYYY-MM-DD for yearly (year value ignored)'),
        skip: z.number().int().min(0).optional().describe('Skip every N occurrences (0 = none, 1 = every other)'),
        weekend: z.number().int().min(1).max(4).optional().describe('Weekend handling: 1=do nothing, 2=skip (no transaction), 3=previous Friday, 4=next Monday'),
        amount: z.string().describe('Transaction amount as a positive number string, e.g. "950.00"'),
        transaction_description: z.string().describe('Description of each generated transaction'),
        source_id: z.string().describe('Source account ID'),
        destination_id: z.string().describe('Destination account ID'),
        category_id: z.string().optional().describe('Category ID — use get_categories to find valid IDs'),
        budget_id: z.string().optional().describe('Budget ID — use get_budgets to find valid IDs'),
        currency_code: z.string().optional().describe('Currency code (e.g. EUR, USD)'),
        tags: z.array(z.string()).optional().describe('Tags'),
        transaction_notes: z.string().optional().describe('Notes for each generated transaction'),
      },
      annotations: WRITE_ANNOTATIONS,
    },
    async (params) => {
      try {
        const result = await createRecurrence(client, params);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );

  server.registerTool(
    'update_recurring',
    {
      title: 'Update Recurring Transaction',
      description: 'Update an existing recurring transaction in Firefly III. Only fields provided will be changed. Use get_recurrence to confirm the ID before updating.',
      inputSchema: {
        id: z.string().describe('Recurrence ID — use get_recurring to find valid IDs'),
        type: z.enum(['withdrawal', 'deposit', 'transfer']).optional().describe('Transaction type'),
        title: z.string().optional().describe('Name of the recurring transaction'),
        description: z.string().optional().describe('Description of the recurrence'),
        notes: z.string().optional().describe('Notes'),
        first_date: z.string().optional().describe('Date of first occurrence (YYYY-MM-DD)'),
        repeat_until: z.string().nullable().optional().describe('Stop after this date (YYYY-MM-DD). Pass null to remove end date.'),
        nr_of_repetitions: z.number().int().positive().optional().describe('Stop after N occurrences'),
        apply_rules: z.boolean().optional().describe('Apply rules to generated transactions'),
        active: z.boolean().optional().describe('Whether the recurrence is active'),
        repeat_type: z.enum(['daily', 'weekly', 'monthly', 'ndom', 'yearly']).optional().describe('Repetition frequency'),
        repeat_moment: z.string().optional().describe('Repetition moment (see create_recurring for format details)'),
        skip: z.number().int().min(0).optional().describe('Skip every N occurrences'),
        weekend: z.number().int().min(1).max(4).optional().describe('Weekend handling: 1=do nothing, 2=skip, 3=previous Friday, 4=next Monday'),
        amount: z.string().optional().describe('Transaction amount'),
        transaction_description: z.string().optional().describe('Description of each generated transaction'),
        source_id: z.string().optional().describe('Source account ID'),
        destination_id: z.string().optional().describe('Destination account ID'),
        category_id: z.string().optional().describe('Category ID'),
        budget_id: z.string().optional().describe('Budget ID'),
        currency_code: z.string().optional().describe('Currency code'),
        tags: z.array(z.string()).optional().describe('Tags'),
        transaction_notes: z.string().optional().describe('Notes for each generated transaction'),
      },
      annotations: UPDATE_ANNOTATIONS,
    },
    async ({ id, ...params }) => {
      try {
        const result = await updateRecurrence(client, id, params);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );

  server.registerTool(
    'delete_recurring',
    {
      title: 'Delete Recurring Transaction',
      description: 'Permanently delete a recurring transaction from Firefly III. **This action cannot be undone.** This deletes the recurrence schedule only — previously generated transactions are not affected. Use get_recurrence to confirm before deleting.',
      inputSchema: {
        id: z.string().describe('Recurrence ID — use get_recurring to find valid IDs'),
      },
      annotations: DELETE_ANNOTATIONS,
    },
    async ({ id }) => {
      try {
        const result = await deleteRecurrence(client, id);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );
}
```

- [ ] **Step 2: Wire into `src/tools/index.ts`**

Add to `src/tools/index.ts`:

```typescript
import { registerRecurringTools } from './recurring.js';
```

And add to `registerAllTools`:

```typescript
  registerRecurringTools(server, client);
```

The full updated `src/tools/index.ts`:

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
import { registerRecurringTools } from './recurring.js';

export function registerAllTools(server: McpServer, client: FireflyClient): void {
  registerAccountTools(server, client);
  registerTransactionTools(server, client);
  registerBudgetTools(server, client);
  registerCategoryTools(server, client);
  registerBillTools(server, client);
  registerPiggyBankTools(server, client);
  registerReportTools(server, client);
  registerRecurringTools(server, client);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/tools/recurring.ts src/tools/index.ts
git commit -m "feat: register recurring transaction tools and wire into server

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 6: Build, full test suite, commit dist

**Files:**
- Modify: `dist/` (compiled output)

- [ ] **Step 1: Run full test suite**

```bash
npm test 2>&1 | tail -20
```

Expected: All tests pass across all test files (transactions, recurring, and existing suites).

- [ ] **Step 2: Build**

```bash
npm run build 2>&1 | tail -20
```

Expected: No errors. `dist/index.js` updated.

- [ ] **Step 3: Commit dist**

```bash
git add dist/
git commit -m "chore: rebuild dist for roadmap tasks 1–3 (split tx, search, recurring)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```
