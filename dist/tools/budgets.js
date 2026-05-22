import { z } from 'zod';
import { unwrapList, unwrapSingle } from '../transform.js';
import { READ_ANNOTATIONS, WRITE_ANNOTATIONS, UPDATE_ANNOTATIONS, DELETE_ANNOTATIONS } from './_annotations.js';
import { defineTool, dateSchema } from './_helpers.js';
export async function fetchBudgets(client, params) {
    const response = await client.get('/budgets', { page: params.page, limit: params.limit });
    return unwrapList(response);
}
export async function fetchBudgetLimits(client, budgetId, start, end) {
    const query = {};
    if (start)
        query['start'] = start;
    if (end)
        query['end'] = end;
    const response = await client.get(`/budgets/${budgetId}/limits`, query);
    return unwrapList(response);
}
export async function createBudget(client, params) {
    const response = await client.post('/budgets', params);
    return unwrapSingle(response);
}
export async function updateBudget(client, id, params) {
    const response = await client.put(`/budgets/${id}`, params);
    return unwrapSingle(response);
}
export async function deleteBudget(client, id) {
    await client.delete(`/budgets/${id}`);
    return { deleted: true, id };
}
export async function createBudgetLimit(client, budgetId, params) {
    const response = await client.post(`/budgets/${budgetId}/limits`, params);
    return unwrapSingle(response);
}
export async function updateBudgetLimit(client, id, params) {
    const response = await client.put(`/budget-limits/${id}`, params);
    return unwrapSingle(response);
}
export async function deleteBudgetLimit(client, id) {
    await client.delete(`/budget-limits/${id}`);
    return { deleted: true, id };
}
export async function fetchAvailableBudgets(client, params) {
    const response = await client.get('/available-budgets', { page: params.page, limit: params.limit });
    return unwrapList(response);
}
export async function fetchAvailableBudget(client, id) {
    const response = await client.get(`/available-budgets/${id}`);
    return unwrapSingle(response);
}
export async function fetchBudgetTransactions(client, id, params) {
    const query = { page: params.page, limit: params.limit };
    if (params.start)
        query['start'] = params.start;
    if (params.end)
        query['end'] = params.end;
    const response = await client.get(`/budgets/${id}/transactions`, query);
    return unwrapList(response);
}
export async function fetchTransactionsWithoutBudget(client, params) {
    const query = { page: params.page, limit: params.limit };
    if (params.start)
        query['start'] = params.start;
    if (params.end)
        query['end'] = params.end;
    const response = await client.get('/budgets/transactions-without-budget', query);
    return unwrapList(response);
}
export function registerBudgetTools(server, client) {
    defineTool(server, 'get_budgets', {
        title: 'Get Budgets',
        description: 'Get all budgets from Firefly III, including spent and available amounts for the current period. Use get_budget_limits for period-specific spending limits.',
        inputSchema: {
            page: z.number().int().positive().optional().default(1).describe('Page number'),
            limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
        },
        annotations: READ_ANNOTATIONS,
    }, ({ page, limit }) => fetchBudgets(client, { page: page, limit: limit }));
    defineTool(server, 'get_budget_limits', {
        title: 'Get Budget Limits',
        description: 'Get spending limits for a specific Firefly III budget, including how much has been spent against each limit. Optionally filter by date range (YYYY-MM-DD). Use get_budgets to find valid budget IDs.',
        inputSchema: {
            budgetId: z.string().describe('Budget ID — use get_budgets to find valid IDs'),
            start: dateSchema.optional().describe('Start date (YYYY-MM-DD)'),
            end: dateSchema.optional().describe('End date (YYYY-MM-DD)'),
        },
        annotations: READ_ANNOTATIONS,
    }, ({ budgetId, start, end }) => fetchBudgetLimits(client, budgetId, start, end));
    defineTool(server, 'create_budget', {
        title: 'Create Budget',
        description: 'Create a new budget in Firefly III.',
        inputSchema: {
            name: z.string().describe('Budget name'),
            active: z.boolean().optional().describe('Whether the budget is active'),
            auto_budget_type: z.enum(['reset', 'rollover', 'none']).optional().describe('Auto-budget type'),
            auto_budget_currency_code: z.string().optional().describe('Currency code for auto-budget'),
            auto_budget_amount: z.string().optional().describe('Auto-budget amount as a number string'),
            auto_budget_period: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'half_year', 'yearly']).optional().describe('Auto-budget period'),
        },
        annotations: WRITE_ANNOTATIONS,
    }, (params) => createBudget(client, params));
    defineTool(server, 'update_budget', {
        title: 'Update Budget',
        description: 'Update an existing budget in Firefly III. Only fields provided will be changed. Use get_budgets to find valid budget IDs.',
        inputSchema: {
            id: z.string().describe('Budget ID — use get_budgets to find valid IDs'),
            name: z.string().optional().describe('Budget name'),
            active: z.boolean().optional().describe('Whether the budget is active'),
            auto_budget_type: z.enum(['reset', 'rollover', 'none']).optional().describe('Auto-budget type'),
            auto_budget_currency_code: z.string().optional().describe('Currency code for auto-budget'),
            auto_budget_amount: z.string().optional().describe('Auto-budget amount as a number string'),
            auto_budget_period: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'half_year', 'yearly']).optional().describe('Auto-budget period'),
        },
        annotations: UPDATE_ANNOTATIONS,
    }, ({ id, ...params }) => updateBudget(client, id, params));
    defineTool(server, 'delete_budget', {
        title: 'Delete Budget',
        description: 'Permanently delete a budget from Firefly III. **This action cannot be undone.** Use get_budgets to confirm the ID before deleting.',
        inputSchema: { id: z.string().describe('Budget ID — use get_budgets to find valid IDs') },
        annotations: DELETE_ANNOTATIONS,
    }, ({ id }) => deleteBudget(client, id));
    defineTool(server, 'create_budget_limit', {
        title: 'Create Budget Limit',
        description: 'Create a spending limit for a budget in Firefly III for a specific date range.',
        inputSchema: {
            budget_id: z.string().describe('Budget ID — use get_budgets to find valid IDs'),
            start: dateSchema.describe('Start date (YYYY-MM-DD)'),
            end: dateSchema.describe('End date (YYYY-MM-DD)'),
            amount: z.string().describe('Limit amount as a number string'),
            currency_code: z.string().optional().describe('Currency code (e.g. EUR, USD)'),
            period: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'half_year', 'yearly']).optional().describe('Budget period'),
        },
        annotations: WRITE_ANNOTATIONS,
    }, ({ budget_id, ...params }) => createBudgetLimit(client, budget_id, params));
    defineTool(server, 'update_budget_limit', {
        title: 'Update Budget Limit',
        description: 'Update an existing budget limit in Firefly III. Only fields provided will be changed. Use get_budget_limits to find valid limit IDs.',
        inputSchema: {
            id: z.string().describe('Budget limit ID — use get_budget_limits to find valid IDs'),
            start: dateSchema.optional().describe('Start date (YYYY-MM-DD)'),
            end: dateSchema.optional().describe('End date (YYYY-MM-DD)'),
            amount: z.string().optional().describe('Limit amount as a number string'),
            currency_code: z.string().optional().describe('Currency code (e.g. EUR, USD)'),
            period: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'half_year', 'yearly']).optional().describe('Budget period'),
        },
        annotations: UPDATE_ANNOTATIONS,
    }, ({ id, ...params }) => updateBudgetLimit(client, id, params));
    defineTool(server, 'delete_budget_limit', {
        title: 'Delete Budget Limit',
        description: 'Permanently delete a budget limit from Firefly III. **This action cannot be undone.** Use get_budget_limits to confirm the ID before deleting.',
        inputSchema: { id: z.string().describe('Budget limit ID — use get_budget_limits to find valid IDs') },
        annotations: DELETE_ANNOTATIONS,
    }, ({ id }) => deleteBudgetLimit(client, id));
    defineTool(server, 'get_available_budgets', {
        title: 'Get Available Budgets',
        description: 'Get all available budget amounts configured in Firefly III (the total money available to budget per period).',
        inputSchema: {
            page: z.number().int().positive().optional().default(1).describe('Page number'),
            limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
        },
        annotations: READ_ANNOTATIONS,
    }, ({ page, limit }) => fetchAvailableBudgets(client, { page: page, limit: limit }));
    defineTool(server, 'get_available_budget', {
        title: 'Get Available Budget',
        description: 'Get a single available budget amount by ID. Use get_available_budgets to find valid IDs.',
        inputSchema: {
            id: z.string().describe('Available budget ID'),
        },
        annotations: READ_ANNOTATIONS,
    }, ({ id }) => fetchAvailableBudget(client, id));
    defineTool(server, 'get_budget_transactions', {
        title: 'Get Budget Transactions',
        description: 'Get all transactions linked to a specific budget. Use get_budgets to find valid budget IDs.',
        inputSchema: {
            id: z.string().describe('Budget ID'),
            start: dateSchema.optional().describe('Start date (YYYY-MM-DD)'),
            end: dateSchema.optional().describe('End date (YYYY-MM-DD)'),
            page: z.number().int().positive().optional().default(1).describe('Page number'),
            limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
        },
        annotations: READ_ANNOTATIONS,
    }, ({ id, start, end, page, limit }) => fetchBudgetTransactions(client, id, { start, end, page, limit }));
    defineTool(server, 'get_transactions_without_budget', {
        title: 'Get Transactions Without Budget',
        description: 'Get all transactions that have no budget assigned. Useful for finding unbudgeted spending.',
        inputSchema: {
            start: dateSchema.optional().describe('Start date (YYYY-MM-DD)'),
            end: dateSchema.optional().describe('End date (YYYY-MM-DD)'),
            page: z.number().int().positive().optional().default(1).describe('Page number'),
            limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
        },
        annotations: READ_ANNOTATIONS,
    }, (params) => fetchTransactionsWithoutBudget(client, params));
}
//# sourceMappingURL=budgets.js.map