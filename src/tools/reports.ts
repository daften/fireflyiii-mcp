import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { type FireflyClient, formatError } from '../client.js';
import type { QueryParams } from '../types.js';
import { unwrapList, cleanSummary, type JsonApiListResponse, type RawSummaryResponse, type CleanSummaryItem, type UnwrappedList } from '../transform.js';

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

const READ_ANNOTATIONS = {
  readOnlyHint: true,
  openWorldHint: true,
  idempotentHint: true,
} as const;

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
}
