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
