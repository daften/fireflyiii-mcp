import { z } from 'zod';
import { formatError } from '../client.js';
import { unwrapList, unwrapSingle } from '../transform.js';
export async function fetchBills(client, params) {
    const query = { page: params.page, limit: params.limit };
    if (params.start)
        query['start'] = params.start;
    if (params.end)
        query['end'] = params.end;
    const response = await client.get('/bills', query);
    return unwrapList(response);
}
export async function createBill(client, params) {
    const response = await client.post('/bills', params);
    return unwrapSingle(response);
}
export async function updateBill(client, id, params) {
    const response = await client.put(`/bills/${id}`, params);
    return unwrapSingle(response);
}
export async function deleteBill(client, id) {
    await client.delete(`/bills/${id}`);
    return { deleted: true, id };
}
export async function fetchBillTransactions(client, id, params) {
    const query = { page: params.page, limit: params.limit };
    if (params.start)
        query['start'] = params.start;
    if (params.end)
        query['end'] = params.end;
    const response = await client.get(`/bills/${id}/transactions`, query);
    return unwrapList(response);
}
const READ_ANNOTATIONS = {
    readOnlyHint: true,
    openWorldHint: true,
    idempotentHint: true,
};
const WRITE_ANNOTATIONS = { openWorldHint: true };
const UPDATE_ANNOTATIONS = { openWorldHint: true, idempotentHint: true };
const DELETE_ANNOTATIONS = { destructiveHint: true, openWorldHint: true };
export function registerBillTools(server, client) {
    server.registerTool('get_bills', {
        title: 'Get Bills',
        description: 'Get all recurring bills from Firefly III, including the next expected match date and payment status. Optionally filter by date range (YYYY-MM-DD).',
        inputSchema: {
            start: z.string().optional().describe('Start date (YYYY-MM-DD)'),
            end: z.string().optional().describe('End date (YYYY-MM-DD)'),
            page: z.number().int().positive().optional().default(1).describe('Page number'),
            limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
        },
        annotations: READ_ANNOTATIONS,
    }, async ({ start, end, page, limit }) => {
        try {
            const result = await fetchBills(client, { start, end, page, limit });
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        catch (err) {
            return { content: [{ type: 'text', text: formatError(err) }], isError: true };
        }
    });
    server.registerTool('create_bill', {
        title: 'Create Bill',
        description: 'Create a new recurring bill in Firefly III.',
        inputSchema: {
            name: z.string().describe('Bill name'),
            amount_min: z.string().describe('Minimum expected amount as a number string'),
            amount_max: z.string().describe('Maximum expected amount as a number string'),
            date: z.string().describe('First expected payment date (YYYY-MM-DD)'),
            repeat_freq: z.enum(['weekly', 'monthly', 'quarterly', 'half-year', 'yearly']).describe('Repeat frequency'),
            currency_code: z.string().optional().describe('Currency code (e.g. EUR, USD)'),
            end_date: z.string().optional().describe('End date for the bill (YYYY-MM-DD)'),
            active: z.boolean().optional().describe('Whether the bill is active'),
            notes: z.string().optional().describe('Notes'),
        },
        annotations: WRITE_ANNOTATIONS,
    }, async (params) => {
        try {
            const result = await createBill(client, params);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        catch (err) {
            return { content: [{ type: 'text', text: formatError(err) }], isError: true };
        }
    });
    server.registerTool('update_bill', {
        title: 'Update Bill',
        description: 'Update an existing bill in Firefly III. Only fields provided will be changed. Use get_bills to find valid bill IDs.',
        inputSchema: {
            id: z.string().describe('Bill ID — use get_bills to find valid IDs'),
            name: z.string().optional().describe('Bill name'),
            amount_min: z.string().optional().describe('Minimum expected amount as a number string'),
            amount_max: z.string().optional().describe('Maximum expected amount as a number string'),
            date: z.string().optional().describe('First expected payment date (YYYY-MM-DD)'),
            repeat_freq: z.enum(['weekly', 'monthly', 'quarterly', 'half-year', 'yearly']).optional().describe('Repeat frequency'),
            currency_code: z.string().optional().describe('Currency code (e.g. EUR, USD)'),
            end_date: z.string().optional().describe('End date (YYYY-MM-DD)'),
            active: z.boolean().optional().describe('Whether the bill is active'),
            notes: z.string().optional().describe('Notes'),
        },
        annotations: UPDATE_ANNOTATIONS,
    }, async ({ id, ...params }) => {
        try {
            const result = await updateBill(client, id, params);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        catch (err) {
            return { content: [{ type: 'text', text: formatError(err) }], isError: true };
        }
    });
    server.registerTool('delete_bill', {
        title: 'Delete Bill',
        description: 'Permanently delete a bill from Firefly III. **This action cannot be undone.** Use get_bills to confirm the ID before deleting.',
        inputSchema: { id: z.string().describe('Bill ID — use get_bills to find valid IDs') },
        annotations: DELETE_ANNOTATIONS,
    }, async ({ id }) => {
        try {
            const result = await deleteBill(client, id);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        catch (err) {
            return { content: [{ type: 'text', text: formatError(err) }], isError: true };
        }
    });
    server.registerTool('get_bill_transactions', {
        title: 'Get Bill Transactions',
        description: 'Get all transactions linked to a specific bill. Use get_bills to find valid bill IDs.',
        inputSchema: {
            id: z.string().describe('Bill ID'),
            start: z.string().optional().describe('Start date (YYYY-MM-DD)'),
            end: z.string().optional().describe('End date (YYYY-MM-DD)'),
            page: z.number().int().positive().optional().default(1).describe('Page number'),
            limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
        },
        annotations: READ_ANNOTATIONS,
    }, async ({ id, start, end, page, limit }) => {
        try {
            const result = await fetchBillTransactions(client, id, { start, end, page, limit });
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        catch (err) {
            return { content: [{ type: 'text', text: formatError(err) }], isError: true };
        }
    });
}
//# sourceMappingURL=bills.js.map