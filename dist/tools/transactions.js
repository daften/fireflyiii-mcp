import { z } from 'zod';
import { formatError } from '../client.js';
export async function fetchTransactions(client, params) {
    const query = { page: params.page, limit: params.limit };
    if (params.type)
        query['type'] = params.type;
    if (params.accountId)
        query['account_id'] = params.accountId;
    if (params.start)
        query['start'] = params.start;
    if (params.end)
        query['end'] = params.end;
    return client.get('/transactions', query);
}
export async function fetchTransaction(client, id) {
    return client.get(`/transactions/${id}`);
}
export function registerTransactionTools(server, client) {
    server.tool('get_transactions', 'Get transactions from Firefly III. Filter by transaction type (withdrawal/deposit/transfer/reconciliation), account ID, date range, and pagination. Dates must be YYYY-MM-DD format.', {
        type: z
            .enum(['withdrawal', 'deposit', 'transfer', 'reconciliation'])
            .optional()
            .describe('Transaction type filter'),
        accountId: z.string().optional().describe('Filter by account ID'),
        start: z.string().optional().describe('Start date (YYYY-MM-DD)'),
        end: z.string().optional().describe('End date (YYYY-MM-DD)'),
        page: z.number().int().positive().optional().default(1).describe('Page number'),
        limit: z.number().int().positive().optional().default(50).describe('Results per page'),
    }, async ({ type, accountId, start, end, page, limit }) => {
        try {
            const result = await fetchTransactions(client, { type, accountId, start, end, page, limit });
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        catch (err) {
            return { content: [{ type: 'text', text: formatError(err) }], isError: true };
        }
    });
    server.tool('get_transaction', 'Get a single Firefly III transaction by its numeric ID, including all splits.', {
        id: z.string().describe('Transaction ID'),
    }, async ({ id }) => {
        try {
            const result = await fetchTransaction(client, id);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        catch (err) {
            return { content: [{ type: 'text', text: formatError(err) }], isError: true };
        }
    });
}
//# sourceMappingURL=transactions.js.map