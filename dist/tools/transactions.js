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
export async function createTransaction(client, params) {
    const split = {
        type: params.type,
        date: params.date,
        amount: params.amount,
        description: params.description,
    };
    if (params.source_id !== undefined)
        split.source_id = params.source_id;
    if (params.destination_id !== undefined)
        split.destination_id = params.destination_id;
    if (params.category_name !== undefined)
        split.category_name = params.category_name;
    if (params.budget_id !== undefined)
        split.budget_id = params.budget_id;
    if (params.currency_code !== undefined)
        split.currency_code = params.currency_code;
    if (params.notes !== undefined)
        split.notes = params.notes;
    if (params.tags !== undefined)
        split.tags = params.tags;
    const response = await client.post('/transactions', {
        apply_rules: true,
        fire_webhooks: true,
        transactions: [split],
    });
    return unwrapSingle(response);
}
export async function updateTransaction(client, id, params) {
    const split = {};
    if (params.type !== undefined)
        split.type = params.type;
    if (params.date !== undefined)
        split.date = params.date;
    if (params.amount !== undefined)
        split.amount = params.amount;
    if (params.description !== undefined)
        split.description = params.description;
    if (params.source_id !== undefined)
        split.source_id = params.source_id;
    if (params.destination_id !== undefined)
        split.destination_id = params.destination_id;
    if (params.category_name !== undefined)
        split.category_name = params.category_name;
    if (params.budget_id !== undefined)
        split.budget_id = params.budget_id;
    if (params.currency_code !== undefined)
        split.currency_code = params.currency_code;
    if (params.notes !== undefined)
        split.notes = params.notes;
    if (params.tags !== undefined)
        split.tags = params.tags;
    const response = await client.put(`/transactions/${id}`, {
        apply_rules: true,
        fire_webhooks: true,
        transactions: [split],
    });
    return unwrapSingle(response);
}
export async function deleteTransaction(client, id) {
    await client.delete(`/transactions/${id}`);
    return { deleted: true, id };
}
export async function searchTransactions(client, params) {
    const query = { query: params.query, page: params.page, limit: params.limit };
    const response = await client.get('/search/transactions', query);
    return unwrapList(response);
}
export async function createSplitTransaction(client, params) {
    const transactions = params.splits.map(split => {
        const item = {
            type: params.type,
            date: params.date,
            amount: split.amount,
            description: split.description,
        };
        if (params.source_id !== undefined)
            item.source_id = params.source_id;
        if (params.destination_id !== undefined)
            item.destination_id = params.destination_id;
        if (params.currency_code !== undefined)
            item.currency_code = params.currency_code;
        if (split.category_name !== undefined)
            item.category_name = split.category_name;
        if (split.budget_id !== undefined)
            item.budget_id = split.budget_id;
        if (split.tags !== undefined)
            item.tags = split.tags;
        if (split.notes !== undefined)
            item.notes = split.notes;
        return item;
    });
    const body = { apply_rules: true, fire_webhooks: true, transactions };
    if (params.group_title !== undefined)
        body.group_title = params.group_title;
    const response = await client.post('/transactions', body);
    return unwrapSingle(response);
}
const READ_ANNOTATIONS = {
    readOnlyHint: true,
    openWorldHint: true,
    idempotentHint: true,
};
const WRITE_ANNOTATIONS = { openWorldHint: true };
const UPDATE_ANNOTATIONS = { openWorldHint: true, idempotentHint: true };
const DELETE_ANNOTATIONS = { destructiveHint: true, openWorldHint: true };
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
    server.registerTool('create_transaction', {
        title: 'Create Transaction',
        description: 'Create a new transaction in Firefly III. Use get_accounts to find source and destination account IDs.',
        inputSchema: {
            type: z.enum(['withdrawal', 'deposit', 'transfer']).describe('Transaction type'),
            date: z.string().describe('Transaction date (YYYY-MM-DD)'),
            amount: z.string().describe('Amount as a positive number string, e.g. "42.50"'),
            description: z.string().describe('Short description of the transaction'),
            source_id: z.string().optional().describe('Source account ID (required for withdrawals and transfers)'),
            destination_id: z.string().optional().describe('Destination account ID (required for deposits and transfers)'),
            category_name: z.string().optional().describe('Category name to assign'),
            budget_id: z.string().optional().describe('Budget ID — use get_budgets to find valid IDs'),
            currency_code: z.string().optional().describe('Currency code (e.g. EUR, USD). Defaults to account currency.'),
            notes: z.string().optional().describe('Additional notes'),
            tags: z.array(z.string()).optional().describe('Tags to attach'),
        },
        annotations: WRITE_ANNOTATIONS,
    }, async ({ type, date, amount, description, source_id, destination_id, category_name, budget_id, currency_code, notes, tags }) => {
        try {
            const result = await createTransaction(client, { type, date, amount, description, source_id, destination_id, category_name, budget_id, currency_code, notes, tags });
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        catch (err) {
            return { content: [{ type: 'text', text: formatError(err) }], isError: true };
        }
    });
    server.registerTool('update_transaction', {
        title: 'Update Transaction',
        description: 'Update an existing transaction in Firefly III. Only fields provided will be changed. Use get_transaction to confirm the ID before updating.',
        inputSchema: {
            id: z.string().describe('Transaction ID — use get_transactions to find valid IDs'),
            type: z.enum(['withdrawal', 'deposit', 'transfer']).optional().describe('Transaction type'),
            date: z.string().optional().describe('Transaction date (YYYY-MM-DD)'),
            amount: z.string().optional().describe('Amount as a positive number string'),
            description: z.string().optional().describe('Short description'),
            source_id: z.string().optional().describe('Source account ID'),
            destination_id: z.string().optional().describe('Destination account ID'),
            category_name: z.string().optional().describe('Category name'),
            budget_id: z.string().optional().describe('Budget ID'),
            currency_code: z.string().optional().describe('Currency code (e.g. EUR, USD)'),
            notes: z.string().optional().describe('Additional notes'),
            tags: z.array(z.string()).optional().describe('Tags (replaces existing tags)'),
        },
        annotations: UPDATE_ANNOTATIONS,
    }, async ({ id, ...params }) => {
        try {
            const result = await updateTransaction(client, id, params);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        catch (err) {
            return { content: [{ type: 'text', text: formatError(err) }], isError: true };
        }
    });
    server.registerTool('delete_transaction', {
        title: 'Delete Transaction',
        description: 'Permanently delete a transaction from Firefly III. **This action cannot be undone.** Use get_transaction to confirm the transaction before deleting.',
        inputSchema: {
            id: z.string().describe('Transaction ID — use get_transactions to find valid IDs'),
        },
        annotations: DELETE_ANNOTATIONS,
    }, async ({ id }) => {
        try {
            const result = await deleteTransaction(client, id);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        catch (err) {
            return { content: [{ type: 'text', text: formatError(err) }], isError: true };
        }
    });
    server.registerTool('search_transactions', {
        title: 'Search Transactions',
        description: 'Search for transactions in Firefly III by keyword. Searches across descriptions, notes, and other fields.',
        inputSchema: {
            query: z.string().describe('Search query'),
            page: z.number().int().positive().optional().default(1).describe('Page number'),
            limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
        },
        annotations: READ_ANNOTATIONS,
    }, async ({ query, page, limit }) => {
        try {
            const result = await searchTransactions(client, { query, page, limit });
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        catch (err) {
            return { content: [{ type: 'text', text: formatError(err) }], isError: true };
        }
    });
    server.registerTool('create_split_transaction', {
        title: 'Create Split Transaction',
        description: 'Create a split transaction in Firefly III — one receipt divided across multiple categories, budgets, or descriptions. All splits share the same type, date, and accounts. Use get_accounts to find source and destination account IDs.',
        inputSchema: {
            type: z.enum(['withdrawal', 'deposit', 'transfer']).describe('Transaction type (shared across all splits)'),
            date: z.string().describe('Transaction date (YYYY-MM-DD, shared across all splits)'),
            source_id: z.string().optional().describe('Source account ID (required for withdrawals and transfers)'),
            destination_id: z.string().optional().describe('Destination account ID (required for deposits and transfers)'),
            currency_code: z.string().optional().describe('Currency code (e.g. EUR, USD). Defaults to account currency.'),
            group_title: z.string().optional().describe('Optional label for the transaction group'),
            splits: z.array(z.object({
                amount: z.string().describe('Amount as a positive number string, e.g. "42.50"'),
                description: z.string().describe('Description for this split'),
                category_name: z.string().optional().describe('Category name'),
                budget_id: z.string().optional().describe('Budget ID — use get_budgets to find valid IDs'),
                tags: z.array(z.string()).optional().describe('Tags'),
                notes: z.string().optional().describe('Notes'),
            })).min(2).describe('At least 2 splits required'),
        },
        annotations: WRITE_ANNOTATIONS,
    }, async ({ type, date, source_id, destination_id, currency_code, group_title, splits }) => {
        try {
            const result = await createSplitTransaction(client, { type, date, source_id, destination_id, currency_code, group_title, splits });
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        catch (err) {
            return { content: [{ type: 'text', text: formatError(err) }], isError: true };
        }
    });
}
//# sourceMappingURL=transactions.js.map