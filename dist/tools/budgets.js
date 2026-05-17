import { z } from 'zod';
import { formatError } from '../client.js';
import { unwrapList, unwrapSingle } from '../transform.js';
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
const READ_ANNOTATIONS = {
    readOnlyHint: true,
    openWorldHint: true,
    idempotentHint: true,
};
const WRITE_ANNOTATIONS = { openWorldHint: true };
const UPDATE_ANNOTATIONS = { openWorldHint: true, idempotentHint: true };
const DELETE_ANNOTATIONS = { destructiveHint: true, openWorldHint: true };
export function registerBudgetTools(server, client) {
    server.registerTool('get_budgets', {
        title: 'Get Budgets',
        description: 'Get all budgets from Firefly III, including spent and available amounts for the current period. Use get_budget_limits for period-specific spending limits.',
        inputSchema: {
            page: z.number().int().positive().optional().default(1).describe('Page number'),
            limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
        },
        annotations: READ_ANNOTATIONS,
    }, async ({ page, limit }) => {
        try {
            const result = await fetchBudgets(client, { page, limit });
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        catch (err) {
            return { content: [{ type: 'text', text: formatError(err) }], isError: true };
        }
    });
    server.registerTool('get_budget_limits', {
        title: 'Get Budget Limits',
        description: 'Get spending limits for a specific Firefly III budget, including how much has been spent against each limit. Optionally filter by date range (YYYY-MM-DD). Use get_budgets to find valid budget IDs.',
        inputSchema: {
            budgetId: z.string().describe('Budget ID — use get_budgets to find valid IDs'),
            start: z.string().optional().describe('Start date (YYYY-MM-DD)'),
            end: z.string().optional().describe('End date (YYYY-MM-DD)'),
        },
        annotations: READ_ANNOTATIONS,
    }, async ({ budgetId, start, end }) => {
        try {
            const result = await fetchBudgetLimits(client, budgetId, start, end);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        catch (err) {
            return { content: [{ type: 'text', text: formatError(err) }], isError: true };
        }
    });
    server.registerTool('create_budget', {
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
    }, async (params) => {
        try {
            const result = await createBudget(client, params);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        catch (err) {
            return { content: [{ type: 'text', text: formatError(err) }], isError: true };
        }
    });
    server.registerTool('update_budget', {
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
    }, async ({ id, ...params }) => {
        try {
            const result = await updateBudget(client, id, params);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        catch (err) {
            return { content: [{ type: 'text', text: formatError(err) }], isError: true };
        }
    });
    server.registerTool('delete_budget', {
        title: 'Delete Budget',
        description: 'Permanently delete a budget from Firefly III. **This action cannot be undone.** Use get_budgets to confirm the ID before deleting.',
        inputSchema: { id: z.string().describe('Budget ID — use get_budgets to find valid IDs') },
        annotations: DELETE_ANNOTATIONS,
    }, async ({ id }) => {
        try {
            const result = await deleteBudget(client, id);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        catch (err) {
            return { content: [{ type: 'text', text: formatError(err) }], isError: true };
        }
    });
    server.registerTool('create_budget_limit', {
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
    }, async ({ budget_id, ...params }) => {
        try {
            const result = await createBudgetLimit(client, budget_id, params);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        catch (err) {
            return { content: [{ type: 'text', text: formatError(err) }], isError: true };
        }
    });
    server.registerTool('update_budget_limit', {
        title: 'Update Budget Limit',
        description: 'Update an existing budget limit in Firefly III. Only fields provided will be changed. Use get_budget_limits to find valid limit IDs.',
        inputSchema: {
            id: z.string().describe('Budget limit ID — use get_budget_limits to find valid IDs'),
            start: z.string().optional().describe('Start date (YYYY-MM-DD)'),
            end: z.string().optional().describe('End date (YYYY-MM-DD)'),
            amount: z.string().optional().describe('Limit amount as a number string'),
            currency_code: z.string().optional().describe('Currency code (e.g. EUR, USD)'),
            period: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'half_year', 'yearly']).optional().describe('Budget period'),
        },
        annotations: UPDATE_ANNOTATIONS,
    }, async ({ id, ...params }) => {
        try {
            const result = await updateBudgetLimit(client, id, params);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        catch (err) {
            return { content: [{ type: 'text', text: formatError(err) }], isError: true };
        }
    });
    server.registerTool('delete_budget_limit', {
        title: 'Delete Budget Limit',
        description: 'Permanently delete a budget limit from Firefly III. **This action cannot be undone.** Use get_budget_limits to confirm the ID before deleting.',
        inputSchema: { id: z.string().describe('Budget limit ID — use get_budget_limits to find valid IDs') },
        annotations: DELETE_ANNOTATIONS,
    }, async ({ id }) => {
        try {
            const result = await deleteBudgetLimit(client, id);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        catch (err) {
            return { content: [{ type: 'text', text: formatError(err) }], isError: true };
        }
    });
}
//# sourceMappingURL=budgets.js.map