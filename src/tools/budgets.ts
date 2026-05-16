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

const READ_ANNOTATIONS = {
  readOnlyHint: true,
  openWorldHint: true,
  idempotentHint: true,
} as const;

export function registerBudgetTools(server: McpServer, client: FireflyClient): void {
  server.registerTool(
    'get_budgets',
    {
      title: 'Get Budgets',
      description: 'Get all budgets from Firefly III, including spent and available amounts for the current period. Use get_budget_limits for period-specific spending limits.',
      inputSchema: {
        page: z.number().int().positive().optional().default(1).describe('Page number'),
        limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
      },
      annotations: READ_ANNOTATIONS,
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

  server.registerTool(
    'get_budget_limits',
    {
      title: 'Get Budget Limits',
      description: 'Get spending limits for a specific Firefly III budget, including how much has been spent against each limit. Optionally filter by date range (YYYY-MM-DD). Use get_budgets to find valid budget IDs.',
      inputSchema: {
        budgetId: z.string().describe('Budget ID — use get_budgets to find valid IDs'),
        start: z.string().optional().describe('Start date (YYYY-MM-DD)'),
        end: z.string().optional().describe('End date (YYYY-MM-DD)'),
      },
      annotations: READ_ANNOTATIONS,
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
