import { z } from 'zod';
import { unwrapList, unwrapSingle } from '../transform.js';
import { READ_ANNOTATIONS, WRITE_ANNOTATIONS, UPDATE_ANNOTATIONS, DELETE_ANNOTATIONS } from './_annotations.js';
import { defineTool, dateSchema } from './_helpers.js';
export async function fetchAccounts(client, params) {
    const query = { page: params.page, limit: params.limit };
    if (params.type && params.type !== 'all')
        query['type'] = params.type;
    const response = await client.get('/accounts', query);
    return unwrapList(response);
}
export async function fetchAccount(client, id) {
    const response = await client.get(`/accounts/${id}`);
    return unwrapSingle(response);
}
export async function createAccount(client, params) {
    const response = await client.post('/accounts', params);
    return unwrapSingle(response);
}
export async function updateAccount(client, id, params) {
    const response = await client.put(`/accounts/${id}`, params);
    return unwrapSingle(response);
}
export async function deleteAccount(client, id) {
    await client.delete(`/accounts/${id}`);
    return { deleted: true, id };
}
export async function fetchAccountTransactions(client, id, params) {
    const query = { page: params.page, limit: params.limit };
    if (params.start)
        query['start'] = params.start;
    if (params.end)
        query['end'] = params.end;
    if (params.type)
        query['type'] = params.type;
    const response = await client.get(`/accounts/${id}/transactions`, query);
    return unwrapList(response);
}
export async function searchAccounts(client, params) {
    const query = { query: params.query, page: params.page, limit: params.limit };
    if (params.field)
        query['field'] = params.field;
    const response = await client.get('/search/accounts', query);
    return unwrapList(response);
}
export function registerAccountTools(server, client) {
    defineTool(server, 'get_accounts', {
        title: 'Get Accounts',
        description: 'Get all accounts from Firefly III. Filter by type: asset (bank/cash accounts), expense (merchants), revenue (income sources), liability (loans/debts), or all. Use get_account to fetch a single account by ID.',
        inputSchema: {
            type: z.enum(['asset', 'expense', 'revenue', 'liability', 'all']).optional().default('all').describe('Account type filter'),
            page: z.number().int().positive().optional().default(1).describe('Page number'),
            limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
        },
        annotations: READ_ANNOTATIONS,
    }, ({ type, page, limit }) => fetchAccounts(client, { type: type, page: page, limit: limit }));
    defineTool(server, 'get_account', {
        title: 'Get Account',
        description: 'Get a single Firefly III account by its numeric ID, including the current balance. Use get_accounts to find valid account IDs.',
        inputSchema: { id: z.string().describe('Account ID') },
        annotations: READ_ANNOTATIONS,
    }, ({ id }) => fetchAccount(client, id));
    defineTool(server, 'create_account', {
        title: 'Create Account',
        description: 'Create a new account in Firefly III.',
        inputSchema: {
            name: z.string().describe('Account name'),
            type: z.enum(['asset', 'expense', 'revenue', 'liability']).describe('Account type'),
            currency_code: z.string().optional().describe('Currency code (e.g. EUR, USD)'),
            iban: z.string().optional().describe('IBAN number'),
            opening_balance: z.string().optional().describe('Opening balance as a number string'),
            opening_balance_date: dateSchema.optional().describe('Opening balance date (YYYY-MM-DD)'),
            include_net_worth: z.boolean().optional().describe('Include in net worth calculations'),
            notes: z.string().optional().describe('Notes'),
        },
        annotations: WRITE_ANNOTATIONS,
    }, (params) => createAccount(client, params));
    defineTool(server, 'update_account', {
        title: 'Update Account',
        description: 'Update an existing account in Firefly III. Only fields provided will be changed. Use get_account to confirm the ID.',
        inputSchema: {
            id: z.string().describe('Account ID — use get_accounts to find valid IDs'),
            name: z.string().optional().describe('Account name'),
            currency_code: z.string().optional().describe('Currency code (e.g. EUR, USD)'),
            iban: z.string().optional().describe('IBAN number'),
            opening_balance: z.string().optional().describe('Opening balance as a number string'),
            opening_balance_date: dateSchema.optional().describe('Opening balance date (YYYY-MM-DD)'),
            include_net_worth: z.boolean().optional().describe('Include in net worth calculations'),
            active: z.boolean().optional().describe('Whether the account is active'),
            notes: z.string().optional().describe('Notes'),
        },
        annotations: UPDATE_ANNOTATIONS,
    }, ({ id, ...params }) => updateAccount(client, id, params));
    defineTool(server, 'delete_account', {
        title: 'Delete Account',
        description: 'Permanently delete an account from Firefly III. **This action cannot be undone.** Accounts with linked transactions cannot be deleted. Use get_account to confirm before deleting.',
        inputSchema: { id: z.string().describe('Account ID — use get_accounts to find valid IDs') },
        annotations: DELETE_ANNOTATIONS,
    }, ({ id }) => deleteAccount(client, id));
    defineTool(server, 'get_account_transactions', {
        title: 'Get Account Transactions',
        description: 'Get all transactions for a specific account. Use get_accounts to find valid account IDs.',
        inputSchema: {
            id: z.string().describe('Account ID'),
            start: dateSchema.optional().describe('Start date (YYYY-MM-DD)'),
            end: dateSchema.optional().describe('End date (YYYY-MM-DD)'),
            type: z.enum(['all', 'withdrawal', 'deposit', 'transfer', 'opening_balance', 'reconciliation', 'special', 'default']).optional().describe('Filter by transaction type'),
            page: z.number().int().positive().optional().default(1).describe('Page number'),
            limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
        },
        annotations: READ_ANNOTATIONS,
    }, ({ id, start, end, type, page, limit }) => fetchAccountTransactions(client, id, { start: start, end: end, type: type, page: page, limit: limit }));
    defineTool(server, 'search_accounts', {
        title: 'Search Accounts',
        description: 'Search for accounts by name, IBAN, account number, or ID.',
        inputSchema: {
            query: z.string().describe('Search query'),
            field: z.enum(['all', 'id', 'name', 'iban', 'number', 'account_number']).optional().default('all').describe('Field to search in'),
            page: z.number().int().positive().optional().default(1).describe('Page number'),
            limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
        },
        annotations: READ_ANNOTATIONS,
    }, ({ query, field, page, limit }) => searchAccounts(client, { query: query, field: field, page: page, limit: limit }));
}
//# sourceMappingURL=accounts.js.map