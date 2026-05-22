import { z } from 'zod';
import { unwrapList, unwrapSingle } from '../transform.js';
import { READ_ANNOTATIONS, WRITE_ANNOTATIONS, UPDATE_ANNOTATIONS, DELETE_ANNOTATIONS } from './_annotations.js';
import { defineTool, dateSchema } from './_helpers.js';
export async function fetchCategories(client, params) {
    const response = await client.get('/categories', { page: params.page, limit: params.limit });
    return unwrapList(response);
}
export async function fetchCategoryTransactions(client, categoryId, params) {
    const query = { page: params.page, limit: params.limit };
    if (params.start)
        query['start'] = params.start;
    if (params.end)
        query['end'] = params.end;
    const response = await client.get(`/categories/${categoryId}/transactions`, query);
    return unwrapList(response);
}
export async function createCategory(client, params) {
    const response = await client.post('/categories', params);
    return unwrapSingle(response);
}
export async function updateCategory(client, id, params) {
    const response = await client.put(`/categories/${id}`, params);
    return unwrapSingle(response);
}
export async function deleteCategory(client, id) {
    await client.delete(`/categories/${id}`);
    return { deleted: true, id };
}
export function registerCategoryTools(server, client) {
    defineTool(server, 'get_categories', {
        title: 'Get Categories',
        description: 'Get all spending categories defined in Firefly III. Use get_category_transactions to list transactions for a specific category.',
        inputSchema: {
            page: z.number().int().positive().optional().default(1).describe('Page number'),
            limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
        },
        annotations: READ_ANNOTATIONS,
    }, ({ page, limit }) => fetchCategories(client, { page: page, limit: limit }));
    defineTool(server, 'get_category_transactions', {
        title: 'Get Category Transactions',
        description: 'Get all transactions belonging to a specific Firefly III category. Optionally filter by date range (YYYY-MM-DD). Use get_categories to find valid category IDs.',
        inputSchema: {
            categoryId: z.string().describe('Category ID — use get_categories to find valid IDs'),
            start: dateSchema.optional().describe('Start date (YYYY-MM-DD)'),
            end: dateSchema.optional().describe('End date (YYYY-MM-DD)'),
            page: z.number().int().positive().optional().default(1).describe('Page number'),
            limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
        },
        annotations: READ_ANNOTATIONS,
    }, ({ categoryId, start, end, page, limit }) => fetchCategoryTransactions(client, categoryId, { start: start, end: end, page: page, limit: limit }));
    defineTool(server, 'create_category', {
        title: 'Create Category',
        description: 'Create a new spending category in Firefly III.',
        inputSchema: {
            name: z.string().describe('Category name'),
            notes: z.string().optional().describe('Notes'),
        },
        annotations: WRITE_ANNOTATIONS,
    }, (params) => createCategory(client, params));
    defineTool(server, 'update_category', {
        title: 'Update Category',
        description: 'Update an existing category in Firefly III. Only fields provided will be changed. Use get_categories to find valid category IDs.',
        inputSchema: {
            id: z.string().describe('Category ID — use get_categories to find valid IDs'),
            name: z.string().optional().describe('Category name'),
            notes: z.string().optional().describe('Notes'),
        },
        annotations: UPDATE_ANNOTATIONS,
    }, ({ id, ...params }) => updateCategory(client, id, params));
    defineTool(server, 'delete_category', {
        title: 'Delete Category',
        description: 'Permanently delete a category from Firefly III. **This action cannot be undone.** Transactions in this category will become uncategorised. Use get_categories to confirm the ID.',
        inputSchema: { id: z.string().describe('Category ID — use get_categories to find valid IDs') },
        annotations: DELETE_ANNOTATIONS,
    }, ({ id }) => deleteCategory(client, id));
}
//# sourceMappingURL=categories.js.map