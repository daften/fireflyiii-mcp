import { z } from 'zod';
import { formatError } from '../client.js';
export async function fetchTags(client, params) {
    return client.get('/tags', { page: params.page, limit: params.limit });
}
export async function fetchTagTransactions(client, tag, params) {
    const query = { page: params.page, limit: params.limit };
    if (params.start)
        query['start'] = params.start;
    if (params.end)
        query['end'] = params.end;
    return client.get(`/tags/${encodeURIComponent(tag)}/transactions`, query);
}
export async function fetchSummary(client, start, end, currencyCode) {
    const query = { start, end };
    if (currencyCode)
        query['currency_code'] = currencyCode;
    return client.get('/summary/basic', query);
}
export async function fetchInsightExpenses(client, start, end) {
    return client.get('/insight/expense/category', { start, end });
}
export async function fetchInsightIncome(client, start, end) {
    return client.get('/insight/income/category', { start, end });
}
const READ_ANNOTATIONS = {
    readOnlyHint: true,
    openWorldHint: true,
    idempotentHint: true,
};
export function registerReportTools(server, client) {
    server.registerTool('get_tags', {
        title: 'Get Tags',
        description: 'Get all tags defined in Firefly III. Use get_tag_transactions to list transactions for a specific tag.',
        inputSchema: {
            page: z.number().int().positive().optional().default(1).describe('Page number'),
            limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
        },
        annotations: READ_ANNOTATIONS,
    }, async ({ page, limit }) => {
        try {
            const result = await fetchTags(client, { page, limit });
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        catch (err) {
            return { content: [{ type: 'text', text: formatError(err) }], isError: true };
        }
    });
    server.registerTool('get_tag_transactions', {
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
    }, async ({ tag, start, end, page, limit }) => {
        try {
            const result = await fetchTagTransactions(client, tag, { start, end, page, limit });
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        catch (err) {
            return { content: [{ type: 'text', text: formatError(err) }], isError: true };
        }
    });
    server.registerTool('get_summary', {
        title: 'Get Financial Summary',
        description: 'Get a basic financial summary from Firefly III for a date range, including total assets, liabilities, and net worth. Both start and end dates (YYYY-MM-DD) are required.',
        inputSchema: {
            start: z.string().describe('Start date (YYYY-MM-DD)'),
            end: z.string().describe('End date (YYYY-MM-DD)'),
            currencyCode: z.string().optional().describe('Currency code to filter by (e.g. EUR, USD)'),
        },
        annotations: READ_ANNOTATIONS,
    }, async ({ start, end, currencyCode }) => {
        try {
            const result = await fetchSummary(client, start, end, currencyCode);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        catch (err) {
            return { content: [{ type: 'text', text: formatError(err) }], isError: true };
        }
    });
    server.registerTool('get_insight_expenses', {
        title: 'Get Expense Insights',
        description: 'Get expense insights grouped by category for a date range. Returns how much was spent per category. Both start and end dates (YYYY-MM-DD) are required. For income insights, use get_insight_income.',
        inputSchema: {
            start: z.string().describe('Start date (YYYY-MM-DD)'),
            end: z.string().describe('End date (YYYY-MM-DD)'),
        },
        annotations: READ_ANNOTATIONS,
    }, async ({ start, end }) => {
        try {
            const result = await fetchInsightExpenses(client, start, end);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        catch (err) {
            return { content: [{ type: 'text', text: formatError(err) }], isError: true };
        }
    });
    server.registerTool('get_insight_income', {
        title: 'Get Income Insights',
        description: 'Get income insights grouped by category for a date range. Returns how much was earned per category. Both start and end dates (YYYY-MM-DD) are required. For expense insights, use get_insight_expenses.',
        inputSchema: {
            start: z.string().describe('Start date (YYYY-MM-DD)'),
            end: z.string().describe('End date (YYYY-MM-DD)'),
        },
        annotations: READ_ANNOTATIONS,
    }, async ({ start, end }) => {
        try {
            const result = await fetchInsightIncome(client, start, end);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        catch (err) {
            return { content: [{ type: 'text', text: formatError(err) }], isError: true };
        }
    });
}
//# sourceMappingURL=reports.js.map