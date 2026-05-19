import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { type FireflyClient, formatError } from '../client.js';
import type { QueryParams } from '../types.js';
import { unwrapList, unwrapSingle, type JsonApiListResponse, type JsonApiSingleResponse, type UnwrappedList, type UnwrappedSingle } from '../transform.js';

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

export function registerRecurringTools(_server: McpServer, _client: FireflyClient): void {
  // tool registrations added in Task 5
}
