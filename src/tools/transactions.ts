import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { type FireflyClient, formatError } from '../client.js';
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
  buildTransactionListQuery,
  CATEGORY_NAME_HINT,
  dateOrDateTimeSchema,
  dateSchema,
  defineTool,
  parseId,
} from './_helpers.js';
import { fetchAccountTransactions } from './accounts.js';

// A transaction response carries two ids: the top-level group `id`, which update_transaction and
// delete_transaction expect, and a `transaction_journal_id` inside each item of `transactions[]`.
// They are usually adjacent numbers, so the wrong one addresses a real but unrelated transaction
// rather than erroring — nothing at write time can tell the two apart, which is why these fields
// warn instead of validating. GROUP_ID_HINT and groupIdField both restate this fact for different
// audiences (a tool description vs. a field description); they share this one fragment so the
// wording can't drift apart.
const GROUP_VS_JOURNAL_ID =
  'the top-level `id` (the transaction group), not the `transaction_journal_id` inside `transactions[]`';

const GROUP_ID_HINT = `update_transaction and delete_transaction take ${GROUP_VS_JOURNAL_ID}.`;

const groupIdField = (verb: string): string =>
  `Transaction group ID — ${GROUP_VS_JOURNAL_ID}. That is usually an adjacent number, so the wrong one silently ${verb} a different transaction.`;

export async function fetchTransactions(
  client: FireflyClient,
  params: {
    type?: string;
    accountId?: string;
    start?: string;
    end?: string;
    page?: number;
    limit?: number;
  },
): Promise<UnwrappedList> {
  // Firefly III's /transactions endpoint has no account_id filter and silently ignores it, so
  // accountId must be routed to /accounts/{id}/transactions instead — see issue #101.
  if (params.accountId) {
    return fetchAccountTransactions(client, parseId(params.accountId), {
      start: params.start,
      end: params.end,
      type: params.type,
      page: params.page,
      limit: params.limit,
    });
  }
  const query = buildTransactionListQuery(params);
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
  },
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

/** One split (journal) of a transaction group, as returned inside `transactions[]`. */
interface GroupSplit {
  transaction_journal_id: string;
  description?: string;
  amount?: string;
}

interface GroupSplits {
  title: string | null;
  splits: GroupSplit[];
}

async function fetchGroupSplits(client: FireflyClient, id: string): Promise<GroupSplits> {
  const group = await fetchTransaction(client, id);
  const splits = Array.isArray(group.transactions) ? (group.transactions as GroupSplit[]) : [];
  if (splits.length === 0) throw new Error(`Transaction group ${id} has no splits.`);
  return {
    title: typeof group.group_title === 'string' ? group.group_title : null,
    splits: splits.map((s) => ({ ...s, transaction_journal_id: String(s.transaction_journal_id) })),
  };
}

const describeSplits = (splits: GroupSplit[]): string =>
  splits.map((s) => `${s.transaction_journal_id} ("${s.description ?? ''}", ${s.amount ?? '?'})`).join(', ');

function definedFields(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
}

/**
 * Builds a PUT body that changes only the splits in `targets`.
 *
 * Firefly's GroupUpdateService treats a `transactions[]` entry without `transaction_journal_id` as a
 * brand-new split, and then deletes every existing split the request did not mention. So every split
 * of the group is sent with its ID; the untouched ones carry nothing else, which Firefly skips.
 * Firefly also requires all splits to share one type (a type change applies to every split) and
 * rejects a multi-split update without a group title.
 */
function buildGroupUpdate(group: GroupSplits, targets: Set<string>, changes: Record<string, unknown>) {
  const { type, ...perSplit } = changes;
  const transactions = group.splits.map((s) => {
    const entry: Record<string, unknown> = { transaction_journal_id: s.transaction_journal_id };
    if (type !== undefined) entry.type = type;
    if (targets.has(s.transaction_journal_id)) Object.assign(entry, perSplit);
    return entry;
  });
  const body: Record<string, unknown> = { apply_rules: true, fire_webhooks: true, transactions };
  if (transactions.length > 1) body.group_title = group.title || group.splits[0].description || 'Split transaction';
  return body;
}

export async function updateTransaction(
  client: FireflyClient,
  id: string,
  params: {
    transaction_journal_id?: string;
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
  },
): Promise<UnwrappedSingle> {
  const { transaction_journal_id: journalId, ...fields } = params;
  const changes = definedFields(fields);
  if (Object.keys(changes).length === 0) throw new Error('Nothing to update: pass at least one field to change.');

  const group = await fetchGroupSplits(client, id);
  let target: string;
  if (journalId !== undefined) {
    if (!group.splits.some((s) => s.transaction_journal_id === journalId)) {
      throw new Error(
        `Split ${journalId} is not part of transaction group ${id}. Its splits are: ${describeSplits(group.splits)}.`,
      );
    }
    target = journalId;
  } else if (group.splits.length === 1) {
    target = group.splits[0].transaction_journal_id;
  } else {
    throw new Error(
      `Transaction group ${id} has ${group.splits.length} splits; pass transaction_journal_id to choose which one to update (one split per call). Splits: ${describeSplits(group.splits)}.`,
    );
  }

  const response = await client.put<JsonApiSingleResponse>(
    `/transactions/${id}`,
    buildGroupUpdate(group, new Set([target]), changes),
  );
  return unwrapSingle(response);
}

export async function deleteTransaction(client: FireflyClient, id: string): Promise<{ deleted: true; id: string }> {
  await client.delete(`/transactions/${id}`);
  return { deleted: true, id };
}

export async function searchTransactions(
  client: FireflyClient,
  params: { query: string; page?: number; limit?: number },
): Promise<UnwrappedList> {
  const query: QueryParams = { query: params.query, page: params.page, limit: params.limit };
  const response = await client.get<JsonApiListResponse>('/search/transactions', query);
  return unwrapList(response);
}

export const BULK_UPDATE_DEFAULT_MAX = 50;
export const BULK_UPDATE_HARD_MAX = 500;
const BULK_SEARCH_PAGE_SIZE = 100;

export interface BulkUpdateResult {
  matched: number;
  updated: Array<{ id: string; splits: string[] }>;
  failed: Array<{ id: string; error: string }>;
}

/**
 * Applies the same field changes to every transaction a search query matches.
 *
 * Firefly's own `/data/bulk/transactions` endpoint can only move transactions between accounts
 * (`where.account_id` → `update.account_id`), so this is done client-side: page through the search
 * results, then update each matched group. Search returns *partial* groups (only the splits that
 * matched), and sending those back as-is would make Firefly delete the unmatched splits, so each
 * group is re-read in full and only the matched splits are changed (see buildGroupUpdate).
 *
 * Nothing is changed if the query matches more than `max_transactions` groups.
 */
export async function bulkUpdateTransactions(
  client: FireflyClient,
  params: {
    query: string;
    category_name?: string;
    budget_id?: string;
    tags?: string[];
    notes?: string;
    max_transactions?: number;
  },
): Promise<BulkUpdateResult> {
  const changes = definedFields({
    category_name: params.category_name,
    budget_id: params.budget_id,
    tags: params.tags,
    notes: params.notes,
  });
  if (Object.keys(changes).length === 0) {
    throw new Error('Nothing to update: pass at least one of category_name, budget_id, tags or notes.');
  }
  const max = params.max_transactions ?? BULK_UPDATE_DEFAULT_MAX;

  const matched = new Map<string, Set<string>>();
  for (let page = 1; ; page++) {
    const result = await searchTransactions(client, { query: params.query, page, limit: BULK_SEARCH_PAGE_SIZE });
    for (const group of result.data) {
      const splits = matched.get(group.id) ?? new Set<string>();
      for (const split of (group.transactions as GroupSplit[] | undefined) ?? []) {
        splits.add(String(split.transaction_journal_id));
      }
      matched.set(group.id, splits);
    }
    if (matched.size > max) {
      throw new Error(
        `The query matches more than ${max} transactions, so nothing was changed. Narrow the query, or raise max_transactions (up to ${BULK_UPDATE_HARD_MAX}) after checking the matches with search_transactions.`,
      );
    }
    if (result.data.length === 0 || !result.pagination || page >= result.pagination.totalPages) break;
  }

  const outcome: BulkUpdateResult = { matched: matched.size, updated: [], failed: [] };
  for (const [id, splitIds] of matched) {
    try {
      const group = await fetchGroupSplits(client, id);
      await client.put(`/transactions/${id}`, buildGroupUpdate(group, splitIds, changes));
      outcome.updated.push({ id, splits: [...splitIds] });
    } catch (err) {
      outcome.failed.push({ id, error: formatError(err) });
    }
  }
  return outcome;
}

export async function createSplitTransaction(
  client: FireflyClient,
  params: {
    type: 'withdrawal' | 'deposit' | 'transfer';
    date: string;
    source_id?: string;
    destination_id?: string;
    currency_code?: string;
    group_title: string;
    splits: Array<{
      amount: string;
      description: string;
      category_name?: string;
      budget_id?: string;
      tags?: string[];
      notes?: string;
    }>;
  },
): Promise<UnwrappedSingle> {
  const transactions = params.splits.map((split) => {
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
  const response = await client.post<JsonApiSingleResponse>('/transactions', {
    apply_rules: true,
    fire_webhooks: true,
    group_title: params.group_title,
    transactions,
  });
  return unwrapSingle(response);
}

export function registerTransactionTools(server: McpServer, client: FireflyClient): void {
  defineTool(
    server,
    'get_transactions',
    {
      title: 'Get Transactions',
      description:
        'Get transactions from Firefly III. Filter by type (withdrawal/deposit/transfer/reconciliation), account ID, or date range. Dates must be YYYY-MM-DD. Use get_transaction to fetch a single transaction by ID.',
      inputSchema: {
        type: z
          .enum(['withdrawal', 'deposit', 'transfer', 'reconciliation'])
          .optional()
          .describe('Transaction type filter'),
        accountId: z
          .string()
          .optional()
          .describe(
            'Filter by account ID — use get_accounts to find valid IDs. Internally delegates to the same endpoint as get_account_transactions.',
          ),
        start: dateSchema.optional().describe('Start date (YYYY-MM-DD)'),
        end: dateSchema.optional().describe('End date (YYYY-MM-DD)'),
        page: z.number().int().positive().optional().default(1).describe('Page number'),
        limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
      },
      annotations: READ_ANNOTATIONS,
    },
    ({ type, accountId, start, end, page, limit }) =>
      fetchTransactions(client, {
        type: type,
        accountId: accountId,
        start: start,
        end: end,
        page: page,
        limit: limit,
      }),
  );

  defineTool(
    server,
    'get_transaction',
    {
      title: 'Get Transaction',
      description: `Get a single Firefly III transaction by its numeric ID, including all splits. Use get_transactions to find valid transaction IDs. ${GROUP_ID_HINT}`,
      inputSchema: {
        id: z.string().describe('Transaction ID'),
      },
      annotations: READ_ANNOTATIONS,
    },
    ({ id }) => fetchTransaction(client, id),
  );

  defineTool(
    server,
    'create_transaction',
    {
      title: 'Create Transaction',
      description: `Create a new transaction in Firefly III. Use get_accounts to find source and destination account IDs. ${GROUP_ID_HINT}`,
      inputSchema: {
        type: z.enum(['withdrawal', 'deposit', 'transfer']).describe('Transaction type'),
        date: dateOrDateTimeSchema.describe('Transaction date (YYYY-MM-DD or RFC 3339 date-time with timezone)'),
        amount: z.string().describe('Amount as a positive number string, e.g. "42.50"'),
        description: z.string().describe('Short description of the transaction'),
        source_id: z.string().optional().describe('Source account ID (required for withdrawals and transfers)'),
        destination_id: z.string().optional().describe('Destination account ID (required for deposits and transfers)'),
        category_name: z.string().optional().describe(`Category name to assign. ${CATEGORY_NAME_HINT}`),
        budget_id: z.string().optional().describe('Budget ID — use get_budgets to find valid IDs'),
        currency_code: z.string().optional().describe('Currency code (e.g. EUR, USD). Defaults to account currency.'),
        notes: z.string().optional().describe('Additional notes'),
        tags: z.array(z.string()).optional().describe('Tags to attach'),
      },
      annotations: WRITE_ANNOTATIONS,
    },
    (params) => createTransaction(client, params),
  );

  defineTool(
    server,
    'update_transaction',
    {
      title: 'Update Transaction',
      description:
        'Update one split of an existing transaction in Firefly III. Only fields provided will be changed; the other splits of a split transaction are left untouched. For a transaction with several splits, pass transaction_journal_id to pick the split (one split per call); a type change always applies to every split. Use get_transaction to confirm the IDs before updating.',
      inputSchema: {
        id: z.string().describe(groupIdField('updates')),
        transaction_journal_id: z
          .string()
          .optional()
          .describe(
            "Which split to update: the `transaction_journal_id` from the group's `transactions[]`. Optional when the transaction has a single split; required when it has several.",
          ),
        type: z.enum(['withdrawal', 'deposit', 'transfer']).optional().describe('Transaction type'),
        date: dateOrDateTimeSchema
          .optional()
          .describe('Transaction date (YYYY-MM-DD or RFC 3339 date-time with timezone)'),
        amount: z.string().optional().describe('Amount as a positive number string'),
        description: z.string().optional().describe('Short description'),
        source_id: z.string().optional().describe('Source account ID'),
        destination_id: z.string().optional().describe('Destination account ID'),
        category_name: z.string().optional().describe(`Category name. ${CATEGORY_NAME_HINT}`),
        budget_id: z.string().optional().describe('Budget ID'),
        currency_code: z.string().optional().describe('Currency code (e.g. EUR, USD)'),
        notes: z.string().optional().describe('Additional notes'),
        tags: z.array(z.string()).optional().describe('Tags (replaces existing tags)'),
      },
      annotations: UPDATE_ANNOTATIONS,
    },
    ({ id, ...params }) => updateTransaction(client, id, params),
  );

  defineTool(
    server,
    'delete_transaction',
    {
      title: 'Delete Transaction',
      description:
        'Permanently delete a transaction from Firefly III. **This action cannot be undone.** Use get_transaction to confirm the transaction before deleting.',
      inputSchema: {
        id: z.string().describe(groupIdField('deletes')),
      },
      annotations: DELETE_ANNOTATIONS,
    },
    ({ id }) => deleteTransaction(client, id),
  );

  defineTool(
    server,
    'search_transactions',
    {
      title: 'Search Transactions',
      description:
        'Search for transactions in Firefly III by keyword. Searches across descriptions, notes, and other fields.',
      inputSchema: {
        query: z.string().describe('Search query'),
        page: z.number().int().positive().optional().default(1).describe('Page number'),
        limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
      },
      annotations: READ_ANNOTATIONS,
    },
    ({ query, page, limit }) =>
      searchTransactions(client, {
        query: query,
        page: page,
        limit: limit,
      }),
  );

  defineTool(
    server,
    'create_split_transaction',
    {
      title: 'Create Split Transaction',
      description:
        'Create a split transaction in Firefly III — one receipt divided across multiple categories, budgets, or descriptions. All splits share the same type, date, and accounts. Use get_accounts to find source and destination account IDs.',
      inputSchema: {
        type: z.enum(['withdrawal', 'deposit', 'transfer']).describe('Transaction type (shared across all splits)'),
        date: dateOrDateTimeSchema.describe(
          'Transaction date (YYYY-MM-DD or RFC 3339 date-time with timezone, shared across all splits)',
        ),
        source_id: z.string().optional().describe('Source account ID (required for withdrawals and transfers)'),
        destination_id: z.string().optional().describe('Destination account ID (required for deposits and transfers)'),
        currency_code: z.string().optional().describe('Currency code (e.g. EUR, USD). Defaults to account currency.'),
        group_title: z
          .string()
          .min(1)
          .describe('Title for the whole transaction group (Firefly III requires one when there are several splits)'),
        splits: z
          .array(
            z.object({
              amount: z.string().describe('Amount as a positive number string, e.g. "42.50"'),
              description: z.string().describe('Description for this split'),
              category_name: z.string().optional().describe(`Category name. ${CATEGORY_NAME_HINT}`),
              budget_id: z.string().optional().describe('Budget ID — use get_budgets to find valid IDs'),
              tags: z.array(z.string()).optional().describe('Tags'),
              notes: z.string().optional().describe('Notes'),
            }),
          )
          .min(2)
          .describe('At least 2 splits required'),
      },
      annotations: WRITE_ANNOTATIONS,
    },
    (params) => createSplitTransaction(client, params),
  );

  defineTool(
    server,
    'bulk_update_transactions',
    {
      title: 'Bulk Update Transactions',
      description:
        'Set the category, budget, tags or notes on every transaction a search query matches (same syntax as search_transactions). Only the splits the query matches are changed. Run search_transactions with the same query first to check what will change: if the query matches more than max_transactions transactions, nothing is changed. Returns the updated and failed transaction IDs.',
      inputSchema: {
        query: z.string().describe('Search query to select transactions (same syntax as search_transactions)'),
        category_name: z
          .string()
          .optional()
          .describe(`Set category for all matched transactions. ${CATEGORY_NAME_HINT}`),
        budget_id: z.string().optional().describe('Set budget for all matched transactions'),
        tags: z.array(z.string()).optional().describe('Replace tags on all matched transactions'),
        notes: z.string().optional().describe('Set notes on all matched transactions'),
        max_transactions: z
          .number()
          .int()
          .positive()
          .max(BULK_UPDATE_HARD_MAX)
          .optional()
          .default(BULK_UPDATE_DEFAULT_MAX)
          .describe(
            `Safety limit: refuse to change anything if the query matches more transactions than this (default ${BULK_UPDATE_DEFAULT_MAX}, max ${BULK_UPDATE_HARD_MAX})`,
          ),
      },
      annotations: WRITE_ANNOTATIONS,
    },
    (params) => bulkUpdateTransactions(client, params),
  );
}
