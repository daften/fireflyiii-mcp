import { z } from 'zod';
import { formatError } from '../client.js';
import { unwrapList, unwrapSingle, cleanSummary } from '../transform.js';
export async function fetchTags(client, params) {
    const response = await client.get('/tags', { page: params.page, limit: params.limit });
    return unwrapList(response);
}
export async function fetchTagTransactions(client, tag, params) {
    const query = { page: params.page, limit: params.limit };
    if (params.start)
        query['start'] = params.start;
    if (params.end)
        query['end'] = params.end;
    const response = await client.get(`/tags/${encodeURIComponent(tag)}/transactions`, query);
    return unwrapList(response);
}
export async function fetchSummary(client, start, end, currencyCode) {
    const query = { start, end };
    if (currencyCode)
        query['currency_code'] = currencyCode;
    const response = await client.get('/summary/basic', query);
    return cleanSummary(response);
}
export async function fetchInsightExpenses(client, start, end) {
    return client.get('/insight/expense/category', { start, end });
}
export async function fetchInsightIncome(client, start, end) {
    return client.get('/insight/income/category', { start, end });
}
export async function fetchInsightNoX(client, endpoint, start, end) {
    return client.get(endpoint, { start, end });
}
export async function createTag(client, params) {
    const response = await client.post('/tags', params);
    return unwrapSingle(response);
}
export async function updateTag(client, id, params) {
    const response = await client.put(`/tags/${id}`, params);
    return unwrapSingle(response);
}
export async function deleteTag(client, id) {
    await client.delete(`/tags/${id}`);
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
    server.registerTool('create_tag', {
        title: 'Create Tag',
        description: 'Create a new tag in Firefly III.',
        inputSchema: {
            tag: z.string().describe('Tag name'),
            date: z.string().optional().describe('Tag date (YYYY-MM-DD)'),
            description: z.string().optional().describe('Tag description'),
        },
        annotations: WRITE_ANNOTATIONS,
    }, async (params) => {
        try {
            const result = await createTag(client, params);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        catch (err) {
            return { content: [{ type: 'text', text: formatError(err) }], isError: true };
        }
    });
    server.registerTool('update_tag', {
        title: 'Update Tag',
        description: 'Update an existing tag in Firefly III. Only fields provided will be changed. Use get_tags to find valid tag IDs.',
        inputSchema: {
            id: z.string().describe('Tag ID — use get_tags to find valid IDs'),
            tag: z.string().optional().describe('Tag name'),
            date: z.string().optional().describe('Tag date (YYYY-MM-DD)'),
            description: z.string().optional().describe('Tag description'),
        },
        annotations: UPDATE_ANNOTATIONS,
    }, async ({ id, ...params }) => {
        try {
            const result = await updateTag(client, id, params);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        catch (err) {
            return { content: [{ type: 'text', text: formatError(err) }], isError: true };
        }
    });
    server.registerTool('delete_tag', {
        title: 'Delete Tag',
        description: 'Permanently delete a tag from Firefly III. **This action cannot be undone.** Transactions with this tag will have it removed. Use get_tags to confirm the ID before deleting.',
        inputSchema: { id: z.string().describe('Tag ID — use get_tags to find valid IDs') },
        annotations: DELETE_ANNOTATIONS,
    }, async ({ id }) => {
        try {
            const result = await deleteTag(client, id);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        catch (err) {
            return { content: [{ type: 'text', text: formatError(err) }], isError: true };
        }
    });
    server.registerTool('get_insight_expenses_no_bill', {
        title: 'Get Expense Insights — No Bill',
        description: 'Get expense totals for transactions that have no bill attached, grouped by currency. Both start and end dates (YYYY-MM-DD) are required.',
        inputSchema: {
            start: z.string().describe('Start date (YYYY-MM-DD)'),
            end: z.string().describe('End date (YYYY-MM-DD)'),
        },
        annotations: READ_ANNOTATIONS,
    }, async ({ start, end }) => {
        try {
            const result = await fetchInsightNoX(client, '/insight/expense/no-bill', start, end);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        catch (err) {
            return { content: [{ type: 'text', text: formatError(err) }], isError: true };
        }
    });
    server.registerTool('get_insight_expenses_no_budget', {
        title: 'Get Expense Insights — No Budget',
        description: 'Get expense totals for transactions that have no budget attached, grouped by currency. Both start and end dates (YYYY-MM-DD) are required.',
        inputSchema: {
            start: z.string().describe('Start date (YYYY-MM-DD)'),
            end: z.string().describe('End date (YYYY-MM-DD)'),
        },
        annotations: READ_ANNOTATIONS,
    }, async ({ start, end }) => {
        try {
            const result = await fetchInsightNoX(client, '/insight/expense/no-budget', start, end);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        catch (err) {
            return { content: [{ type: 'text', text: formatError(err) }], isError: true };
        }
    });
    server.registerTool('get_insight_expenses_no_category', {
        title: 'Get Expense Insights — No Category',
        description: 'Get expense totals for transactions that have no category attached, grouped by currency. Both start and end dates (YYYY-MM-DD) are required.',
        inputSchema: {
            start: z.string().describe('Start date (YYYY-MM-DD)'),
            end: z.string().describe('End date (YYYY-MM-DD)'),
        },
        annotations: READ_ANNOTATIONS,
    }, async ({ start, end }) => {
        try {
            const result = await fetchInsightNoX(client, '/insight/expense/no-category', start, end);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        catch (err) {
            return { content: [{ type: 'text', text: formatError(err) }], isError: true };
        }
    });
    server.registerTool('get_insight_expenses_no_tag', {
        title: 'Get Expense Insights — No Tag',
        description: 'Get expense totals for transactions that have no tag attached, grouped by currency. Both start and end dates (YYYY-MM-DD) are required.',
        inputSchema: {
            start: z.string().describe('Start date (YYYY-MM-DD)'),
            end: z.string().describe('End date (YYYY-MM-DD)'),
        },
        annotations: READ_ANNOTATIONS,
    }, async ({ start, end }) => {
        try {
            const result = await fetchInsightNoX(client, '/insight/expense/no-tag', start, end);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        catch (err) {
            return { content: [{ type: 'text', text: formatError(err) }], isError: true };
        }
    });
    server.registerTool('get_insight_income_no_category', {
        title: 'Get Income Insights — No Category',
        description: 'Get income totals for transactions that have no category attached, grouped by currency. Both start and end dates (YYYY-MM-DD) are required.',
        inputSchema: {
            start: z.string().describe('Start date (YYYY-MM-DD)'),
            end: z.string().describe('End date (YYYY-MM-DD)'),
        },
        annotations: READ_ANNOTATIONS,
    }, async ({ start, end }) => {
        try {
            const result = await fetchInsightNoX(client, '/insight/income/no-category', start, end);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        catch (err) {
            return { content: [{ type: 'text', text: formatError(err) }], isError: true };
        }
    });
    server.registerTool('get_insight_income_no_tag', {
        title: 'Get Income Insights — No Tag',
        description: 'Get income totals for transactions that have no tag attached, grouped by currency. Both start and end dates (YYYY-MM-DD) are required.',
        inputSchema: {
            start: z.string().describe('Start date (YYYY-MM-DD)'),
            end: z.string().describe('End date (YYYY-MM-DD)'),
        },
        annotations: READ_ANNOTATIONS,
    }, async ({ start, end }) => {
        try {
            const result = await fetchInsightNoX(client, '/insight/income/no-tag', start, end);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        catch (err) {
            return { content: [{ type: 'text', text: formatError(err) }], isError: true };
        }
    });
    server.registerTool('get_insight_transfer_no_category', {
        title: 'Get Transfer Insights — No Category',
        description: 'Get transfer totals for transactions that have no category attached, grouped by currency. Both start and end dates (YYYY-MM-DD) are required.',
        inputSchema: {
            start: z.string().describe('Start date (YYYY-MM-DD)'),
            end: z.string().describe('End date (YYYY-MM-DD)'),
        },
        annotations: READ_ANNOTATIONS,
    }, async ({ start, end }) => {
        try {
            const result = await fetchInsightNoX(client, '/insight/transfer/no-category', start, end);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        catch (err) {
            return { content: [{ type: 'text', text: formatError(err) }], isError: true };
        }
    });
    server.registerTool('get_insight_transfer_no_tag', {
        title: 'Get Transfer Insights — No Tag',
        description: 'Get transfer totals for transactions that have no tag attached, grouped by currency. Both start and end dates (YYYY-MM-DD) are required.',
        inputSchema: {
            start: z.string().describe('Start date (YYYY-MM-DD)'),
            end: z.string().describe('End date (YYYY-MM-DD)'),
        },
        annotations: READ_ANNOTATIONS,
    }, async ({ start, end }) => {
        try {
            const result = await fetchInsightNoX(client, '/insight/transfer/no-tag', start, end);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        catch (err) {
            return { content: [{ type: 'text', text: formatError(err) }], isError: true };
        }
    });
}
//# sourceMappingURL=reports.js.map