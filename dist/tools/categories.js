import { z } from 'zod';
import { formatError } from '../client.js';
export async function fetchCategories(client, params) {
    return client.get('/categories', { page: params.page, limit: params.limit });
}
export async function fetchCategoryTransactions(client, categoryId, params) {
    const query = { page: params.page, limit: params.limit };
    if (params.start)
        query['start'] = params.start;
    if (params.end)
        query['end'] = params.end;
    return client.get(`/categories/${categoryId}/transactions`, query);
}
const READ_ANNOTATIONS = {
    readOnlyHint: true,
    openWorldHint: true,
    idempotentHint: true,
};
export function registerCategoryTools(server, client) {
    server.registerTool('get_categories', {
        title: 'Get Categories',
        description: 'Get all spending categories defined in Firefly III. Use get_category_transactions to list transactions for a specific category.',
        inputSchema: {
            page: z.number().int().positive().optional().default(1).describe('Page number'),
            limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
        },
        annotations: READ_ANNOTATIONS,
    }, async ({ page, limit }) => {
        try {
            const result = await fetchCategories(client, { page, limit });
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        catch (err) {
            return { content: [{ type: 'text', text: formatError(err) }], isError: true };
        }
    });
    server.registerTool('get_category_transactions', {
        title: 'Get Category Transactions',
        description: 'Get all transactions belonging to a specific Firefly III category. Optionally filter by date range (YYYY-MM-DD). Use get_categories to find valid category IDs.',
        inputSchema: {
            categoryId: z.string().describe('Category ID — use get_categories to find valid IDs'),
            start: z.string().optional().describe('Start date (YYYY-MM-DD)'),
            end: z.string().optional().describe('End date (YYYY-MM-DD)'),
            page: z.number().int().positive().optional().default(1).describe('Page number'),
            limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
        },
        annotations: READ_ANNOTATIONS,
    }, async ({ categoryId, start, end, page, limit }) => {
        try {
            const result = await fetchCategoryTransactions(client, categoryId, { start, end, page, limit });
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        catch (err) {
            return { content: [{ type: 'text', text: formatError(err) }], isError: true };
        }
    });
}
//# sourceMappingURL=categories.js.map