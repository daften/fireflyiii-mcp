import { z } from 'zod';
import { formatError } from '../client.js';
import { unwrapList, unwrapSingle } from '../transform.js';
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
    const response = await client.get('/transactions', query);
    return unwrapList(response);
}
export async function fetchTransaction(client, id) {
    const response = await client.get(`/transactions/${id}`);
    return unwrapSingle(response);
}
const READ_ANNOTATIONS = {
    readOnlyHint: true,
    openWorldHint: true,
    idempotentHint: true,
};
export function registerTransactionTools(server, client) {
    server.registerTool('get_transactions', {
        title: 'Get Transactions',
        description: 'Get transactions from Firefly III. Filter by type (withdrawal/deposit/transfer/reconciliation), account ID, or date range. Dates must be YYYY-MM-DD. Use get_transaction to fetch a single transaction by ID.',
        inputSchema: {
            type: z
                .enum(['withdrawal', 'deposit', 'transfer', 'reconciliation'])
                .optional()
                .describe('Transaction type filter'),
            accountId: z.string().optional().describe('Filter by account ID — use get_accounts to find valid IDs'),
            start: z.string().optional().describe('Start date (YYYY-MM-DD)'),
            end: z.string().optional().describe('End date (YYYY-MM-DD)'),
            page: z.number().int().positive().optional().default(1).describe('Page number'),
            limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
        },
        annotations: READ_ANNOTATIONS,
    }, async ({ type, accountId, start, end, page, limit }) => {
        try {
            const result = await fetchTransactions(client, { type, accountId, start, end, page, limit });
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        catch (err) {
            return { content: [{ type: 'text', text: formatError(err) }], isError: true };
        }
    });
    server.registerTool('get_transaction', {
        title: 'Get Transaction',
        description: 'Get a single Firefly III transaction by its numeric ID, including all splits. Use get_transactions to find valid transaction IDs.',
        inputSchema: {
            id: z.string().describe('Transaction ID'),
        },
        annotations: READ_ANNOTATIONS,
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