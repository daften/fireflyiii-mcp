import { z } from 'zod';
import { unwrapList, unwrapSingle } from '../transform.js';
import { READ_ANNOTATIONS, WRITE_ANNOTATIONS, UPDATE_ANNOTATIONS, DELETE_ANNOTATIONS } from './_annotations.js';
import { defineTool, dateSchema } from './_helpers.js';
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
export function registerBillTools(server, client) {
    defineTool(server, 'get_bills', {
        title: 'Get Bills',
        description: 'Get all recurring bills from Firefly III, including the next expected match date and payment status. Optionally filter by date range (YYYY-MM-DD).',
        inputSchema: {
            start: dateSchema.optional().describe('Start date (YYYY-MM-DD)'),
            end: dateSchema.optional().describe('End date (YYYY-MM-DD)'),
            page: z.number().int().positive().optional().default(1).describe('Page number'),
            limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
        },
        annotations: READ_ANNOTATIONS,
    }, ({ start, end, page, limit }) => fetchBills(client, { start: start, end: end, page: page, limit: limit }));
    defineTool(server, 'create_bill', {
        title: 'Create Bill',
        description: 'Create a new recurring bill in Firefly III.',
        inputSchema: {
            name: z.string().describe('Bill name'),
            amount_min: z.string().describe('Minimum expected amount as a number string'),
            amount_max: z.string().describe('Maximum expected amount as a number string'),
            date: dateSchema.describe('Bill start date (YYYY-MM-DD)'),
            repeat_freq: z.enum(['weekly', 'monthly', 'quarterly', 'half-year', 'yearly']).describe('Repeat frequency'),
            currency_code: z.string().optional().describe('Currency code (e.g. EUR, USD)'),
            end_date: dateSchema.optional().describe('End date for the bill (YYYY-MM-DD)'),
            active: z.boolean().optional().describe('Whether the bill is active'),
            notes: z.string().optional().describe('Notes'),
        },
        annotations: WRITE_ANNOTATIONS,
    }, (params) => createBill(client, params));
    defineTool(server, 'update_bill', {
        title: 'Update Bill',
        description: 'Update an existing bill in Firefly III. Only fields provided will be changed. Use get_bills to find valid bill IDs.',
        inputSchema: {
            id: z.string().describe('Bill ID — use get_bills to find valid IDs'),
            name: z.string().optional().describe('Bill name'),
            amount_min: z.string().optional().describe('Minimum expected amount as a number string'),
            amount_max: z.string().optional().describe('Maximum expected amount as a number string'),
            date: dateSchema.optional().describe('First expected payment date (YYYY-MM-DD)'),
            repeat_freq: z.enum(['weekly', 'monthly', 'quarterly', 'half-year', 'yearly']).optional().describe('Repeat frequency'),
            currency_code: z.string().optional().describe('Currency code (e.g. EUR, USD)'),
            end_date: dateSchema.optional().describe('End date (YYYY-MM-DD)'),
            active: z.boolean().optional().describe('Whether the bill is active'),
            notes: z.string().optional().describe('Notes'),
        },
        annotations: UPDATE_ANNOTATIONS,
    }, ({ id, ...params }) => updateBill(client, id, params));
    defineTool(server, 'delete_bill', {
        title: 'Delete Bill',
        description: 'Permanently delete a bill from Firefly III. **This action cannot be undone.** Use get_bills to confirm the ID before deleting.',
        inputSchema: { id: z.string().describe('Bill ID — use get_bills to find valid IDs') },
        annotations: DELETE_ANNOTATIONS,
    }, ({ id }) => deleteBill(client, id));
    defineTool(server, 'get_bill_transactions', {
        title: 'Get Bill Transactions',
        description: 'Get all transactions linked to a specific bill. Use get_bills to find valid bill IDs.',
        inputSchema: {
            id: z.string().describe('Bill ID'),
            start: dateSchema.optional().describe('Start date (YYYY-MM-DD)'),
            end: dateSchema.optional().describe('End date (YYYY-MM-DD)'),
            page: z.number().int().positive().optional().default(1).describe('Page number'),
            limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
        },
        annotations: READ_ANNOTATIONS,
    }, ({ id, start, end, page, limit }) => fetchBillTransactions(client, id, { start: start, end: end, page: page, limit: limit }));
}
//# sourceMappingURL=bills.js.map