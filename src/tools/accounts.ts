import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { type FireflyClient, formatError } from '../client.js';
import type { QueryParams } from '../types.js';
import { unwrapList, unwrapSingle, type JsonApiListResponse, type JsonApiSingleResponse, type UnwrappedList, type UnwrappedSingle } from '../transform.js';

export async function fetchAccounts(
  client: FireflyClient,
  params: { type?: string; page?: number; limit?: number }
): Promise<UnwrappedList> {
  const query: QueryParams = { page: params.page, limit: params.limit };
  if (params.type && params.type !== 'all') query['type'] = params.type;
  const response = await client.get<JsonApiListResponse>('/accounts', query);
  return unwrapList(response);
}

export async function fetchAccount(client: FireflyClient, id: string): Promise<UnwrappedSingle> {
  const response = await client.get<JsonApiSingleResponse>(`/accounts/${id}`);
  return unwrapSingle(response);
}

export async function createAccount(
  client: FireflyClient,
  params: {
    name: string;
    type: 'asset' | 'expense' | 'revenue' | 'liability';
    currency_code?: string;
    iban?: string;
    opening_balance?: string;
    opening_balance_date?: string;
    include_net_worth?: boolean;
    notes?: string;
  }
): Promise<UnwrappedSingle> {
  const response = await client.post<JsonApiSingleResponse>('/accounts', params);
  return unwrapSingle(response);
}

export async function updateAccount(
  client: FireflyClient,
  id: string,
  params: {
    name?: string;
    currency_code?: string;
    iban?: string;
    opening_balance?: string;
    opening_balance_date?: string;
    include_net_worth?: boolean;
    active?: boolean;
    notes?: string;
  }
): Promise<UnwrappedSingle> {
  const response = await client.put<JsonApiSingleResponse>(`/accounts/${id}`, params);
  return unwrapSingle(response);
}

export async function deleteAccount(
  client: FireflyClient,
  id: string
): Promise<{ deleted: true; id: string }> {
  await client.delete(`/accounts/${id}`);
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

export function registerAccountTools(server: McpServer, client: FireflyClient): void {
  server.registerTool(
    'get_accounts',
    {
      title: 'Get Accounts',
      description: 'Get all accounts from Firefly III. Filter by type: asset (bank/cash accounts), expense (merchants), revenue (income sources), liability (loans/debts), or all. Use get_account to fetch a single account by ID.',
      inputSchema: {
        type: z
          .enum(['asset', 'expense', 'revenue', 'liability', 'all'])
          .optional()
          .default('all')
          .describe('Account type filter'),
        page: z.number().int().positive().optional().default(1).describe('Page number'),
        limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
      },
      annotations: READ_ANNOTATIONS,
    },
    async ({ type, page, limit }) => {
      try {
        const result = await fetchAccounts(client, { type, page, limit });
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );

  server.registerTool(
    'get_account',
    {
      title: 'Get Account',
      description: 'Get a single Firefly III account by its numeric ID, including the current balance. Use get_accounts to find valid account IDs.',
      inputSchema: {
        id: z.string().describe('Account ID'),
      },
      annotations: READ_ANNOTATIONS,
    },
    async ({ id }) => {
      try {
        const result = await fetchAccount(client, id);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );

  server.registerTool(
    'create_account',
    {
      title: 'Create Account',
      description: 'Create a new account in Firefly III.',
      inputSchema: {
        name: z.string().describe('Account name'),
        type: z.enum(['asset', 'expense', 'revenue', 'liability']).describe('Account type'),
        currency_code: z.string().optional().describe('Currency code (e.g. EUR, USD)'),
        iban: z.string().optional().describe('IBAN number'),
        opening_balance: z.string().optional().describe('Opening balance as a number string'),
        opening_balance_date: z.string().optional().describe('Opening balance date (YYYY-MM-DD)'),
        include_net_worth: z.boolean().optional().describe('Include in net worth calculations'),
        notes: z.string().optional().describe('Notes'),
      },
      annotations: WRITE_ANNOTATIONS,
    },
    async (params) => {
      try {
        const result = await createAccount(client, params);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );

  server.registerTool(
    'update_account',
    {
      title: 'Update Account',
      description: 'Update an existing account in Firefly III. Only fields provided will be changed. Use get_account to confirm the ID.',
      inputSchema: {
        id: z.string().describe('Account ID — use get_accounts to find valid IDs'),
        name: z.string().optional().describe('Account name'),
        currency_code: z.string().optional().describe('Currency code (e.g. EUR, USD)'),
        iban: z.string().optional().describe('IBAN number'),
        opening_balance: z.string().optional().describe('Opening balance as a number string'),
        opening_balance_date: z.string().optional().describe('Opening balance date (YYYY-MM-DD)'),
        include_net_worth: z.boolean().optional().describe('Include in net worth calculations'),
        active: z.boolean().optional().describe('Whether the account is active'),
        notes: z.string().optional().describe('Notes'),
      },
      annotations: UPDATE_ANNOTATIONS,
    },
    async ({ id, ...params }) => {
      try {
        const result = await updateAccount(client, id, params);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );

  server.registerTool(
    'delete_account',
    {
      title: 'Delete Account',
      description: 'Permanently delete an account from Firefly III. **This action cannot be undone.** Accounts with linked transactions cannot be deleted. Use get_account to confirm before deleting.',
      inputSchema: {
        id: z.string().describe('Account ID — use get_accounts to find valid IDs'),
      },
      annotations: DELETE_ANNOTATIONS,
    },
    async ({ id }) => {
      try {
        const result = await deleteAccount(client, id);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );
}
