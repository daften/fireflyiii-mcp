import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { type FireflyClient, formatError } from '../client.js';
import {
  unwrapList, unwrapSingle,
  type JsonApiListResponse, type JsonApiSingleResponse,
  type UnwrappedList, type UnwrappedSingle,
} from '../transform.js';

export async function fetchCurrencies(
  client: FireflyClient,
  params: { page?: number; limit?: number }
): Promise<UnwrappedList> {
  const response = await client.get<JsonApiListResponse>('/currencies', { page: params.page, limit: params.limit });
  return unwrapList(response);
}

export async function fetchCurrency(client: FireflyClient, code: string): Promise<UnwrappedSingle> {
  const response = await client.get<JsonApiSingleResponse>(`/currencies/${encodeURIComponent(code)}`);
  return unwrapSingle(response);
}

export async function createCurrency(
  client: FireflyClient,
  params: { name: string; code: string; symbol: string; decimal_places?: number; enabled?: boolean; default?: boolean }
): Promise<UnwrappedSingle> {
  const response = await client.post<JsonApiSingleResponse>('/currencies', params);
  return unwrapSingle(response);
}

export async function updateCurrency(
  client: FireflyClient,
  code: string,
  params: { name?: string; symbol?: string; decimal_places?: number; enabled?: boolean; default?: boolean }
): Promise<UnwrappedSingle> {
  const response = await client.put<JsonApiSingleResponse>(`/currencies/${encodeURIComponent(code)}`, params);
  return unwrapSingle(response);
}

export async function deleteCurrency(
  client: FireflyClient,
  code: string
): Promise<{ deleted: true; code: string }> {
  await client.delete(`/currencies/${encodeURIComponent(code)}`);
  return { deleted: true, code };
}

export async function enableCurrency(client: FireflyClient, code: string): Promise<UnwrappedSingle> {
  const response = await client.post<JsonApiSingleResponse>(`/currencies/${encodeURIComponent(code)}/enable`, {});
  return unwrapSingle(response);
}

export async function disableCurrency(client: FireflyClient, code: string): Promise<UnwrappedSingle> {
  const response = await client.post<JsonApiSingleResponse>(`/currencies/${encodeURIComponent(code)}/disable`, {});
  return unwrapSingle(response);
}

export async function setPrimaryCurrency(client: FireflyClient, code: string): Promise<UnwrappedSingle> {
  const response = await client.post<JsonApiSingleResponse>(`/currencies/${encodeURIComponent(code)}/primary`, {});
  return unwrapSingle(response);
}

const READ_ANNOTATIONS = { readOnlyHint: true, openWorldHint: true, idempotentHint: true } as const;
const WRITE_ANNOTATIONS = { openWorldHint: true } as const;
const UPDATE_ANNOTATIONS = { openWorldHint: true, idempotentHint: true } as const;
const DELETE_ANNOTATIONS = { destructiveHint: true, openWorldHint: true } as const;

export function registerCurrencyTools(server: McpServer, client: FireflyClient): void {
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
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
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
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
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
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
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
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
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
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
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
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
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
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
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
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  });
}
