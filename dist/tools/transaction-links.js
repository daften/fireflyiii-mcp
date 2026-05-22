import { z } from 'zod';
import { formatError } from '../client.js';
import { unwrapList, unwrapSingle, } from '../transform.js';
export async function fetchLinkTypes(client, params) {
    const response = await client.get('/link-types', { page: params.page, limit: params.limit });
    return unwrapList(response);
}
export async function fetchTransactionLinks(client, journalId, params) {
    const response = await client.get(`/transaction-journals/${journalId}/links`, { page: params.page, limit: params.limit });
    return unwrapList(response);
}
export async function fetchTransactionLink(client, id) {
    const response = await client.get(`/transaction-links/${id}`);
    return unwrapSingle(response);
}
export async function createTransactionLink(client, params) {
    const response = await client.post('/transaction-links', params);
    return unwrapSingle(response);
}
export async function updateTransactionLink(client, id, params) {
    const response = await client.put(`/transaction-links/${id}`, params);
    return unwrapSingle(response);
}
export async function deleteTransactionLink(client, id) {
    await client.delete(`/transaction-links/${id}`);
    return { deleted: true, id };
}
const READ_ANNOTATIONS = { readOnlyHint: true, openWorldHint: true, idempotentHint: true };
const WRITE_ANNOTATIONS = { openWorldHint: true };
const UPDATE_ANNOTATIONS = { openWorldHint: true, idempotentHint: true };
const DELETE_ANNOTATIONS = { destructiveHint: true, openWorldHint: true };
export function registerTransactionLinkTools(server, client) {
    server.registerTool('get_link_types', {
        title: 'Get Link Types',
        description: 'Get all available transaction link types (e.g. "Related", "Refund", "Paid"). Use these IDs when creating transaction links.',
        inputSchema: {
            page: z.number().int().positive().optional().default(1).describe('Page number'),
            limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
        },
        annotations: READ_ANNOTATIONS,
    }, async ({ page, limit }) => {
        try {
            const result = await fetchLinkTypes(client, { page, limit });
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        catch (err) {
            return { content: [{ type: 'text', text: formatError(err) }], isError: true };
        }
    });
    server.registerTool('get_transaction_links', {
        title: 'Get Transaction Links',
        description: 'Get all links attached to a specific transaction journal entry. Use get_transactions to find valid journal IDs.',
        inputSchema: {
            journal_id: z.string().describe('Transaction journal ID'),
            page: z.number().int().positive().optional().default(1).describe('Page number'),
            limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
        },
        annotations: READ_ANNOTATIONS,
    }, async ({ journal_id, page, limit }) => {
        try {
            const result = await fetchTransactionLinks(client, journal_id, { page, limit });
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        catch (err) {
            return { content: [{ type: 'text', text: formatError(err) }], isError: true };
        }
    });
    server.registerTool('get_transaction_link', {
        title: 'Get Transaction Link',
        description: 'Get a single transaction link by ID.',
        inputSchema: { id: z.string().describe('Transaction link ID') },
        annotations: READ_ANNOTATIONS,
    }, async ({ id }) => {
        try {
            const result = await fetchTransactionLink(client, id);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        catch (err) {
            return { content: [{ type: 'text', text: formatError(err) }], isError: true };
        }
    });
    server.registerTool('create_transaction_link', {
        title: 'Create Transaction Link',
        description: 'Create a link between two transactions (e.g. mark one as a refund of another). Use get_link_types to find valid link_type_id values.',
        inputSchema: {
            link_type_id: z.string().describe('Link type ID — use get_link_types to find valid IDs'),
            in_id: z.string().describe('Inward transaction journal ID'),
            out_id: z.string().describe('Outward transaction journal ID'),
            notes: z.string().optional().describe('Notes about this link'),
        },
        annotations: WRITE_ANNOTATIONS,
    }, async (params) => {
        try {
            const result = await createTransactionLink(client, params);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        catch (err) {
            return { content: [{ type: 'text', text: formatError(err) }], isError: true };
        }
    });
    server.registerTool('update_transaction_link', {
        title: 'Update Transaction Link',
        description: 'Update an existing transaction link. Only fields provided will be changed.',
        inputSchema: {
            id: z.string().describe('Transaction link ID'),
            link_type_id: z.string().optional().describe('Link type ID'),
            in_id: z.string().optional().describe('Inward transaction journal ID'),
            out_id: z.string().optional().describe('Outward transaction journal ID'),
            notes: z.string().optional().describe('Notes about this link'),
        },
        annotations: UPDATE_ANNOTATIONS,
    }, async ({ id, ...params }) => {
        try {
            const result = await updateTransactionLink(client, id, params);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        catch (err) {
            return { content: [{ type: 'text', text: formatError(err) }], isError: true };
        }
    });
    server.registerTool('delete_transaction_link', {
        title: 'Delete Transaction Link',
        description: 'Permanently delete a link between two transactions. **This action cannot be undone.**',
        inputSchema: { id: z.string().describe('Transaction link ID') },
        annotations: DELETE_ANNOTATIONS,
    }, async ({ id }) => {
        try {
            const result = await deleteTransactionLink(client, id);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        catch (err) {
            return { content: [{ type: 'text', text: formatError(err) }], isError: true };
        }
    });
}
//# sourceMappingURL=transaction-links.js.map