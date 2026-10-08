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
import { dateSchema, defineTool, idSchema } from './_helpers.js';

// Since Firefly III v6.2.0 a piggy bank can save from several asset accounts. Each link carries the
// amount saved from that account; there is no separate "event" write API (piggy bank events are only
// readable), so money moves in or out by setting a link's current_amount.
export interface PiggyBankAccountLink {
  account_id: string;
  current_amount?: string;
}

export async function fetchPiggyBanks(
  client: FireflyClient,
  params: { page?: number; limit?: number },
): Promise<UnwrappedList> {
  const response = await client.get<JsonApiListResponse>('/piggy-banks', { page: params.page, limit: params.limit });
  return unwrapList(response);
}

export async function fetchPiggyBank(client: FireflyClient, id: string): Promise<UnwrappedSingle> {
  const response = await client.get<JsonApiSingleResponse>(`/piggy-banks/${id}`);
  return unwrapSingle(response);
}

export async function createPiggyBank(
  client: FireflyClient,
  params: {
    name: string;
    accounts?: PiggyBankAccountLink[];
    account_id?: string;
    target_amount: string;
    currency_code: string;
    start_date?: string;
    target_date?: string;
    notes?: string;
    object_group_title?: string;
  },
): Promise<UnwrappedSingle> {
  const { account_id, accounts, currency_code, start_date, ...rest } = params;
  const links = accounts ?? (account_id !== undefined ? [{ account_id }] : []);
  if (links.length === 0)
    throw new Error('Pass accounts (or account_id): a piggy bank must save from an asset account.');
  const body: Record<string, unknown> = {
    ...rest,
    accounts: links,
    transaction_currency_code: currency_code,
    // Firefly III requires a start date; today is what its own UI pre-fills.
    start_date: start_date ?? new Date().toISOString().slice(0, 10),
  };
  const response = await client.post<JsonApiSingleResponse>('/piggy-banks', body);
  return unwrapSingle(response);
}

/**
 * Firefly III *replaces* a piggy bank's linked accounts with whatever `accounts` an update sends: any
 * account left out is unlinked, together with the money saved from it. To make topping up one
 * account safe, the given links are merged over the current ones, so accounts not mentioned keep
 * their link and their amount.
 */
export async function updatePiggyBank(
  client: FireflyClient,
  id: string,
  params: {
    name?: string;
    accounts?: PiggyBankAccountLink[];
    target_amount?: string;
    currency_code?: string;
    start_date?: string;
    target_date?: string;
    notes?: string;
    object_group_title?: string;
  },
): Promise<UnwrappedSingle> {
  const { accounts, currency_code, ...rest } = params;
  const body: Record<string, unknown> = { ...rest };
  if (currency_code !== undefined) body.transaction_currency_code = currency_code;
  if (accounts !== undefined) {
    const current = await fetchPiggyBank(client, id);
    const merged = new Map<string, PiggyBankAccountLink>();
    for (const link of (current.accounts as PiggyBankAccountLink[] | undefined) ?? []) {
      merged.set(String(link.account_id), { account_id: String(link.account_id), current_amount: link.current_amount });
    }
    for (const link of accounts) {
      merged.set(String(link.account_id), { ...merged.get(String(link.account_id)), ...link });
    }
    body.accounts = [...merged.values()];
  }
  const response = await client.put<JsonApiSingleResponse>(`/piggy-banks/${id}`, body);
  return unwrapSingle(response);
}

export async function deletePiggyBank(client: FireflyClient, id: string): Promise<{ deleted: true; id: string }> {
  await client.delete(`/piggy-banks/${id}`);
  return { deleted: true, id };
}

export async function fetchPiggyBankEvents(
  client: FireflyClient,
  id: string,
  params: { page?: number; limit?: number },
): Promise<UnwrappedList> {
  const query: QueryParams = { page: params.page, limit: params.limit };
  const response = await client.get<JsonApiListResponse>(`/piggy-banks/${id}/events`, query);
  return unwrapList(response);
}

const accountLinkSchema = z.object({
  account_id: z.string().describe('Asset account ID: use get_accounts to find valid IDs'),
  current_amount: z
    .string()
    .optional()
    .describe('Total amount saved from this account, as a number string (the new total, not a change)'),
});

export function registerPiggyBankTools(server: McpServer, client: FireflyClient): void {
  defineTool(
    server,
    'get_piggy_banks',
    {
      title: 'Get Piggy Banks',
      description:
        'Get all piggy banks (savings goals) from Firefly III, including current saved amount and target amount.',
      inputSchema: {
        page: z.number().int().positive().optional().default(1).describe('Page number'),
        limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
      },
      annotations: READ_ANNOTATIONS,
    },
    ({ page, limit }) => fetchPiggyBanks(client, { page: page, limit: limit }),
  );

  defineTool(
    server,
    'create_piggy_bank',
    {
      title: 'Create Piggy Bank',
      description:
        'Create a new savings goal (piggy bank) in Firefly III. It saves from one or more asset accounts: pass accounts, or account_id for a single account.',
      inputSchema: {
        name: z.string().describe('Piggy bank name'),
        accounts: z
          .array(accountLinkSchema)
          .min(1)
          .optional()
          .describe('Asset accounts to save from, each with an optional starting amount. Use instead of account_id.'),
        account_id: z
          .string()
          .optional()
          .describe('Shortcut for a single asset account to save from (ignored when accounts is given)'),
        target_amount: z.string().describe('Savings goal amount as a number string ("0" for no target)'),
        currency_code: z.string().describe('Currency of the piggy bank (e.g. EUR, USD)'),
        start_date: dateSchema.optional().describe('Start date (YYYY-MM-DD). Defaults to today.'),
        target_date: dateSchema.optional().describe('Target completion date (YYYY-MM-DD)'),
        notes: z.string().optional().describe('Notes'),
        object_group_title: z
          .string()
          .optional()
          .describe('Object group to file this piggy bank under; Firefly III creates the group if it does not exist'),
      },
      annotations: WRITE_ANNOTATIONS,
    },
    (params) => createPiggyBank(client, params),
  );

  defineTool(
    server,
    'update_piggy_bank',
    {
      title: 'Update Piggy Bank',
      description:
        'Update an existing piggy bank in Firefly III. Only fields provided will be changed. To put money in or take it out, pass accounts with the new current_amount (total saved) for that account; accounts you do not mention keep their link and amount. Use get_piggy_banks to find valid IDs and current amounts.',
      inputSchema: {
        id: idSchema.describe('Piggy bank ID: use get_piggy_banks to find valid IDs'),
        name: z.string().optional().describe('Piggy bank name'),
        accounts: z
          .array(accountLinkSchema)
          .min(1)
          .optional()
          .describe('Accounts to link or re-amount; merged with the existing links by account_id'),
        target_amount: z.string().optional().describe('Savings goal amount as a number string'),
        currency_code: z.string().optional().describe('Currency of the piggy bank (e.g. EUR, USD)'),
        start_date: dateSchema.optional().describe('Start date (YYYY-MM-DD)'),
        target_date: dateSchema.optional().describe('Target completion date (YYYY-MM-DD)'),
        notes: z.string().optional().describe('Notes'),
        object_group_title: z
          .string()
          .optional()
          .describe('Object group to file this piggy bank under; Firefly III creates the group if it does not exist'),
      },
      annotations: UPDATE_ANNOTATIONS,
    },
    ({ id, ...params }) => updatePiggyBank(client, id, params),
  );

  defineTool(
    server,
    'delete_piggy_bank',
    {
      title: 'Delete Piggy Bank',
      description:
        'Permanently delete a piggy bank (savings goal) from Firefly III. **This action cannot be undone.** Use get_piggy_banks to confirm the ID before deleting.',
      inputSchema: { id: idSchema.describe('Piggy bank ID: use get_piggy_banks to find valid IDs') },
      annotations: DELETE_ANNOTATIONS,
    },
    ({ id }) => deletePiggyBank(client, id),
  );

  defineTool(
    server,
    'get_piggy_bank_events',
    {
      title: 'Get Piggy Bank Events',
      description:
        'Get the recorded deposit/withdrawal history of a specific piggy bank. Use get_piggy_banks to find valid IDs.',
      inputSchema: {
        id: idSchema.describe('Piggy bank ID'),
        page: z.number().int().positive().optional().default(1).describe('Page number'),
        limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
      },
      annotations: READ_ANNOTATIONS,
    },
    ({ id, page, limit }) =>
      fetchPiggyBankEvents(client, id, {
        page: page,
        limit: limit,
      }),
  );
}
