import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { type FireflyClient, formatError } from '../client.js';
import type { QueryParams } from '../types.js';
import { unwrapList, unwrapSingle, cleanSummary, type JsonApiListResponse, type JsonApiSingleResponse, type RawSummaryResponse, type CleanSummaryItem, type UnwrappedList, type UnwrappedSingle } from '../transform.js';

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
  const response = await client.get<RawSummaryResponse>('/summary/basic', query);
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

type InsightNoXEndpoint =
  | '/insight/expense/no-bill'
  | '/insight/expense/no-budget'
  | '/insight/expense/no-category'
  | '/insight/expense/no-tag'
  | '/insight/income/no-category'
  | '/insight/income/no-tag'
  | '/insight/transfer/no-category'
  | '/insight/transfer/no-tag';

export async function fetchInsightNoX(
  client: FireflyClient,
  endpoint: InsightNoXEndpoint,
  start: string,
  end: string
): Promise<unknown> {
  return client.get(endpoint, { start, end });
}

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

const READ_ANNOTATIONS = {
  readOnlyHint: true,
  openWorldHint: true,
  idempotentHint: true,
} as const;

const WRITE_ANNOTATIONS = { openWorldHint: true } as const;
const UPDATE_ANNOTATIONS = { openWorldHint: true, idempotentHint: true } as const;
const DELETE_ANNOTATIONS = { destructiveHint: true, openWorldHint: true } as const;

export function registerReportTools(server: McpServer, client: FireflyClient): void {
  server.registerTool(
    'get_tags',
    {
      title: 'Get Tags',
      description: 'Get all tags defined in Firefly III. Use get_tag_transactions to list transactions for a specific tag.',
      inputSchema: {
        page: z.number().int().positive().optional().default(1).describe('Page number'),
        limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
      },
      annotations: READ_ANNOTATIONS,
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

  server.registerTool(
    'get_tag_transactions',
    {
      title: 'Get Tag Transactions',
      description: 'Get all transactions associated with a specific Firefly III tag. Optionally filter by date range (YYYY-MM-DD). Use get_tags to find valid tag names.',
      inputSchema: {
        tag: z.string().describe('Tag name — use get_tags to find valid tag names'),
        start: z.string().optional().describe('Start date (YYYY-MM-DD)'),
        end: z.string().optional().describe('End date (YYYY-MM-DD)'),
        page: z.number().int().positive().optional().default(1).describe('Page number'),
        limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
      },
      annotations: READ_ANNOTATIONS,
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

  server.registerTool(
    'get_summary',
    {
      title: 'Get Financial Summary',
      description: 'Get a basic financial summary from Firefly III for a date range, including total assets, liabilities, and net worth. Both start and end dates (YYYY-MM-DD) are required.',
      inputSchema: {
        start: z.string().describe('Start date (YYYY-MM-DD)'),
        end: z.string().describe('End date (YYYY-MM-DD)'),
        currencyCode: z.string().optional().describe('Currency code to filter by (e.g. EUR, USD)'),
      },
      annotations: READ_ANNOTATIONS,
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

  server.registerTool(
    'get_insight_expenses',
    {
      title: 'Get Expense Insights',
      description: 'Get expense insights grouped by category for a date range. Returns how much was spent per category. Both start and end dates (YYYY-MM-DD) are required. For income insights, use get_insight_income.',
      inputSchema: {
        start: z.string().describe('Start date (YYYY-MM-DD)'),
        end: z.string().describe('End date (YYYY-MM-DD)'),
      },
      annotations: READ_ANNOTATIONS,
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

  server.registerTool(
    'get_insight_income',
    {
      title: 'Get Income Insights',
      description: 'Get income insights grouped by category for a date range. Returns how much was earned per category. Both start and end dates (YYYY-MM-DD) are required. For expense insights, use get_insight_expenses.',
      inputSchema: {
        start: z.string().describe('Start date (YYYY-MM-DD)'),
        end: z.string().describe('End date (YYYY-MM-DD)'),
      },
      annotations: READ_ANNOTATIONS,
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

  server.registerTool('create_tag', {
    title: 'Create Tag',
    description: 'Create a new tag in Firefly III.',
    inputSchema: {
      tag: z.string().describe('Tag name'),
      date: z.string().optional().describe('Tag date (YYYY-MM-DD)'),
      description: z.string().optional().describe('Tag description'),
    },
    annotations: WRITE_ANNOTATIONS,
  }, async (params) => {
    try {
      const result = await createTag(client, params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  });

  server.registerTool('update_tag', {
    title: 'Update Tag',
    description: 'Update an existing tag in Firefly III. Only fields provided will be changed. Use get_tags to find valid tag IDs.',
    inputSchema: {
      id: z.string().describe('Tag ID — use get_tags to find valid IDs'),
      tag: z.string().optional().describe('Tag name'),
      date: z.string().optional().describe('Tag date (YYYY-MM-DD)'),
      description: z.string().optional().describe('Tag description'),
    },
    annotations: UPDATE_ANNOTATIONS,
  }, async ({ id, ...params }) => {
    try {
      const result = await updateTag(client, id, params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  });

  server.registerTool('delete_tag', {
    title: 'Delete Tag',
    description: 'Permanently delete a tag from Firefly III. **This action cannot be undone.** Transactions with this tag will have it removed. Use get_tags to confirm the ID before deleting.',
    inputSchema: { id: z.string().describe('Tag ID — use get_tags to find valid IDs') },
    annotations: DELETE_ANNOTATIONS,
  }, async ({ id }) => {
    try {
      const result = await deleteTag(client, id);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  });

  server.registerTool(
    'get_insight_expenses_no_bill',
    {
      title: 'Get Expense Insights — No Bill',
      description: 'Get expense totals for transactions that have no bill attached, grouped by currency. Both start and end dates (YYYY-MM-DD) are required.',
      inputSchema: {
        start: z.string().describe('Start date (YYYY-MM-DD)'),
        end: z.string().describe('End date (YYYY-MM-DD)'),
      },
      annotations: READ_ANNOTATIONS,
    },
    async ({ start, end }) => {
      try {
        const result = await fetchInsightNoX(client, '/insight/expense/no-bill', start, end);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );

  server.registerTool(
    'get_insight_expenses_no_budget',
    {
      title: 'Get Expense Insights — No Budget',
      description: 'Get expense totals for transactions that have no budget attached, grouped by currency. Both start and end dates (YYYY-MM-DD) are required.',
      inputSchema: {
        start: z.string().describe('Start date (YYYY-MM-DD)'),
        end: z.string().describe('End date (YYYY-MM-DD)'),
      },
      annotations: READ_ANNOTATIONS,
    },
    async ({ start, end }) => {
      try {
        const result = await fetchInsightNoX(client, '/insight/expense/no-budget', start, end);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );

  server.registerTool(
    'get_insight_expenses_no_category',
    {
      title: 'Get Expense Insights — No Category',
      description: 'Get expense totals for transactions that have no category attached, grouped by currency. Both start and end dates (YYYY-MM-DD) are required.',
      inputSchema: {
        start: z.string().describe('Start date (YYYY-MM-DD)'),
        end: z.string().describe('End date (YYYY-MM-DD)'),
      },
      annotations: READ_ANNOTATIONS,
    },
    async ({ start, end }) => {
      try {
        const result = await fetchInsightNoX(client, '/insight/expense/no-category', start, end);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );

  server.registerTool(
    'get_insight_expenses_no_tag',
    {
      title: 'Get Expense Insights — No Tag',
      description: 'Get expense totals for transactions that have no tag attached, grouped by currency. Both start and end dates (YYYY-MM-DD) are required.',
      inputSchema: {
        start: z.string().describe('Start date (YYYY-MM-DD)'),
        end: z.string().describe('End date (YYYY-MM-DD)'),
      },
      annotations: READ_ANNOTATIONS,
    },
    async ({ start, end }) => {
      try {
        const result = await fetchInsightNoX(client, '/insight/expense/no-tag', start, end);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );

  server.registerTool(
    'get_insight_income_no_category',
    {
      title: 'Get Income Insights — No Category',
      description: 'Get income totals for transactions that have no category attached, grouped by currency. Both start and end dates (YYYY-MM-DD) are required.',
      inputSchema: {
        start: z.string().describe('Start date (YYYY-MM-DD)'),
        end: z.string().describe('End date (YYYY-MM-DD)'),
      },
      annotations: READ_ANNOTATIONS,
    },
    async ({ start, end }) => {
      try {
        const result = await fetchInsightNoX(client, '/insight/income/no-category', start, end);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );

  server.registerTool(
    'get_insight_income_no_tag',
    {
      title: 'Get Income Insights — No Tag',
      description: 'Get income totals for transactions that have no tag attached, grouped by currency. Both start and end dates (YYYY-MM-DD) are required.',
      inputSchema: {
        start: z.string().describe('Start date (YYYY-MM-DD)'),
        end: z.string().describe('End date (YYYY-MM-DD)'),
      },
      annotations: READ_ANNOTATIONS,
    },
    async ({ start, end }) => {
      try {
        const result = await fetchInsightNoX(client, '/insight/income/no-tag', start, end);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );

  server.registerTool(
    'get_insight_transfer_no_category',
    {
      title: 'Get Transfer Insights — No Category',
      description: 'Get transfer totals for transactions that have no category attached, grouped by currency. Both start and end dates (YYYY-MM-DD) are required.',
      inputSchema: {
        start: z.string().describe('Start date (YYYY-MM-DD)'),
        end: z.string().describe('End date (YYYY-MM-DD)'),
      },
      annotations: READ_ANNOTATIONS,
    },
    async ({ start, end }) => {
      try {
        const result = await fetchInsightNoX(client, '/insight/transfer/no-category', start, end);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );

  server.registerTool(
    'get_insight_transfer_no_tag',
    {
      title: 'Get Transfer Insights — No Tag',
      description: 'Get transfer totals for transactions that have no tag attached, grouped by currency. Both start and end dates (YYYY-MM-DD) are required.',
      inputSchema: {
        start: z.string().describe('Start date (YYYY-MM-DD)'),
        end: z.string().describe('End date (YYYY-MM-DD)'),
      },
      annotations: READ_ANNOTATIONS,
    },
    async ({ start, end }) => {
      try {
        const result = await fetchInsightNoX(client, '/insight/transfer/no-tag', start, end);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );

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
    const inputSchema: Record<string, z.ZodTypeAny> = {
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
}
