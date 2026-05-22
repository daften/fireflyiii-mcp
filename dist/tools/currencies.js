import { z } from 'zod';
import { formatError } from '../client.js';
import { unwrapList, unwrapSingle, } from '../transform.js';
export async function fetchCurrencies(client, params) {
    const response = await client.get('/currencies', { page: params.page, limit: params.limit });
    return unwrapList(response);
}
export async function fetchCurrency(client, code) {
    const response = await client.get(`/currencies/${encodeURIComponent(code)}`);
    return unwrapSingle(response);
}
export async function createCurrency(client, params) {
    const response = await client.post('/currencies', params);
    return unwrapSingle(response);
}
export async function updateCurrency(client, code, params) {
    const response = await client.put(`/currencies/${encodeURIComponent(code)}`, params);
    return unwrapSingle(response);
}
export async function deleteCurrency(client, code) {
    await client.delete(`/currencies/${encodeURIComponent(code)}`);
    return { deleted: true, code };
}
export async function enableCurrency(client, code) {
    const response = await client.post(`/currencies/${encodeURIComponent(code)}/enable`, {});
    return unwrapSingle(response);
}
export async function disableCurrency(client, code) {
    const response = await client.post(`/currencies/${encodeURIComponent(code)}/disable`, {});
    return unwrapSingle(response);
}
export async function setPrimaryCurrency(client, code) {
    const response = await client.post(`/currencies/${encodeURIComponent(code)}/primary`, {});
    return unwrapSingle(response);
}
const READ_ANNOTATIONS = { readOnlyHint: true, openWorldHint: true, idempotentHint: true };
const WRITE_ANNOTATIONS = { openWorldHint: true };
const UPDATE_ANNOTATIONS = { openWorldHint: true, idempotentHint: true };
const DELETE_ANNOTATIONS = { destructiveHint: true, openWorldHint: true };
export function registerCurrencyTools(server, client) {
    server.registerTool('get_currencies', {
        title: 'Get Currencies',
        description: 'Get all currencies configured in Firefly III.',
        inputSchema: {
            page: z.number().int().positive().optional().default(1).describe('Page number'),
            limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
        },
        annotations: READ_ANNOTATIONS,
    }, async ({ page, limit }) => {
        try {
            const result = await fetchCurrencies(client, { page, limit });
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        catch (err) {
            return { content: [{ type: 'text', text: formatError(err) }], isError: true };
        }
    });
    server.registerTool('get_currency', {
        title: 'Get Currency',
        description: 'Get a single currency by its currency code (e.g. EUR, USD).',
        inputSchema: { code: z.string().describe('Currency code (e.g. EUR, USD)') },
        annotations: READ_ANNOTATIONS,
    }, async ({ code }) => {
        try {
            const result = await fetchCurrency(client, code);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        catch (err) {
            return { content: [{ type: 'text', text: formatError(err) }], isError: true };
        }
    });
    server.registerTool('create_currency', {
        title: 'Create Currency',
        description: 'Create a new currency in Firefly III.',
        inputSchema: {
            name: z.string().describe('Currency name (e.g. Euro)'),
            code: z.string().describe('Currency code (e.g. EUR)'),
            symbol: z.string().describe('Currency symbol (e.g. €)'),
            decimal_places: z.number().int().min(0).max(10).optional().describe('Number of decimal places (default 2)'),
            enabled: z.boolean().optional().describe('Whether the currency is enabled'),
            default: z.boolean().optional().describe('Whether this is the default currency'),
        },
        annotations: WRITE_ANNOTATIONS,
    }, async (params) => {
        try {
            const result = await createCurrency(client, params);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        catch (err) {
            return { content: [{ type: 'text', text: formatError(err) }], isError: true };
        }
    });
    server.registerTool('update_currency', {
        title: 'Update Currency',
        description: 'Update an existing currency. Only fields provided will be changed. Use get_currencies to find valid currency codes.',
        inputSchema: {
            code: z.string().describe('Currency code to update (e.g. EUR)'),
            name: z.string().optional().describe('Currency name'),
            symbol: z.string().optional().describe('Currency symbol'),
            decimal_places: z.number().int().min(0).max(10).optional().describe('Number of decimal places'),
            enabled: z.boolean().optional().describe('Whether the currency is enabled'),
            default: z.boolean().optional().describe('Whether this is the default currency'),
        },
        annotations: UPDATE_ANNOTATIONS,
    }, async ({ code, ...params }) => {
        try {
            const result = await updateCurrency(client, code, params);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        catch (err) {
            return { content: [{ type: 'text', text: formatError(err) }], isError: true };
        }
    });
    server.registerTool('delete_currency', {
        title: 'Delete Currency',
        description: 'Permanently delete a currency from Firefly III. **This action cannot be undone.** Use get_currencies to confirm the code before deleting.',
        inputSchema: { code: z.string().describe('Currency code to delete (e.g. EUR)') },
        annotations: DELETE_ANNOTATIONS,
    }, async ({ code }) => {
        try {
            const result = await deleteCurrency(client, code);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        catch (err) {
            return { content: [{ type: 'text', text: formatError(err) }], isError: true };
        }
    });
    server.registerTool('enable_currency', {
        title: 'Enable Currency',
        description: 'Enable a currency so it can be used in transactions.',
        inputSchema: { code: z.string().describe('Currency code (e.g. EUR)') },
        annotations: UPDATE_ANNOTATIONS,
    }, async ({ code }) => {
        try {
            const result = await enableCurrency(client, code);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        catch (err) {
            return { content: [{ type: 'text', text: formatError(err) }], isError: true };
        }
    });
    server.registerTool('disable_currency', {
        title: 'Disable Currency',
        description: 'Disable a currency so it no longer appears in transaction forms.',
        inputSchema: { code: z.string().describe('Currency code (e.g. EUR)') },
        annotations: UPDATE_ANNOTATIONS,
    }, async ({ code }) => {
        try {
            const result = await disableCurrency(client, code);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        catch (err) {
            return { content: [{ type: 'text', text: formatError(err) }], isError: true };
        }
    });
    server.registerTool('set_primary_currency', {
        title: 'Set Primary Currency',
        description: 'Set a currency as the primary/default currency for Firefly III.',
        inputSchema: { code: z.string().describe('Currency code to set as primary (e.g. EUR)') },
        annotations: UPDATE_ANNOTATIONS,
    }, async ({ code }) => {
        try {
            const result = await setPrimaryCurrency(client, code);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        catch (err) {
            return { content: [{ type: 'text', text: formatError(err) }], isError: true };
        }
    });
}
//# sourceMappingURL=currencies.js.map