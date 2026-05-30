import { completable } from '@modelcontextprotocol/sdk/server/completable.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { FireflyClient } from '../client.js';
import {
  type JsonApiListResponse,
  type JsonApiSingleResponse,
  type UnwrappedList,
  type UnwrappedSingle,
  unwrapList,
  unwrapSingle,
} from '../transform.js';
import type { QueryParams } from '../types.js';
import { DELETE_ANNOTATIONS, READ_ANNOTATIONS, UPDATE_ANNOTATIONS, WRITE_ANNOTATIONS } from './_annotations.js';
import {
  AUTOCOMPLETE_FETCH_LIMIT,
  AUTOCOMPLETE_MAX_SUGGESTIONS,
  createTtlCache,
  dateSchema,
  debugLog,
  defineTool,
  parseId,
} from './_helpers.js';

export async function fetchCategories(
  client: FireflyClient,
  params: { page?: number; limit?: number },
): Promise<UnwrappedList> {
  const response = await client.get<JsonApiListResponse>('/categories', { page: params.page, limit: params.limit });
  return unwrapList(response);
}

export async function fetchCategoryTransactions(
  client: FireflyClient,
  categoryId: string,
  params: { start?: string; end?: string; page?: number; limit?: number },
): Promise<UnwrappedList> {
  const query: QueryParams = { page: params.page, limit: params.limit };
  if (params.start) query.start = params.start;
  if (params.end) query.end = params.end;
  const response = await client.get<JsonApiListResponse>(`/categories/${categoryId}/transactions`, query);
  return unwrapList(response);
}

export async function createCategory(
  client: FireflyClient,
  params: { name: string; notes?: string },
): Promise<UnwrappedSingle> {
  const response = await client.post<JsonApiSingleResponse>('/categories', params);
  return unwrapSingle(response);
}

export async function updateCategory(
  client: FireflyClient,
  id: string,
  params: { name?: string; notes?: string },
): Promise<UnwrappedSingle> {
  const response = await client.put<JsonApiSingleResponse>(`/categories/${id}`, params);
  return unwrapSingle(response);
}

export async function deleteCategory(client: FireflyClient, id: string): Promise<{ deleted: true; id: string }> {
  await client.delete(`/categories/${id}`);
  return { deleted: true, id };
}

// Module-scoped so the cache survives across the stateless HTTP requests autocomplete fires;
// keyed per identity inside the completion handler so one user never sees another's categories.
const categoriesCache = createTtlCache<UnwrappedList>();

export function clearCategoriesCache(): void {
  categoriesCache.clear();
}

export function registerCategoryTools(server: McpServer, client: FireflyClient): void {
  defineTool(
    server,
    'get_categories',
    {
      title: 'Get Categories',
      description:
        'Get all spending categories defined in Firefly III. Use get_category_transactions to list transactions for a specific category.',
      inputSchema: {
        page: z.number().int().positive().optional().default(1).describe('Page number'),
        limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
      },
      annotations: READ_ANNOTATIONS,
    },
    ({ page, limit }) =>
      fetchCategories(client, { page: page as number | undefined, limit: limit as number | undefined }),
  );

  const categoryIdSchema = completable(
    z.string().describe('Category ID — use get_categories to find valid IDs'),
    async (value) => {
      debugLog(`[Autocomplete] Category search input: "${value}"`);
      try {
        const categories = await categoriesCache.get(client.cacheKey(), () =>
          fetchCategories(client, { limit: AUTOCOMPLETE_FETCH_LIMIT }),
        );
        const suggestions = categories.data
          .map((c) => `${c.id} (${c.name ?? ''})`)
          .filter((label) => label.toLowerCase().includes(value.toLowerCase()))
          .slice(0, AUTOCOMPLETE_MAX_SUGGESTIONS);
        debugLog(`[Autocomplete] Category suggestions found: ${suggestions.length}`);
        return suggestions;
      } catch (err) {
        debugLog('[Autocomplete Error - Category]:', err);
        return [];
      }
    },
  );

  defineTool(
    server,
    'get_category_transactions',
    {
      title: 'Get Category Transactions',
      description:
        'Get all transactions belonging to a specific Firefly III category. Optionally filter by date range (YYYY-MM-DD). Use get_categories to find valid category IDs.',
      inputSchema: {
        categoryId: categoryIdSchema,
        start: dateSchema.optional().describe('Start date (YYYY-MM-DD)'),
        end: dateSchema.optional().describe('End date (YYYY-MM-DD)'),
        page: z.number().int().positive().optional().default(1).describe('Page number'),
        limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
      },
      annotations: READ_ANNOTATIONS,
    },
    ({ categoryId, start, end, page, limit }) =>
      fetchCategoryTransactions(client, parseId(categoryId as string), {
        start: start as string | undefined,
        end: end as string | undefined,
        page: page as number | undefined,
        limit: limit as number | undefined,
      }),
  );

  defineTool(
    server,
    'create_category',
    {
      title: 'Create Category',
      description: 'Create a new spending category in Firefly III.',
      inputSchema: {
        name: z.string().describe('Category name'),
        notes: z.string().optional().describe('Notes'),
      },
      annotations: WRITE_ANNOTATIONS,
    },
    (params) => createCategory(client, params as { name: string; notes?: string }),
  );

  defineTool(
    server,
    'update_category',
    {
      title: 'Update Category',
      description:
        'Update an existing category in Firefly III. Only fields provided will be changed. Use get_categories to find valid category IDs.',
      inputSchema: {
        id: categoryIdSchema,
        name: z.string().optional().describe('Category name'),
        notes: z.string().optional().describe('Notes'),
      },
      annotations: UPDATE_ANNOTATIONS,
    },
    ({ id, ...params }) => updateCategory(client, parseId(id as string), params as { name?: string; notes?: string }),
  );

  defineTool(
    server,
    'delete_category',
    {
      title: 'Delete Category',
      description:
        'Permanently delete a category from Firefly III. **This action cannot be undone.** Transactions in this category will become uncategorised. Use get_categories to confirm the ID.',
      inputSchema: { id: categoryIdSchema },
      annotations: DELETE_ANNOTATIONS,
    },
    ({ id }) => deleteCategory(client, parseId(id as string)),
  );

  server.registerPrompt(
    'category-transactions',
    {
      title: 'Get Transactions by Category',
      description: 'Get transactions for a specific category with autocomplete.',
      argsSchema: {
        category: categoryIdSchema,
      },
    },
    async ({ category }) => {
      const id = parseId(category as string);
      return {
        description: `Get transactions for category ID ${id}`,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Show me the recent transactions for category ID "${id}".`,
            },
          },
        ],
      };
    },
  );
}
