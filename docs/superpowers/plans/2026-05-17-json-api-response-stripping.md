# JSON:API Response Stripping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strip JSON:API envelopes in all fetch functions so Claude receives flat, compact data instead of raw API responses.

**Architecture:** A new `src/transform.ts` exports three pure functions (`unwrapList`, `unwrapSingle`, `cleanSummary`) plus their TypeScript types. Each fetch function imports the appropriate transform and calls it on the raw `client.get()` result before returning. Tool handlers in `registerTool` callbacks are unchanged.

**Tech Stack:** TypeScript (ESM, strict), Vitest, Node 18+, `@modelcontextprotocol/sdk` v1.29.0

**Spec:** `docs/superpowers/specs/2026-05-17-json-api-response-stripping-design.md`

---

### Task 1: Create `src/transform.ts` and `src/tests/transform.test.ts` (TDD)

**Files:**
- Create: `src/transform.ts`
- Create: `src/tests/transform.test.ts`

- [ ] **Step 1: Write failing tests in `src/tests/transform.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { unwrapList, unwrapSingle, cleanSummary } from '../transform.js';
import type { JsonApiListResponse, JsonApiSingleResponse, RawSummaryItem } from '../transform.js';

const listFixture: JsonApiListResponse = {
  data: [
    {
      id: '240',
      type: 'accounts',
      attributes: { name: 'Checking', current_balance: '1234.56', active: true },
      links: { self: 'https://firefly.example.com/api/v1/accounts/240', '0': { rel: 'self', uri: '/accounts/240' } },
    },
  ],
  meta: {
    pagination: { current_page: 1, total_pages: 52, total: 2580 },
  },
};

const singleFixture: JsonApiSingleResponse = {
  data: {
    id: '240',
    type: 'accounts',
    attributes: { name: 'Checking', current_balance: '1234.56', active: true },
    links: { self: 'https://firefly.example.com/api/v1/accounts/240' },
  },
};

const summaryFixture: RawSummaryItem[] = [
  {
    key: 'balance-in-EUR',
    value: {
      key: 'balance-in-EUR',
      title: 'Balance (€)',
      monetary_value: '8818.16',
      currency_id: '1',
      currency_code: 'EUR',
      currency_symbol: '€',
      currency_decimal_places: 2,
      value_parsed: '€8,818.16',
      local_icon: 'balance-scale',
      sub_title: '-€20,448.98 + €29,267.14',
    },
  },
];

describe('unwrapList', () => {
  it('flattens id and attributes, strips type and links', () => {
    const result = unwrapList(listFixture);
    expect(result.data).toEqual([
      { id: '240', name: 'Checking', current_balance: '1234.56', active: true },
    ]);
  });

  it('extracts compact pagination', () => {
    const result = unwrapList(listFixture);
    expect(result.pagination).toEqual({ page: 1, totalPages: 52, total: 2580 });
  });

  it('sets pagination to undefined when meta is absent', () => {
    const result = unwrapList({ data: [] });
    expect(result.pagination).toBeUndefined();
  });

  it('sets pagination to undefined when meta.pagination is absent', () => {
    const result = unwrapList({ data: [], meta: {} });
    expect(result.pagination).toBeUndefined();
  });
});

describe('unwrapSingle', () => {
  it('merges id with attributes, strips type and links', () => {
    const result = unwrapSingle(singleFixture);
    expect(result).toEqual({ id: '240', name: 'Checking', current_balance: '1234.56', active: true });
  });
});

describe('cleanSummary', () => {
  it('keeps the six useful fields', () => {
    const result = cleanSummary(summaryFixture);
    expect(result).toEqual([
      {
        key: 'balance-in-EUR',
        value: {
          key: 'balance-in-EUR',
          title: 'Balance (€)',
          monetary_value: '8818.16',
          currency_id: '1',
          currency_code: 'EUR',
          value_parsed: '€8,818.16',
        },
      },
    ]);
  });

  it('drops UI-only fields', () => {
    const result = cleanSummary(summaryFixture);
    expect(result[0].value).not.toHaveProperty('local_icon');
    expect(result[0].value).not.toHaveProperty('sub_title');
    expect(result[0].value).not.toHaveProperty('currency_symbol');
    expect(result[0].value).not.toHaveProperty('currency_decimal_places');
  });
});
```

- [ ] **Step 2: Run tests — expect them to fail**

```bash
npm test src/tests/transform.test.ts
```

Expected: FAIL with `Cannot find module '../transform.js'`

- [ ] **Step 3: Implement `src/transform.ts`**

```typescript
export interface JsonApiItem {
  id: string;
  type: string;
  attributes: Record<string, unknown>;
  links?: unknown;
}

export interface JsonApiListResponse {
  data: JsonApiItem[];
  meta?: {
    pagination?: {
      current_page: number;
      total_pages: number;
      total: number;
    };
  };
}

export interface JsonApiSingleResponse {
  data: JsonApiItem;
}

export interface RawSummaryItem {
  key: string;
  value: Record<string, unknown>;
}

export interface CleanSummaryItem {
  key: string;
  value: {
    key: string;
    title: string;
    monetary_value: string;
    currency_id: string;
    currency_code: string;
    value_parsed: string;
  };
}

export interface UnwrappedList {
  data: Array<{ id: string } & Record<string, unknown>>;
  pagination?: { page: number; totalPages: number; total: number };
}

export type UnwrappedSingle = { id: string } & Record<string, unknown>;

export function unwrapList(response: JsonApiListResponse): UnwrappedList {
  return {
    data: response.data.map(item => ({ id: item.id, ...item.attributes })),
    pagination: response.meta?.pagination
      ? {
          page: response.meta.pagination.current_page,
          totalPages: response.meta.pagination.total_pages,
          total: response.meta.pagination.total,
        }
      : undefined,
  };
}

export function unwrapSingle(response: JsonApiSingleResponse): UnwrappedSingle {
  return { id: response.data.id, ...response.data.attributes };
}

export function cleanSummary(response: RawSummaryItem[]): CleanSummaryItem[] {
  return response.map(item => ({
    key: item.key,
    value: {
      key: item.value['key'] as string,
      title: item.value['title'] as string,
      monetary_value: item.value['monetary_value'] as string,
      currency_id: item.value['currency_id'] as string,
      currency_code: item.value['currency_code'] as string,
      value_parsed: item.value['value_parsed'] as string,
    },
  }));
}
```

- [ ] **Step 4: Run tests — expect them to pass**

```bash
npm test src/tests/transform.test.ts
```

Expected: all 8 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/transform.ts src/tests/transform.test.ts
git commit -m "feat: add transform functions for JSON:API response stripping

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Apply transforms to `accounts.ts` + update `accounts.test.ts`

**Files:**
- Modify: `src/tools/accounts.ts`
- Modify: `src/tests/accounts.test.ts`

- [ ] **Step 1: Update `src/tools/accounts.ts`**

Replace the two fetch functions (leave `registerAccountTools` unchanged):

```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { type FireflyClient, formatError } from '../client.js';
import type { QueryParams } from '../types.js';
import { unwrapList, unwrapSingle } from '../transform.js';
import type { JsonApiListResponse, JsonApiSingleResponse, UnwrappedList, UnwrappedSingle } from '../transform.js';

export async function fetchAccounts(
  client: FireflyClient,
  params: { type?: string; page?: number; limit?: number }
): Promise<UnwrappedList> {
  const query: QueryParams = { page: params.page, limit: params.limit };
  if (params.type && params.type !== 'all') query['type'] = params.type;
  const response = await client.get<JsonApiListResponse>('/accounts', query);
  return unwrapList(response);
}

export async function fetchAccount(client: FireflyClient, id: string): Promise<UnwrappedSingle> {
  const response = await client.get<JsonApiSingleResponse>(`/accounts/${id}`);
  return unwrapSingle(response);
}
```

- [ ] **Step 2: Update `src/tests/accounts.test.ts`**

Replace the entire file with realistic fixtures and return-value assertions:

```typescript
import { describe, it, expect, vi } from 'vitest';
import type { FireflyClient } from '../client.js';
import { fetchAccounts, fetchAccount } from '../tools/accounts.js';

const mockClient = { get: vi.fn() } as unknown as FireflyClient;

const listFixture = {
  data: [
    {
      id: '1',
      type: 'accounts',
      attributes: { name: 'Checking', current_balance: '1000.00', active: true },
      links: { self: 'https://firefly.example.com/api/v1/accounts/1' },
    },
  ],
  meta: { pagination: { current_page: 1, total_pages: 1, total: 1 } },
};

const singleFixture = {
  data: {
    id: '42',
    type: 'accounts',
    attributes: { name: 'Savings', current_balance: '5000.00', active: true },
    links: { self: 'https://firefly.example.com/api/v1/accounts/42' },
  },
};

describe('fetchAccounts', () => {
  it('calls /accounts with type filter when type is not "all"', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    await fetchAccounts(mockClient, { type: 'asset', page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/accounts', { type: 'asset', page: 1, limit: 50 });
  });

  it('omits type param when type is "all"', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    await fetchAccounts(mockClient, { type: 'all', page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/accounts', { page: 1, limit: 50 });
  });

  it('omits type param when type is undefined', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    await fetchAccounts(mockClient, { page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/accounts', { page: 1, limit: 50 });
  });

  it('returns flat items with pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    const result = await fetchAccounts(mockClient, { page: 1, limit: 50 });
    expect(result.data[0]).toEqual({ id: '1', name: 'Checking', current_balance: '1000.00', active: true });
    expect(result.pagination).toEqual({ page: 1, totalPages: 1, total: 1 });
  });
});

describe('fetchAccount', () => {
  it('calls /accounts/:id', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(singleFixture);
    await fetchAccount(mockClient, '42');
    expect(mockClient.get).toHaveBeenCalledWith('/accounts/42');
  });

  it('returns flat item', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(singleFixture);
    const result = await fetchAccount(mockClient, '42');
    expect(result).toEqual({ id: '42', name: 'Savings', current_balance: '5000.00', active: true });
  });
});
```

- [ ] **Step 3: Run tests — expect them to pass**

```bash
npm test src/tests/accounts.test.ts
```

Expected: all 6 tests pass

- [ ] **Step 4: Commit**

```bash
git add src/tools/accounts.ts src/tests/accounts.test.ts
git commit -m "feat: unwrap JSON:API envelope in account fetch functions

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Apply transforms to `transactions.ts` + update `transactions.test.ts`

**Files:**
- Modify: `src/tools/transactions.ts`
- Modify: `src/tests/transactions.test.ts`

- [ ] **Step 1: Update `src/tools/transactions.ts`**

Replace the two fetch functions (leave `registerTransactionTools` unchanged):

```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { type FireflyClient, formatError } from '../client.js';
import type { QueryParams } from '../types.js';
import { unwrapList, unwrapSingle } from '../transform.js';
import type { JsonApiListResponse, JsonApiSingleResponse, UnwrappedList, UnwrappedSingle } from '../transform.js';

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
): Promise<UnwrappedList> {
  const query: QueryParams = { page: params.page, limit: params.limit };
  if (params.type) query['type'] = params.type;
  if (params.accountId) query['account_id'] = params.accountId;
  if (params.start) query['start'] = params.start;
  if (params.end) query['end'] = params.end;
  const response = await client.get<JsonApiListResponse>('/transactions', query);
  return unwrapList(response);
}

export async function fetchTransaction(client: FireflyClient, id: string): Promise<UnwrappedSingle> {
  const response = await client.get<JsonApiSingleResponse>(`/transactions/${id}`);
  return unwrapSingle(response);
}
```

- [ ] **Step 2: Update `src/tests/transactions.test.ts`**

Replace the entire file:

```typescript
import { describe, it, expect, vi } from 'vitest';
import type { FireflyClient } from '../client.js';
import { fetchTransactions, fetchTransaction } from '../tools/transactions.js';

const mockClient = { get: vi.fn() } as unknown as FireflyClient;

const listFixture = {
  data: [
    {
      id: '101',
      type: 'transactions',
      attributes: { description: 'Groceries', amount: '-45.00', date: '2026-01-15' },
      links: { self: 'https://firefly.example.com/api/v1/transactions/101' },
    },
  ],
  meta: { pagination: { current_page: 1, total_pages: 3, total: 120 } },
};

const singleFixture = {
  data: {
    id: '123',
    type: 'transactions',
    attributes: { description: 'Salary', amount: '3000.00', date: '2026-01-01' },
    links: { self: 'https://firefly.example.com/api/v1/transactions/123' },
  },
};

describe('fetchTransactions', () => {
  it('calls /transactions with all provided filters', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
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
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    await fetchTransactions(mockClient, { page: 1, limit: 20 });
    expect(mockClient.get).toHaveBeenCalledWith('/transactions', { page: 1, limit: 20 });
  });

  it('returns flat items with pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    const result = await fetchTransactions(mockClient, { page: 1, limit: 50 });
    expect(result.data[0]).toEqual({ id: '101', description: 'Groceries', amount: '-45.00', date: '2026-01-15' });
    expect(result.pagination).toEqual({ page: 1, totalPages: 3, total: 120 });
  });
});

describe('fetchTransaction', () => {
  it('calls /transactions/:id', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(singleFixture);
    await fetchTransaction(mockClient, '123');
    expect(mockClient.get).toHaveBeenCalledWith('/transactions/123');
  });

  it('returns flat item', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(singleFixture);
    const result = await fetchTransaction(mockClient, '123');
    expect(result).toEqual({ id: '123', description: 'Salary', amount: '3000.00', date: '2026-01-01' });
  });
});
```

- [ ] **Step 3: Run tests — expect them to pass**

```bash
npm test src/tests/transactions.test.ts
```

Expected: all 5 tests pass

- [ ] **Step 4: Commit**

```bash
git add src/tools/transactions.ts src/tests/transactions.test.ts
git commit -m "feat: unwrap JSON:API envelope in transaction fetch functions

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 4: Apply transforms to `budgets.ts` + update `budgets.test.ts`

**Files:**
- Modify: `src/tools/budgets.ts`
- Modify: `src/tests/budgets.test.ts`

- [ ] **Step 1: Update `src/tools/budgets.ts`**

Replace the two fetch functions (leave `registerBudgetTools` unchanged):

```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { type FireflyClient, formatError } from '../client.js';
import type { QueryParams } from '../types.js';
import { unwrapList } from '../transform.js';
import type { JsonApiListResponse, UnwrappedList } from '../transform.js';

export async function fetchBudgets(
  client: FireflyClient,
  params: { page?: number; limit?: number }
): Promise<UnwrappedList> {
  const response = await client.get<JsonApiListResponse>('/budgets', { page: params.page, limit: params.limit });
  return unwrapList(response);
}

export async function fetchBudgetLimits(
  client: FireflyClient,
  budgetId: string,
  start?: string,
  end?: string
): Promise<UnwrappedList> {
  const query: QueryParams = {};
  if (start) query['start'] = start;
  if (end) query['end'] = end;
  const response = await client.get<JsonApiListResponse>(`/budgets/${budgetId}/limits`, query);
  return unwrapList(response);
}
```

- [ ] **Step 2: Update `src/tests/budgets.test.ts`**

Replace the entire file:

```typescript
import { describe, it, expect, vi } from 'vitest';
import type { FireflyClient } from '../client.js';
import { fetchBudgets, fetchBudgetLimits } from '../tools/budgets.js';

const mockClient = { get: vi.fn() } as unknown as FireflyClient;

const listFixture = {
  data: [
    {
      id: '3',
      type: 'budgets',
      attributes: { name: 'Groceries', active: true },
      links: { self: 'https://firefly.example.com/api/v1/budgets/3' },
    },
  ],
  meta: { pagination: { current_page: 1, total_pages: 1, total: 1 } },
};

describe('fetchBudgets', () => {
  it('calls /budgets with pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    await fetchBudgets(mockClient, { page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/budgets', { page: 1, limit: 50 });
  });

  it('returns flat items with pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    const result = await fetchBudgets(mockClient, { page: 1, limit: 50 });
    expect(result.data[0]).toEqual({ id: '3', name: 'Groceries', active: true });
    expect(result.pagination).toEqual({ page: 1, totalPages: 1, total: 1 });
  });
});

describe('fetchBudgetLimits', () => {
  it('calls /budgets/:id/limits with date range', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    await fetchBudgetLimits(mockClient, '3', '2026-01-01', '2026-01-31');
    expect(mockClient.get).toHaveBeenCalledWith('/budgets/3/limits', {
      start: '2026-01-01',
      end: '2026-01-31',
    });
  });

  it('calls /budgets/:id/limits without dates when not provided', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    await fetchBudgetLimits(mockClient, '3');
    expect(mockClient.get).toHaveBeenCalledWith('/budgets/3/limits', {});
  });

  it('returns flat items with pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    const result = await fetchBudgetLimits(mockClient, '3', '2026-01-01', '2026-01-31');
    expect(result.data[0]).toEqual({ id: '3', name: 'Groceries', active: true });
  });
});
```

- [ ] **Step 3: Run tests — expect them to pass**

```bash
npm test src/tests/budgets.test.ts
```

Expected: all 5 tests pass

- [ ] **Step 4: Commit**

```bash
git add src/tools/budgets.ts src/tests/budgets.test.ts
git commit -m "feat: unwrap JSON:API envelope in budget fetch functions

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 5: Apply transforms to `categories.ts` + update `categories.test.ts`

**Files:**
- Modify: `src/tools/categories.ts`
- Modify: `src/tests/categories.test.ts`

- [ ] **Step 1: Update `src/tools/categories.ts`**

Replace the two fetch functions (leave `registerCategoryTools` unchanged):

```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { type FireflyClient, formatError } from '../client.js';
import type { QueryParams } from '../types.js';
import { unwrapList } from '../transform.js';
import type { JsonApiListResponse, UnwrappedList } from '../transform.js';

export async function fetchCategories(
  client: FireflyClient,
  params: { page?: number; limit?: number }
): Promise<UnwrappedList> {
  const response = await client.get<JsonApiListResponse>('/categories', { page: params.page, limit: params.limit });
  return unwrapList(response);
}

export async function fetchCategoryTransactions(
  client: FireflyClient,
  categoryId: string,
  params: { start?: string; end?: string; page?: number; limit?: number }
): Promise<UnwrappedList> {
  const query: QueryParams = { page: params.page, limit: params.limit };
  if (params.start) query['start'] = params.start;
  if (params.end) query['end'] = params.end;
  const response = await client.get<JsonApiListResponse>(`/categories/${categoryId}/transactions`, query);
  return unwrapList(response);
}
```

- [ ] **Step 2: Update `src/tests/categories.test.ts`**

Replace the entire file:

```typescript
import { describe, it, expect, vi } from 'vitest';
import type { FireflyClient } from '../client.js';
import { fetchCategories, fetchCategoryTransactions } from '../tools/categories.js';

const mockClient = { get: vi.fn() } as unknown as FireflyClient;

const listFixture = {
  data: [
    {
      id: '7',
      type: 'categories',
      attributes: { name: 'Food & Dining' },
      links: { self: 'https://firefly.example.com/api/v1/categories/7' },
    },
  ],
  meta: { pagination: { current_page: 1, total_pages: 1, total: 1 } },
};

describe('fetchCategories', () => {
  it('calls /categories with pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    await fetchCategories(mockClient, { page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/categories', { page: 1, limit: 50 });
  });

  it('returns flat items with pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    const result = await fetchCategories(mockClient, { page: 1, limit: 50 });
    expect(result.data[0]).toEqual({ id: '7', name: 'Food & Dining' });
    expect(result.pagination).toEqual({ page: 1, totalPages: 1, total: 1 });
  });
});

describe('fetchCategoryTransactions', () => {
  it('calls /categories/:id/transactions with all params', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    await fetchCategoryTransactions(mockClient, '7', {
      start: '2026-01-01',
      end: '2026-01-31',
      page: 1,
      limit: 50,
    });
    expect(mockClient.get).toHaveBeenCalledWith('/categories/7/transactions', {
      start: '2026-01-01',
      end: '2026-01-31',
      page: 1,
      limit: 50,
    });
  });

  it('omits undefined date params', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    await fetchCategoryTransactions(mockClient, '7', { page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/categories/7/transactions', { page: 1, limit: 50 });
  });

  it('returns flat items with pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    const result = await fetchCategoryTransactions(mockClient, '7', { page: 1, limit: 50 });
    expect(result.data[0]).toEqual({ id: '7', name: 'Food & Dining' });
  });
});
```

- [ ] **Step 3: Run tests — expect them to pass**

```bash
npm test src/tests/categories.test.ts
```

Expected: all 5 tests pass

- [ ] **Step 4: Commit**

```bash
git add src/tools/categories.ts src/tests/categories.test.ts
git commit -m "feat: unwrap JSON:API envelope in category fetch functions

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 6: Apply transforms to `bills.ts` and `piggy-banks.ts` + update their tests

**Files:**
- Modify: `src/tools/bills.ts`
- Modify: `src/tests/bills.test.ts`
- Modify: `src/tools/piggy-banks.ts`
- Modify: `src/tests/piggy-banks.test.ts`

- [ ] **Step 1: Update `src/tools/bills.ts`**

Replace the fetch function (leave `registerBillTools` unchanged):

```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { type FireflyClient, formatError } from '../client.js';
import type { QueryParams } from '../types.js';
import { unwrapList } from '../transform.js';
import type { JsonApiListResponse, UnwrappedList } from '../transform.js';

export async function fetchBills(
  client: FireflyClient,
  params: { start?: string; end?: string; page?: number; limit?: number }
): Promise<UnwrappedList> {
  const query: QueryParams = { page: params.page, limit: params.limit };
  if (params.start) query['start'] = params.start;
  if (params.end) query['end'] = params.end;
  const response = await client.get<JsonApiListResponse>('/bills', query);
  return unwrapList(response);
}
```

- [ ] **Step 2: Update `src/tests/bills.test.ts`**

Replace the entire file:

```typescript
import { describe, it, expect, vi } from 'vitest';
import type { FireflyClient } from '../client.js';
import { fetchBills } from '../tools/bills.js';

const mockClient = { get: vi.fn() } as unknown as FireflyClient;

const listFixture = {
  data: [
    {
      id: '5',
      type: 'bills',
      attributes: { name: 'Rent', amount_min: '800.00', amount_max: '800.00', active: true },
      links: { self: 'https://firefly.example.com/api/v1/bills/5' },
    },
  ],
  meta: { pagination: { current_page: 1, total_pages: 1, total: 1 } },
};

describe('fetchBills', () => {
  it('calls /bills with date range and pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    await fetchBills(mockClient, { start: '2026-01-01', end: '2026-01-31', page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/bills', {
      start: '2026-01-01',
      end: '2026-01-31',
      page: 1,
      limit: 50,
    });
  });

  it('omits undefined date params', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    await fetchBills(mockClient, { page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/bills', { page: 1, limit: 50 });
  });

  it('returns flat items with pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    const result = await fetchBills(mockClient, { page: 1, limit: 50 });
    expect(result.data[0]).toEqual({ id: '5', name: 'Rent', amount_min: '800.00', amount_max: '800.00', active: true });
    expect(result.pagination).toEqual({ page: 1, totalPages: 1, total: 1 });
  });
});
```

- [ ] **Step 3: Update `src/tools/piggy-banks.ts`**

Replace the fetch function (leave `registerPiggyBankTools` unchanged):

```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { type FireflyClient, formatError } from '../client.js';
import { unwrapList } from '../transform.js';
import type { JsonApiListResponse, UnwrappedList } from '../transform.js';

export async function fetchPiggyBanks(
  client: FireflyClient,
  params: { page?: number; limit?: number }
): Promise<UnwrappedList> {
  const response = await client.get<JsonApiListResponse>('/piggy-banks', { page: params.page, limit: params.limit });
  return unwrapList(response);
}
```

- [ ] **Step 4: Update `src/tests/piggy-banks.test.ts`**

Replace the entire file:

```typescript
import { describe, it, expect, vi } from 'vitest';
import type { FireflyClient } from '../client.js';
import { fetchPiggyBanks } from '../tools/piggy-banks.js';

const mockClient = { get: vi.fn() } as unknown as FireflyClient;

const listFixture = {
  data: [
    {
      id: '2',
      type: 'piggy_banks',
      attributes: { name: 'Holiday Fund', current_amount: '500.00', target_amount: '2000.00' },
      links: { self: 'https://firefly.example.com/api/v1/piggy-banks/2' },
    },
  ],
  meta: { pagination: { current_page: 1, total_pages: 1, total: 1 } },
};

describe('fetchPiggyBanks', () => {
  it('calls /piggy-banks with pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    await fetchPiggyBanks(mockClient, { page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/piggy-banks', { page: 1, limit: 50 });
  });

  it('returns flat items with pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    const result = await fetchPiggyBanks(mockClient, { page: 1, limit: 50 });
    expect(result.data[0]).toEqual({
      id: '2',
      name: 'Holiday Fund',
      current_amount: '500.00',
      target_amount: '2000.00',
    });
    expect(result.pagination).toEqual({ page: 1, totalPages: 1, total: 1 });
  });
});
```

- [ ] **Step 5: Run tests — expect them to pass**

```bash
npm test src/tests/bills.test.ts src/tests/piggy-banks.test.ts
```

Expected: all 5 tests pass (3 bills + 2 piggy-banks)

- [ ] **Step 6: Commit**

```bash
git add src/tools/bills.ts src/tests/bills.test.ts src/tools/piggy-banks.ts src/tests/piggy-banks.test.ts
git commit -m "feat: unwrap JSON:API envelope in bill and piggy bank fetch functions

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 7: Apply transforms to `reports.ts` + update `reports.test.ts`

**Files:**
- Modify: `src/tools/reports.ts`
- Modify: `src/tests/reports.test.ts`

`fetchTags` and `fetchTagTransactions` → `unwrapList`. `fetchSummary` → `cleanSummary`. `fetchInsightExpenses` and `fetchInsightIncome` are pass-through (already flat arrays — no change to implementation, only update test mocks to realistic shapes).

- [ ] **Step 1: Update `src/tools/reports.ts`**

Replace all five fetch functions (leave `registerReportTools` unchanged):

```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { type FireflyClient, formatError } from '../client.js';
import type { QueryParams } from '../types.js';
import { unwrapList, cleanSummary } from '../transform.js';
import type { JsonApiListResponse, RawSummaryItem, CleanSummaryItem, UnwrappedList } from '../transform.js';

export async function fetchTags(
  client: FireflyClient,
  params: { page?: number; limit?: number }
): Promise<UnwrappedList> {
  const response = await client.get<JsonApiListResponse>('/tags', { page: params.page, limit: params.limit });
  return unwrapList(response);
}

export async function fetchTagTransactions(
  client: FireflyClient,
  tag: string,
  params: { start?: string; end?: string; page?: number; limit?: number }
): Promise<UnwrappedList> {
  const query: QueryParams = { page: params.page, limit: params.limit };
  if (params.start) query['start'] = params.start;
  if (params.end) query['end'] = params.end;
  const response = await client.get<JsonApiListResponse>(`/tags/${encodeURIComponent(tag)}/transactions`, query);
  return unwrapList(response);
}

export async function fetchSummary(
  client: FireflyClient,
  start: string,
  end: string,
  currencyCode?: string
): Promise<CleanSummaryItem[]> {
  const query: QueryParams = { start, end };
  if (currencyCode) query['currency_code'] = currencyCode;
  const response = await client.get<RawSummaryItem[]>('/summary/basic', query);
  return cleanSummary(response);
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
```

- [ ] **Step 2: Update `src/tests/reports.test.ts`**

Replace the entire file:

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

const tagListFixture = {
  data: [
    {
      id: '9',
      type: 'tags',
      attributes: { tag: 'vacation', date: null },
      links: { self: 'https://firefly.example.com/api/v1/tags/9' },
    },
  ],
  meta: { pagination: { current_page: 1, total_pages: 1, total: 1 } },
};

const summaryFixture = [
  {
    key: 'balance-in-EUR',
    value: {
      key: 'balance-in-EUR',
      title: 'Balance (€)',
      monetary_value: '8818.16',
      currency_id: '1',
      currency_code: 'EUR',
      currency_symbol: '€',
      currency_decimal_places: 2,
      value_parsed: '€8,818.16',
      local_icon: 'balance-scale',
      sub_title: '-€20,448.98 + €29,267.14',
    },
  },
];

const insightFixture = [
  { id: '20', name: 'Bank costs', difference: '-102.97', difference_float: -102.97, currency_id: '1', currency_code: 'EUR' },
];

describe('fetchTags', () => {
  it('calls /tags with pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(tagListFixture);
    await fetchTags(mockClient, { page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/tags', { page: 1, limit: 50 });
  });

  it('returns flat items with pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(tagListFixture);
    const result = await fetchTags(mockClient, { page: 1, limit: 50 });
    expect(result.data[0]).toEqual({ id: '9', tag: 'vacation', date: null });
    expect(result.pagination).toEqual({ page: 1, totalPages: 1, total: 1 });
  });
});

describe('fetchTagTransactions', () => {
  it('calls /tags/:tag/transactions with all params', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(tagListFixture);
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
    mockClient.get = vi.fn().mockResolvedValueOnce(tagListFixture);
    await fetchTagTransactions(mockClient, 'vacation', { page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/tags/vacation/transactions', { page: 1, limit: 50 });
  });

  it('returns flat items with pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(tagListFixture);
    const result = await fetchTagTransactions(mockClient, 'vacation', { page: 1, limit: 50 });
    expect(result.data[0]).toEqual({ id: '9', tag: 'vacation', date: null });
  });
});

describe('fetchSummary', () => {
  it('calls /summary/basic with required date range', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(summaryFixture);
    await fetchSummary(mockClient, '2026-01-01', '2026-12-31');
    expect(mockClient.get).toHaveBeenCalledWith('/summary/basic', {
      start: '2026-01-01',
      end: '2026-12-31',
    });
  });

  it('includes currency_code when provided', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(summaryFixture);
    await fetchSummary(mockClient, '2026-01-01', '2026-12-31', 'EUR');
    expect(mockClient.get).toHaveBeenCalledWith('/summary/basic', {
      start: '2026-01-01',
      end: '2026-12-31',
      currency_code: 'EUR',
    });
  });

  it('returns cleaned summary without UI fields', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(summaryFixture);
    const result = await fetchSummary(mockClient, '2026-01-01', '2026-12-31');
    expect(result[0].value).toEqual({
      key: 'balance-in-EUR',
      title: 'Balance (€)',
      monetary_value: '8818.16',
      currency_id: '1',
      currency_code: 'EUR',
      value_parsed: '€8,818.16',
    });
    expect(result[0].value).not.toHaveProperty('local_icon');
  });
});

describe('fetchInsightExpenses', () => {
  it('calls /insight/expense/category with date range', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(insightFixture);
    await fetchInsightExpenses(mockClient, '2026-01-01', '2026-01-31');
    expect(mockClient.get).toHaveBeenCalledWith('/insight/expense/category', {
      start: '2026-01-01',
      end: '2026-01-31',
    });
  });
});

describe('fetchInsightIncome', () => {
  it('calls /insight/income/category with date range', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(insightFixture);
    await fetchInsightIncome(mockClient, '2026-01-01', '2026-01-31');
    expect(mockClient.get).toHaveBeenCalledWith('/insight/income/category', {
      start: '2026-01-01',
      end: '2026-01-31',
    });
  });
});
```

- [ ] **Step 3: Run tests — expect them to pass**

```bash
npm test src/tests/reports.test.ts
```

Expected: all 9 tests pass

- [ ] **Step 4: Commit**

```bash
git add src/tools/reports.ts src/tests/reports.test.ts
git commit -m "feat: unwrap JSON:API envelope in report and tag fetch functions

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 8: Full build and test verification + dist commit

**Files:**
- Modify: `dist/` (compiled output)

- [ ] **Step 1: Run the full test suite**

```bash
npm test
```

Expected output:
```
Test Files  9 passed (9)
Tests       XX passed (XX)
```

All test files pass, integration tests skipped (no `FIREFLY_INTEGRATION` env var).

- [ ] **Step 2: Build**

```bash
npm run build
```

Expected: exits 0, no TypeScript errors, `dist/index.js` is executable.

- [ ] **Step 3: Commit dist**

```bash
git add dist/
git commit -m "chore: update dist with JSON:API response stripping build

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```
