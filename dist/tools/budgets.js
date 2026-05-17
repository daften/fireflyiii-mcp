import { z } from 'zod';
import { formatError } from '../client.js';
import { unwrapList } from '../transform.js';
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
const READ_ANNOTATIONS = {
    readOnlyHint: true,
    openWorldHint: true,
    idempotentHint: true,
};
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
}
//# sourceMappingURL=budgets.js.map