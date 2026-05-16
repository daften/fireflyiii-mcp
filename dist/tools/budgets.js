import { z } from 'zod';
import { formatError } from '../client.js';
export async function fetchBudgets(client, params) {
    return client.get('/budgets', { page: params.page, limit: params.limit });
}
export async function fetchBudgetLimits(client, budgetId, start, end) {
    const query = {};
    if (start)
        query['start'] = start;
    if (end)
        query['end'] = end;
    return client.get(`/budgets/${budgetId}/limits`, query);
}
export function registerBudgetTools(server, client) {
    server.tool('get_budgets', 'Get all budgets from Firefly III, including spent and available amounts for the current period.', {
        page: z.number().int().positive().optional().default(1).describe('Page number'),
        limit: z.number().int().positive().optional().default(50).describe('Results per page'),
    }, async ({ page, limit }) => {
        try {
            const result = await fetchBudgets(client, { page, limit });
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        catch (err) {
            return { content: [{ type: 'text', text: formatError(err) }], isError: true };
        }
    });
    server.tool('get_budget_limits', 'Get the spending limits for a specific Firefly III budget. Optionally filter by date range (YYYY-MM-DD). Returns limits and how much has been spent against each.', {
        budgetId: z.string().describe('Budget ID'),
        start: z.string().optional().describe('Start date (YYYY-MM-DD)'),
        end: z.string().optional().describe('End date (YYYY-MM-DD)'),
    }, async ({ budgetId, start, end }) => {
        try {
            const result = await fetchBudgetLimits(client, budgetId, start, end);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        catch (err) {
            return { content: [{ type: 'text', text: formatError(err) }], isError: true };
        }
    });
}
//# sourceMappingURL=budgets.js.map