import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { FireflyClient } from '../client.js';
import type { QueryParams } from '../types.js';
import { unwrapList, unwrapSingle, type JsonApiListResponse, type JsonApiSingleResponse, type UnwrappedList, type UnwrappedSingle } from '../transform.js';
import { READ_ANNOTATIONS, WRITE_ANNOTATIONS, UPDATE_ANNOTATIONS, DELETE_ANNOTATIONS } from './_annotations.js';
import { defineTool, dateSchema } from './_helpers.js';

export async function fetchTransactions(
  client: FireflyClient,
  params: {
    type?: string;
    accountId?: string;
    start?: string;
    end?: string;
    page?: number;
    limit?: number;
  }
): Promise<UnwrappedList> {
  const query: QueryParams = { page: params.page, limit: params.limit };
  if (params.type) query['type'] = params.type;
  if (params.accountId) query['account_id'] = params.accountId;
  if (params.start) query['start'] = params.start;
  if (params.end) query['end'] = params.end;
  const response = await client.get<JsonApiListResponse>('/transactions', query);
  return unwrapList(response);
}

export async function fetchTransaction(client: FireflyClient, id: string): Promise<UnwrappedSingle> {
  const response = await client.get<JsonApiSingleResponse>(`/transactions/${id}`);
  return unwrapSingle(response);
}

export async function createTransaction(
  client: FireflyClient,
  params: {
    type: 'withdrawal' | 'deposit' | 'transfer';
    date: string;
    amount: string;
    description: string;
    source_id?: string;
    destination_id?: string;
    category_name?: string;
    budget_id?: string;
    currency_code?: string;
    notes?: string;
    tags?: string[];
  }
): Promise<UnwrappedSingle> {
  const split: Record<string, unknown> = {
    type: params.type,
    date: params.date,
    amount: params.amount,
    description: params.description,
  };
  if (params.source_id !== undefined) split.source_id = params.source_id;
  if (params.destination_id !== undefined) split.destination_id = params.destination_id;
  if (params.category_name !== undefined) split.category_name = params.category_name;
  if (params.budget_id !== undefined) split.budget_id = params.budget_id;
  if (params.currency_code !== undefined) split.currency_code = params.currency_code;
  if (params.notes !== undefined) split.notes = params.notes;
  if (params.tags !== undefined) split.tags = params.tags;
  const response = await client.post<JsonApiSingleResponse>('/transactions', {
    apply_rules: true,
    fire_webhooks: true,
    transactions: [split],
  });
  return unwrapSingle(response);
}

export async function updateTransaction(
  client: FireflyClient,
  id: string,
  params: {
    type?: 'withdrawal' | 'deposit' | 'transfer';
    date?: string;
    amount?: string;
    description?: string;
    source_id?: string;
    destination_id?: string;
    category_name?: string;
    budget_id?: string;
    currency_code?: string;
    notes?: string;
    tags?: string[];
  }
): Promise<UnwrappedSingle> {
  const split: Record<string, unknown> = {};
  if (params.type !== undefined) split.type = params.type;
  if (params.date !== undefined) split.date = params.date;
  if (params.amount !== undefined) split.amount = params.amount;
  if (params.description !== undefined) split.description = params.description;
  if (params.source_id !== undefined) split.source_id = params.source_id;
  if (params.destination_id !== undefined) split.destination_id = params.destination_id;
  if (params.category_name !== undefined) split.category_name = params.category_name;
  if (params.budget_id !== undefined) split.budget_id = params.budget_id;
  if (params.currency_code !== undefined) split.currency_code = params.currency_code;
  if (params.notes !== undefined) split.notes = params.notes;
  if (params.tags !== undefined) split.tags = params.tags;
  const response = await client.put<JsonApiSingleResponse>(`/transactions/${id}`, {
    apply_rules: true,
    fire_webhooks: true,
    transactions: [split],
  });
  return unwrapSingle(response);
}

export async function deleteTransaction(
  client: FireflyClient,
  id: string
): Promise<{ deleted: true; id: string }> {
  await client.delete(`/transactions/${id}`);
  return { deleted: true, id };
}

export async function searchTransactions(
  client: FireflyClient,
  params: { query: string; page?: number; limit?: number }
): Promise<UnwrappedList> {
  const query: QueryParams = { query: params.query, page: params.page, limit: params.limit };
  const response = await client.get<JsonApiListResponse>('/search/transactions', query);
  return unwrapList(response);
}

export async function bulkUpdateTransactions(
  client: FireflyClient,
  params: { query: string; category_name?: string; budget_id?: string; tags?: string[]; notes?: string }
): Promise<unknown> {
  const update: Record<string, unknown> = {};
  if (params.category_name !== undefined) update['category_name'] = params.category_name;
  if (params.budget_id !== undefined) update['budget_id'] = params.budget_id;
  if (params.tags !== undefined) update['tags'] = params.tags;
  if (params.notes !== undefined) update['notes'] = params.notes;
  return client.post('/data/bulk/transactions', undefined, {
    query: JSON.stringify({ where: params.query, update }),
  });
}

export async function createSplitTransaction(
  client: FireflyClient,
  params: {
    type: 'withdrawal' | 'deposit' | 'transfer';
    date: string;
    source_id?: string;
    destination_id?: string;
    currency_code?: string;
    group_title?: string;
    splits: Array<{
      amount: string;
      description: string;
      category_name?: string;
      budget_id?: string;
      tags?: string[];
      notes?: string;
    }>;
  }
): Promise<UnwrappedSingle> {
  const transactions = params.splits.map(split => {
    const item: Record<string, unknown> = {
      type: params.type,
      date: params.date,
      amount: split.amount,
      description: split.description,
    };
    if (params.source_id !== undefined) item.source_id = params.source_id;
    if (params.destination_id !== undefined) item.destination_id = params.destination_id;
    if (params.currency_code !== undefined) item.currency_code = params.currency_code;
    if (split.category_name !== undefined) item.category_name = split.category_name;
    if (split.budget_id !== undefined) item.budget_id = split.budget_id;
    if (split.tags !== undefined) item.tags = split.tags;
    if (split.notes !== undefined) item.notes = split.notes;
    return item;
  });
  const body: Record<string, unknown> = { apply_rules: true, fire_webhooks: true, transactions };
  if (params.group_title !== undefined) body.group_title = params.group_title;
  const response = await client.post<JsonApiSingleResponse>('/transactions', body);
  return unwrapSingle(response);
}

export function registerTransactionTools(server: McpServer, client: FireflyClient): void {
  defineTool(server, 'get_transactions', {
    title: 'Get Transactions',
    description: 'Get transactions from Firefly III. Filter by type (withdrawal/deposit/transfer/reconciliation), account ID, or date range. Dates must be YYYY-MM-DD. Use get_transaction to fetch a single transaction by ID.',
    inputSchema: {
      type: z
        .enum(['withdrawal', 'deposit', 'transfer', 'reconciliation'])
        .optional()
        .describe('Transaction type filter'),
      accountId: z.string().optional().describe('Filter by account ID — use get_accounts to find valid IDs'),
      start: dateSchema.optional().describe('Start date (YYYY-MM-DD)'),
      end: dateSchema.optional().describe('End date (YYYY-MM-DD)'),
      page: z.number().int().positive().optional().default(1).describe('Page number'),
      limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
    },
    annotations: READ_ANNOTATIONS,
  }, ({ type, accountId, start, end, page, limit }) =>
    fetchTransactions(client, {
      type: type as string | undefined,
      accountId: accountId as string | undefined,
      start: start as string | undefined,
      end: end as string | undefined,
      page: page as number | undefined,
      limit: limit as number | undefined,
    }));

  defineTool(server, 'get_transaction', {
    title: 'Get Transaction',
    description: 'Get a single Firefly III transaction by its numeric ID, including all splits. Use get_transactions to find valid transaction IDs.',
    inputSchema: {
      id: z.string().describe('Transaction ID'),
    },
    annotations: READ_ANNOTATIONS,
  }, ({ id }) => fetchTransaction(client, id as string));

  defineTool(server, 'create_transaction', {
    title: 'Create Transaction',
    description: 'Create a new transaction in Firefly III. Use get_accounts to find source and destination account IDs.',
    inputSchema: {
      type: z.enum(['withdrawal', 'deposit', 'transfer']).describe('Transaction type'),
      date: dateSchema.describe('Transaction date (YYYY-MM-DD)'),
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
  }, (params) => createTransaction(client, params as Parameters<typeof createTransaction>[1]));

  defineTool(server, 'update_transaction', {
    title: 'Update Transaction',
    description: 'Update an existing transaction in Firefly III. Only fields provided will be changed. Use get_transaction to confirm the ID before updating.',
    inputSchema: {
      id: z.string().describe('Transaction ID — use get_transactions to find valid IDs'),
      type: z.enum(['withdrawal', 'deposit', 'transfer']).optional().describe('Transaction type'),
      date: dateSchema.optional().describe('Transaction date (YYYY-MM-DD)'),
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
  }, ({ id, ...params }) => updateTransaction(client, id as string, params as Parameters<typeof updateTransaction>[2]));

  defineTool(server, 'delete_transaction', {
    title: 'Delete Transaction',
    description: 'Permanently delete a transaction from Firefly III. **This action cannot be undone.** Use get_transaction to confirm the transaction before deleting.',
    inputSchema: {
      id: z.string().describe('Transaction ID — use get_transactions to find valid IDs'),
    },
    annotations: DELETE_ANNOTATIONS,
  }, ({ id }) => deleteTransaction(client, id as string));

  defineTool(server, 'search_transactions', {
    title: 'Search Transactions',
    description: 'Search for transactions in Firefly III by keyword. Searches across descriptions, notes, and other fields.',
    inputSchema: {
      query: z.string().describe('Search query'),
      page: z.number().int().positive().optional().default(1).describe('Page number'),
      limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
    },
    annotations: READ_ANNOTATIONS,
  }, ({ query, page, limit }) =>
    searchTransactions(client, {
      query: query as string,
      page: page as number | undefined,
      limit: limit as number | undefined,
    }));

  defineTool(server, 'create_split_transaction', {
    title: 'Create Split Transaction',
    description: 'Create a split transaction in Firefly III — one receipt divided across multiple categories, budgets, or descriptions. All splits share the same type, date, and accounts. Use get_accounts to find source and destination account IDs.',
    inputSchema: {
      type: z.enum(['withdrawal', 'deposit', 'transfer']).describe('Transaction type (shared across all splits)'),
      date: dateSchema.describe('Transaction date (YYYY-MM-DD, shared across all splits)'),
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
  }, (params) => createSplitTransaction(client, params as Parameters<typeof createSplitTransaction>[1]));

  defineTool(server, 'bulk_update_transactions', {
    title: 'Bulk Update Transactions',
    description: 'Update multiple transactions at once using a search query (same syntax as search_transactions). All matching transactions will have the specified fields updated.',
    inputSchema: {
      query: z.string().describe('Search query to select transactions (same syntax as search_transactions)'),
      category_name: z.string().optional().describe('Set category for all matched transactions'),
      budget_id: z.string().optional().describe('Set budget for all matched transactions'),
      tags: z.array(z.string()).optional().describe('Replace tags on all matched transactions'),
      notes: z.string().optional().describe('Set notes on all matched transactions'),
    },
    annotations: WRITE_ANNOTATIONS,
  }, (params) => bulkUpdateTransactions(client, params as Parameters<typeof bulkUpdateTransactions>[1]));
}
