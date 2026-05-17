import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { type FireflyClient, formatError } from '../client.js';
import type { QueryParams } from '../types.js';
import { unwrapList, unwrapSingle, type JsonApiListResponse, type JsonApiSingleResponse, type UnwrappedList, type UnwrappedSingle } from '../transform.js';

export async function fetchCategories(
  client: FireflyClient,
  params: { page?: number; limit?: number }
): Promise<UnwrappedList> {
  const response = await client.get<JsonApiListResponse>('/categories', { page: params.page, limit: params.limit });
  return unwrapList(response);
}

export async function fetchCategoryTransactions(
  client: FireflyClient,
  categoryId: string,
  params: { start?: string; end?: string; page?: number; limit?: number }
): Promise<UnwrappedList> {
  const query: QueryParams = { page: params.page, limit: params.limit };
  if (params.start) query['start'] = params.start;
  if (params.end) query['end'] = params.end;
  const response = await client.get<JsonApiListResponse>(`/categories/${categoryId}/transactions`, query);
  return unwrapList(response);
}

export async function createCategory(
  client: FireflyClient,
  params: { name: string; notes?: string }
): Promise<UnwrappedSingle> {
  const response = await client.post<JsonApiSingleResponse>('/categories', params);
  return unwrapSingle(response);
}

export async function updateCategory(
  client: FireflyClient,
  id: string,
  params: { name?: string; notes?: string }
): Promise<UnwrappedSingle> {
  const response = await client.put<JsonApiSingleResponse>(`/categories/${id}`, params);
  return unwrapSingle(response);
}

export async function deleteCategory(
  client: FireflyClient,
  id: string
): Promise<{ deleted: true; id: string }> {
  await client.delete(`/categories/${id}`);
  return { deleted: true, id };
}

const READ_ANNOTATIONS = {
  readOnlyHint: true,
  openWorldHint: true,
  idempotentHint: true,
} as const;

const WRITE_ANNOTATIONS = { openWorldHint: true } as const;
const UPDATE_ANNOTATIONS = { openWorldHint: true, idempotentHint: true } as const;
const DELETE_ANNOTATIONS = { destructiveHint: true, openWorldHint: true } as const;

export function registerCategoryTools(server: McpServer, client: FireflyClient): void {
  server.registerTool(
    'get_categories',
    {
      title: 'Get Categories',
      description: 'Get all spending categories defined in Firefly III. Use get_category_transactions to list transactions for a specific category.',
      inputSchema: {
        page: z.number().int().positive().optional().default(1).describe('Page number'),
        limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
      },
      annotations: READ_ANNOTATIONS,
    },
    async ({ page, limit }) => {
      try {
        const result = await fetchCategories(client, { page, limit });
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );

  server.registerTool(
    'get_category_transactions',
    {
      title: 'Get Category Transactions',
      description: 'Get all transactions belonging to a specific Firefly III category. Optionally filter by date range (YYYY-MM-DD). Use get_categories to find valid category IDs.',
      inputSchema: {
        categoryId: z.string().describe('Category ID — use get_categories to find valid IDs'),
        start: z.string().optional().describe('Start date (YYYY-MM-DD)'),
        end: z.string().optional().describe('End date (YYYY-MM-DD)'),
        page: z.number().int().positive().optional().default(1).describe('Page number'),
        limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
      },
      annotations: READ_ANNOTATIONS,
    },
    async ({ categoryId, start, end, page, limit }) => {
      try {
        const result = await fetchCategoryTransactions(client, categoryId, { start, end, page, limit });
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );

  server.registerTool('create_category', {
    title: 'Create Category',
    description: 'Create a new spending category in Firefly III.',
    inputSchema: {
      name: z.string().describe('Category name'),
      notes: z.string().optional().describe('Notes'),
    },
    annotations: WRITE_ANNOTATIONS,
  }, async (params) => {
    try {
      const result = await createCategory(client, params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  });

  server.registerTool('update_category', {
    title: 'Update Category',
    description: 'Update an existing category in Firefly III. Only fields provided will be changed. Use get_categories to find valid category IDs.',
    inputSchema: {
      id: z.string().describe('Category ID — use get_categories to find valid IDs'),
      name: z.string().optional().describe('Category name'),
      notes: z.string().optional().describe('Notes'),
    },
    annotations: UPDATE_ANNOTATIONS,
  }, async ({ id, ...params }) => {
    try {
      const result = await updateCategory(client, id, params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  });

  server.registerTool('delete_category', {
    title: 'Delete Category',
    description: 'Permanently delete a category from Firefly III. **This action cannot be undone.** Transactions in this category will become uncategorised. Use get_categories to confirm the ID.',
    inputSchema: { id: z.string().describe('Category ID — use get_categories to find valid IDs') },
    annotations: DELETE_ANNOTATIONS,
  }, async ({ id }) => {
    try {
      const result = await deleteCategory(client, id);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  });
}
