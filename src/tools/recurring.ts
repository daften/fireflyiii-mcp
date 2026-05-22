import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { FireflyClient } from '../client.js';
import type { QueryParams } from '../types.js';
import { unwrapList, unwrapSingle, type JsonApiListResponse, type JsonApiSingleResponse, type UnwrappedList, type UnwrappedSingle } from '../transform.js';
import { READ_ANNOTATIONS, WRITE_ANNOTATIONS, UPDATE_ANNOTATIONS, DELETE_ANNOTATIONS } from './_annotations.js';
import { defineTool, dateSchema } from './_helpers.js';

export async function fetchRecurrences(
  client: FireflyClient,
  params: { page?: number; limit?: number }
): Promise<UnwrappedList> {
  const query: QueryParams = { page: params.page, limit: params.limit };
  const response = await client.get<JsonApiListResponse>('/recurrences', query);
  return unwrapList(response);
}

export async function fetchRecurrence(client: FireflyClient, id: string): Promise<UnwrappedSingle> {
  const response = await client.get<JsonApiSingleResponse>(`/recurrences/${id}`);
  return unwrapSingle(response);
}

export async function createRecurrence(
  client: FireflyClient,
  params: {
    type: 'withdrawal' | 'deposit' | 'transfer';
    title: string;
    description?: string;
    notes?: string;
    first_date: string;
    repeat_until?: string | null;
    nr_of_repetitions?: number;
    apply_rules?: boolean;
    active?: boolean;
    repeat_type: 'daily' | 'weekly' | 'monthly' | 'ndom' | 'yearly';
    repeat_moment: string;
    skip?: number;
    weekend?: number;
    amount: string;
    transaction_description: string;
    source_id: string;
    destination_id: string;
    category_id?: string;
    budget_id?: string;
    currency_code?: string;
    tags?: string[];
    transaction_notes?: string;
  }
): Promise<UnwrappedSingle> {
  const repetition: Record<string, unknown> = { type: params.repeat_type, moment: params.repeat_moment };
  if (params.skip !== undefined) repetition.skip = params.skip;
  if (params.weekend !== undefined) repetition.weekend = params.weekend;

  const transaction: Record<string, unknown> = {
    description: params.transaction_description,
    amount: params.amount,
    source_id: params.source_id,
    destination_id: params.destination_id,
  };
  if (params.category_id !== undefined) transaction.category_id = params.category_id;
  if (params.budget_id !== undefined) transaction.budget_id = params.budget_id;
  if (params.currency_code !== undefined) transaction.currency_code = params.currency_code;
  if (params.tags !== undefined) transaction.tags = params.tags;
  if (params.transaction_notes !== undefined) transaction.notes = params.transaction_notes;

  const body: Record<string, unknown> = {
    type: params.type,
    title: params.title,
    first_date: params.first_date,
    repeat_until: params.repeat_until ?? null,
    apply_rules: params.apply_rules ?? true,
    active: params.active ?? true,
    repetitions: [repetition],
    transactions: [transaction],
  };
  if (params.description !== undefined) body.description = params.description;
  if (params.notes !== undefined) body.notes = params.notes;
  if (params.nr_of_repetitions !== undefined) body.nr_of_repetitions = params.nr_of_repetitions;

  const response = await client.post<JsonApiSingleResponse>('/recurrences', body);
  return unwrapSingle(response);
}

export async function updateRecurrence(
  client: FireflyClient,
  id: string,
  params: {
    type?: 'withdrawal' | 'deposit' | 'transfer';
    title?: string;
    description?: string;
    notes?: string;
    first_date?: string;
    repeat_until?: string | null;
    nr_of_repetitions?: number;
    apply_rules?: boolean;
    active?: boolean;
    repeat_type?: 'daily' | 'weekly' | 'monthly' | 'ndom' | 'yearly';
    repeat_moment?: string;
    skip?: number;
    weekend?: number;
    amount?: string;
    transaction_description?: string;
    source_id?: string;
    destination_id?: string;
    category_id?: string;
    budget_id?: string;
    currency_code?: string;
    tags?: string[];
    transaction_notes?: string;
  }
): Promise<UnwrappedSingle> {
  const body: Record<string, unknown> = {};
  if (params.type !== undefined) body.type = params.type;
  if (params.title !== undefined) body.title = params.title;
  if (params.description !== undefined) body.description = params.description;
  if (params.notes !== undefined) body.notes = params.notes;
  if (params.first_date !== undefined) body.first_date = params.first_date;
  if (params.repeat_until !== undefined) body.repeat_until = params.repeat_until;
  if (params.nr_of_repetitions !== undefined) body.nr_of_repetitions = params.nr_of_repetitions;
  if (params.apply_rules !== undefined) body.apply_rules = params.apply_rules;
  if (params.active !== undefined) body.active = params.active;

  const hasRepetitionFields = params.repeat_type !== undefined || params.repeat_moment !== undefined
    || params.skip !== undefined || params.weekend !== undefined;
  if (hasRepetitionFields) {
    const repetition: Record<string, unknown> = {};
    if (params.repeat_type !== undefined) repetition.type = params.repeat_type;
    if (params.repeat_moment !== undefined) repetition.moment = params.repeat_moment;
    if (params.skip !== undefined) repetition.skip = params.skip;
    if (params.weekend !== undefined) repetition.weekend = params.weekend;
    body.repetitions = [repetition];
  }

  const hasTransactionFields = params.amount !== undefined || params.transaction_description !== undefined
    || params.source_id !== undefined || params.destination_id !== undefined
    || params.category_id !== undefined || params.budget_id !== undefined
    || params.currency_code !== undefined || params.tags !== undefined
    || params.transaction_notes !== undefined;
  if (hasTransactionFields) {
    const transaction: Record<string, unknown> = {};
    if (params.amount !== undefined) transaction.amount = params.amount;
    if (params.transaction_description !== undefined) transaction.description = params.transaction_description;
    if (params.source_id !== undefined) transaction.source_id = params.source_id;
    if (params.destination_id !== undefined) transaction.destination_id = params.destination_id;
    if (params.category_id !== undefined) transaction.category_id = params.category_id;
    if (params.budget_id !== undefined) transaction.budget_id = params.budget_id;
    if (params.currency_code !== undefined) transaction.currency_code = params.currency_code;
    if (params.tags !== undefined) transaction.tags = params.tags;
    if (params.transaction_notes !== undefined) transaction.notes = params.transaction_notes;
    body.transactions = [transaction];
  }

  const response = await client.put<JsonApiSingleResponse>(`/recurrences/${id}`, body);
  return unwrapSingle(response);
}

export async function deleteRecurrence(
  client: FireflyClient,
  id: string
): Promise<{ deleted: true; id: string }> {
  await client.delete(`/recurrences/${id}`);
  return { deleted: true, id };
}

export async function fetchRecurrenceTransactions(
  client: FireflyClient,
  id: string,
  params: { page?: number; limit?: number }
): Promise<UnwrappedList> {
  const query: QueryParams = { page: params.page, limit: params.limit };
  const response = await client.get<JsonApiListResponse>(`/recurrences/${id}/transactions`, query);
  return unwrapList(response);
}

export async function triggerRecurrence(
  client: FireflyClient,
  id: string,
  date?: string
): Promise<{ triggered: true; id: string }> {
  const query: QueryParams = {};
  if (date) query['date'] = date;
  await client.post(`/recurrences/${id}/trigger`, {}, query);
  return { triggered: true, id };
}

export function registerRecurringTools(server: McpServer, client: FireflyClient): void {
  defineTool(server, 'get_recurring', {
    title: 'Get Recurring Transactions',
    description: 'Get all recurring transactions from Firefly III.',
    inputSchema: {
      page: z.number().int().positive().optional().default(1).describe('Page number'),
      limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
    },
    annotations: READ_ANNOTATIONS,
  }, ({ page, limit }) => fetchRecurrences(client, { page: page as number | undefined, limit: limit as number | undefined }));

  defineTool(server, 'get_recurrence', {
    title: 'Get Recurring Transaction',
    description: 'Get a single recurring transaction by its numeric ID. Use get_recurring to find valid IDs.',
    inputSchema: {
      id: z.string().describe('Recurrence ID'),
    },
    annotations: READ_ANNOTATIONS,
  }, ({ id }) => fetchRecurrence(client, id as string));

  defineTool(server, 'create_recurring', {
    title: 'Create Recurring Transaction',
    description: 'Create a new recurring transaction in Firefly III. Use get_accounts to find source and destination account IDs. Use get_categories to find category IDs.',
    inputSchema: {
      type: z.enum(['withdrawal', 'deposit', 'transfer']).describe('Transaction type for all generated transactions'),
      title: z.string().describe('Name of the recurring transaction'),
      description: z.string().optional().describe('Description of the recurrence (not the individual transactions)'),
      notes: z.string().optional().describe('Notes'),
      first_date: dateSchema.describe('First recurrence date (YYYY-MM-DD)'),
      repeat_until: dateSchema.optional().nullable().describe('Stop after this date (YYYY-MM-DD). Omit or pass null for no end date.'),
      nr_of_repetitions: z.number().int().positive().optional().describe('Stop after N occurrences. Do not combine with repeat_until.'),
      apply_rules: z.boolean().optional().default(true).describe('Apply rules to generated transactions'),
      active: z.boolean().optional().default(true).describe('Whether the recurrence is active'),
      repeat_type: z.enum(['daily', 'weekly', 'monthly', 'ndom', 'yearly']).describe('Repetition frequency'),
      repeat_moment: z.string().describe('Repetition moment: empty string for daily; 1–7 (Mon–Sun) for weekly; 1–31 for monthly; "week,day" e.g. "2,3" for ndom (2nd Wednesday); YYYY-MM-DD for yearly (year value ignored)'),
      skip: z.number().int().min(0).optional().describe('Skip every N occurrences (0 = none, 1 = every other)'),
      weekend: z.number().int().min(1).max(4).optional().describe('Weekend handling: 1=do nothing, 2=skip (no transaction), 3=previous Friday, 4=next Monday'),
      amount: z.string().describe('Transaction amount as a positive number string, e.g. "950.00"'),
      transaction_description: z.string().describe('Description of each generated transaction'),
      source_id: z.string().describe('Source account ID'),
      destination_id: z.string().describe('Destination account ID'),
      category_id: z.string().optional().describe('Category ID — use get_categories to find valid IDs'),
      budget_id: z.string().optional().describe('Budget ID — use get_budgets to find valid IDs'),
      currency_code: z.string().optional().describe('Currency code (e.g. EUR, USD)'),
      tags: z.array(z.string()).optional().describe('Tags'),
      transaction_notes: z.string().optional().describe('Notes for each generated transaction'),
    },
    annotations: WRITE_ANNOTATIONS,
  }, (params) => createRecurrence(client, params as Parameters<typeof createRecurrence>[1]));

  defineTool(server, 'update_recurring', {
    title: 'Update Recurring Transaction',
    description: 'Update an existing recurring transaction in Firefly III. Only fields provided will be changed. Use get_recurrence to confirm the ID before updating.',
    inputSchema: {
      id: z.string().describe('Recurrence ID — use get_recurring to find valid IDs'),
      type: z.enum(['withdrawal', 'deposit', 'transfer']).optional().describe('Transaction type'),
      title: z.string().optional().describe('Name of the recurring transaction'),
      description: z.string().optional().describe('Description of the recurrence'),
      notes: z.string().optional().describe('Notes'),
      first_date: dateSchema.optional().describe('Date of first occurrence (YYYY-MM-DD)'),
      repeat_until: dateSchema.optional().nullable().describe('Stop after this date (YYYY-MM-DD). Pass null to remove end date.'),
      nr_of_repetitions: z.number().int().positive().optional().describe('Stop after N occurrences'),
      apply_rules: z.boolean().optional().describe('Apply rules to generated transactions'),
      active: z.boolean().optional().describe('Whether the recurrence is active'),
      repeat_type: z.enum(['daily', 'weekly', 'monthly', 'ndom', 'yearly']).optional().describe('Repetition frequency'),
      repeat_moment: z.string().optional().describe('Repetition moment (see create_recurring for format details)'),
      skip: z.number().int().min(0).optional().describe('Skip every N occurrences'),
      weekend: z.number().int().min(1).max(4).optional().describe('Weekend handling: 1=do nothing, 2=skip, 3=previous Friday, 4=next Monday'),
      amount: z.string().optional().describe('Transaction amount'),
      transaction_description: z.string().optional().describe('Description of each generated transaction'),
      source_id: z.string().optional().describe('Source account ID'),
      destination_id: z.string().optional().describe('Destination account ID'),
      category_id: z.string().optional().describe('Category ID'),
      budget_id: z.string().optional().describe('Budget ID'),
      currency_code: z.string().optional().describe('Currency code'),
      tags: z.array(z.string()).optional().describe('Tags'),
      transaction_notes: z.string().optional().describe('Notes for each generated transaction'),
    },
    annotations: UPDATE_ANNOTATIONS,
  }, ({ id, ...params }) =>
    updateRecurrence(client, id as string, params as Parameters<typeof updateRecurrence>[2]));

  defineTool(server, 'delete_recurring', {
    title: 'Delete Recurring Transaction',
    description: 'Permanently delete a recurring transaction from Firefly III. **This action cannot be undone.** This deletes the recurrence schedule only — previously generated transactions are not affected. Use get_recurrence to confirm before deleting.',
    inputSchema: {
      id: z.string().describe('Recurrence ID — use get_recurring to find valid IDs'),
    },
    annotations: DELETE_ANNOTATIONS,
  }, ({ id }) => deleteRecurrence(client, id as string));

  defineTool(server, 'get_recurrence_transactions', {
    title: 'Get Recurrence Transactions',
    description: 'Get all transactions that have been created by a recurring transaction rule. Use get_recurring to find valid IDs.',
    inputSchema: {
      id: z.string().describe('Recurring transaction ID'),
      page: z.number().int().positive().optional().default(1).describe('Page number'),
      limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
    },
    annotations: READ_ANNOTATIONS,
  }, ({ id, page, limit }) =>
    fetchRecurrenceTransactions(client, id as string, { page: page as number | undefined, limit: limit as number | undefined }));

  defineTool(server, 'trigger_recurrence', {
    title: 'Trigger Recurrence',
    description: 'Manually fire a recurring transaction rule to create its transaction immediately. Optionally specify a date (YYYY-MM-DD) to use instead of today.',
    inputSchema: {
      id: z.string().describe('Recurring transaction ID'),
      date: dateSchema.optional().describe('Date to use for the triggered transaction (YYYY-MM-DD). Defaults to today.'),
    },
    annotations: WRITE_ANNOTATIONS,
  }, ({ id, date }) => triggerRecurrence(client, id as string, date as string | undefined));
}
