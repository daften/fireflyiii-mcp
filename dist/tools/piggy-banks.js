import { z } from 'zod';
import { unwrapList, unwrapSingle } from '../transform.js';
import { READ_ANNOTATIONS, WRITE_ANNOTATIONS, UPDATE_ANNOTATIONS, DELETE_ANNOTATIONS } from './_annotations.js';
import { defineTool, dateSchema } from './_helpers.js';
export async function fetchPiggyBanks(client, params) {
    const response = await client.get('/piggy-banks', { page: params.page, limit: params.limit });
    return unwrapList(response);
}
export async function createPiggyBank(client, params) {
    const response = await client.post('/piggy-banks', params);
    return unwrapSingle(response);
}
export async function updatePiggyBank(client, id, params) {
    const response = await client.put(`/piggy-banks/${id}`, params);
    return unwrapSingle(response);
}
export async function deletePiggyBank(client, id) {
    await client.delete(`/piggy-banks/${id}`);
    return { deleted: true, id };
}
export async function fetchPiggyBankEvents(client, id, params) {
    const query = { page: params.page, limit: params.limit };
    const response = await client.get(`/piggy-banks/${id}/events`, query);
    return unwrapList(response);
}
export async function createPiggyBankEvent(client, id, params) {
    const response = await client.post(`/piggy-banks/${id}/events`, params);
    return unwrapSingle(response);
}
export async function deletePiggyBankEvent(client, id, eventId) {
    await client.delete(`/piggy-banks/${id}/events/${eventId}`);
    return { deleted: true, id: eventId };
}
export function registerPiggyBankTools(server, client) {
    defineTool(server, 'get_piggy_banks', {
        title: 'Get Piggy Banks',
        description: 'Get all piggy banks (savings goals) from Firefly III, including current saved amount and target amount.',
        inputSchema: {
            page: z.number().int().positive().optional().default(1).describe('Page number'),
            limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
        },
        annotations: READ_ANNOTATIONS,
    }, ({ page, limit }) => fetchPiggyBanks(client, { page: page, limit: limit }));
    defineTool(server, 'create_piggy_bank', {
        title: 'Create Piggy Bank',
        description: 'Create a new savings goal (piggy bank) in Firefly III. Requires an asset account ID to link to.',
        inputSchema: {
            name: z.string().describe('Piggy bank name'),
            account_id: z.string().describe('Asset account ID to link to — use get_accounts to find valid IDs'),
            target_amount: z.string().optional().describe('Savings goal amount as a number string'),
            start_date: dateSchema.optional().describe('Start date (YYYY-MM-DD)'),
            target_date: dateSchema.optional().describe('Target completion date (YYYY-MM-DD)'),
            notes: z.string().optional().describe('Notes'),
        },
        annotations: WRITE_ANNOTATIONS,
    }, (params) => createPiggyBank(client, params));
    defineTool(server, 'update_piggy_bank', {
        title: 'Update Piggy Bank',
        description: 'Update an existing piggy bank in Firefly III. Only fields provided will be changed. Use get_piggy_banks to find valid IDs.',
        inputSchema: {
            id: z.string().describe('Piggy bank ID — use get_piggy_banks to find valid IDs'),
            name: z.string().optional().describe('Piggy bank name'),
            account_id: z.string().optional().describe('Asset account ID to link to'),
            target_amount: z.string().optional().describe('Savings goal amount as a number string'),
            start_date: dateSchema.optional().describe('Start date (YYYY-MM-DD)'),
            target_date: dateSchema.optional().describe('Target completion date (YYYY-MM-DD)'),
            notes: z.string().optional().describe('Notes'),
        },
        annotations: UPDATE_ANNOTATIONS,
    }, ({ id, ...params }) => updatePiggyBank(client, id, params));
    defineTool(server, 'delete_piggy_bank', {
        title: 'Delete Piggy Bank',
        description: 'Permanently delete a piggy bank (savings goal) from Firefly III. **This action cannot be undone.** Use get_piggy_banks to confirm the ID before deleting.',
        inputSchema: { id: z.string().describe('Piggy bank ID — use get_piggy_banks to find valid IDs') },
        annotations: DELETE_ANNOTATIONS,
    }, ({ id }) => deletePiggyBank(client, id));
    defineTool(server, 'get_piggy_bank_events', {
        title: 'Get Piggy Bank Events',
        description: 'Get all deposit/withdrawal events for a specific piggy bank. Use get_piggy_banks to find valid IDs.',
        inputSchema: {
            id: z.string().describe('Piggy bank ID'),
            page: z.number().int().positive().optional().default(1).describe('Page number'),
            limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
        },
        annotations: READ_ANNOTATIONS,
    }, ({ id, page, limit }) => fetchPiggyBankEvents(client, id, { page: page, limit: limit }));
    defineTool(server, 'create_piggy_bank_event', {
        title: 'Create Piggy Bank Event',
        description: 'Add a deposit or withdrawal event to a piggy bank. Use a positive amount for a deposit and a negative amount for a withdrawal.',
        inputSchema: {
            id: z.string().describe('Piggy bank ID'),
            amount: z.string().describe('Amount as a number string. Positive for deposit, negative for withdrawal.'),
            date: z.string().describe('Event date (YYYY-MM-DD)'),
        },
        annotations: WRITE_ANNOTATIONS,
    }, ({ id, amount, date }) => createPiggyBankEvent(client, id, { amount: amount, date: date }));
    defineTool(server, 'delete_piggy_bank_event', {
        title: 'Delete Piggy Bank Event',
        description: 'Permanently delete a deposit/withdrawal event from a piggy bank. **This action cannot be undone.** Use get_piggy_bank_events to confirm the event ID.',
        inputSchema: {
            id: z.string().describe('Piggy bank ID'),
            event_id: z.string().describe('Event ID — use get_piggy_bank_events to find valid IDs'),
        },
        annotations: DELETE_ANNOTATIONS,
    }, ({ id, event_id }) => deletePiggyBankEvent(client, id, event_id));
}
//# sourceMappingURL=piggy-banks.js.map