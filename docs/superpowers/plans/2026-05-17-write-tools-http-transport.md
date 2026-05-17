# Write Tools + HTTP Transport Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add full CRUD write tools for all resources and an opt-in HTTP transport (`--transport http`) to the Firefly III MCP server.

**Architecture:** Write methods (`post`, `put`, `delete`) are added to `FireflyClient` via a shared `request()` helper. Write tools are co-located in existing tool files alongside reads. HTTP transport lives in a new `src/http.ts` and is selected via a `--transport` CLI flag parsed in `src/index.ts`; stdio remains the default.

**Tech Stack:** TypeScript ESM, `@modelcontextprotocol/sdk` v1.29.0 (`StreamableHTTPServerTransport`), Node.js `http`/`net` built-ins, Zod, Vitest.

---

## File Structure

| File | Change |
|------|--------|
| `src/client.ts` | Add `private request()`, `post()`, `put()`, `delete()`; make `FireflyError.body` public; improve `formatError` (400, smart 422) |
| `src/http.ts` | **New** — `startHttpServer(server, host, port, portWasExplicit)` |
| `src/index.ts` | Add `parseArgs()`; branch on `--transport` |
| `src/tools/transactions.ts` | Add `createTransaction`, `updateTransaction`, `deleteTransaction` + register calls |
| `src/tools/accounts.ts` | Add `createAccount`, `updateAccount`, `deleteAccount` + register calls |
| `src/tools/budgets.ts` | Add `createBudget`, `updateBudget`, `deleteBudget`, `createBudgetLimit`, `updateBudgetLimit`, `deleteBudgetLimit` + register calls |
| `src/tools/categories.ts` | Add `createCategory`, `updateCategory`, `deleteCategory` + register calls |
| `src/tools/bills.ts` | Add `createBill`, `updateBill`, `deleteBill` + register calls |
| `src/tools/piggy-banks.ts` | Add `createPiggyBank`, `updatePiggyBank`, `deletePiggyBank` + register calls |
| `src/tools/reports.ts` | Add `createTag`, `updateTag`, `deleteTag` + register calls |
| `src/tests/client.test.ts` | Tests for new client methods + updated `formatError` |
| `src/tests/transactions.test.ts` | Tests for write fetch functions |
| `src/tests/accounts.test.ts` | Tests for write fetch functions |
| `src/tests/budgets.test.ts` | Tests for write fetch functions |
| `src/tests/categories.test.ts` | Tests for write fetch functions |
| `src/tests/bills.test.ts` | Tests for write fetch functions |
| `src/tests/piggy-banks.test.ts` | Tests for write fetch functions |
| `src/tests/reports.test.ts` | Tests for tag write fetch functions |
| `CLAUDE.md` | Update Phase 2 section |

---

## Task 1: Extend FireflyClient with write methods

**Files:**
- Modify: `src/client.ts`
- Modify: `src/tests/client.test.ts`

- [ ] **Step 1: Write failing tests** — add to `src/tests/client.test.ts`:

```typescript
// Add after existing imports:
import { FireflyClient, FireflyError, formatError } from '../client.js';

// Add new describe blocks after existing ones:

describe('FireflyClient write methods', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('post() sends POST with JSON body and returns parsed response', async () => {
    const body = { name: 'Test' };
    const responseData = { data: { id: '1', type: 'accounts', attributes: { name: 'Test' }, links: {} } };
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(responseData), { status: 200 }));
    const client = new FireflyClient('https://firefly.example.com', 'token');
    const result = await client.post('/accounts', body);
    expect(fetch).toHaveBeenCalledWith(
      'https://firefly.example.com/api/v1/accounts',
      expect.objectContaining({ method: 'POST', body: JSON.stringify(body) })
    );
    expect(result).toEqual(responseData);
  });

  it('put() sends PUT with JSON body and returns parsed response', async () => {
    const body = { name: 'Updated' };
    const responseData = { data: { id: '1', type: 'accounts', attributes: { name: 'Updated' }, links: {} } };
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(responseData), { status: 200 }));
    const client = new FireflyClient('https://firefly.example.com', 'token');
    const result = await client.put('/accounts/1', body);
    expect(fetch).toHaveBeenCalledWith(
      'https://firefly.example.com/api/v1/accounts/1',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify(body) })
    );
    expect(result).toEqual(responseData);
  });

  it('delete() sends DELETE and returns undefined on 204', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }));
    const client = new FireflyClient('https://firefly.example.com', 'token');
    const result = await client.delete('/accounts/1');
    expect(fetch).toHaveBeenCalledWith(
      'https://firefly.example.com/api/v1/accounts/1',
      expect.objectContaining({ method: 'DELETE' })
    );
    expect(result).toBeUndefined();
  });

  it('post() throws FireflyError on 422', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('{"message":"invalid"}', { status: 422 }));
    const client = new FireflyClient('https://firefly.example.com', 'token');
    await expect(client.post('/accounts', {})).rejects.toThrow(FireflyError);
  });

  it('FireflyError exposes body string', () => {
    const err = new FireflyError(422, 'https://example.com', '{"message":"bad"}');
    expect(err.body).toBe('{"message":"bad"}');
  });
});

describe('formatError — updated cases', () => {
  it('returns bad request message for 400', () => {
    const err = new FireflyError(400, 'https://example.com', 'Bad Request');
    expect(formatError(err)).toBe('Bad request — check your input parameters.');
  });

  it('formats field errors from 422 JSON body', () => {
    const body = JSON.stringify({
      message: 'The given data was invalid.',
      errors: {
        'transactions.0.amount': ['The amount field is required.'],
        'transactions.0.type': ['Invalid type.'],
      },
    });
    const err = new FireflyError(422, 'https://example.com', body);
    const msg = formatError(err);
    expect(msg).toContain('transactions.0.amount');
    expect(msg).toContain('The amount field is required.');
  });

  it('falls back to generic 422 message when body is not JSON', () => {
    const err = new FireflyError(422, 'https://example.com', 'Unprocessable Entity');
    expect(formatError(err)).toBe('Invalid request parameters.');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Volumes/Webdev/Personal/claude/fireflyiii-mcp && npx vitest run src/tests/client.test.ts
```

Expected: multiple failures — `client.post is not a function`, `err.body is undefined`, `formatError` returning wrong messages.

- [ ] **Step 3: Implement changes to `src/client.ts`**

Replace the entire file with:

```typescript
import type { QueryParams } from './types.js';

export class FireflyError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
    public readonly body: string
  ) {
    super(`Firefly III API error ${status} at ${url}: ${body}`);
    this.name = 'FireflyError';
  }
}

export function formatError(err: unknown): string {
  if (err instanceof FireflyError) {
    if (err.status === 400) return 'Bad request — check your input parameters.';
    if (err.status === 401) return 'Authentication failed. Check your FIREFLY_TOKEN.';
    if (err.status === 404) return 'Resource not found.';
    if (err.status === 422) {
      try {
        const parsed = JSON.parse(err.body) as { errors?: Record<string, string[]> };
        if (parsed.errors && Object.keys(parsed.errors).length > 0) {
          const details = Object.entries(parsed.errors)
            .map(([field, msgs]) => `${field} — ${msgs.join(', ')}`)
            .join('; ');
          return `Validation failed: ${details}`;
        }
      } catch {
        // fall through
      }
      return 'Invalid request parameters.';
    }
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

  private async request<T>(method: string, url: string, body?: unknown): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await fetch(url, {
        method,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
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
      const responseBody = await response.text().catch(() => '');
      throw new FireflyError(response.status, url, responseBody);
    }
    if (response.status === 204) return undefined as T;
    return response.json() as T;
  }

  async get<T = unknown>(path: string, params?: QueryParams): Promise<T> {
    const url = new URL(`${this.baseUrl}/api/v1${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    }
    return this.request<T>('GET', url.toString());
  }

  async post<T = unknown>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', `${this.baseUrl}/api/v1${path}`, body);
  }

  async put<T = unknown>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PUT', `${this.baseUrl}/api/v1${path}`, body);
  }

  async delete(path: string): Promise<void> {
    await this.request<void>('DELETE', `${this.baseUrl}/api/v1${path}`);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/tests/client.test.ts
```

Expected: all tests pass, including all existing tests (existing `get()` tests use `this.request()` internally now).

- [ ] **Step 5: Commit**

```bash
git add src/client.ts src/tests/client.test.ts
git commit -m "feat: add post/put/delete to FireflyClient; improve formatError for 400 and 422

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Transaction write tools

**Files:**
- Modify: `src/tools/transactions.ts`
- Modify: `src/tests/transactions.test.ts`

- [ ] **Step 1: Write failing tests** — add to `src/tests/transactions.test.ts`:

```typescript
// Update the mock client at the top of the file to include write methods:
const mockClient = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
} as unknown as FireflyClient;

// Add these imports to the existing import line:
import { fetchTransactions, fetchTransaction, createTransaction, updateTransaction, deleteTransaction } from '../tools/transactions.js';

// Add new describe blocks:

const singleFixture = {
  data: {
    id: '5',
    type: 'transactions',
    attributes: { description: 'Groceries', amount: '42.50', type: 'withdrawal' },
    links: {},
  },
};

describe('createTransaction', () => {
  it('posts to /transactions with wrapped body', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(singleFixture);
    await createTransaction(mockClient, {
      type: 'withdrawal',
      date: '2024-01-15',
      amount: '42.50',
      description: 'Groceries',
      source_id: '1',
    });
    expect(mockClient.post).toHaveBeenCalledWith('/transactions', {
      apply_rules: true,
      fire_webhooks: true,
      transactions: [
        expect.objectContaining({
          type: 'withdrawal',
          date: '2024-01-15',
          amount: '42.50',
          description: 'Groceries',
          source_id: '1',
        }),
      ],
    });
  });

  it('returns unwrapped single', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(singleFixture);
    const result = await createTransaction(mockClient, {
      type: 'withdrawal',
      date: '2024-01-15',
      amount: '42.50',
      description: 'Groceries',
    });
    expect(result).toEqual({ description: 'Groceries', amount: '42.50', type: 'withdrawal', id: '5' });
  });
});

describe('updateTransaction', () => {
  it('puts to /transactions/:id with wrapped body', async () => {
    mockClient.put = vi.fn().mockResolvedValueOnce(singleFixture);
    await updateTransaction(mockClient, '5', { description: 'Updated' });
    expect(mockClient.put).toHaveBeenCalledWith('/transactions/5', {
      apply_rules: true,
      fire_webhooks: true,
      transactions: [{ description: 'Updated' }],
    });
  });

  it('returns unwrapped single', async () => {
    mockClient.put = vi.fn().mockResolvedValueOnce(singleFixture);
    const result = await updateTransaction(mockClient, '5', { amount: '50.00' });
    expect(result).toEqual({ description: 'Groceries', amount: '42.50', type: 'withdrawal', id: '5' });
  });
});

describe('deleteTransaction', () => {
  it('calls delete on /transactions/:id', async () => {
    mockClient.delete = vi.fn().mockResolvedValueOnce(undefined);
    await deleteTransaction(mockClient, '5');
    expect(mockClient.delete).toHaveBeenCalledWith('/transactions/5');
  });

  it('returns deleted confirmation', async () => {
    mockClient.delete = vi.fn().mockResolvedValueOnce(undefined);
    const result = await deleteTransaction(mockClient, '5');
    expect(result).toEqual({ deleted: true, id: '5' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/tests/transactions.test.ts
```

Expected: `createTransaction is not a function` (and similar for update/delete).

- [ ] **Step 3: Add write functions and tool registrations to `src/tools/transactions.ts`**

Add after the existing `fetchTransaction` function and before `READ_ANNOTATIONS`:

```typescript
export async function createTransaction(
  client: FireflyClient,
  params: {
    type: 'withdrawal' | 'deposit' | 'transfer';
    date: string;
    amount: string;
    description: string;
    source_id?: string;
    destination_id?: string;
    category_name?: string;
    budget_id?: string;
    currency_code?: string;
    notes?: string;
    tags?: string[];
  }
): Promise<UnwrappedSingle> {
  const split: Record<string, unknown> = {
    type: params.type,
    date: params.date,
    amount: params.amount,
    description: params.description,
  };
  if (params.source_id !== undefined) split.source_id = params.source_id;
  if (params.destination_id !== undefined) split.destination_id = params.destination_id;
  if (params.category_name !== undefined) split.category_name = params.category_name;
  if (params.budget_id !== undefined) split.budget_id = params.budget_id;
  if (params.currency_code !== undefined) split.currency_code = params.currency_code;
  if (params.notes !== undefined) split.notes = params.notes;
  if (params.tags !== undefined) split.tags = params.tags;
  const response = await client.post<JsonApiSingleResponse>('/transactions', {
    apply_rules: true,
    fire_webhooks: true,
    transactions: [split],
  });
  return unwrapSingle(response);
}

export async function updateTransaction(
  client: FireflyClient,
  id: string,
  params: {
    type?: 'withdrawal' | 'deposit' | 'transfer';
    date?: string;
    amount?: string;
    description?: string;
    source_id?: string;
    destination_id?: string;
    category_name?: string;
    budget_id?: string;
    currency_code?: string;
    notes?: string;
    tags?: string[];
  }
): Promise<UnwrappedSingle> {
  const split: Record<string, unknown> = {};
  if (params.type !== undefined) split.type = params.type;
  if (params.date !== undefined) split.date = params.date;
  if (params.amount !== undefined) split.amount = params.amount;
  if (params.description !== undefined) split.description = params.description;
  if (params.source_id !== undefined) split.source_id = params.source_id;
  if (params.destination_id !== undefined) split.destination_id = params.destination_id;
  if (params.category_name !== undefined) split.category_name = params.category_name;
  if (params.budget_id !== undefined) split.budget_id = params.budget_id;
  if (params.currency_code !== undefined) split.currency_code = params.currency_code;
  if (params.notes !== undefined) split.notes = params.notes;
  if (params.tags !== undefined) split.tags = params.tags;
  const response = await client.put<JsonApiSingleResponse>(`/transactions/${id}`, {
    apply_rules: true,
    fire_webhooks: true,
    transactions: [split],
  });
  return unwrapSingle(response);
}

export async function deleteTransaction(
  client: FireflyClient,
  id: string
): Promise<{ deleted: true; id: string }> {
  await client.delete(`/transactions/${id}`);
  return { deleted: true, id };
}
```

Add after `READ_ANNOTATIONS`:

```typescript
const WRITE_ANNOTATIONS = { openWorldHint: true } as const;
const UPDATE_ANNOTATIONS = { openWorldHint: true, idempotentHint: true } as const;
const DELETE_ANNOTATIONS = { destructiveHint: true, openWorldHint: true } as const;
```

Add inside `registerTransactionTools`, after the existing `get_transaction` registration:

```typescript
  server.registerTool(
    'create_transaction',
    {
      title: 'Create Transaction',
      description: 'Create a new transaction in Firefly III. Use get_accounts to find source and destination account IDs.',
      inputSchema: {
        type: z.enum(['withdrawal', 'deposit', 'transfer']).describe('Transaction type'),
        date: z.string().describe('Transaction date (YYYY-MM-DD)'),
        amount: z.string().describe('Amount as a positive number string, e.g. "42.50"'),
        description: z.string().describe('Short description of the transaction'),
        source_id: z.string().optional().describe('Source account ID (required for withdrawals and transfers)'),
        destination_id: z.string().optional().describe('Destination account ID (required for deposits and transfers)'),
        category_name: z.string().optional().describe('Category name to assign'),
        budget_id: z.string().optional().describe('Budget ID — use get_budgets to find valid IDs'),
        currency_code: z.string().optional().describe('Currency code (e.g. EUR, USD). Defaults to account currency.'),
        notes: z.string().optional().describe('Additional notes'),
        tags: z.array(z.string()).optional().describe('Tags to attach'),
      },
      annotations: WRITE_ANNOTATIONS,
    },
    async ({ type, date, amount, description, source_id, destination_id, category_name, budget_id, currency_code, notes, tags }) => {
      try {
        const result = await createTransaction(client, { type, date, amount, description, source_id, destination_id, category_name, budget_id, currency_code, notes, tags });
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );

  server.registerTool(
    'update_transaction',
    {
      title: 'Update Transaction',
      description: 'Update an existing transaction in Firefly III. Only fields provided will be changed. Use get_transaction to confirm the ID before updating.',
      inputSchema: {
        id: z.string().describe('Transaction ID — use get_transactions to find valid IDs'),
        type: z.enum(['withdrawal', 'deposit', 'transfer']).optional().describe('Transaction type'),
        date: z.string().optional().describe('Transaction date (YYYY-MM-DD)'),
        amount: z.string().optional().describe('Amount as a positive number string'),
        description: z.string().optional().describe('Short description'),
        source_id: z.string().optional().describe('Source account ID'),
        destination_id: z.string().optional().describe('Destination account ID'),
        category_name: z.string().optional().describe('Category name'),
        budget_id: z.string().optional().describe('Budget ID'),
        currency_code: z.string().optional().describe('Currency code (e.g. EUR, USD)'),
        notes: z.string().optional().describe('Additional notes'),
        tags: z.array(z.string()).optional().describe('Tags (replaces existing tags)'),
      },
      annotations: UPDATE_ANNOTATIONS,
    },
    async ({ id, ...params }) => {
      try {
        const result = await updateTransaction(client, id, params);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );

  server.registerTool(
    'delete_transaction',
    {
      title: 'Delete Transaction',
      description: 'Permanently delete a transaction from Firefly III. **This action cannot be undone.** Use get_transaction to confirm the transaction before deleting.',
      inputSchema: {
        id: z.string().describe('Transaction ID — use get_transactions to find valid IDs'),
      },
      annotations: DELETE_ANNOTATIONS,
    },
    async ({ id }) => {
      try {
        const result = await deleteTransaction(client, id);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/tests/transactions.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/tools/transactions.ts src/tests/transactions.test.ts
git commit -m "feat: add create/update/delete transaction tools

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Account write tools

**Files:**
- Modify: `src/tools/accounts.ts`
- Modify: `src/tests/accounts.test.ts`

- [ ] **Step 1: Write failing tests** — add to `src/tests/accounts.test.ts`:

```typescript
// Update mock client at top of file:
const mockClient = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
} as unknown as FireflyClient;

// Add to import line:
import { fetchAccounts, fetchAccount, createAccount, updateAccount, deleteAccount } from '../tools/accounts.js';

// Add these describe blocks:

const accountSingleFixture = {
  data: {
    id: '10',
    type: 'accounts',
    attributes: { name: 'New Account', type: 'asset', active: true },
    links: {},
  },
};

describe('createAccount', () => {
  it('posts to /accounts with params', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(accountSingleFixture);
    await createAccount(mockClient, { name: 'New Account', type: 'asset', currency_code: 'EUR' });
    expect(mockClient.post).toHaveBeenCalledWith('/accounts', {
      name: 'New Account',
      type: 'asset',
      currency_code: 'EUR',
    });
  });

  it('returns unwrapped single', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(accountSingleFixture);
    const result = await createAccount(mockClient, { name: 'New Account', type: 'asset' });
    expect(result).toEqual({ name: 'New Account', type: 'asset', active: true, id: '10' });
  });
});

describe('updateAccount', () => {
  it('puts to /accounts/:id', async () => {
    mockClient.put = vi.fn().mockResolvedValueOnce(accountSingleFixture);
    await updateAccount(mockClient, '10', { name: 'Renamed' });
    expect(mockClient.put).toHaveBeenCalledWith('/accounts/10', { name: 'Renamed' });
  });

  it('returns unwrapped single', async () => {
    mockClient.put = vi.fn().mockResolvedValueOnce(accountSingleFixture);
    const result = await updateAccount(mockClient, '10', { name: 'Renamed' });
    expect(result).toEqual({ name: 'New Account', type: 'asset', active: true, id: '10' });
  });
});

describe('deleteAccount', () => {
  it('calls delete on /accounts/:id', async () => {
    mockClient.delete = vi.fn().mockResolvedValueOnce(undefined);
    await deleteAccount(mockClient, '10');
    expect(mockClient.delete).toHaveBeenCalledWith('/accounts/10');
  });

  it('returns deleted confirmation', async () => {
    mockClient.delete = vi.fn().mockResolvedValueOnce(undefined);
    const result = await deleteAccount(mockClient, '10');
    expect(result).toEqual({ deleted: true, id: '10' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/tests/accounts.test.ts
```

Expected: `createAccount is not a function`.

- [ ] **Step 3: Add write functions and registrations to `src/tools/accounts.ts`**

Update the import from `transform.ts` to add `unwrapSingle`, `JsonApiSingleResponse`, and `UnwrappedSingle`:

```typescript
import { unwrapList, unwrapSingle, type JsonApiListResponse, type JsonApiSingleResponse, type UnwrappedList, type UnwrappedSingle } from '../transform.js';
```

Add after `fetchAccount`:

```typescript
export async function createAccount(
  client: FireflyClient,
  params: {
    name: string;
    type: 'asset' | 'expense' | 'revenue' | 'liability';
    currency_code?: string;
    iban?: string;
    opening_balance?: string;
    opening_balance_date?: string;
    include_net_worth?: boolean;
    notes?: string;
  }
): Promise<UnwrappedSingle> {
  const response = await client.post<JsonApiSingleResponse>('/accounts', params);
  return unwrapSingle(response);
}

export async function updateAccount(
  client: FireflyClient,
  id: string,
  params: {
    name?: string;
    currency_code?: string;
    iban?: string;
    opening_balance?: string;
    opening_balance_date?: string;
    include_net_worth?: boolean;
    active?: boolean;
    notes?: string;
  }
): Promise<UnwrappedSingle> {
  const response = await client.put<JsonApiSingleResponse>(`/accounts/${id}`, params);
  return unwrapSingle(response);
}

export async function deleteAccount(
  client: FireflyClient,
  id: string
): Promise<{ deleted: true; id: string }> {
  await client.delete(`/accounts/${id}`);
  return { deleted: true, id };
}
```

Add after `READ_ANNOTATIONS`:

```typescript
const WRITE_ANNOTATIONS = { openWorldHint: true } as const;
const UPDATE_ANNOTATIONS = { openWorldHint: true, idempotentHint: true } as const;
const DELETE_ANNOTATIONS = { destructiveHint: true, openWorldHint: true } as const;
```

Add inside `registerAccountTools`, after the existing `get_account` registration:

```typescript
  server.registerTool(
    'create_account',
    {
      title: 'Create Account',
      description: 'Create a new account in Firefly III.',
      inputSchema: {
        name: z.string().describe('Account name'),
        type: z.enum(['asset', 'expense', 'revenue', 'liability']).describe('Account type'),
        currency_code: z.string().optional().describe('Currency code (e.g. EUR, USD)'),
        iban: z.string().optional().describe('IBAN number'),
        opening_balance: z.string().optional().describe('Opening balance as a number string'),
        opening_balance_date: z.string().optional().describe('Opening balance date (YYYY-MM-DD)'),
        include_net_worth: z.boolean().optional().describe('Include in net worth calculations'),
        notes: z.string().optional().describe('Notes'),
      },
      annotations: WRITE_ANNOTATIONS,
    },
    async (params) => {
      try {
        const result = await createAccount(client, params);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );

  server.registerTool(
    'update_account',
    {
      title: 'Update Account',
      description: 'Update an existing account in Firefly III. Only fields provided will be changed. Use get_account to confirm the ID.',
      inputSchema: {
        id: z.string().describe('Account ID — use get_accounts to find valid IDs'),
        name: z.string().optional().describe('Account name'),
        currency_code: z.string().optional().describe('Currency code (e.g. EUR, USD)'),
        iban: z.string().optional().describe('IBAN number'),
        opening_balance: z.string().optional().describe('Opening balance as a number string'),
        opening_balance_date: z.string().optional().describe('Opening balance date (YYYY-MM-DD)'),
        include_net_worth: z.boolean().optional().describe('Include in net worth calculations'),
        active: z.boolean().optional().describe('Whether the account is active'),
        notes: z.string().optional().describe('Notes'),
      },
      annotations: UPDATE_ANNOTATIONS,
    },
    async ({ id, ...params }) => {
      try {
        const result = await updateAccount(client, id, params);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );

  server.registerTool(
    'delete_account',
    {
      title: 'Delete Account',
      description: 'Permanently delete an account from Firefly III. **This action cannot be undone.** Accounts with linked transactions cannot be deleted. Use get_account to confirm before deleting.',
      inputSchema: {
        id: z.string().describe('Account ID — use get_accounts to find valid IDs'),
      },
      annotations: DELETE_ANNOTATIONS,
    },
    async ({ id }) => {
      try {
        const result = await deleteAccount(client, id);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/tests/accounts.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/tools/accounts.ts src/tests/accounts.test.ts
git commit -m "feat: add create/update/delete account tools

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Budget write tools

**Files:**
- Modify: `src/tools/budgets.ts`
- Modify: `src/tests/budgets.test.ts`

- [ ] **Step 1: Write failing tests** — add to `src/tests/budgets.test.ts`:

```typescript
// Update mock client at top of file:
const mockClient = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
} as unknown as FireflyClient;

// Add to import line:
import { fetchBudgets, fetchBudgetLimits, createBudget, updateBudget, deleteBudget, createBudgetLimit, updateBudgetLimit, deleteBudgetLimit } from '../tools/budgets.js';

// Add these describe blocks:

const budgetSingleFixture = {
  data: {
    id: '3',
    type: 'budgets',
    attributes: { name: 'Groceries', active: true },
    links: {},
  },
};

const limitSingleFixture = {
  data: {
    id: '7',
    type: 'budget_limits',
    attributes: { amount: '500.00', start: '2024-01-01', end: '2024-01-31' },
    links: {},
  },
};

describe('createBudget', () => {
  it('posts to /budgets', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(budgetSingleFixture);
    await createBudget(mockClient, { name: 'Groceries' });
    expect(mockClient.post).toHaveBeenCalledWith('/budgets', { name: 'Groceries' });
  });

  it('returns unwrapped single', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(budgetSingleFixture);
    const result = await createBudget(mockClient, { name: 'Groceries' });
    expect(result).toEqual({ name: 'Groceries', active: true, id: '3' });
  });
});

describe('updateBudget', () => {
  it('puts to /budgets/:id', async () => {
    mockClient.put = vi.fn().mockResolvedValueOnce(budgetSingleFixture);
    await updateBudget(mockClient, '3', { name: 'Food' });
    expect(mockClient.put).toHaveBeenCalledWith('/budgets/3', { name: 'Food' });
  });
});

describe('deleteBudget', () => {
  it('calls delete on /budgets/:id and returns confirmation', async () => {
    mockClient.delete = vi.fn().mockResolvedValueOnce(undefined);
    const result = await deleteBudget(mockClient, '3');
    expect(mockClient.delete).toHaveBeenCalledWith('/budgets/3');
    expect(result).toEqual({ deleted: true, id: '3' });
  });
});

describe('createBudgetLimit', () => {
  it('posts to /budgets/:id/limits', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(limitSingleFixture);
    await createBudgetLimit(mockClient, '3', { start: '2024-01-01', end: '2024-01-31', amount: '500.00' });
    expect(mockClient.post).toHaveBeenCalledWith('/budgets/3/limits', {
      start: '2024-01-01',
      end: '2024-01-31',
      amount: '500.00',
    });
  });

  it('returns unwrapped single', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(limitSingleFixture);
    const result = await createBudgetLimit(mockClient, '3', { start: '2024-01-01', end: '2024-01-31', amount: '500.00' });
    expect(result).toEqual({ amount: '500.00', start: '2024-01-01', end: '2024-01-31', id: '7' });
  });
});

describe('updateBudgetLimit', () => {
  it('puts to /budget-limits/:id', async () => {
    mockClient.put = vi.fn().mockResolvedValueOnce(limitSingleFixture);
    await updateBudgetLimit(mockClient, '7', { amount: '600.00' });
    expect(mockClient.put).toHaveBeenCalledWith('/budget-limits/7', { amount: '600.00' });
  });
});

describe('deleteBudgetLimit', () => {
  it('calls delete on /budget-limits/:id and returns confirmation', async () => {
    mockClient.delete = vi.fn().mockResolvedValueOnce(undefined);
    const result = await deleteBudgetLimit(mockClient, '7');
    expect(mockClient.delete).toHaveBeenCalledWith('/budget-limits/7');
    expect(result).toEqual({ deleted: true, id: '7' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/tests/budgets.test.ts
```

Expected: `createBudget is not a function`.

- [ ] **Step 3: Add write functions and registrations to `src/tools/budgets.ts`**

Update the import from `transform.ts`:

```typescript
import { unwrapList, unwrapSingle, type JsonApiListResponse, type JsonApiSingleResponse, type UnwrappedList, type UnwrappedSingle } from '../transform.js';
```

Add after `fetchBudgetLimits`:

```typescript
export async function createBudget(
  client: FireflyClient,
  params: {
    name: string;
    active?: boolean;
    auto_budget_type?: 'reset' | 'rollover' | 'none';
    auto_budget_currency_code?: string;
    auto_budget_amount?: string;
    auto_budget_period?: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'half-year' | 'yearly';
  }
): Promise<UnwrappedSingle> {
  const response = await client.post<JsonApiSingleResponse>('/budgets', params);
  return unwrapSingle(response);
}

export async function updateBudget(
  client: FireflyClient,
  id: string,
  params: {
    name?: string;
    active?: boolean;
    auto_budget_type?: 'reset' | 'rollover' | 'none';
    auto_budget_currency_code?: string;
    auto_budget_amount?: string;
    auto_budget_period?: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'half-year' | 'yearly';
  }
): Promise<UnwrappedSingle> {
  const response = await client.put<JsonApiSingleResponse>(`/budgets/${id}`, params);
  return unwrapSingle(response);
}

export async function deleteBudget(
  client: FireflyClient,
  id: string
): Promise<{ deleted: true; id: string }> {
  await client.delete(`/budgets/${id}`);
  return { deleted: true, id };
}

export async function createBudgetLimit(
  client: FireflyClient,
  budgetId: string,
  params: {
    start: string;
    end: string;
    amount: string;
    currency_code?: string;
    period?: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'half_year' | 'yearly';
  }
): Promise<UnwrappedSingle> {
  const response = await client.post<JsonApiSingleResponse>(`/budgets/${budgetId}/limits`, params);
  return unwrapSingle(response);
}

export async function updateBudgetLimit(
  client: FireflyClient,
  id: string,
  params: {
    start?: string;
    end?: string;
    amount?: string;
    currency_code?: string;
    period?: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'half_year' | 'yearly';
  }
): Promise<UnwrappedSingle> {
  const response = await client.put<JsonApiSingleResponse>(`/budget-limits/${id}`, params);
  return unwrapSingle(response);
}

export async function deleteBudgetLimit(
  client: FireflyClient,
  id: string
): Promise<{ deleted: true; id: string }> {
  await client.delete(`/budget-limits/${id}`);
  return { deleted: true, id };
}
```

Add after `READ_ANNOTATIONS`:

```typescript
const WRITE_ANNOTATIONS = { openWorldHint: true } as const;
const UPDATE_ANNOTATIONS = { openWorldHint: true, idempotentHint: true } as const;
const DELETE_ANNOTATIONS = { destructiveHint: true, openWorldHint: true } as const;
```

Add inside `registerBudgetTools`, after the existing `get_budget_limits` registration:

```typescript
  server.registerTool(
    'create_budget',
    {
      title: 'Create Budget',
      description: 'Create a new budget in Firefly III.',
      inputSchema: {
        name: z.string().describe('Budget name'),
        active: z.boolean().optional().describe('Whether the budget is active'),
        auto_budget_type: z.enum(['reset', 'rollover', 'none']).optional().describe('Auto-budget type'),
        auto_budget_currency_code: z.string().optional().describe('Currency code for auto-budget'),
        auto_budget_amount: z.string().optional().describe('Auto-budget amount as a number string'),
        auto_budget_period: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'half-year', 'yearly']).optional().describe('Auto-budget period'),
      },
      annotations: WRITE_ANNOTATIONS,
    },
    async (params) => {
      try {
        const result = await createBudget(client, params);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );

  server.registerTool(
    'update_budget',
    {
      title: 'Update Budget',
      description: 'Update an existing budget in Firefly III. Only fields provided will be changed. Use get_budgets to find valid budget IDs.',
      inputSchema: {
        id: z.string().describe('Budget ID — use get_budgets to find valid IDs'),
        name: z.string().optional().describe('Budget name'),
        active: z.boolean().optional().describe('Whether the budget is active'),
        auto_budget_type: z.enum(['reset', 'rollover', 'none']).optional().describe('Auto-budget type'),
        auto_budget_currency_code: z.string().optional().describe('Currency code for auto-budget'),
        auto_budget_amount: z.string().optional().describe('Auto-budget amount as a number string'),
        auto_budget_period: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'half-year', 'yearly']).optional().describe('Auto-budget period'),
      },
      annotations: UPDATE_ANNOTATIONS,
    },
    async ({ id, ...params }) => {
      try {
        const result = await updateBudget(client, id, params);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );

  server.registerTool(
    'delete_budget',
    {
      title: 'Delete Budget',
      description: 'Permanently delete a budget from Firefly III. **This action cannot be undone.** Use get_budgets to confirm the ID before deleting.',
      inputSchema: {
        id: z.string().describe('Budget ID — use get_budgets to find valid IDs'),
      },
      annotations: DELETE_ANNOTATIONS,
    },
    async ({ id }) => {
      try {
        const result = await deleteBudget(client, id);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );

  server.registerTool(
    'create_budget_limit',
    {
      title: 'Create Budget Limit',
      description: 'Create a spending limit for a budget in Firefly III for a specific date range.',
      inputSchema: {
        budget_id: z.string().describe('Budget ID — use get_budgets to find valid IDs'),
        start: z.string().describe('Start date (YYYY-MM-DD)'),
        end: z.string().describe('End date (YYYY-MM-DD)'),
        amount: z.string().describe('Limit amount as a number string'),
        currency_code: z.string().optional().describe('Currency code (e.g. EUR, USD)'),
        period: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'half_year', 'yearly']).optional().describe('Budget period'),
      },
      annotations: WRITE_ANNOTATIONS,
    },
    async ({ budget_id, ...params }) => {
      try {
        const result = await createBudgetLimit(client, budget_id, params);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );

  server.registerTool(
    'update_budget_limit',
    {
      title: 'Update Budget Limit',
      description: 'Update an existing budget limit in Firefly III. Use get_budget_limits to find valid limit IDs.',
      inputSchema: {
        id: z.string().describe('Budget limit ID — use get_budget_limits to find valid IDs'),
        start: z.string().optional().describe('Start date (YYYY-MM-DD)'),
        end: z.string().optional().describe('End date (YYYY-MM-DD)'),
        amount: z.string().optional().describe('Limit amount as a number string'),
        currency_code: z.string().optional().describe('Currency code (e.g. EUR, USD)'),
        period: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'half_year', 'yearly']).optional().describe('Budget period'),
      },
      annotations: UPDATE_ANNOTATIONS,
    },
    async ({ id, ...params }) => {
      try {
        const result = await updateBudgetLimit(client, id, params);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );

  server.registerTool(
    'delete_budget_limit',
    {
      title: 'Delete Budget Limit',
      description: 'Permanently delete a budget limit from Firefly III. **This action cannot be undone.** Use get_budget_limits to confirm the ID before deleting.',
      inputSchema: {
        id: z.string().describe('Budget limit ID — use get_budget_limits to find valid IDs'),
      },
      annotations: DELETE_ANNOTATIONS,
    },
    async ({ id }) => {
      try {
        const result = await deleteBudgetLimit(client, id);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/tests/budgets.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/tools/budgets.ts src/tests/budgets.test.ts
git commit -m "feat: add create/update/delete budget and budget limit tools

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 5: Category write tools

**Files:**
- Modify: `src/tools/categories.ts`
- Modify: `src/tests/categories.test.ts`

- [ ] **Step 1: Write failing tests** — add to `src/tests/categories.test.ts`:

```typescript
// Update mock client at top of file:
const mockClient = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
} as unknown as FireflyClient;

// Add to import line:
import { fetchCategories, fetchCategoryTransactions, createCategory, updateCategory, deleteCategory } from '../tools/categories.js';

// Add these describe blocks:

const categorySingleFixture = {
  data: {
    id: '8',
    type: 'categories',
    attributes: { name: 'Groceries' },
    links: {},
  },
};

describe('createCategory', () => {
  it('posts to /categories', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(categorySingleFixture);
    await createCategory(mockClient, { name: 'Groceries' });
    expect(mockClient.post).toHaveBeenCalledWith('/categories', { name: 'Groceries' });
  });

  it('returns unwrapped single', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(categorySingleFixture);
    const result = await createCategory(mockClient, { name: 'Groceries' });
    expect(result).toEqual({ name: 'Groceries', id: '8' });
  });
});

describe('updateCategory', () => {
  it('puts to /categories/:id', async () => {
    mockClient.put = vi.fn().mockResolvedValueOnce(categorySingleFixture);
    await updateCategory(mockClient, '8', { name: 'Food' });
    expect(mockClient.put).toHaveBeenCalledWith('/categories/8', { name: 'Food' });
  });
});

describe('deleteCategory', () => {
  it('calls delete on /categories/:id and returns confirmation', async () => {
    mockClient.delete = vi.fn().mockResolvedValueOnce(undefined);
    const result = await deleteCategory(mockClient, '8');
    expect(mockClient.delete).toHaveBeenCalledWith('/categories/8');
    expect(result).toEqual({ deleted: true, id: '8' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/tests/categories.test.ts
```

Expected: `createCategory is not a function`.

- [ ] **Step 3: Add write functions and registrations to `src/tools/categories.ts`**

Update the import from `transform.ts`:

```typescript
import { unwrapList, unwrapSingle, type JsonApiListResponse, type JsonApiSingleResponse, type UnwrappedList, type UnwrappedSingle } from '../transform.js';
```

Add after `fetchCategoryTransactions`:

```typescript
export async function createCategory(
  client: FireflyClient,
  params: { name: string; notes?: string }
): Promise<UnwrappedSingle> {
  const response = await client.post<JsonApiSingleResponse>('/categories', params);
  return unwrapSingle(response);
}

export async function updateCategory(
  client: FireflyClient,
  id: string,
  params: { name?: string; notes?: string }
): Promise<UnwrappedSingle> {
  const response = await client.put<JsonApiSingleResponse>(`/categories/${id}`, params);
  return unwrapSingle(response);
}

export async function deleteCategory(
  client: FireflyClient,
  id: string
): Promise<{ deleted: true; id: string }> {
  await client.delete(`/categories/${id}`);
  return { deleted: true, id };
}
```

Add after `READ_ANNOTATIONS`:

```typescript
const WRITE_ANNOTATIONS = { openWorldHint: true } as const;
const UPDATE_ANNOTATIONS = { openWorldHint: true, idempotentHint: true } as const;
const DELETE_ANNOTATIONS = { destructiveHint: true, openWorldHint: true } as const;
```

Add inside `registerCategoryTools`, after the existing `get_category_transactions` registration:

```typescript
  server.registerTool(
    'create_category',
    {
      title: 'Create Category',
      description: 'Create a new spending category in Firefly III.',
      inputSchema: {
        name: z.string().describe('Category name'),
        notes: z.string().optional().describe('Notes'),
      },
      annotations: WRITE_ANNOTATIONS,
    },
    async (params) => {
      try {
        const result = await createCategory(client, params);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );

  server.registerTool(
    'update_category',
    {
      title: 'Update Category',
      description: 'Update an existing category in Firefly III. Use get_categories to find valid category IDs.',
      inputSchema: {
        id: z.string().describe('Category ID — use get_categories to find valid IDs'),
        name: z.string().optional().describe('Category name'),
        notes: z.string().optional().describe('Notes'),
      },
      annotations: UPDATE_ANNOTATIONS,
    },
    async ({ id, ...params }) => {
      try {
        const result = await updateCategory(client, id, params);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );

  server.registerTool(
    'delete_category',
    {
      title: 'Delete Category',
      description: 'Permanently delete a category from Firefly III. **This action cannot be undone.** Transactions in this category will become uncategorised. Use get_categories to confirm the ID.',
      inputSchema: {
        id: z.string().describe('Category ID — use get_categories to find valid IDs'),
      },
      annotations: DELETE_ANNOTATIONS,
    },
    async ({ id }) => {
      try {
        const result = await deleteCategory(client, id);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/tests/categories.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/tools/categories.ts src/tests/categories.test.ts
git commit -m "feat: add create/update/delete category tools

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 6: Bill write tools

**Files:**
- Modify: `src/tools/bills.ts`
- Modify: `src/tests/bills.test.ts`

- [ ] **Step 1: Write failing tests** — add to `src/tests/bills.test.ts`:

```typescript
// Update mock client at top of file:
const mockClient = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
} as unknown as FireflyClient;

// Add to import line:
import { fetchBills, createBill, updateBill, deleteBill } from '../tools/bills.js';

// Add these describe blocks:

const billSingleFixture = {
  data: {
    id: '2',
    type: 'bills',
    attributes: { name: 'Netflix', amount_min: '10.00', amount_max: '15.00', repeat_freq: 'monthly', active: true },
    links: {},
  },
};

describe('createBill', () => {
  it('posts to /bills', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(billSingleFixture);
    await createBill(mockClient, {
      name: 'Netflix',
      amount_min: '10.00',
      amount_max: '15.00',
      date: '2024-01-01',
      repeat_freq: 'monthly',
    });
    expect(mockClient.post).toHaveBeenCalledWith('/bills', expect.objectContaining({ name: 'Netflix' }));
  });

  it('returns unwrapped single', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(billSingleFixture);
    const result = await createBill(mockClient, {
      name: 'Netflix',
      amount_min: '10.00',
      amount_max: '15.00',
      date: '2024-01-01',
      repeat_freq: 'monthly',
    });
    expect(result).toEqual({ name: 'Netflix', amount_min: '10.00', amount_max: '15.00', repeat_freq: 'monthly', active: true, id: '2' });
  });
});

describe('updateBill', () => {
  it('puts to /bills/:id', async () => {
    mockClient.put = vi.fn().mockResolvedValueOnce(billSingleFixture);
    await updateBill(mockClient, '2', { name: 'Netflix Premium' });
    expect(mockClient.put).toHaveBeenCalledWith('/bills/2', { name: 'Netflix Premium' });
  });
});

describe('deleteBill', () => {
  it('calls delete on /bills/:id and returns confirmation', async () => {
    mockClient.delete = vi.fn().mockResolvedValueOnce(undefined);
    const result = await deleteBill(mockClient, '2');
    expect(mockClient.delete).toHaveBeenCalledWith('/bills/2');
    expect(result).toEqual({ deleted: true, id: '2' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/tests/bills.test.ts
```

Expected: `createBill is not a function`.

- [ ] **Step 3: Add write functions and registrations to `src/tools/bills.ts`**

Update the import from `transform.ts`:

```typescript
import { unwrapList, unwrapSingle, type JsonApiListResponse, type JsonApiSingleResponse, type UnwrappedList, type UnwrappedSingle } from '../transform.js';
```

Add after `fetchBills`:

```typescript
export async function createBill(
  client: FireflyClient,
  params: {
    name: string;
    amount_min: string;
    amount_max: string;
    date: string;
    repeat_freq: 'weekly' | 'monthly' | 'quarterly' | 'half-year' | 'yearly';
    currency_code?: string;
    end_date?: string;
    active?: boolean;
    notes?: string;
  }
): Promise<UnwrappedSingle> {
  const response = await client.post<JsonApiSingleResponse>('/bills', params);
  return unwrapSingle(response);
}

export async function updateBill(
  client: FireflyClient,
  id: string,
  params: {
    name?: string;
    amount_min?: string;
    amount_max?: string;
    date?: string;
    repeat_freq?: 'weekly' | 'monthly' | 'quarterly' | 'half-year' | 'yearly';
    currency_code?: string;
    end_date?: string;
    active?: boolean;
    notes?: string;
  }
): Promise<UnwrappedSingle> {
  const response = await client.put<JsonApiSingleResponse>(`/bills/${id}`, params);
  return unwrapSingle(response);
}

export async function deleteBill(
  client: FireflyClient,
  id: string
): Promise<{ deleted: true; id: string }> {
  await client.delete(`/bills/${id}`);
  return { deleted: true, id };
}
```

Add after `READ_ANNOTATIONS`:

```typescript
const WRITE_ANNOTATIONS = { openWorldHint: true } as const;
const UPDATE_ANNOTATIONS = { openWorldHint: true, idempotentHint: true } as const;
const DELETE_ANNOTATIONS = { destructiveHint: true, openWorldHint: true } as const;
```

Add inside `registerBillTools`, after the existing `get_bills` registration:

```typescript
  server.registerTool(
    'create_bill',
    {
      title: 'Create Bill',
      description: 'Create a new recurring bill in Firefly III.',
      inputSchema: {
        name: z.string().describe('Bill name'),
        amount_min: z.string().describe('Minimum expected amount as a number string'),
        amount_max: z.string().describe('Maximum expected amount as a number string'),
        date: z.string().describe('First expected payment date (YYYY-MM-DD)'),
        repeat_freq: z.enum(['weekly', 'monthly', 'quarterly', 'half-year', 'yearly']).describe('Repeat frequency'),
        currency_code: z.string().optional().describe('Currency code (e.g. EUR, USD)'),
        end_date: z.string().optional().describe('End date for the bill (YYYY-MM-DD)'),
        active: z.boolean().optional().describe('Whether the bill is active'),
        notes: z.string().optional().describe('Notes'),
      },
      annotations: WRITE_ANNOTATIONS,
    },
    async (params) => {
      try {
        const result = await createBill(client, params);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );

  server.registerTool(
    'update_bill',
    {
      title: 'Update Bill',
      description: 'Update an existing bill in Firefly III. Only fields provided will be changed. Use get_bills to find valid bill IDs.',
      inputSchema: {
        id: z.string().describe('Bill ID — use get_bills to find valid IDs'),
        name: z.string().optional().describe('Bill name'),
        amount_min: z.string().optional().describe('Minimum expected amount as a number string'),
        amount_max: z.string().optional().describe('Maximum expected amount as a number string'),
        date: z.string().optional().describe('First expected payment date (YYYY-MM-DD)'),
        repeat_freq: z.enum(['weekly', 'monthly', 'quarterly', 'half-year', 'yearly']).optional().describe('Repeat frequency'),
        currency_code: z.string().optional().describe('Currency code (e.g. EUR, USD)'),
        end_date: z.string().optional().describe('End date (YYYY-MM-DD)'),
        active: z.boolean().optional().describe('Whether the bill is active'),
        notes: z.string().optional().describe('Notes'),
      },
      annotations: UPDATE_ANNOTATIONS,
    },
    async ({ id, ...params }) => {
      try {
        const result = await updateBill(client, id, params);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );

  server.registerTool(
    'delete_bill',
    {
      title: 'Delete Bill',
      description: 'Permanently delete a bill from Firefly III. **This action cannot be undone.** Use get_bills to confirm the ID before deleting.',
      inputSchema: {
        id: z.string().describe('Bill ID — use get_bills to find valid IDs'),
      },
      annotations: DELETE_ANNOTATIONS,
    },
    async ({ id }) => {
      try {
        const result = await deleteBill(client, id);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/tests/bills.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/tools/bills.ts src/tests/bills.test.ts
git commit -m "feat: add create/update/delete bill tools

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 7: Piggy bank write tools

**Files:**
- Modify: `src/tools/piggy-banks.ts`
- Modify: `src/tests/piggy-banks.test.ts`

- [ ] **Step 1: Write failing tests** — add to `src/tests/piggy-banks.test.ts`:

```typescript
// Update mock client at top of file:
const mockClient = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
} as unknown as FireflyClient;

// Add to import line:
import { fetchPiggyBanks, createPiggyBank, updatePiggyBank, deletePiggyBank } from '../tools/piggy-banks.js';

// Add these describe blocks:

const piggyBankSingleFixture = {
  data: {
    id: '4',
    type: 'piggy_banks',
    attributes: { name: 'Vacation', target_amount: '1000.00', account_id: '1' },
    links: {},
  },
};

describe('createPiggyBank', () => {
  it('posts to /piggy-banks', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(piggyBankSingleFixture);
    await createPiggyBank(mockClient, { name: 'Vacation', account_id: '1' });
    expect(mockClient.post).toHaveBeenCalledWith('/piggy-banks', { name: 'Vacation', account_id: '1' });
  });

  it('returns unwrapped single', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(piggyBankSingleFixture);
    const result = await createPiggyBank(mockClient, { name: 'Vacation', account_id: '1' });
    expect(result).toEqual({ name: 'Vacation', target_amount: '1000.00', account_id: '1', id: '4' });
  });
});

describe('updatePiggyBank', () => {
  it('puts to /piggy-banks/:id', async () => {
    mockClient.put = vi.fn().mockResolvedValueOnce(piggyBankSingleFixture);
    await updatePiggyBank(mockClient, '4', { target_amount: '2000.00' });
    expect(mockClient.put).toHaveBeenCalledWith('/piggy-banks/4', { target_amount: '2000.00' });
  });
});

describe('deletePiggyBank', () => {
  it('calls delete on /piggy-banks/:id and returns confirmation', async () => {
    mockClient.delete = vi.fn().mockResolvedValueOnce(undefined);
    const result = await deletePiggyBank(mockClient, '4');
    expect(mockClient.delete).toHaveBeenCalledWith('/piggy-banks/4');
    expect(result).toEqual({ deleted: true, id: '4' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/tests/piggy-banks.test.ts
```

Expected: `createPiggyBank is not a function`.

- [ ] **Step 3: Add write functions and registrations to `src/tools/piggy-banks.ts`**

Update the import from `transform.ts`:

```typescript
import { unwrapList, unwrapSingle, type JsonApiListResponse, type JsonApiSingleResponse, type UnwrappedList, type UnwrappedSingle } from '../transform.js';
```

Add after `fetchPiggyBanks`:

```typescript
export async function createPiggyBank(
  client: FireflyClient,
  params: {
    name: string;
    account_id: string;
    target_amount?: string;
    start_date?: string;
    target_date?: string;
    notes?: string;
  }
): Promise<UnwrappedSingle> {
  const response = await client.post<JsonApiSingleResponse>('/piggy-banks', params);
  return unwrapSingle(response);
}

export async function updatePiggyBank(
  client: FireflyClient,
  id: string,
  params: {
    name?: string;
    account_id?: string;
    target_amount?: string;
    start_date?: string;
    target_date?: string;
    notes?: string;
  }
): Promise<UnwrappedSingle> {
  const response = await client.put<JsonApiSingleResponse>(`/piggy-banks/${id}`, params);
  return unwrapSingle(response);
}

export async function deletePiggyBank(
  client: FireflyClient,
  id: string
): Promise<{ deleted: true; id: string }> {
  await client.delete(`/piggy-banks/${id}`);
  return { deleted: true, id };
}
```

Add after `READ_ANNOTATIONS`:

```typescript
const WRITE_ANNOTATIONS = { openWorldHint: true } as const;
const UPDATE_ANNOTATIONS = { openWorldHint: true, idempotentHint: true } as const;
const DELETE_ANNOTATIONS = { destructiveHint: true, openWorldHint: true } as const;
```

Add inside `registerPiggyBankTools`, after the existing `get_piggy_banks` registration:

```typescript
  server.registerTool(
    'create_piggy_bank',
    {
      title: 'Create Piggy Bank',
      description: 'Create a new savings goal (piggy bank) in Firefly III. Requires an asset account ID to link to.',
      inputSchema: {
        name: z.string().describe('Piggy bank name'),
        account_id: z.string().describe('Asset account ID to link to — use get_accounts to find valid IDs'),
        target_amount: z.string().optional().describe('Savings goal amount as a number string'),
        start_date: z.string().optional().describe('Start date (YYYY-MM-DD)'),
        target_date: z.string().optional().describe('Target completion date (YYYY-MM-DD)'),
        notes: z.string().optional().describe('Notes'),
      },
      annotations: WRITE_ANNOTATIONS,
    },
    async (params) => {
      try {
        const result = await createPiggyBank(client, params);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );

  server.registerTool(
    'update_piggy_bank',
    {
      title: 'Update Piggy Bank',
      description: 'Update an existing piggy bank in Firefly III. Only fields provided will be changed. Use get_piggy_banks to find valid IDs.',
      inputSchema: {
        id: z.string().describe('Piggy bank ID — use get_piggy_banks to find valid IDs'),
        name: z.string().optional().describe('Piggy bank name'),
        account_id: z.string().optional().describe('Asset account ID to link to'),
        target_amount: z.string().optional().describe('Savings goal amount as a number string'),
        start_date: z.string().optional().describe('Start date (YYYY-MM-DD)'),
        target_date: z.string().optional().describe('Target completion date (YYYY-MM-DD)'),
        notes: z.string().optional().describe('Notes'),
      },
      annotations: UPDATE_ANNOTATIONS,
    },
    async ({ id, ...params }) => {
      try {
        const result = await updatePiggyBank(client, id, params);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );

  server.registerTool(
    'delete_piggy_bank',
    {
      title: 'Delete Piggy Bank',
      description: 'Permanently delete a piggy bank (savings goal) from Firefly III. **This action cannot be undone.** Use get_piggy_banks to confirm the ID before deleting.',
      inputSchema: {
        id: z.string().describe('Piggy bank ID — use get_piggy_banks to find valid IDs'),
      },
      annotations: DELETE_ANNOTATIONS,
    },
    async ({ id }) => {
      try {
        const result = await deletePiggyBank(client, id);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/tests/piggy-banks.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/tools/piggy-banks.ts src/tests/piggy-banks.test.ts
git commit -m "feat: add create/update/delete piggy bank tools

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 8: Tag write tools

**Files:**
- Modify: `src/tools/reports.ts`
- Modify: `src/tests/reports.test.ts`

- [ ] **Step 1: Write failing tests** — add to `src/tests/reports.test.ts`:

```typescript
// Update mock client at top of file:
const mockClient = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
} as unknown as FireflyClient;

// Add to import line:
import { fetchTags, fetchTagTransactions, fetchSummary, fetchInsightExpenses, fetchInsightIncome, createTag, updateTag, deleteTag } from '../tools/reports.js';

// Add these describe blocks:

const tagSingleFixture = {
  data: {
    id: '6',
    type: 'tags',
    attributes: { tag: 'vacation', description: 'holiday expenses' },
    links: {},
  },
};

describe('createTag', () => {
  it('posts to /tags', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(tagSingleFixture);
    await createTag(mockClient, { tag: 'vacation' });
    expect(mockClient.post).toHaveBeenCalledWith('/tags', { tag: 'vacation' });
  });

  it('returns unwrapped single', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(tagSingleFixture);
    const result = await createTag(mockClient, { tag: 'vacation' });
    expect(result).toEqual({ tag: 'vacation', description: 'holiday expenses', id: '6' });
  });
});

describe('updateTag', () => {
  it('puts to /tags/:id', async () => {
    mockClient.put = vi.fn().mockResolvedValueOnce(tagSingleFixture);
    await updateTag(mockClient, '6', { tag: 'holiday' });
    expect(mockClient.put).toHaveBeenCalledWith('/tags/6', { tag: 'holiday' });
  });
});

describe('deleteTag', () => {
  it('calls delete on /tags/:id and returns confirmation', async () => {
    mockClient.delete = vi.fn().mockResolvedValueOnce(undefined);
    const result = await deleteTag(mockClient, '6');
    expect(mockClient.delete).toHaveBeenCalledWith('/tags/6');
    expect(result).toEqual({ deleted: true, id: '6' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/tests/reports.test.ts
```

Expected: `createTag is not a function`.

- [ ] **Step 3: Add write functions and registrations to `src/tools/reports.ts`**

Update the import from `transform.ts` to add `unwrapSingle`, `JsonApiSingleResponse`, `UnwrappedSingle`:

```typescript
import { unwrapList, unwrapSingle, cleanSummary, type JsonApiListResponse, type JsonApiSingleResponse, type RawSummaryResponse, type CleanSummaryItem, type UnwrappedList, type UnwrappedSingle } from '../transform.js';
```

Add after `fetchInsightIncome`:

```typescript
export async function createTag(
  client: FireflyClient,
  params: { tag: string; date?: string; description?: string }
): Promise<UnwrappedSingle> {
  const response = await client.post<JsonApiSingleResponse>('/tags', params);
  return unwrapSingle(response);
}

export async function updateTag(
  client: FireflyClient,
  id: string,
  params: { tag?: string; date?: string; description?: string }
): Promise<UnwrappedSingle> {
  const response = await client.put<JsonApiSingleResponse>(`/tags/${id}`, params);
  return unwrapSingle(response);
}

export async function deleteTag(
  client: FireflyClient,
  id: string
): Promise<{ deleted: true; id: string }> {
  await client.delete(`/tags/${id}`);
  return { deleted: true, id };
}
```

Add after `READ_ANNOTATIONS`:

```typescript
const WRITE_ANNOTATIONS = { openWorldHint: true } as const;
const UPDATE_ANNOTATIONS = { openWorldHint: true, idempotentHint: true } as const;
const DELETE_ANNOTATIONS = { destructiveHint: true, openWorldHint: true } as const;
```

Add inside `registerReportTools`, after the existing `get_insight_income` registration:

```typescript
  server.registerTool(
    'create_tag',
    {
      title: 'Create Tag',
      description: 'Create a new tag in Firefly III.',
      inputSchema: {
        tag: z.string().describe('Tag name'),
        date: z.string().optional().describe('Tag date (YYYY-MM-DD)'),
        description: z.string().optional().describe('Tag description'),
      },
      annotations: WRITE_ANNOTATIONS,
    },
    async (params) => {
      try {
        const result = await createTag(client, params);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );

  server.registerTool(
    'update_tag',
    {
      title: 'Update Tag',
      description: 'Update an existing tag in Firefly III. Only fields provided will be changed. Use get_tags to find valid tag IDs.',
      inputSchema: {
        id: z.string().describe('Tag ID — use get_tags to find valid IDs'),
        tag: z.string().optional().describe('Tag name'),
        date: z.string().optional().describe('Tag date (YYYY-MM-DD)'),
        description: z.string().optional().describe('Tag description'),
      },
      annotations: UPDATE_ANNOTATIONS,
    },
    async ({ id, ...params }) => {
      try {
        const result = await updateTag(client, id, params);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );

  server.registerTool(
    'delete_tag',
    {
      title: 'Delete Tag',
      description: 'Permanently delete a tag from Firefly III. **This action cannot be undone.** Transactions with this tag will have it removed. Use get_tags to confirm the ID before deleting.',
      inputSchema: {
        id: z.string().describe('Tag ID — use get_tags to find valid IDs'),
      },
      annotations: DELETE_ANNOTATIONS,
    },
    async ({ id }) => {
      try {
        const result = await deleteTag(client, id);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/tests/reports.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Run the full test suite**

```bash
npm test
```

Expected: all tests pass across all files.

- [ ] **Step 6: Commit**

```bash
git add src/tools/reports.ts src/tests/reports.test.ts
git commit -m "feat: add create/update/delete tag tools

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 9: HTTP transport

**Files:**
- Create: `src/http.ts`

No unit tests for this task (port-probing is integration-level behaviour). Manual verification in Step 4.

- [ ] **Step 1: Create `src/http.ts`**

```typescript
import * as http from 'node:http';
import * as net from 'node:net';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

async function isPortAvailable(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, host);
  });
}

export async function startHttpServer(
  server: McpServer,
  host: string,
  requestedPort: number,
  portWasExplicit: boolean
): Promise<void> {
  let port = requestedPort;
  let moved = false;

  if (!(await isPortAvailable(host, port))) {
    if (portWasExplicit) {
      process.stderr.write(`Error: Port ${port} on ${host} is already in use. Choose a different port with --port.\n`);
      process.exit(1);
    }
    const originalPort = port;
    let found = false;
    for (let i = 1; i <= 10; i++) {
      port = originalPort + i;
      if (await isPortAvailable(host, port)) {
        moved = true;
        found = true;
        break;
      }
    }
    if (!found) {
      process.stderr.write(
        `Error: Ports ${originalPort}–${originalPort + 10} on ${host} are all in use. Specify an available port with --port.\n`
      );
      process.exit(1);
    }
  }

  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);

  const httpServer = http.createServer(async (req, res) => {
    try {
      await transport.handleRequest(req, res);
    } catch {
      if (!res.headersSent) {
        res.writeHead(500);
        res.end('Internal server error');
      }
    }
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, host, () => {
      process.stdout.write(`Firefly III MCP server listening on http://${host}:${port}\n`);
      if (moved) {
        process.stdout.write(`(port ${requestedPort} was in use — moved up automatically)\n`);
      }
      resolve();
    });
  });
}
```

- [ ] **Step 2: Verify TypeScript compiles without errors**

```bash
cd /Volumes/Webdev/Personal/claude/fireflyiii-mcp && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/http.ts
git commit -m "feat: add HTTP transport (StreamableHTTP, stateless mode)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 10: CLI argument parsing + transport branching

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Replace `src/index.ts` with the new version**

```typescript
#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { FireflyClient } from './client.js';
import { createServer } from './server.js';
import { startHttpServer } from './http.js';

interface ParsedArgs {
  transport: 'stdio' | 'http';
  host: string;
  port: number;
  portWasExplicit: boolean;
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  let transport: 'stdio' | 'http' = 'stdio';
  let host = '127.0.0.1';
  let port = 3000;
  let portWasExplicit = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--transport' && args[i + 1]) {
      const val = args[++i];
      if (val !== 'stdio' && val !== 'http') {
        process.stderr.write(`Error: --transport must be "stdio" or "http", got "${val}"\n`);
        process.exit(1);
      }
      transport = val;
    } else if (args[i] === '--host' && args[i + 1]) {
      host = args[++i];
    } else if (args[i] === '--port' && args[i + 1]) {
      const parsed = parseInt(args[++i], 10);
      if (isNaN(parsed) || parsed < 1 || parsed > 65535) {
        process.stderr.write('Error: --port must be a valid port number (1–65535)\n');
        process.exit(1);
      }
      port = parsed;
      portWasExplicit = true;
    }
  }

  return { transport, host, port, portWasExplicit };
}

const { transport, host, port, portWasExplicit } = parseArgs();

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

if (transport === 'http') {
  await startHttpServer(server, host, port, portWasExplicit);
} else {
  const stdioTransport = new StdioServerTransport();
  await server.connect(stdioTransport);
}
```

- [ ] **Step 2: Verify TypeScript compiles without errors**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Verify stdio mode still works**

```bash
npm run build && echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | dotenv -e .env -- node dist/index.js
```

Expected: JSON response listing all tools (including the new write tools).

- [ ] **Step 4: Verify HTTP mode starts and prints the listening message**

```bash
dotenv -e .env -- node dist/index.js --transport http --port 4444
```

Expected output:
```
Firefly III MCP server listening on http://127.0.0.1:4444
```

Press Ctrl+C to stop.

- [ ] **Step 5: Verify port auto-increment when default port is in use**

Start a dummy listener on port 3000:
```bash
node -e "require('net').createServer().listen(3000, '127.0.0.1', () => console.log('blocking 3000'))" &
BLOCKER_PID=$!
dotenv -e .env -- node dist/index.js --transport http
kill $BLOCKER_PID
```

Expected output:
```
Firefly III MCP server listening on http://127.0.0.1:3001
(port 3000 was in use — moved up automatically)
```

- [ ] **Step 6: Commit**

```bash
git add src/index.ts
git commit -m "feat: add --transport, --host, --port CLI flags; HTTP transport opt-in

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 11: Build dist and update CLAUDE.md

**Files:**
- Rebuild: `dist/`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Run full test suite one final time**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 2: Build**

```bash
npm run build
```

Expected: no TypeScript errors, `dist/` updated.

- [ ] **Step 3: Update CLAUDE.md — Phase 1 vs Phase 2 section**

Replace the Phase 1 vs Phase 2 section with:

```markdown
## Phase 1 vs Phase 2

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
- No HTTP auth (Phase 3: OAuth via Firefly III)

**Phase 3 (future):**
- OAuth via Firefly III for HTTP transport (replaces PAT token in HTTP mode)
- Multi-split transaction support
```

Also update the **Build & Test Commands** section to add:

```markdown
npm run dev -- --transport http          # Run HTTP server in dev mode
npm run dev -- --transport http --port 4000  # Run on a specific port
```

Also update the **Tool Annotations** section to add:

```markdown
Phase 2 write tools use:
- Create/update: `{ openWorldHint: true }` / `{ openWorldHint: true, idempotentHint: true }`  
- Delete: `{ destructiveHint: true, openWorldHint: true }`
```

- [ ] **Step 4: Commit everything**

```bash
git add dist/ CLAUDE.md
git commit -m "chore: build dist and update CLAUDE.md for Phase 2

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```
