import { completable } from '@modelcontextprotocol/sdk/server/completable.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { FireflyClient } from '../client.js';
import {
  type JsonApiListResponse,
  type JsonApiSingleResponse,
  type UnwrappedList,
  type UnwrappedSingle,
  unwrapList,
  unwrapSingle,
} from '../transform.js';
import type { QueryParams } from '../types.js';
import { DELETE_ANNOTATIONS, READ_ANNOTATIONS, UPDATE_ANNOTATIONS, WRITE_ANNOTATIONS } from './_annotations.js';
import {
  AUTOCOMPLETE_FETCH_LIMIT,
  AUTOCOMPLETE_MAX_SUGGESTIONS,
  createTtlCache,
  dateSchema,
  debugLog,
  defineTool,
  parseId,
} from './_helpers.js';

export async function fetchBudgets(
  client: FireflyClient,
  params: { page?: number; limit?: number },
): Promise<UnwrappedList> {
  const response = await client.get<JsonApiListResponse>('/budgets', { page: params.page, limit: params.limit });
  return unwrapList(response);
}

export async function fetchBudgetLimits(
  client: FireflyClient,
  budgetId: string,
  start?: string,
  end?: string,
): Promise<UnwrappedList> {
  const query: QueryParams = {};
  if (start) query.start = start;
  if (end) query.end = end;
  const response = await client.get<JsonApiListResponse>(`/budgets/${budgetId}/limits`, query);
  return unwrapList(response);
}

export async function createBudget(
  client: FireflyClient,
  params: {
    name: string;
    active?: boolean;
    auto_budget_type?: 'reset' | 'rollover' | 'none';
    auto_budget_currency_code?: string;
    auto_budget_amount?: string;
    auto_budget_period?: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'half_year' | 'yearly';
  },
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
    auto_budget_period?: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'half_year' | 'yearly';
  },
): Promise<UnwrappedSingle> {
  const response = await client.put<JsonApiSingleResponse>(`/budgets/${id}`, params);
  return unwrapSingle(response);
}

export async function deleteBudget(client: FireflyClient, id: string): Promise<{ deleted: true; id: string }> {
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
  },
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
  },
): Promise<UnwrappedSingle> {
  const response = await client.put<JsonApiSingleResponse>(`/budget-limits/${id}`, params);
  return unwrapSingle(response);
}

export async function deleteBudgetLimit(client: FireflyClient, id: string): Promise<{ deleted: true; id: string }> {
  await client.delete(`/budget-limits/${id}`);
  return { deleted: true, id };
}

export async function fetchAvailableBudgets(
  client: FireflyClient,
  params: { page?: number; limit?: number },
): Promise<UnwrappedList> {
  const response = await client.get<JsonApiListResponse>('/available-budgets', {
    page: params.page,
    limit: params.limit,
  });
  return unwrapList(response);
}

export async function fetchAvailableBudget(client: FireflyClient, id: string): Promise<UnwrappedSingle> {
  const response = await client.get<JsonApiSingleResponse>(`/available-budgets/${id}`);
  return unwrapSingle(response);
}

export async function fetchBudgetTransactions(
  client: FireflyClient,
  id: string,
  params: { start?: string; end?: string; page?: number; limit?: number },
): Promise<UnwrappedList> {
  const query: QueryParams = { page: params.page, limit: params.limit };
  if (params.start) query.start = params.start;
  if (params.end) query.end = params.end;
  const response = await client.get<JsonApiListResponse>(`/budgets/${id}/transactions`, query);
  return unwrapList(response);
}

export async function fetchTransactionsWithoutBudget(
  client: FireflyClient,
  params: { start?: string; end?: string; page?: number; limit?: number },
): Promise<UnwrappedList> {
  const query: QueryParams = { page: params.page, limit: params.limit };
  if (params.start) query.start = params.start;
  if (params.end) query.end = params.end;
  const response = await client.get<JsonApiListResponse>('/budgets/transactions-without-budget', query);
  return unwrapList(response);
}

// Module-scoped so the cache survives across the stateless HTTP requests autocomplete fires;
// keyed per identity inside the completion handler so one user never sees another's budgets.
const budgetsCache = createTtlCache<UnwrappedList>();

export function clearBudgetsCache(): void {
  budgetsCache.clear();
}

export function registerBudgetTools(server: McpServer, client: FireflyClient): void {
  defineTool(
    server,
    'get_budgets',
    {
      title: 'Get Budgets',
      description:
        'Get all budgets from Firefly III, including spent and available amounts for the current period. Use get_budget_limits for period-specific spending limits.',
      inputSchema: {
        page: z.number().int().positive().optional().default(1).describe('Page number'),
        limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
      },
      annotations: READ_ANNOTATIONS,
    },
    ({ page, limit }) => fetchBudgets(client, { page: page, limit: limit }),
  );

  const budgetIdSchema = completable(
    z.string().describe('Budget ID — use get_budgets to find valid IDs'),
    async (value) => {
      debugLog(`[Autocomplete] Budget search input: "${value}"`);
      try {
        const budgets = await budgetsCache.get(client.cacheKey(), () =>
          fetchBudgets(client, { limit: AUTOCOMPLETE_FETCH_LIMIT }),
        );
        const suggestions = budgets.data
          .map((b) => `${b.id} (${b.name ?? ''})`)
          .filter((label) => label.toLowerCase().includes(value.toLowerCase()))
          .slice(0, AUTOCOMPLETE_MAX_SUGGESTIONS);
        debugLog(`[Autocomplete] Budget suggestions found: ${suggestions.length}`);
        return suggestions;
      } catch (err) {
        debugLog('[Autocomplete Error - Budget]:', err);
        return [];
      }
    },
  );

  defineTool(
    server,
    'get_budget_limits',
    {
      title: 'Get Budget Limits',
      description:
        'Get spending limits for a specific Firefly III budget, including how much has been spent against each limit. Optionally filter by date range (YYYY-MM-DD). Use get_budgets to find valid budget IDs.',
      inputSchema: {
        budgetId: budgetIdSchema,
        start: dateSchema.optional().describe('Start date (YYYY-MM-DD)'),
        end: dateSchema.optional().describe('End date (YYYY-MM-DD)'),
      },
      annotations: READ_ANNOTATIONS,
    },
    ({ budgetId, start, end }) => fetchBudgetLimits(client, parseId(budgetId), start, end),
  );

  defineTool(
    server,
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
        auto_budget_period: z
          .enum(['daily', 'weekly', 'monthly', 'quarterly', 'half_year', 'yearly'])
          .optional()
          .describe('Auto-budget period'),
      },
      annotations: WRITE_ANNOTATIONS,
    },
    (params) => createBudget(client, params),
  );

  defineTool(
    server,
    'update_budget',
    {
      title: 'Update Budget',
      description:
        'Update an existing budget in Firefly III. Only fields provided will be changed. Use get_budgets to find valid budget IDs.',
      inputSchema: {
        id: budgetIdSchema,
        name: z.string().optional().describe('Budget name'),
        active: z.boolean().optional().describe('Whether the budget is active'),
        auto_budget_type: z.enum(['reset', 'rollover', 'none']).optional().describe('Auto-budget type'),
        auto_budget_currency_code: z.string().optional().describe('Currency code for auto-budget'),
        auto_budget_amount: z.string().optional().describe('Auto-budget amount as a number string'),
        auto_budget_period: z
          .enum(['daily', 'weekly', 'monthly', 'quarterly', 'half_year', 'yearly'])
          .optional()
          .describe('Auto-budget period'),
      },
      annotations: UPDATE_ANNOTATIONS,
    },
    ({ id, ...params }) => updateBudget(client, parseId(id), params),
  );

  defineTool(
    server,
    'delete_budget',
    {
      title: 'Delete Budget',
      description:
        'Permanently delete a budget from Firefly III. **This action cannot be undone.** Use get_budgets to confirm the ID before deleting.',
      inputSchema: { id: budgetIdSchema },
      annotations: DELETE_ANNOTATIONS,
    },
    ({ id }) => deleteBudget(client, parseId(id)),
  );

  defineTool(
    server,
    'create_budget_limit',
    {
      title: 'Create Budget Limit',
      description: 'Create a spending limit for a budget in Firefly III for a specific date range.',
      inputSchema: {
        budget_id: budgetIdSchema,
        start: dateSchema.describe('Start date (YYYY-MM-DD)'),
        end: dateSchema.describe('End date (YYYY-MM-DD)'),
        amount: z.string().describe('Limit amount as a number string'),
        currency_code: z.string().optional().describe('Currency code (e.g. EUR, USD)'),
        period: z
          .enum(['daily', 'weekly', 'monthly', 'quarterly', 'half_year', 'yearly'])
          .optional()
          .describe('Budget period'),
      },
      annotations: WRITE_ANNOTATIONS,
    },
    ({ budget_id, ...params }) => createBudgetLimit(client, parseId(budget_id), params),
  );

  defineTool(
    server,
    'update_budget_limit',
    {
      title: 'Update Budget Limit',
      description:
        'Update an existing budget limit in Firefly III. Only fields provided will be changed. Use get_budget_limits to find valid limit IDs.',
      inputSchema: {
        id: z.string().describe('Budget limit ID — use get_budget_limits to find valid IDs'),
        start: dateSchema.optional().describe('Start date (YYYY-MM-DD)'),
        end: dateSchema.optional().describe('End date (YYYY-MM-DD)'),
        amount: z.string().optional().describe('Limit amount as a number string'),
        currency_code: z.string().optional().describe('Currency code (e.g. EUR, USD)'),
        period: z
          .enum(['daily', 'weekly', 'monthly', 'quarterly', 'half_year', 'yearly'])
          .optional()
          .describe('Budget period'),
      },
      annotations: UPDATE_ANNOTATIONS,
    },
    ({ id, ...params }) => updateBudgetLimit(client, id, params),
  );

  defineTool(
    server,
    'delete_budget_limit',
    {
      title: 'Delete Budget Limit',
      description:
        'Permanently delete a budget limit from Firefly III. **This action cannot be undone.** Use get_budget_limits to confirm the ID before deleting.',
      inputSchema: { id: z.string().describe('Budget limit ID — use get_budget_limits to find valid IDs') },
      annotations: DELETE_ANNOTATIONS,
    },
    ({ id }) => deleteBudgetLimit(client, id),
  );

  defineTool(
    server,
    'get_available_budgets',
    {
      title: 'Get Available Budgets',
      description:
        'Get all available budget amounts configured in Firefly III (the total money available to budget per period).',
      inputSchema: {
        page: z.number().int().positive().optional().default(1).describe('Page number'),
        limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
      },
      annotations: READ_ANNOTATIONS,
    },
    ({ page, limit }) => fetchAvailableBudgets(client, { page: page, limit: limit }),
  );

  defineTool(
    server,
    'get_available_budget',
    {
      title: 'Get Available Budget',
      description: 'Get a single available budget amount by ID. Use get_available_budgets to find valid IDs.',
      inputSchema: {
        id: z.string().describe('Available budget ID'),
      },
      annotations: READ_ANNOTATIONS,
    },
    ({ id }) => fetchAvailableBudget(client, id),
  );

  defineTool(
    server,
    'get_budget_transactions',
    {
      title: 'Get Budget Transactions',
      description: 'Get all transactions linked to a specific budget. Use get_budgets to find valid budget IDs.',
      inputSchema: {
        id: budgetIdSchema,
        start: dateSchema.optional().describe('Start date (YYYY-MM-DD)'),
        end: dateSchema.optional().describe('End date (YYYY-MM-DD)'),
        page: z.number().int().positive().optional().default(1).describe('Page number'),
        limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
      },
      annotations: READ_ANNOTATIONS,
    },
    ({ id, start, end, page, limit }) =>
      fetchBudgetTransactions(client, parseId(id), { start, end, page, limit } as Parameters<
        typeof fetchBudgetTransactions
      >[2]),
  );

  defineTool(
    server,
    'get_transactions_without_budget',
    {
      title: 'Get Transactions Without Budget',
      description: 'Get all transactions that have no budget assigned. Useful for finding unbudgeted spending.',
      inputSchema: {
        start: dateSchema.optional().describe('Start date (YYYY-MM-DD)'),
        end: dateSchema.optional().describe('End date (YYYY-MM-DD)'),
        page: z.number().int().positive().optional().default(1).describe('Page number'),
        limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
      },
      annotations: READ_ANNOTATIONS,
    },
    (params) => fetchTransactionsWithoutBudget(client, params),
  );

  server.registerPrompt(
    'budget-transactions',
    {
      title: 'Get Transactions by Budget',
      description: 'Get transactions for a specific budget with autocomplete.',
      argsSchema: {
        budget: budgetIdSchema,
      },
    },
    async ({ budget }) => {
      const id = parseId(budget);
      return {
        description: `Get transactions for budget ID ${id}`,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Show me the recent transactions for budget ID "${id}".`,
            },
          },
        ],
      };
    },
  );
}
