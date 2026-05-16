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
