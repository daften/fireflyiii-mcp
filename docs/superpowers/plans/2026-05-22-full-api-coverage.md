# Full API Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement ~50 new tools achieving near-complete Firefly III API coverage across 4 new tool groups and additions to 9 existing files.

**Architecture:** Each tool follows the fetch-function + registerTool pattern. New groups get their own file wired into TOOL_GROUPS/registerAllTools. Client gets getText() for raw CSV/binary responses.

**Tech Stack:** TypeScript ESM, @modelcontextprotocol/sdk, Zod, Vitest, Node 18+

---

## Task 1: Client — add getText() and extend QueryParams

**Files:**
- Modify: `src/types.ts`
- Modify: `src/client.ts`
- Modify: `src/tests/client.test.ts`

- [ ] **Step 1: Write failing test**

Add to `src/tests/client.test.ts`:

```typescript
it('getText returns raw response text', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response('id,name\n1,Checking', { status: 200 })
  );
  const client = new FireflyClient('https://firefly.example.com', 'my-token');
  const result = await client.getText('/data/export/accounts', { type: 'csv' });
  expect(result).toBe('id,name\n1,Checking');
  expect(fetch).toHaveBeenCalledWith(
    'https://firefly.example.com/api/v1/data/export/accounts?type=csv',
    expect.objectContaining({ method: 'GET' })
  );
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd /Volumes/Webdev/Personal/claude/fireflyiii-mcp && npm test -- --reporter=verbose 2>&1 | grep -A 3 "getText"
```

Expected: FAIL — `client.getText is not a function`

- [ ] **Step 3: Extend QueryParams to support string[]**

In `src/types.ts`, change:
```typescript
export type QueryParams = Record<string, string | number | number[] | string[] | undefined>;
```

- [ ] **Step 4: Add getText() to FireflyClient**

In `src/client.ts`, add after the `postBinary` method:

```typescript
async getText(path: string, params?: QueryParams): Promise<string> {
  const response = await this.rawFetch(this.buildUrl(path, params), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${this.getToken()}`,
      Accept: '*/*',
    },
  });
  return response.text();
}
```

- [ ] **Step 5: Run tests**

```bash
npm test
```

Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/client.ts src/tests/client.test.ts && git commit -m "feat: add getText() to FireflyClient and string[] to QueryParams

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Reports — get_about and get_net_worth_summary

**Files:**
- Modify: `src/tools/reports.ts`
- Modify: `src/tests/reports.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `src/tests/reports.test.ts`:

```typescript
describe('fetchAbout', () => {
  it('calls /about and returns response', async () => {
    const fixture = { data: { version: '6.1.0', os: 'Linux' } };
    mockClient.get = vi.fn().mockResolvedValueOnce(fixture);
    const result = await fetchAbout(mockClient);
    expect(mockClient.get).toHaveBeenCalledWith('/about');
    expect(result).toEqual(fixture);
  });
});

describe('fetchNetWorth', () => {
  it('calls /summary/net-worth with params', async () => {
    const fixture = [{ key: 'net-worth-in-EUR', value: { monetary_value: '5000' } }];
    mockClient.get = vi.fn().mockResolvedValueOnce(fixture);
    const result = await fetchNetWorth(mockClient, '2026-01-01', '2026-01-31');
    expect(mockClient.get).toHaveBeenCalledWith('/summary/net-worth', { start: '2026-01-01', end: '2026-01-31' });
    expect(result).toEqual(fixture);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- src/tests/reports.test.ts 2>&1 | grep -E "FAIL|fetchAbout|fetchNetWorth"
```

- [ ] **Step 3: Add fetch functions to reports.ts**

Add after the existing `deleteTag` function:

```typescript
export async function fetchAbout(client: FireflyClient): Promise<unknown> {
  return client.get('/about');
}

export async function fetchNetWorth(
  client: FireflyClient,
  start: string,
  end: string,
  currencyCode?: string
): Promise<unknown> {
  const query: QueryParams = { start, end };
  if (currencyCode) query['currency_code'] = currencyCode;
  return client.get('/summary/net-worth', query);
}
```

- [ ] **Step 4: Add registerTool calls inside registerReportTools()**

Add at the end of `registerReportTools`, before the closing `}`:

```typescript
server.registerTool(
  'get_about',
  {
    title: 'Get Server Info',
    description: 'Get Firefly III server version, PHP version, and OS info. Useful for diagnostics.',
    inputSchema: {},
    annotations: READ_ANNOTATIONS,
  },
  async () => {
    try {
      const result = await fetchAbout(client);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  }
);

server.registerTool(
  'get_net_worth_summary',
  {
    title: 'Get Net Worth Summary',
    description: 'Get net worth over a date range, broken down by currency. Both start and end dates (YYYY-MM-DD) are required.',
    inputSchema: {
      start: z.string().describe('Start date (YYYY-MM-DD)'),
      end: z.string().describe('End date (YYYY-MM-DD)'),
      currency_code: z.string().optional().describe('Filter by currency code (e.g. EUR, USD)'),
    },
    annotations: READ_ANNOTATIONS,
  },
  async ({ start, end, currency_code }) => {
    try {
      const result = await fetchNetWorth(client, start, end, currency_code);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  }
);
```

- [ ] **Step 5: Run tests**

```bash
npm test
```

- [ ] **Step 6: Commit**

```bash
git add src/tools/reports.ts src/tests/reports.test.ts && git commit -m "feat: add get_about and get_net_worth_summary tools

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Reports — chart tools and exchange rate

**Files:**
- Modify: `src/tools/reports.ts`
- Modify: `src/tests/reports.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `src/tests/reports.test.ts`:

```typescript
describe('fetchChart', () => {
  it('calls chart endpoint with start/end', async () => {
    const fixture = [{ label: 'Checking', entries: {} }];
    mockClient.get = vi.fn().mockResolvedValueOnce(fixture);
    const result = await fetchChart(mockClient, '/chart/account/overview', '2026-01-01', '2026-01-31');
    expect(mockClient.get).toHaveBeenCalledWith('/chart/account/overview', { start: '2026-01-01', end: '2026-01-31' });
    expect(result).toEqual(fixture);
  });
});

describe('fetchExchangeRate', () => {
  it('calls exchange rate endpoint', async () => {
    const fixture = { data: { rate: 1.08 } };
    mockClient.get = vi.fn().mockResolvedValueOnce(fixture);
    await fetchExchangeRate(mockClient, 'EUR', 'USD');
    expect(mockClient.get).toHaveBeenCalledWith('/exchange-rates/by-currencies/EUR/USD', {});
  });
  it('includes date when provided', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce({});
    await fetchExchangeRate(mockClient, 'EUR', 'USD', '2026-01-01');
    expect(mockClient.get).toHaveBeenCalledWith('/exchange-rates/by-currencies/EUR/USD', { date: '2026-01-01' });
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- src/tests/reports.test.ts 2>&1 | grep -E "fetchChart|fetchExchangeRate"
```

- [ ] **Step 3: Add fetch functions to reports.ts**

```typescript
export async function fetchChart(
  client: FireflyClient,
  endpoint: string,
  start: string,
  end: string
): Promise<unknown> {
  return client.get(endpoint, { start, end });
}

export async function fetchExchangeRate(
  client: FireflyClient,
  from: string,
  to: string,
  date?: string
): Promise<unknown> {
  const query: QueryParams = {};
  if (date) query['date'] = date;
  return client.get(`/exchange-rates/by-currencies/${encodeURIComponent(from)}/${encodeURIComponent(to)}`, query);
}
```

- [ ] **Step 4: Add registerTool calls inside registerReportTools()**

```typescript
const CHART_ENDPOINTS: Record<string, { title: string; description: string; endpoint: string }> = {
  get_account_overview_chart: {
    title: 'Get Account Overview Chart',
    description: 'Get chart data showing account balances over a date range.',
    endpoint: '/chart/account/overview',
  },
  get_balance_chart: {
    title: 'Get Balance Chart',
    description: 'Get chart data showing balance changes over a date range.',
    endpoint: '/chart/balance/balance',
  },
  get_budget_chart: {
    title: 'Get Budget Chart',
    description: 'Get chart data showing budget usage over a date range.',
    endpoint: '/chart/budget/overview',
  },
  get_category_chart: {
    title: 'Get Category Chart',
    description: 'Get chart data showing spending by category over a date range.',
    endpoint: '/chart/category/overview',
  },
};

for (const [name, { title, description, endpoint }] of Object.entries(CHART_ENDPOINTS)) {
  server.registerTool(
    name,
    {
      title,
      description: `${description} Both start and end dates (YYYY-MM-DD) are required.`,
      inputSchema: {
        start: z.string().describe('Start date (YYYY-MM-DD)'),
        end: z.string().describe('End date (YYYY-MM-DD)'),
      },
      annotations: READ_ANNOTATIONS,
    },
    async ({ start, end }) => {
      try {
        const result = await fetchChart(client, endpoint, start, end);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );
}

server.registerTool(
  'get_exchange_rate',
  {
    title: 'Get Exchange Rate',
    description: 'Get the exchange rate between two currencies. Optionally specify a date (YYYY-MM-DD) for historical rates.',
    inputSchema: {
      from: z.string().describe('Source currency code (e.g. EUR)'),
      to: z.string().describe('Target currency code (e.g. USD)'),
      date: z.string().optional().describe('Date for historical rate (YYYY-MM-DD). Defaults to today.'),
    },
    annotations: READ_ANNOTATIONS,
  },
  async ({ from, to, date }) => {
    try {
      const result = await fetchExchangeRate(client, from, to, date);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  }
);
```

- [ ] **Step 5: Run tests**

```bash
npm test
```

- [ ] **Step 6: Commit**

```bash
git add src/tools/reports.ts src/tests/reports.test.ts && git commit -m "feat: add chart tools and get_exchange_rate

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Reports — 14 new insight variants

**Files:**
- Modify: `src/tools/reports.ts`
- Modify: `src/tests/reports.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `src/tests/reports.test.ts`:

```typescript
describe('fetchInsightGrouped', () => {
  it('calls endpoint with start/end', async () => {
    const fixture = [{ name: 'Groceries', difference: '-200' }];
    mockClient.get = vi.fn().mockResolvedValueOnce(fixture);
    const result = await fetchInsightGrouped(mockClient, '/insight/expense/bill', '2026-01-01', '2026-01-31');
    expect(mockClient.get).toHaveBeenCalledWith('/insight/expense/bill', { start: '2026-01-01', end: '2026-01-31' });
    expect(result).toEqual(fixture);
  });

  it('passes filter arrays as query params', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce([]);
    await fetchInsightGrouped(mockClient, '/insight/expense/bill', '2026-01-01', '2026-01-31', { 'bills[]': ['1', '2'] });
    expect(mockClient.get).toHaveBeenCalledWith('/insight/expense/bill', {
      start: '2026-01-01',
      end: '2026-01-31',
      'bills[]': ['1', '2'],
    });
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- src/tests/reports.test.ts 2>&1 | grep "fetchInsightGrouped"
```

- [ ] **Step 3: Add fetch helper to reports.ts**

```typescript
export async function fetchInsightGrouped(
  client: FireflyClient,
  endpoint: string,
  start: string,
  end: string,
  filters?: Record<string, string[]>
): Promise<unknown> {
  const query: QueryParams = { start, end, ...filters };
  return client.get(endpoint, query);
}
```

- [ ] **Step 4: Add 14 registerTool calls inside registerReportTools()**

```typescript
const INSIGHT_GROUPED_TOOLS: Array<{
  name: string;
  title: string;
  description: string;
  endpoint: string;
  filterKey?: string;
  filterDesc?: string;
}> = [
  { name: 'get_insight_expenses_by_bill', title: 'Get Expense Insights by Bill', description: 'Get expense totals grouped by bill for a date range.', endpoint: '/insight/expense/bill', filterKey: 'bills[]', filterDesc: 'Filter to specific bill IDs' },
  { name: 'get_insight_expenses_by_budget', title: 'Get Expense Insights by Budget', description: 'Get expense totals grouped by budget for a date range.', endpoint: '/insight/expense/budget', filterKey: 'budgets[]', filterDesc: 'Filter to specific budget IDs' },
  { name: 'get_insight_expenses_by_tag', title: 'Get Expense Insights by Tag', description: 'Get expense totals grouped by tag for a date range.', endpoint: '/insight/expense/tag', filterKey: 'tags[]', filterDesc: 'Filter to specific tag IDs' },
  { name: 'get_insight_expenses_by_asset', title: 'Get Expense Insights by Asset Account', description: 'Get expense totals grouped by asset account for a date range.', endpoint: '/insight/expense/asset', filterKey: 'assets[]', filterDesc: 'Filter to specific asset account IDs' },
  { name: 'get_insight_expenses_by_expense_account', title: 'Get Expense Insights by Expense Account', description: 'Get expense totals grouped by expense account for a date range.', endpoint: '/insight/expense/expense', filterKey: 'accounts[]', filterDesc: 'Filter to specific expense account IDs' },
  { name: 'get_insight_expenses_total', title: 'Get Total Expenses', description: 'Get total expense amount for a date range, grouped by currency.', endpoint: '/insight/expense/total' },
  { name: 'get_insight_income_by_revenue', title: 'Get Income Insights by Revenue Account', description: 'Get income totals grouped by revenue account for a date range.', endpoint: '/insight/income/revenue', filterKey: 'revenue[]', filterDesc: 'Filter to specific revenue account IDs' },
  { name: 'get_insight_income_by_tag', title: 'Get Income Insights by Tag', description: 'Get income totals grouped by tag for a date range.', endpoint: '/insight/income/tag', filterKey: 'tags[]', filterDesc: 'Filter to specific tag IDs' },
  { name: 'get_insight_income_by_asset', title: 'Get Income Insights by Asset Account', description: 'Get income totals grouped by asset account for a date range.', endpoint: '/insight/income/asset', filterKey: 'assets[]', filterDesc: 'Filter to specific asset account IDs' },
  { name: 'get_insight_income_total', title: 'Get Total Income', description: 'Get total income amount for a date range, grouped by currency.', endpoint: '/insight/income/total' },
  { name: 'get_insight_transfers_by_category', title: 'Get Transfer Insights by Category', description: 'Get transfer totals grouped by category for a date range.', endpoint: '/insight/transfer/category', filterKey: 'categories[]', filterDesc: 'Filter to specific category IDs' },
  { name: 'get_insight_transfers_by_tag', title: 'Get Transfer Insights by Tag', description: 'Get transfer totals grouped by tag for a date range.', endpoint: '/insight/transfer/tag', filterKey: 'tags[]', filterDesc: 'Filter to specific tag IDs' },
  { name: 'get_insight_transfers_by_asset', title: 'Get Transfer Insights by Asset Account', description: 'Get transfer totals grouped by asset account for a date range.', endpoint: '/insight/transfer/asset', filterKey: 'assets[]', filterDesc: 'Filter to specific asset account IDs' },
  { name: 'get_insight_transfers_total', title: 'Get Total Transfers', description: 'Get total transfer amount for a date range, grouped by currency.', endpoint: '/insight/transfer/total' },
];

for (const { name, title, description, endpoint, filterKey, filterDesc } of INSIGHT_GROUPED_TOOLS) {
  const inputSchema: Record<string, unknown> = {
    start: z.string().describe('Start date (YYYY-MM-DD)'),
    end: z.string().describe('End date (YYYY-MM-DD)'),
  };
  if (filterKey) {
    inputSchema[filterKey] = z.array(z.string()).optional().describe(filterDesc!);
  }

  server.registerTool(
    name,
    {
      title,
      description: `${description} Both start and end dates (YYYY-MM-DD) are required.`,
      inputSchema,
      annotations: READ_ANNOTATIONS,
    },
    async (params: Record<string, unknown>) => {
      try {
        const { start, end, ...rest } = params as { start: string; end: string; [k: string]: unknown };
        const filters: Record<string, string[]> = {};
        for (const [k, v] of Object.entries(rest)) {
          if (Array.isArray(v)) filters[k] = v as string[];
        }
        const result = await fetchInsightGrouped(client, endpoint, start, end, Object.keys(filters).length ? filters : undefined);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );
}
```

- [ ] **Step 5: Run tests**

```bash
npm test
```

- [ ] **Step 6: Commit**

```bash
git add src/tools/reports.ts src/tests/reports.test.ts && git commit -m "feat: add 14 grouped insight tools to reports

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 5: Accounts — get_account_transactions and search_accounts

**Files:**
- Modify: `src/tools/accounts.ts`
- Modify: `src/tests/accounts.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `src/tests/accounts.test.ts`:

```typescript
describe('fetchAccountTransactions', () => {
  it('calls /accounts/:id/transactions with params', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    await fetchAccountTransactions(mockClient, '1', { start: '2026-01-01', end: '2026-01-31', page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/accounts/1/transactions', {
      start: '2026-01-01', end: '2026-01-31', page: 1, limit: 50,
    });
  });
});

describe('searchAccounts', () => {
  it('calls /search/accounts with query', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    await searchAccounts(mockClient, { query: 'Checking', page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/search/accounts', { query: 'Checking', page: 1, limit: 50 });
  });
});
```

(Use the existing `listFixture` already defined in accounts.test.ts)

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- src/tests/accounts.test.ts 2>&1 | grep -E "fetchAccountTransactions|searchAccounts"
```

- [ ] **Step 3: Add fetch functions to accounts.ts**

```typescript
export async function fetchAccountTransactions(
  client: FireflyClient,
  id: string,
  params: { start?: string; end?: string; type?: string; page?: number; limit?: number }
): Promise<UnwrappedList> {
  const query: QueryParams = { page: params.page, limit: params.limit };
  if (params.start) query['start'] = params.start;
  if (params.end) query['end'] = params.end;
  if (params.type) query['type'] = params.type;
  const response = await client.get<JsonApiListResponse>(`/accounts/${id}/transactions`, query);
  return unwrapList(response);
}

export async function searchAccounts(
  client: FireflyClient,
  params: { query: string; field?: string; page?: number; limit?: number }
): Promise<UnwrappedList> {
  const query: QueryParams = { query: params.query, page: params.page, limit: params.limit };
  if (params.field) query['field'] = params.field;
  const response = await client.get<JsonApiListResponse>('/search/accounts', query);
  return unwrapList(response);
}
```

- [ ] **Step 4: Add registerTool calls inside registerAccountTools()**

```typescript
server.registerTool(
  'get_account_transactions',
  {
    title: 'Get Account Transactions',
    description: 'Get all transactions for a specific account. Use get_accounts to find valid account IDs.',
    inputSchema: {
      id: z.string().describe('Account ID'),
      start: z.string().optional().describe('Start date (YYYY-MM-DD)'),
      end: z.string().optional().describe('End date (YYYY-MM-DD)'),
      type: z.enum(['all', 'withdrawal', 'deposit', 'transfer', 'opening_balance', 'reconciliation', 'special', 'default']).optional().describe('Filter by transaction type'),
      page: z.number().int().positive().optional().default(1).describe('Page number'),
      limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
    },
    annotations: READ_ANNOTATIONS,
  },
  async ({ id, start, end, type, page, limit }) => {
    try {
      const result = await fetchAccountTransactions(client, id, { start, end, type, page, limit });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  }
);

server.registerTool(
  'search_accounts',
  {
    title: 'Search Accounts',
    description: 'Search for accounts by name, IBAN, account number, or ID.',
    inputSchema: {
      query: z.string().describe('Search query'),
      field: z.enum(['all', 'id', 'name', 'iban', 'number', 'account_number']).optional().default('all').describe('Field to search in'),
      page: z.number().int().positive().optional().default(1).describe('Page number'),
      limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
    },
    annotations: READ_ANNOTATIONS,
  },
  async ({ query, field, page, limit }) => {
    try {
      const result = await searchAccounts(client, { query, field, page, limit });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  }
);
```

- [ ] **Step 5: Run tests**

```bash
npm test
```

- [ ] **Step 6: Commit**

```bash
git add src/tools/accounts.ts src/tests/accounts.test.ts && git commit -m "feat: add get_account_transactions and search_accounts

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 6: Budgets — available budgets, budget transactions, without-budget

**Files:**
- Modify: `src/tools/budgets.ts`
- Modify: `src/tests/budgets.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `src/tests/budgets.test.ts`:

```typescript
const availableBudgetFixture = {
  data: [{ id: '1', type: 'available_budgets', attributes: { amount: '500.00', currency_code: 'EUR', start: '2026-01-01', end: '2026-01-31' }, links: {} }],
  meta: { pagination: { current_page: 1, total_pages: 1, total: 1 } },
};

describe('fetchAvailableBudgets', () => {
  it('calls /available-budgets', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(availableBudgetFixture);
    await fetchAvailableBudgets(mockClient, { page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/available-budgets', { page: 1, limit: 50 });
  });
});

describe('fetchAvailableBudget', () => {
  it('calls /available-budgets/:id', async () => {
    const single = { data: { id: '1', type: 'available_budgets', attributes: { amount: '500.00' }, links: {} } };
    mockClient.get = vi.fn().mockResolvedValueOnce(single);
    await fetchAvailableBudget(mockClient, '1');
    expect(mockClient.get).toHaveBeenCalledWith('/available-budgets/1');
  });
});

describe('fetchBudgetTransactions', () => {
  it('calls /budgets/:id/transactions', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(availableBudgetFixture);
    await fetchBudgetTransactions(mockClient, '3', { page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/budgets/3/transactions', { page: 1, limit: 50 });
  });
});

describe('fetchTransactionsWithoutBudget', () => {
  it('calls /budgets/transactions-without-budget', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(availableBudgetFixture);
    await fetchTransactionsWithoutBudget(mockClient, { page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/budgets/transactions-without-budget', { page: 1, limit: 50 });
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- src/tests/budgets.test.ts 2>&1 | grep -E "fetchAvailable|fetchBudgetTrans|fetchTransactionsWithout"
```

- [ ] **Step 3: Add fetch functions to budgets.ts**

```typescript
export async function fetchAvailableBudgets(
  client: FireflyClient,
  params: { page?: number; limit?: number }
): Promise<UnwrappedList> {
  const response = await client.get<JsonApiListResponse>('/available-budgets', { page: params.page, limit: params.limit });
  return unwrapList(response);
}

export async function fetchAvailableBudget(
  client: FireflyClient,
  id: string
): Promise<UnwrappedSingle> {
  const response = await client.get<JsonApiSingleResponse>(`/available-budgets/${id}`);
  return unwrapSingle(response);
}

export async function fetchBudgetTransactions(
  client: FireflyClient,
  id: string,
  params: { start?: string; end?: string; page?: number; limit?: number }
): Promise<UnwrappedList> {
  const query: QueryParams = { page: params.page, limit: params.limit };
  if (params.start) query['start'] = params.start;
  if (params.end) query['end'] = params.end;
  const response = await client.get<JsonApiListResponse>(`/budgets/${id}/transactions`, query);
  return unwrapList(response);
}

export async function fetchTransactionsWithoutBudget(
  client: FireflyClient,
  params: { start?: string; end?: string; page?: number; limit?: number }
): Promise<UnwrappedList> {
  const query: QueryParams = { page: params.page, limit: params.limit };
  if (params.start) query['start'] = params.start;
  if (params.end) query['end'] = params.end;
  const response = await client.get<JsonApiListResponse>('/budgets/transactions-without-budget', query);
  return unwrapList(response);
}
```

- [ ] **Step 4: Add registerTool calls inside registerBudgetTools()**

```typescript
server.registerTool(
  'get_available_budgets',
  {
    title: 'Get Available Budgets',
    description: 'Get all available budget amounts configured in Firefly III (the total money available to budget per period).',
    inputSchema: {
      page: z.number().int().positive().optional().default(1).describe('Page number'),
      limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
    },
    annotations: READ_ANNOTATIONS,
  },
  async ({ page, limit }) => {
    try {
      const result = await fetchAvailableBudgets(client, { page, limit });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  }
);

server.registerTool(
  'get_available_budget',
  {
    title: 'Get Available Budget',
    description: 'Get a single available budget amount by ID. Use get_available_budgets to find valid IDs.',
    inputSchema: {
      id: z.string().describe('Available budget ID'),
    },
    annotations: READ_ANNOTATIONS,
  },
  async ({ id }) => {
    try {
      const result = await fetchAvailableBudget(client, id);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  }
);

server.registerTool(
  'get_budget_transactions',
  {
    title: 'Get Budget Transactions',
    description: 'Get all transactions linked to a specific budget. Use get_budgets to find valid budget IDs.',
    inputSchema: {
      id: z.string().describe('Budget ID'),
      start: z.string().optional().describe('Start date (YYYY-MM-DD)'),
      end: z.string().optional().describe('End date (YYYY-MM-DD)'),
      page: z.number().int().positive().optional().default(1).describe('Page number'),
      limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
    },
    annotations: READ_ANNOTATIONS,
  },
  async ({ id, start, end, page, limit }) => {
    try {
      const result = await fetchBudgetTransactions(client, id, { start, end, page, limit });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  }
);

server.registerTool(
  'get_transactions_without_budget',
  {
    title: 'Get Transactions Without Budget',
    description: 'Get all transactions that have no budget assigned. Useful for finding unbudgeted spending.',
    inputSchema: {
      start: z.string().optional().describe('Start date (YYYY-MM-DD)'),
      end: z.string().optional().describe('End date (YYYY-MM-DD)'),
      page: z.number().int().positive().optional().default(1).describe('Page number'),
      limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
    },
    annotations: READ_ANNOTATIONS,
  },
  async ({ start, end, page, limit }) => {
    try {
      const result = await fetchTransactionsWithoutBudget(client, { start, end, page, limit });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  }
);
```

- [ ] **Step 5: Run tests**

```bash
npm test
```

- [ ] **Step 6: Commit**

```bash
git add src/tools/budgets.ts src/tests/budgets.test.ts && git commit -m "feat: add available budgets and budget transaction tools

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 7: Bills, piggy bank events, rules, recurring, attachments, transactions additions

**Files:**
- Modify: `src/tools/bills.ts`, `src/tests/bills.test.ts`
- Modify: `src/tools/piggy-banks.ts`, `src/tests/piggy-banks.test.ts`
- Modify: `src/tools/rules.ts`, `src/tests/rules.test.ts`
- Modify: `src/tools/recurring.ts`, `src/tests/recurring.test.ts`
- Modify: `src/tools/attachments.ts`, `src/tests/attachments.test.ts`
- Modify: `src/tools/transactions.ts`, `src/tests/transactions.test.ts`

- [ ] **Step 1: Write failing tests for all 6 files**

Add to `src/tests/bills.test.ts`:
```typescript
describe('fetchBillTransactions', () => {
  it('calls /bills/:id/transactions', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    await fetchBillTransactions(mockClient, '5', { page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/bills/5/transactions', { page: 1, limit: 50 });
  });
});
```

Add to `src/tests/piggy-banks.test.ts`:
```typescript
const piggyEventFixture = {
  data: [{ id: '1', type: 'piggy_bank_events', attributes: { amount: '50.00', date: '2026-01-15' }, links: {} }],
  meta: { pagination: { current_page: 1, total_pages: 1, total: 1 } },
};
const piggyEventSingle = {
  data: { id: '2', type: 'piggy_bank_events', attributes: { amount: '25.00', date: '2026-01-20' }, links: {} },
};

describe('fetchPiggyBankEvents', () => {
  it('calls /piggy-banks/:id/events', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(piggyEventFixture);
    await fetchPiggyBankEvents(mockClient, '3', { page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/piggy-banks/3/events', { page: 1, limit: 50 });
  });
});

describe('createPiggyBankEvent', () => {
  it('posts to /piggy-banks/:id/events', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(piggyEventSingle);
    await createPiggyBankEvent(mockClient, '3', { amount: '50.00', date: '2026-01-20' });
    expect(mockClient.post).toHaveBeenCalledWith('/piggy-banks/3/events', { amount: '50.00', date: '2026-01-20' });
  });
});

describe('deletePiggyBankEvent', () => {
  it('calls delete and returns confirmation', async () => {
    mockClient.delete = vi.fn().mockResolvedValueOnce(undefined);
    const result = await deletePiggyBankEvent(mockClient, '3', '1');
    expect(mockClient.delete).toHaveBeenCalledWith('/piggy-banks/3/events/1');
    expect(result).toEqual({ deleted: true, id: '1' });
  });
});
```

Add to `src/tests/rules.test.ts`:
```typescript
describe('fetchRuleGroupRules', () => {
  it('calls /rule-groups/:id/rules', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    await fetchRuleGroupRules(mockClient, '1', { page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/rule-groups/1/rules', { page: 1, limit: 50 });
  });
});

describe('testRule', () => {
  it('calls /rules/:id/test', async () => {
    const fixture = [{ id: '10', type: 'transactions' }];
    mockClient.get = vi.fn().mockResolvedValueOnce(fixture);
    const result = await testRule(mockClient, '5', {});
    expect(mockClient.get).toHaveBeenCalledWith('/rules/5/test', { page: undefined, limit: undefined });
    expect(result).toEqual(fixture);
  });
});

describe('triggerRule', () => {
  it('posts to /rules/:id/trigger and returns confirmation', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(undefined);
    const result = await triggerRule(mockClient, '5', {});
    expect(mockClient.post).toHaveBeenCalledWith('/rules/5/trigger', {}, {});
    expect(result).toEqual({ triggered: true, id: '5' });
  });
});
```

Add to `src/tests/recurring.test.ts`:
```typescript
describe('fetchRecurrenceTransactions', () => {
  it('calls /recurrences/:id/transactions', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    await fetchRecurrenceTransactions(mockClient, '2', { page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/recurrences/2/transactions', { page: 1, limit: 50 });
  });
});

describe('triggerRecurrence', () => {
  it('posts to /recurrences/:id/trigger', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(undefined);
    const result = await triggerRecurrence(mockClient, '2');
    expect(mockClient.post).toHaveBeenCalledWith('/recurrences/2/trigger', {}, {});
    expect(result).toEqual({ triggered: true, id: '2' });
  });
});
```

Add to `src/tests/attachments.test.ts`:
```typescript
describe('downloadAttachment', () => {
  it('calls getText on /attachments/:id/download', async () => {
    const mockFull = { ...mockClient, getText: vi.fn().mockResolvedValueOnce('receipt content') } as unknown as FireflyClient;
    const result = await downloadAttachment(mockFull, '7');
    expect(mockFull.getText).toHaveBeenCalledWith('/attachments/7/download');
    expect(result).toBe('receipt content');
  });
});
```

Add to `src/tests/transactions.test.ts` (find an existing `describe` block to append after):
```typescript
describe('bulkUpdateTransactions', () => {
  it('posts to /data/bulk/transactions', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce({ count: 3 });
    const result = await bulkUpdateTransactions(mockClient, { query: 'description:coffee', category_name: 'Food' });
    expect(mockClient.post).toHaveBeenCalledWith('/data/bulk/transactions', { query: 'description:coffee', category_name: 'Food' });
    expect(result).toEqual({ count: 3 });
  });
});
```

- [ ] **Step 2: Run to confirm failures**

```bash
npm test 2>&1 | grep -E "fetchBillTransactions|fetchPiggyBankEvents|createPiggyBankEvent|deletePiggyBankEvent|fetchRuleGroupRules|testRule|triggerRule|fetchRecurrenceTransactions|triggerRecurrence|downloadAttachment|bulkUpdateTransactions" | head -20
```

- [ ] **Step 3: Add fetch functions — bills.ts**

```typescript
export async function fetchBillTransactions(
  client: FireflyClient,
  id: string,
  params: { start?: string; end?: string; page?: number; limit?: number }
): Promise<UnwrappedList> {
  const query: QueryParams = { page: params.page, limit: params.limit };
  if (params.start) query['start'] = params.start;
  if (params.end) query['end'] = params.end;
  const response = await client.get<JsonApiListResponse>(`/bills/${id}/transactions`, query);
  return unwrapList(response);
}
```

Add registerTool call inside `registerBillTools()`:
```typescript
server.registerTool(
  'get_bill_transactions',
  {
    title: 'Get Bill Transactions',
    description: 'Get all transactions linked to a specific bill. Use get_bills to find valid bill IDs.',
    inputSchema: {
      id: z.string().describe('Bill ID'),
      start: z.string().optional().describe('Start date (YYYY-MM-DD)'),
      end: z.string().optional().describe('End date (YYYY-MM-DD)'),
      page: z.number().int().positive().optional().default(1).describe('Page number'),
      limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
    },
    annotations: READ_ANNOTATIONS,
  },
  async ({ id, start, end, page, limit }) => {
    try {
      const result = await fetchBillTransactions(client, id, { start, end, page, limit });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  }
);
```

- [ ] **Step 4: Add fetch functions — piggy-banks.ts**

```typescript
export async function fetchPiggyBankEvents(
  client: FireflyClient,
  id: string,
  params: { page?: number; limit?: number }
): Promise<UnwrappedList> {
  const response = await client.get<JsonApiListResponse>(`/piggy-banks/${id}/events`, { page: params.page, limit: params.limit });
  return unwrapList(response);
}

export async function createPiggyBankEvent(
  client: FireflyClient,
  id: string,
  params: { amount: string; date: string }
): Promise<UnwrappedSingle> {
  const response = await client.post<JsonApiSingleResponse>(`/piggy-banks/${id}/events`, params);
  return unwrapSingle(response);
}

export async function deletePiggyBankEvent(
  client: FireflyClient,
  id: string,
  eventId: string
): Promise<{ deleted: true; id: string }> {
  await client.delete(`/piggy-banks/${id}/events/${eventId}`);
  return { deleted: true, id: eventId };
}
```

Add registerTool calls inside `registerPiggyBankTools()`:
```typescript
server.registerTool(
  'get_piggy_bank_events',
  {
    title: 'Get Piggy Bank Events',
    description: 'Get all deposit/withdrawal events for a specific piggy bank. Use get_piggy_banks to find valid IDs.',
    inputSchema: {
      id: z.string().describe('Piggy bank ID'),
      page: z.number().int().positive().optional().default(1).describe('Page number'),
      limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
    },
    annotations: READ_ANNOTATIONS,
  },
  async ({ id, page, limit }) => {
    try {
      const result = await fetchPiggyBankEvents(client, id, { page, limit });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  }
);

server.registerTool(
  'create_piggy_bank_event',
  {
    title: 'Create Piggy Bank Event',
    description: 'Add a deposit or withdrawal event to a piggy bank. Use a positive amount for a deposit and a negative amount for a withdrawal.',
    inputSchema: {
      id: z.string().describe('Piggy bank ID'),
      amount: z.string().describe('Amount as a number string. Positive for deposit, negative for withdrawal.'),
      date: z.string().describe('Event date (YYYY-MM-DD)'),
    },
    annotations: WRITE_ANNOTATIONS,
  },
  async ({ id, amount, date }) => {
    try {
      const result = await createPiggyBankEvent(client, id, { amount, date });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  }
);

server.registerTool(
  'delete_piggy_bank_event',
  {
    title: 'Delete Piggy Bank Event',
    description: 'Permanently delete a deposit/withdrawal event from a piggy bank. **This action cannot be undone.** Use get_piggy_bank_events to confirm the event ID.',
    inputSchema: {
      id: z.string().describe('Piggy bank ID'),
      event_id: z.string().describe('Event ID — use get_piggy_bank_events to find valid IDs'),
    },
    annotations: DELETE_ANNOTATIONS,
  },
  async ({ id, event_id }) => {
    try {
      const result = await deletePiggyBankEvent(client, id, event_id);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  }
);
```

- [ ] **Step 5: Add fetch functions — rules.ts**

```typescript
export async function fetchRuleGroupRules(
  client: FireflyClient,
  id: string,
  params: { page?: number; limit?: number }
): Promise<UnwrappedList> {
  const response = await client.get<JsonApiListResponse>(`/rule-groups/${id}/rules`, { page: params.page, limit: params.limit });
  return unwrapList(response);
}

export async function testRule(
  client: FireflyClient,
  id: string,
  params: { start?: string; end?: string; page?: number; limit?: number }
): Promise<unknown> {
  return client.get(`/rules/${id}/test`, { start: params.start, end: params.end, page: params.page, limit: params.limit });
}

export async function testRuleGroup(
  client: FireflyClient,
  id: string,
  params: { start?: string; end?: string; page?: number; limit?: number }
): Promise<unknown> {
  return client.get(`/rule-groups/${id}/test`, { start: params.start, end: params.end, page: params.page, limit: params.limit });
}

export async function triggerRule(
  client: FireflyClient,
  id: string,
  params: { start?: string; end?: string }
): Promise<{ triggered: true; id: string }> {
  const query: QueryParams = {};
  if (params.start) query['start'] = params.start;
  if (params.end) query['end'] = params.end;
  await client.post(`/rules/${id}/trigger`, {}, query);
  return { triggered: true, id };
}
```

Add registerTool calls inside `registerRuleTools()`:
```typescript
server.registerTool(
  'get_rule_group_rules',
  {
    title: 'Get Rule Group Rules',
    description: 'Get all rules belonging to a specific rule group. Use get_rule_groups to find valid rule group IDs.',
    inputSchema: {
      id: z.string().describe('Rule group ID'),
      page: z.number().int().positive().optional().default(1).describe('Page number'),
      limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
    },
    annotations: READ_ANNOTATIONS,
  },
  async ({ id, page, limit }) => {
    try {
      const result = await fetchRuleGroupRules(client, id, { page, limit });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  }
);

server.registerTool(
  'test_rule',
  {
    title: 'Test Rule',
    description: 'Dry-run a rule and see which existing transactions it would match. Does not modify any data.',
    inputSchema: {
      id: z.string().describe('Rule ID'),
      start: z.string().optional().describe('Start date to limit search (YYYY-MM-DD)'),
      end: z.string().optional().describe('End date to limit search (YYYY-MM-DD)'),
      page: z.number().int().positive().optional().default(1).describe('Page number'),
      limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
    },
    annotations: READ_ANNOTATIONS,
  },
  async ({ id, start, end, page, limit }) => {
    try {
      const result = await testRule(client, id, { start, end, page, limit });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  }
);

server.registerTool(
  'test_rule_group',
  {
    title: 'Test Rule Group',
    description: 'Dry-run all rules in a rule group and see which transactions they would match. Does not modify any data.',
    inputSchema: {
      id: z.string().describe('Rule group ID'),
      start: z.string().optional().describe('Start date to limit search (YYYY-MM-DD)'),
      end: z.string().optional().describe('End date to limit search (YYYY-MM-DD)'),
      page: z.number().int().positive().optional().default(1).describe('Page number'),
      limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
    },
    annotations: READ_ANNOTATIONS,
  },
  async ({ id, start, end, page, limit }) => {
    try {
      const result = await testRuleGroup(client, id, { start, end, page, limit });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  }
);

server.registerTool(
  'trigger_rule',
  {
    title: 'Trigger Rule',
    description: 'Run a rule against existing transactions, applying its actions to any that match. Optionally limit to a date range.',
    inputSchema: {
      id: z.string().describe('Rule ID'),
      start: z.string().optional().describe('Start date to limit (YYYY-MM-DD)'),
      end: z.string().optional().describe('End date to limit (YYYY-MM-DD)'),
    },
    annotations: WRITE_ANNOTATIONS,
  },
  async ({ id, start, end }) => {
    try {
      const result = await triggerRule(client, id, { start, end });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  }
);
```

- [ ] **Step 6: Add fetch functions — recurring.ts**

```typescript
export async function fetchRecurrenceTransactions(
  client: FireflyClient,
  id: string,
  params: { page?: number; limit?: number }
): Promise<UnwrappedList> {
  const response = await client.get<JsonApiListResponse>(`/recurrences/${id}/transactions`, { page: params.page, limit: params.limit });
  return unwrapList(response);
}

export async function triggerRecurrence(
  client: FireflyClient,
  id: string,
  date?: string
): Promise<{ triggered: true; id: string }> {
  const query: QueryParams = {};
  if (date) query['date'] = date;
  await client.post(`/recurrences/${id}/trigger`, {}, query);
  return { triggered: true, id };
}
```

Add registerTool calls inside `registerRecurringTools()`:
```typescript
server.registerTool(
  'get_recurrence_transactions',
  {
    title: 'Get Recurrence Transactions',
    description: 'Get all transactions that have been created by a recurring transaction rule. Use get_recurring to find valid IDs.',
    inputSchema: {
      id: z.string().describe('Recurring transaction ID'),
      page: z.number().int().positive().optional().default(1).describe('Page number'),
      limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
    },
    annotations: READ_ANNOTATIONS,
  },
  async ({ id, page, limit }) => {
    try {
      const result = await fetchRecurrenceTransactions(client, id, { page, limit });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  }
);

server.registerTool(
  'trigger_recurrence',
  {
    title: 'Trigger Recurrence',
    description: 'Manually fire a recurring transaction rule to create its transaction immediately. Optionally specify a date (YYYY-MM-DD) to use instead of today.',
    inputSchema: {
      id: z.string().describe('Recurring transaction ID'),
      date: z.string().optional().describe('Date to use for the triggered transaction (YYYY-MM-DD). Defaults to today.'),
    },
    annotations: WRITE_ANNOTATIONS,
  },
  async ({ id, date }) => {
    try {
      const result = await triggerRecurrence(client, id, date);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  }
);
```

- [ ] **Step 7: Add download_attachment — attachments.ts**

```typescript
export async function downloadAttachment(client: FireflyClient, id: string): Promise<string> {
  return client.getText(`/attachments/${id}/download`);
}
```

Add registerTool call inside `registerAttachmentTools()`:
```typescript
server.registerTool(
  'download_attachment',
  {
    title: 'Download Attachment',
    description: 'Download the raw content of an attachment as text. Useful for reading receipts or notes. Use get_attachments to find valid IDs.',
    inputSchema: {
      id: z.string().describe('Attachment ID'),
    },
    annotations: READ_ANNOTATIONS,
  },
  async ({ id }) => {
    try {
      const text = await downloadAttachment(client, id);
      return { content: [{ type: 'text' as const, text }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  }
);
```

- [ ] **Step 8: Add bulk_update_transactions — transactions.ts**

```typescript
export async function bulkUpdateTransactions(
  client: FireflyClient,
  params: { query: string; category_name?: string; budget_id?: string; tags?: string[]; notes?: string }
): Promise<unknown> {
  return client.post('/data/bulk/transactions', params);
}
```

Add registerTool call inside `registerTransactionTools()`:
```typescript
server.registerTool(
  'bulk_update_transactions',
  {
    title: 'Bulk Update Transactions',
    description: 'Update multiple transactions at once using a search query (same syntax as search_transactions). All matching transactions will have the specified fields updated.',
    inputSchema: {
      query: z.string().describe('Search query to select transactions (same syntax as search_transactions)'),
      category_name: z.string().optional().describe('Set category for all matched transactions'),
      budget_id: z.string().optional().describe('Set budget for all matched transactions'),
      tags: z.array(z.string()).optional().describe('Replace tags on all matched transactions'),
      notes: z.string().optional().describe('Set notes on all matched transactions'),
    },
    annotations: WRITE_ANNOTATIONS,
  },
  async (params) => {
    try {
      const result = await bulkUpdateTransactions(client, params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  }
);
```

- [ ] **Step 9: Run all tests**

```bash
npm test
```

Expected: all pass

- [ ] **Step 10: Commit**

```bash
git add src/tools/bills.ts src/tests/bills.test.ts \
        src/tools/piggy-banks.ts src/tests/piggy-banks.test.ts \
        src/tools/rules.ts src/tests/rules.test.ts \
        src/tools/recurring.ts src/tests/recurring.test.ts \
        src/tools/attachments.ts src/tests/attachments.test.ts \
        src/tools/transactions.ts src/tests/transactions.test.ts && \
git commit -m "feat: add sub-resource and action tools across 6 existing modules

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 8: New file — currencies.ts

**Files:**
- Create: `src/tools/currencies.ts`
- Create: `src/tests/currencies.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/tests/currencies.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import type { FireflyClient } from '../client.js';
import {
  fetchCurrencies, fetchCurrency, createCurrency, updateCurrency,
  deleteCurrency, enableCurrency, disableCurrency, setPrimaryCurrency,
} from '../tools/currencies.js';

const mockClient = { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } as unknown as FireflyClient;

const listFixture = {
  data: [{ id: '1', type: 'currencies', attributes: { name: 'Euro', code: 'EUR', symbol: '€', decimal_places: 2, enabled: true, default: true }, links: {} }],
  meta: { pagination: { current_page: 1, total_pages: 1, total: 1 } },
};
const singleFixture = {
  data: { id: '1', type: 'currencies', attributes: { name: 'Euro', code: 'EUR', symbol: '€', decimal_places: 2, enabled: true, default: true }, links: {} },
};

describe('fetchCurrencies', () => {
  it('calls /currencies with pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    await fetchCurrencies(mockClient, { page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/currencies', { page: 1, limit: 50 });
  });
  it('returns flat items with pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    const result = await fetchCurrencies(mockClient, { page: 1, limit: 50 });
    expect(result.data[0]).toEqual({ name: 'Euro', code: 'EUR', symbol: '€', decimal_places: 2, enabled: true, default: true, id: '1' });
  });
});

describe('fetchCurrency', () => {
  it('calls /currencies/:code', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(singleFixture);
    await fetchCurrency(mockClient, 'EUR');
    expect(mockClient.get).toHaveBeenCalledWith('/currencies/EUR');
  });
});

describe('createCurrency', () => {
  it('posts to /currencies', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(singleFixture);
    await createCurrency(mockClient, { name: 'Euro', code: 'EUR', symbol: '€' });
    expect(mockClient.post).toHaveBeenCalledWith('/currencies', expect.objectContaining({ name: 'Euro', code: 'EUR' }));
  });
});

describe('updateCurrency', () => {
  it('puts to /currencies/:code', async () => {
    mockClient.put = vi.fn().mockResolvedValueOnce(singleFixture);
    await updateCurrency(mockClient, 'EUR', { symbol: '€€' });
    expect(mockClient.put).toHaveBeenCalledWith('/currencies/EUR', { symbol: '€€' });
  });
});

describe('deleteCurrency', () => {
  it('calls delete and returns confirmation', async () => {
    mockClient.delete = vi.fn().mockResolvedValueOnce(undefined);
    const result = await deleteCurrency(mockClient, 'EUR');
    expect(mockClient.delete).toHaveBeenCalledWith('/currencies/EUR');
    expect(result).toEqual({ deleted: true, code: 'EUR' });
  });
});

describe('enableCurrency', () => {
  it('posts to /currencies/:code/enable', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(singleFixture);
    await enableCurrency(mockClient, 'EUR');
    expect(mockClient.post).toHaveBeenCalledWith('/currencies/EUR/enable', {});
  });
});

describe('disableCurrency', () => {
  it('posts to /currencies/:code/disable', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(singleFixture);
    await disableCurrency(mockClient, 'EUR');
    expect(mockClient.post).toHaveBeenCalledWith('/currencies/EUR/disable', {});
  });
});

describe('setPrimaryCurrency', () => {
  it('posts to /currencies/:code/primary', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(singleFixture);
    await setPrimaryCurrency(mockClient, 'EUR');
    expect(mockClient.post).toHaveBeenCalledWith('/currencies/EUR/primary', {});
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- src/tests/currencies.test.ts 2>&1 | head -20
```

Expected: FAIL — module not found

- [ ] **Step 3: Create src/tools/currencies.ts**

```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { type FireflyClient, formatError } from '../client.js';
import { unwrapList, unwrapSingle, type JsonApiListResponse, type JsonApiSingleResponse, type UnwrappedList, type UnwrappedSingle } from '../transform.js';

export async function fetchCurrencies(
  client: FireflyClient,
  params: { page?: number; limit?: number }
): Promise<UnwrappedList> {
  const response = await client.get<JsonApiListResponse>('/currencies', { page: params.page, limit: params.limit });
  return unwrapList(response);
}

export async function fetchCurrency(client: FireflyClient, code: string): Promise<UnwrappedSingle> {
  const response = await client.get<JsonApiSingleResponse>(`/currencies/${encodeURIComponent(code)}`);
  return unwrapSingle(response);
}

export async function createCurrency(
  client: FireflyClient,
  params: { name: string; code: string; symbol: string; decimal_places?: number; enabled?: boolean; default?: boolean }
): Promise<UnwrappedSingle> {
  const response = await client.post<JsonApiSingleResponse>('/currencies', params);
  return unwrapSingle(response);
}

export async function updateCurrency(
  client: FireflyClient,
  code: string,
  params: { name?: string; symbol?: string; decimal_places?: number; enabled?: boolean; default?: boolean }
): Promise<UnwrappedSingle> {
  const response = await client.put<JsonApiSingleResponse>(`/currencies/${encodeURIComponent(code)}`, params);
  return unwrapSingle(response);
}

export async function deleteCurrency(
  client: FireflyClient,
  code: string
): Promise<{ deleted: true; code: string }> {
  await client.delete(`/currencies/${encodeURIComponent(code)}`);
  return { deleted: true, code };
}

export async function enableCurrency(client: FireflyClient, code: string): Promise<UnwrappedSingle> {
  const response = await client.post<JsonApiSingleResponse>(`/currencies/${encodeURIComponent(code)}/enable`, {});
  return unwrapSingle(response);
}

export async function disableCurrency(client: FireflyClient, code: string): Promise<UnwrappedSingle> {
  const response = await client.post<JsonApiSingleResponse>(`/currencies/${encodeURIComponent(code)}/disable`, {});
  return unwrapSingle(response);
}

export async function setPrimaryCurrency(client: FireflyClient, code: string): Promise<UnwrappedSingle> {
  const response = await client.post<JsonApiSingleResponse>(`/currencies/${encodeURIComponent(code)}/primary`, {});
  return unwrapSingle(response);
}

const READ_ANNOTATIONS = { readOnlyHint: true, openWorldHint: true, idempotentHint: true } as const;
const WRITE_ANNOTATIONS = { openWorldHint: true } as const;
const UPDATE_ANNOTATIONS = { openWorldHint: true, idempotentHint: true } as const;
const DELETE_ANNOTATIONS = { destructiveHint: true, openWorldHint: true } as const;

export function registerCurrencyTools(server: McpServer, client: FireflyClient): void {
  server.registerTool('get_currencies', {
    title: 'Get Currencies',
    description: 'Get all currencies configured in Firefly III.',
    inputSchema: {
      page: z.number().int().positive().optional().default(1).describe('Page number'),
      limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
    },
    annotations: READ_ANNOTATIONS,
  }, async ({ page, limit }) => {
    try {
      const result = await fetchCurrencies(client, { page, limit });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  });

  server.registerTool('get_currency', {
    title: 'Get Currency',
    description: 'Get a single currency by its currency code (e.g. EUR, USD).',
    inputSchema: { code: z.string().describe('Currency code (e.g. EUR, USD)') },
    annotations: READ_ANNOTATIONS,
  }, async ({ code }) => {
    try {
      const result = await fetchCurrency(client, code);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  });

  server.registerTool('create_currency', {
    title: 'Create Currency',
    description: 'Create a new currency in Firefly III.',
    inputSchema: {
      name: z.string().describe('Currency name (e.g. Euro)'),
      code: z.string().describe('Currency code (e.g. EUR)'),
      symbol: z.string().describe('Currency symbol (e.g. €)'),
      decimal_places: z.number().int().min(0).max(10).optional().describe('Number of decimal places (default 2)'),
      enabled: z.boolean().optional().describe('Whether the currency is enabled'),
      default: z.boolean().optional().describe('Whether this is the default currency'),
    },
    annotations: WRITE_ANNOTATIONS,
  }, async (params) => {
    try {
      const result = await createCurrency(client, params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  });

  server.registerTool('update_currency', {
    title: 'Update Currency',
    description: 'Update an existing currency. Only fields provided will be changed. Use get_currencies to find valid currency codes.',
    inputSchema: {
      code: z.string().describe('Currency code to update (e.g. EUR)'),
      name: z.string().optional().describe('Currency name'),
      symbol: z.string().optional().describe('Currency symbol'),
      decimal_places: z.number().int().min(0).max(10).optional().describe('Number of decimal places'),
      enabled: z.boolean().optional().describe('Whether the currency is enabled'),
      default: z.boolean().optional().describe('Whether this is the default currency'),
    },
    annotations: UPDATE_ANNOTATIONS,
  }, async ({ code, ...params }) => {
    try {
      const result = await updateCurrency(client, code, params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  });

  server.registerTool('delete_currency', {
    title: 'Delete Currency',
    description: 'Permanently delete a currency from Firefly III. **This action cannot be undone.** Use get_currencies to confirm the code before deleting.',
    inputSchema: { code: z.string().describe('Currency code to delete (e.g. EUR)') },
    annotations: DELETE_ANNOTATIONS,
  }, async ({ code }) => {
    try {
      const result = await deleteCurrency(client, code);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  });

  server.registerTool('enable_currency', {
    title: 'Enable Currency',
    description: 'Enable a currency so it can be used in transactions.',
    inputSchema: { code: z.string().describe('Currency code (e.g. EUR)') },
    annotations: UPDATE_ANNOTATIONS,
  }, async ({ code }) => {
    try {
      const result = await enableCurrency(client, code);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  });

  server.registerTool('disable_currency', {
    title: 'Disable Currency',
    description: 'Disable a currency so it no longer appears in transaction forms.',
    inputSchema: { code: z.string().describe('Currency code (e.g. EUR)') },
    annotations: UPDATE_ANNOTATIONS,
  }, async ({ code }) => {
    try {
      const result = await disableCurrency(client, code);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  });

  server.registerTool('set_primary_currency', {
    title: 'Set Primary Currency',
    description: 'Set a currency as the primary/default currency for Firefly III.',
    inputSchema: { code: z.string().describe('Currency code to set as primary (e.g. EUR)') },
    annotations: UPDATE_ANNOTATIONS,
  }, async ({ code }) => {
    try {
      const result = await setPrimaryCurrency(client, code);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  });
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- src/tests/currencies.test.ts
```

Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add src/tools/currencies.ts src/tests/currencies.test.ts && git commit -m "feat: add currencies tool group with full CRUD and enable/disable/primary

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 9: New file — exports.ts

**Files:**
- Create: `src/tools/exports.ts`
- Create: `src/tests/exports.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/tests/exports.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import type { FireflyClient } from '../client.js';
import { exportEntity } from '../tools/exports.js';

const mockClient = {
  getText: vi.fn(),
} as unknown as FireflyClient;

describe('exportEntity', () => {
  it('calls getText with /data/export/transactions and type=csv', async () => {
    mockClient.getText = vi.fn().mockResolvedValueOnce('id,date,amount\n1,2026-01-01,50');
    const result = await exportEntity(mockClient, 'transactions', {});
    expect(mockClient.getText).toHaveBeenCalledWith('/data/export/transactions', { type: 'csv' });
    expect(result).toBe('id,date,amount\n1,2026-01-01,50');
  });

  it('passes start/end for transactions', async () => {
    mockClient.getText = vi.fn().mockResolvedValueOnce('csv data');
    await exportEntity(mockClient, 'transactions', { start: '2026-01-01', end: '2026-01-31' });
    expect(mockClient.getText).toHaveBeenCalledWith('/data/export/transactions', { type: 'csv', start: '2026-01-01', end: '2026-01-31' });
  });

  it('calls getText with /data/export/accounts', async () => {
    mockClient.getText = vi.fn().mockResolvedValueOnce('id,name\n1,Checking');
    await exportEntity(mockClient, 'accounts', {});
    expect(mockClient.getText).toHaveBeenCalledWith('/data/export/accounts', { type: 'csv' });
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- src/tests/exports.test.ts 2>&1 | head -10
```

- [ ] **Step 3: Create src/tools/exports.ts**

```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { type FireflyClient, formatError } from '../client.js';
import type { QueryParams } from '../types.js';

type ExportEntity = 'transactions' | 'accounts' | 'bills' | 'budgets' | 'categories' | 'tags' | 'recurring' | 'rules' | 'piggy-banks';

export async function exportEntity(
  client: FireflyClient,
  entity: ExportEntity,
  params: { start?: string; end?: string }
): Promise<string> {
  const query: QueryParams = { type: 'csv' };
  if (params.start) query['start'] = params.start;
  if (params.end) query['end'] = params.end;
  return client.getText(`/data/export/${entity}`, query);
}

const READ_ANNOTATIONS = { readOnlyHint: true, openWorldHint: true, idempotentHint: true } as const;

const EXPORT_TOOLS: Array<{ name: string; title: string; entity: ExportEntity; hasDates: boolean }> = [
  { name: 'export_transactions', title: 'Export Transactions', entity: 'transactions', hasDates: true },
  { name: 'export_accounts', title: 'Export Accounts', entity: 'accounts', hasDates: false },
  { name: 'export_bills', title: 'Export Bills', entity: 'bills', hasDates: false },
  { name: 'export_budgets', title: 'Export Budgets', entity: 'budgets', hasDates: false },
  { name: 'export_categories', title: 'Export Categories', entity: 'categories', hasDates: false },
  { name: 'export_tags', title: 'Export Tags', entity: 'tags', hasDates: false },
  { name: 'export_recurring', title: 'Export Recurring Transactions', entity: 'recurring', hasDates: false },
  { name: 'export_rules', title: 'Export Rules', entity: 'rules', hasDates: false },
  { name: 'export_piggy_banks', title: 'Export Piggy Banks', entity: 'piggy-banks', hasDates: false },
];

export function registerExportTools(server: McpServer, client: FireflyClient): void {
  for (const { name, title, entity, hasDates } of EXPORT_TOOLS) {
    const inputSchema: Record<string, unknown> = {};
    if (hasDates) {
      inputSchema['start'] = z.string().optional().describe('Start date (YYYY-MM-DD)');
      inputSchema['end'] = z.string().optional().describe('End date (YYYY-MM-DD)');
    }

    server.registerTool(
      name,
      {
        title,
        description: `Export all ${entity} as a CSV file. Returns raw CSV text.${hasDates ? ' Optionally filter by date range.' : ''}`,
        inputSchema,
        annotations: READ_ANNOTATIONS,
      },
      async (params: Record<string, unknown>) => {
        try {
          const { start, end } = params as { start?: string; end?: string };
          const csv = await exportEntity(client, entity, { start, end });
          return { content: [{ type: 'text' as const, text: csv }] };
        } catch (err) {
          return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
        }
      }
    );
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- src/tests/exports.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/tools/exports.ts src/tests/exports.test.ts && git commit -m "feat: add exports tool group for CSV data export

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 10: New file — object-groups.ts

**Files:**
- Create: `src/tools/object-groups.ts`
- Create: `src/tests/object-groups.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/tests/object-groups.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import type { FireflyClient } from '../client.js';
import {
  fetchObjectGroups, fetchObjectGroup, createObjectGroup, updateObjectGroup,
  deleteObjectGroup, fetchObjectGroupBills, fetchObjectGroupPiggyBanks,
} from '../tools/object-groups.js';

const mockClient = { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } as unknown as FireflyClient;

const listFixture = {
  data: [{ id: '1', type: 'object_groups', attributes: { title: 'Savings', order: 1 }, links: {} }],
  meta: { pagination: { current_page: 1, total_pages: 1, total: 1 } },
};
const singleFixture = {
  data: { id: '1', type: 'object_groups', attributes: { title: 'Savings', order: 1 }, links: {} },
};

describe('fetchObjectGroups', () => {
  it('calls /object-groups with pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    await fetchObjectGroups(mockClient, { page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/object-groups', { page: 1, limit: 50 });
  });
});

describe('fetchObjectGroup', () => {
  it('calls /object-groups/:id', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(singleFixture);
    await fetchObjectGroup(mockClient, '1');
    expect(mockClient.get).toHaveBeenCalledWith('/object-groups/1');
  });
});

describe('createObjectGroup', () => {
  it('posts to /object-groups', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(singleFixture);
    await createObjectGroup(mockClient, { title: 'Savings' });
    expect(mockClient.post).toHaveBeenCalledWith('/object-groups', { title: 'Savings' });
  });
});

describe('updateObjectGroup', () => {
  it('puts to /object-groups/:id', async () => {
    mockClient.put = vi.fn().mockResolvedValueOnce(singleFixture);
    await updateObjectGroup(mockClient, '1', { title: 'Long-term Savings' });
    expect(mockClient.put).toHaveBeenCalledWith('/object-groups/1', { title: 'Long-term Savings' });
  });
});

describe('deleteObjectGroup', () => {
  it('calls delete and returns confirmation', async () => {
    mockClient.delete = vi.fn().mockResolvedValueOnce(undefined);
    const result = await deleteObjectGroup(mockClient, '1');
    expect(mockClient.delete).toHaveBeenCalledWith('/object-groups/1');
    expect(result).toEqual({ deleted: true, id: '1' });
  });
});

describe('fetchObjectGroupBills', () => {
  it('calls /object-groups/:id/bills', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    await fetchObjectGroupBills(mockClient, '1', { page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/object-groups/1/bills', { page: 1, limit: 50 });
  });
});

describe('fetchObjectGroupPiggyBanks', () => {
  it('calls /object-groups/:id/piggy-banks', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    await fetchObjectGroupPiggyBanks(mockClient, '1', { page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/object-groups/1/piggy-banks', { page: 1, limit: 50 });
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- src/tests/object-groups.test.ts 2>&1 | head -10
```

- [ ] **Step 3: Create src/tools/object-groups.ts**

```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { type FireflyClient, formatError } from '../client.js';
import { unwrapList, unwrapSingle, type JsonApiListResponse, type JsonApiSingleResponse, type UnwrappedList, type UnwrappedSingle } from '../transform.js';

export async function fetchObjectGroups(
  client: FireflyClient,
  params: { page?: number; limit?: number }
): Promise<UnwrappedList> {
  const response = await client.get<JsonApiListResponse>('/object-groups', { page: params.page, limit: params.limit });
  return unwrapList(response);
}

export async function fetchObjectGroup(client: FireflyClient, id: string): Promise<UnwrappedSingle> {
  const response = await client.get<JsonApiSingleResponse>(`/object-groups/${id}`);
  return unwrapSingle(response);
}

export async function createObjectGroup(
  client: FireflyClient,
  params: { title: string; order?: number }
): Promise<UnwrappedSingle> {
  const response = await client.post<JsonApiSingleResponse>('/object-groups', params);
  return unwrapSingle(response);
}

export async function updateObjectGroup(
  client: FireflyClient,
  id: string,
  params: { title?: string; order?: number }
): Promise<UnwrappedSingle> {
  const response = await client.put<JsonApiSingleResponse>(`/object-groups/${id}`, params);
  return unwrapSingle(response);
}

export async function deleteObjectGroup(
  client: FireflyClient,
  id: string
): Promise<{ deleted: true; id: string }> {
  await client.delete(`/object-groups/${id}`);
  return { deleted: true, id };
}

export async function fetchObjectGroupBills(
  client: FireflyClient,
  id: string,
  params: { page?: number; limit?: number }
): Promise<UnwrappedList> {
  const response = await client.get<JsonApiListResponse>(`/object-groups/${id}/bills`, { page: params.page, limit: params.limit });
  return unwrapList(response);
}

export async function fetchObjectGroupPiggyBanks(
  client: FireflyClient,
  id: string,
  params: { page?: number; limit?: number }
): Promise<UnwrappedList> {
  const response = await client.get<JsonApiListResponse>(`/object-groups/${id}/piggy-banks`, { page: params.page, limit: params.limit });
  return unwrapList(response);
}

const READ_ANNOTATIONS = { readOnlyHint: true, openWorldHint: true, idempotentHint: true } as const;
const WRITE_ANNOTATIONS = { openWorldHint: true } as const;
const UPDATE_ANNOTATIONS = { openWorldHint: true, idempotentHint: true } as const;
const DELETE_ANNOTATIONS = { destructiveHint: true, openWorldHint: true } as const;

export function registerObjectGroupTools(server: McpServer, client: FireflyClient): void {
  server.registerTool('get_object_groups', {
    title: 'Get Object Groups',
    description: 'Get all object groups from Firefly III. Object groups organise accounts and piggy banks.',
    inputSchema: {
      page: z.number().int().positive().optional().default(1).describe('Page number'),
      limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
    },
    annotations: READ_ANNOTATIONS,
  }, async ({ page, limit }) => {
    try {
      const result = await fetchObjectGroups(client, { page, limit });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  });

  server.registerTool('get_object_group', {
    title: 'Get Object Group',
    description: 'Get a single object group by ID. Use get_object_groups to find valid IDs.',
    inputSchema: { id: z.string().describe('Object group ID') },
    annotations: READ_ANNOTATIONS,
  }, async ({ id }) => {
    try {
      const result = await fetchObjectGroup(client, id);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  });

  server.registerTool('create_object_group', {
    title: 'Create Object Group',
    description: 'Create a new object group to organise accounts and piggy banks.',
    inputSchema: {
      title: z.string().describe('Object group title'),
      order: z.number().int().positive().optional().describe('Display order'),
    },
    annotations: WRITE_ANNOTATIONS,
  }, async (params) => {
    try {
      const result = await createObjectGroup(client, params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  });

  server.registerTool('update_object_group', {
    title: 'Update Object Group',
    description: 'Update an existing object group. Only fields provided will be changed. Use get_object_groups to find valid IDs.',
    inputSchema: {
      id: z.string().describe('Object group ID'),
      title: z.string().optional().describe('Object group title'),
      order: z.number().int().positive().optional().describe('Display order'),
    },
    annotations: UPDATE_ANNOTATIONS,
  }, async ({ id, ...params }) => {
    try {
      const result = await updateObjectGroup(client, id, params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  });

  server.registerTool('delete_object_group', {
    title: 'Delete Object Group',
    description: 'Permanently delete an object group. **This action cannot be undone.** Use get_object_groups to confirm the ID before deleting.',
    inputSchema: { id: z.string().describe('Object group ID') },
    annotations: DELETE_ANNOTATIONS,
  }, async ({ id }) => {
    try {
      const result = await deleteObjectGroup(client, id);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  });

  server.registerTool('get_object_group_bills', {
    title: 'Get Object Group Bills',
    description: 'Get all bills belonging to a specific object group. Use get_object_groups to find valid IDs.',
    inputSchema: {
      id: z.string().describe('Object group ID'),
      page: z.number().int().positive().optional().default(1).describe('Page number'),
      limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
    },
    annotations: READ_ANNOTATIONS,
  }, async ({ id, page, limit }) => {
    try {
      const result = await fetchObjectGroupBills(client, id, { page, limit });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  });

  server.registerTool('get_object_group_piggy_banks', {
    title: 'Get Object Group Piggy Banks',
    description: 'Get all piggy banks belonging to a specific object group. Use get_object_groups to find valid IDs.',
    inputSchema: {
      id: z.string().describe('Object group ID'),
      page: z.number().int().positive().optional().default(1).describe('Page number'),
      limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
    },
    annotations: READ_ANNOTATIONS,
  }, async ({ id, page, limit }) => {
    try {
      const result = await fetchObjectGroupPiggyBanks(client, id, { page, limit });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  });
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- src/tests/object-groups.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/tools/object-groups.ts src/tests/object-groups.test.ts && git commit -m "feat: add object-groups tool group

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 11: New file — transaction-links.ts

**Files:**
- Create: `src/tools/transaction-links.ts`
- Create: `src/tests/transaction-links.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/tests/transaction-links.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import type { FireflyClient } from '../client.js';
import {
  fetchLinkTypes, fetchTransactionLinks, fetchTransactionLink,
  createTransactionLink, updateTransactionLink, deleteTransactionLink,
} from '../tools/transaction-links.js';

const mockClient = { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } as unknown as FireflyClient;

const listFixture = {
  data: [{ id: '1', type: 'link_types', attributes: { name: 'Related', editable: true }, links: {} }],
  meta: { pagination: { current_page: 1, total_pages: 1, total: 1 } },
};
const linkSingle = {
  data: { id: '5', type: 'transaction_links', attributes: { link_type_id: '1', in_id: '10', out_id: '11', notes: '' }, links: {} },
};

describe('fetchLinkTypes', () => {
  it('calls /link-types with pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    await fetchLinkTypes(mockClient, { page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/link-types', { page: 1, limit: 50 });
  });
});

describe('fetchTransactionLinks', () => {
  it('calls /transaction-journals/:id/links', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    await fetchTransactionLinks(mockClient, '10', { page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/transaction-journals/10/links', { page: 1, limit: 50 });
  });
});

describe('fetchTransactionLink', () => {
  it('calls /transaction-links/:id', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(linkSingle);
    await fetchTransactionLink(mockClient, '5');
    expect(mockClient.get).toHaveBeenCalledWith('/transaction-links/5');
  });
});

describe('createTransactionLink', () => {
  it('posts to /transaction-links', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(linkSingle);
    await createTransactionLink(mockClient, { link_type_id: '1', in_id: '10', out_id: '11' });
    expect(mockClient.post).toHaveBeenCalledWith('/transaction-links', { link_type_id: '1', in_id: '10', out_id: '11' });
  });
});

describe('updateTransactionLink', () => {
  it('puts to /transaction-links/:id', async () => {
    mockClient.put = vi.fn().mockResolvedValueOnce(linkSingle);
    await updateTransactionLink(mockClient, '5', { notes: 'related purchase' });
    expect(mockClient.put).toHaveBeenCalledWith('/transaction-links/5', { notes: 'related purchase' });
  });
});

describe('deleteTransactionLink', () => {
  it('calls delete and returns confirmation', async () => {
    mockClient.delete = vi.fn().mockResolvedValueOnce(undefined);
    const result = await deleteTransactionLink(mockClient, '5');
    expect(mockClient.delete).toHaveBeenCalledWith('/transaction-links/5');
    expect(result).toEqual({ deleted: true, id: '5' });
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- src/tests/transaction-links.test.ts 2>&1 | head -10
```

- [ ] **Step 3: Create src/tools/transaction-links.ts**

```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { type FireflyClient, formatError } from '../client.js';
import { unwrapList, unwrapSingle, type JsonApiListResponse, type JsonApiSingleResponse, type UnwrappedList, type UnwrappedSingle } from '../transform.js';

export async function fetchLinkTypes(
  client: FireflyClient,
  params: { page?: number; limit?: number }
): Promise<UnwrappedList> {
  const response = await client.get<JsonApiListResponse>('/link-types', { page: params.page, limit: params.limit });
  return unwrapList(response);
}

export async function fetchTransactionLinks(
  client: FireflyClient,
  journalId: string,
  params: { page?: number; limit?: number }
): Promise<UnwrappedList> {
  const response = await client.get<JsonApiListResponse>(`/transaction-journals/${journalId}/links`, { page: params.page, limit: params.limit });
  return unwrapList(response);
}

export async function fetchTransactionLink(client: FireflyClient, id: string): Promise<UnwrappedSingle> {
  const response = await client.get<JsonApiSingleResponse>(`/transaction-links/${id}`);
  return unwrapSingle(response);
}

export async function createTransactionLink(
  client: FireflyClient,
  params: { link_type_id: string; in_id: string; out_id: string; notes?: string }
): Promise<UnwrappedSingle> {
  const response = await client.post<JsonApiSingleResponse>('/transaction-links', params);
  return unwrapSingle(response);
}

export async function updateTransactionLink(
  client: FireflyClient,
  id: string,
  params: { link_type_id?: string; in_id?: string; out_id?: string; notes?: string }
): Promise<UnwrappedSingle> {
  const response = await client.put<JsonApiSingleResponse>(`/transaction-links/${id}`, params);
  return unwrapSingle(response);
}

export async function deleteTransactionLink(
  client: FireflyClient,
  id: string
): Promise<{ deleted: true; id: string }> {
  await client.delete(`/transaction-links/${id}`);
  return { deleted: true, id };
}

const READ_ANNOTATIONS = { readOnlyHint: true, openWorldHint: true, idempotentHint: true } as const;
const WRITE_ANNOTATIONS = { openWorldHint: true } as const;
const UPDATE_ANNOTATIONS = { openWorldHint: true, idempotentHint: true } as const;
const DELETE_ANNOTATIONS = { destructiveHint: true, openWorldHint: true } as const;

export function registerTransactionLinkTools(server: McpServer, client: FireflyClient): void {
  server.registerTool('get_link_types', {
    title: 'Get Link Types',
    description: 'Get all available transaction link types (e.g. "Related", "Refund", "Paid"). Use these IDs when creating transaction links.',
    inputSchema: {
      page: z.number().int().positive().optional().default(1).describe('Page number'),
      limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
    },
    annotations: READ_ANNOTATIONS,
  }, async ({ page, limit }) => {
    try {
      const result = await fetchLinkTypes(client, { page, limit });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  });

  server.registerTool('get_transaction_links', {
    title: 'Get Transaction Links',
    description: 'Get all links attached to a specific transaction journal entry. Use get_transactions to find valid journal IDs.',
    inputSchema: {
      journal_id: z.string().describe('Transaction journal ID'),
      page: z.number().int().positive().optional().default(1).describe('Page number'),
      limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
    },
    annotations: READ_ANNOTATIONS,
  }, async ({ journal_id, page, limit }) => {
    try {
      const result = await fetchTransactionLinks(client, journal_id, { page, limit });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  });

  server.registerTool('get_transaction_link', {
    title: 'Get Transaction Link',
    description: 'Get a single transaction link by ID.',
    inputSchema: { id: z.string().describe('Transaction link ID') },
    annotations: READ_ANNOTATIONS,
  }, async ({ id }) => {
    try {
      const result = await fetchTransactionLink(client, id);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  });

  server.registerTool('create_transaction_link', {
    title: 'Create Transaction Link',
    description: 'Create a link between two transactions (e.g. mark one as a refund of another). Use get_link_types to find valid link_type_id values.',
    inputSchema: {
      link_type_id: z.string().describe('Link type ID — use get_link_types to find valid IDs'),
      in_id: z.string().describe('Inward transaction journal ID'),
      out_id: z.string().describe('Outward transaction journal ID'),
      notes: z.string().optional().describe('Notes about this link'),
    },
    annotations: WRITE_ANNOTATIONS,
  }, async (params) => {
    try {
      const result = await createTransactionLink(client, params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  });

  server.registerTool('update_transaction_link', {
    title: 'Update Transaction Link',
    description: 'Update an existing transaction link. Only fields provided will be changed.',
    inputSchema: {
      id: z.string().describe('Transaction link ID'),
      link_type_id: z.string().optional().describe('Link type ID'),
      in_id: z.string().optional().describe('Inward transaction journal ID'),
      out_id: z.string().optional().describe('Outward transaction journal ID'),
      notes: z.string().optional().describe('Notes about this link'),
    },
    annotations: UPDATE_ANNOTATIONS,
  }, async ({ id, ...params }) => {
    try {
      const result = await updateTransactionLink(client, id, params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  });

  server.registerTool('delete_transaction_link', {
    title: 'Delete Transaction Link',
    description: 'Permanently delete a link between two transactions. **This action cannot be undone.**',
    inputSchema: { id: z.string().describe('Transaction link ID') },
    annotations: DELETE_ANNOTATIONS,
  }, async ({ id }) => {
    try {
      const result = await deleteTransactionLink(client, id);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  });
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- src/tests/transaction-links.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/tools/transaction-links.ts src/tests/transaction-links.test.ts && git commit -m "feat: add transaction-links tool group

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 12: Wire all new groups into index.ts

**Files:**
- Modify: `src/tools/index.ts`

- [ ] **Step 1: Write failing test**

Add to `src/tests/tool-filter.test.ts`:

```typescript
it('full preset includes all new groups', () => {
  expect(PRESETS.full).toContain('currencies');
  expect(PRESETS.full).toContain('exports');
  expect(PRESETS.full).toContain('object-groups');
  expect(PRESETS.full).toContain('transaction-links');
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- src/tests/tool-filter.test.ts 2>&1 | grep "full preset"
```

- [ ] **Step 3: Update src/tools/index.ts**

Replace the entire file contents:

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
import { registerRuleTools } from './rules.js';
import { registerAttachmentTools } from './attachments.js';
import { registerCurrencyTools } from './currencies.js';
import { registerExportTools } from './exports.js';
import { registerObjectGroupTools } from './object-groups.js';
import { registerTransactionLinkTools } from './transaction-links.js';

export const TOOL_GROUPS = [
  'accounts',
  'transactions',
  'budgets',
  'categories',
  'bills',
  'piggy-banks',
  'reports',
  'rules',
  'recurring',
  'attachments',
  'currencies',
  'exports',
  'object-groups',
  'transaction-links',
] as const;

export type ToolGroup = typeof TOOL_GROUPS[number];

export const PRESETS: Record<string, ToolGroup[]> = {
  minimal:    ['accounts', 'transactions'],
  default:    ['accounts', 'transactions', 'budgets', 'categories', 'bills'],
  budgeting:  ['accounts', 'transactions', 'budgets', 'categories', 'bills', 'piggy-banks'],
  insights:   ['accounts', 'transactions', 'categories', 'reports'],
  automation: ['accounts', 'transactions', 'rules', 'recurring'],
  full:       [...TOOL_GROUPS],
};

export type PresetName = keyof typeof PRESETS;

export interface ToolFilterOptions {
  preset?: PresetName;
  groups?: ToolGroup[];
  readOnly?: boolean;
}

function isReadOnlyTool(name: string): boolean {
  return name.startsWith('get_') || name.startsWith('search_') || name.startsWith('test_');
}

function makeReadOnlyProxy(server: McpServer): McpServer {
  return new Proxy(server, {
    get(target, prop) {
      if (prop === 'registerTool') {
        return (name: string, config: unknown, handler: unknown) => {
          if (isReadOnlyTool(name)) {
            (target.registerTool as (n: string, c: unknown, h: unknown) => void)(name, config, handler);
          }
        };
      }
      return (target as unknown as Record<string | symbol, unknown>)[prop];
    },
  });
}

export function registerAllTools(
  server: McpServer,
  client: FireflyClient,
  options: ToolFilterOptions = {}
): void {
  const { preset, groups, readOnly = false } = options;

  const activeGroups: Set<ToolGroup> = preset
    ? new Set(PRESETS[preset])
    : groups
    ? new Set(groups)
    : new Set(TOOL_GROUPS);

  const s = readOnly ? makeReadOnlyProxy(server) : server;

  if (activeGroups.has('accounts'))          registerAccountTools(s, client);
  if (activeGroups.has('transactions'))      registerTransactionTools(s, client);
  if (activeGroups.has('budgets'))           registerBudgetTools(s, client);
  if (activeGroups.has('categories'))        registerCategoryTools(s, client);
  if (activeGroups.has('bills'))             registerBillTools(s, client);
  if (activeGroups.has('piggy-banks'))       registerPiggyBankTools(s, client);
  if (activeGroups.has('reports'))           registerReportTools(s, client);
  if (activeGroups.has('rules'))             registerRuleTools(s, client);
  if (activeGroups.has('recurring'))         registerRecurringTools(s, client);
  if (activeGroups.has('attachments'))       registerAttachmentTools(s, client);
  if (activeGroups.has('currencies'))        registerCurrencyTools(s, client);
  if (activeGroups.has('exports'))           registerExportTools(s, client);
  if (activeGroups.has('object-groups'))     registerObjectGroupTools(s, client);
  if (activeGroups.has('transaction-links')) registerTransactionLinkTools(s, client);
}
```

- [ ] **Step 4: Run all tests**

```bash
npm test
```

Expected: all pass

- [ ] **Step 5: Build**

```bash
npm run build
```

Expected: exits 0, `dist/` updated

- [ ] **Step 6: Commit**

```bash
git add src/tools/index.ts dist/ && git commit -m "feat: wire currencies, exports, object-groups, transaction-links into index

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 13: Update README and CLAUDE.md

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update CLAUDE.md roadmap**

In the Low Priority section, mark all items complete (change `- [ ]` to `- [x]` for all 7 items):
- Currency management
- Net worth & chart data
- Available budgets
- Piggy bank events
- Data export
- get_about
- Object groups

Also update the File Structure section to include the four new tool files:
- `src/tools/currencies.ts`
- `src/tools/exports.ts`
- `src/tools/object-groups.ts`
- `src/tools/transaction-links.ts`

And update TOOL_GROUPS list to add: `currencies`, `exports`, `object-groups`, `transaction-links`.

- [ ] **Step 2: Update README tools table**

Add rows to the Tools table for all new tools. The table follows this format:

```markdown
| Tool name | Group | Description |
```

Add entries for all ~50 new tools grouped under their group headings.

- [ ] **Step 3: Run tests to confirm nothing broken**

```bash
npm test
```

- [ ] **Step 4: Commit**

```bash
git add README.md CLAUDE.md && git commit -m "docs: update README and CLAUDE.md for full API coverage

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```
