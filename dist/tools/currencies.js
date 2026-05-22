import { z } from 'zod';
import { unwrapList, unwrapSingle, } from '../transform.js';
import { READ_ANNOTATIONS, WRITE_ANNOTATIONS, UPDATE_ANNOTATIONS, DELETE_ANNOTATIONS } from './_annotations.js';
import { defineTool } from './_helpers.js';
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
export function registerCurrencyTools(server, client) {
    defineTool(server, 'get_currencies', {
        title: 'Get Currencies',
        description: 'Get all currencies configured in Firefly III.',
        inputSchema: {
            page: z.number().int().positive().optional().default(1).describe('Page number'),
            limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
        },
        annotations: READ_ANNOTATIONS,
    }, ({ page, limit }) => fetchCurrencies(client, { page: page, limit: limit }));
    defineTool(server, 'get_currency', {
        title: 'Get Currency',
        description: 'Get a single currency by its currency code (e.g. EUR, USD).',
        inputSchema: { code: z.string().describe('Currency code (e.g. EUR, USD)') },
        annotations: READ_ANNOTATIONS,
    }, ({ code }) => fetchCurrency(client, code));
    defineTool(server, 'create_currency', {
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
    }, (params) => createCurrency(client, params));
    defineTool(server, 'update_currency', {
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
    }, ({ code, ...params }) => updateCurrency(client, code, params));
    defineTool(server, 'delete_currency', {
        title: 'Delete Currency',
        description: 'Permanently delete a currency from Firefly III. **This action cannot be undone.** Use get_currencies to confirm the code before deleting.',
        inputSchema: { code: z.string().describe('Currency code to delete (e.g. EUR)') },
        annotations: DELETE_ANNOTATIONS,
    }, ({ code }) => deleteCurrency(client, code));
    defineTool(server, 'enable_currency', {
        title: 'Enable Currency',
        description: 'Enable a currency so it can be used in transactions.',
        inputSchema: { code: z.string().describe('Currency code (e.g. EUR)') },
        annotations: UPDATE_ANNOTATIONS,
    }, ({ code }) => enableCurrency(client, code));
    defineTool(server, 'disable_currency', {
        title: 'Disable Currency',
        description: 'Disable a currency so it no longer appears in transaction forms.',
        inputSchema: { code: z.string().describe('Currency code (e.g. EUR)') },
        annotations: UPDATE_ANNOTATIONS,
    }, ({ code }) => disableCurrency(client, code));
    defineTool(server, 'set_primary_currency', {
        title: 'Set Primary Currency',
        description: 'Set a currency as the primary/default currency for Firefly III.',
        inputSchema: { code: z.string().describe('Currency code to set as primary (e.g. EUR)') },
        annotations: UPDATE_ANNOTATIONS,
    }, ({ code }) => setPrimaryCurrency(client, code));
}
//# sourceMappingURL=currencies.js.map