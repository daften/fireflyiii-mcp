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
  buildTransactionListQuery,
  createTtlCache,
  dateSchema,
  debugLog,
  defineTool,
  parseId,
} from './_helpers.js';

export async function fetchAccounts(
  client: FireflyClient,
  params: { type?: string; page?: number; limit?: number },
): Promise<UnwrappedList> {
  const query: QueryParams = { page: params.page, limit: params.limit };
  if (params.type && params.type !== 'all') query.type = params.type;
  const response = await client.get<JsonApiListResponse>('/accounts', query);
  return unwrapList(response);
}

export async function fetchAccount(client: FireflyClient, id: string): Promise<UnwrappedSingle> {
  const response = await client.get<JsonApiSingleResponse>(`/accounts/${id}`);
  return unwrapSingle(response);
}

// Firefly III validates interest_period against config('firefly.interest_periods') when an account is
// created, but against a hardcoded `in:daily,monthly,yearly` rule when one is updated. Mirroring that
// split keeps update_account from advertising three periods the API will reject (weekly,
// quarterly and half-year, which create_account accepts and update_account does not).
const CREATE_INTEREST_PERIODS = ['daily', 'weekly', 'monthly', 'quarterly', 'half-year', 'yearly'] as const;
const UPDATE_INTEREST_PERIODS = ['daily', 'monthly', 'yearly'] as const;

const LIABILITY_TYPES = ['loan', 'debt', 'mortgage'] as const;
const LIABILITY_DIRECTIONS = ['credit', 'debit'] as const;

// create_account's liability fields are conditional on `type: 'liability'` (a field update_account
// doesn't have at all), so the two tools' wording differs — but the six fields and their Firefly
// semantics are identical. Sharing this factory keeps the *shape* in one place; only the "why would
// you fill this in" clause is allowed to vary between the two callers.
function liabilityFields<Mode extends 'create' | 'update'>(mode: Mode) {
  const scope = mode === 'create' ? 'required when type is liability' : 'Only applies to liability accounts';
  // Cast needed because the ternary's static type is the union of both branches regardless of
  // which literal `mode` was passed — the generic `Mode` param is what lets each call site
  // (liabilityFields('create') vs liabilityFields('update')) get back a differently-typed
  // interest_period enum instead of the union of both.
  const interestPeriods = (
    mode === 'create' ? CREATE_INTEREST_PERIODS : UPDATE_INTEREST_PERIODS
  ) as Mode extends 'create' ? typeof CREATE_INTEREST_PERIODS : typeof UPDATE_INTEREST_PERIODS;
  return {
    liability_type: z.enum(LIABILITY_TYPES).optional().describe(`Liability type (${scope}): loan, debt, or mortgage`),
    liability_direction: z
      .enum(LIABILITY_DIRECTIONS)
      .optional()
      .describe(`Liability direction (${scope}): 'debit' if you owe this money, 'credit' if it is owed to you`),
    liability_amount: z
      .string()
      .optional()
      .describe(
        `Amount of the liability as a number string (${scope}). Must be sent together with liability_start_date.`,
      ),
    liability_start_date: dateSchema
      .optional()
      .describe(`Date the liability started (YYYY-MM-DD) (${scope}). Must be sent together with liability_amount.`),
    interest: z
      .string()
      .optional()
      .describe(`Interest percentage as a number string between 0 and 100, e.g. "3.15" (${scope})`),
    interest_period: z
      .enum(interestPeriods)
      .optional()
      .describe(
        mode === 'create'
          ? `Period the interest percentage applies to (${scope})`
          : `Period the interest percentage applies to (${scope}). Firefly III accepts fewer periods here than on create_account.`,
      ),
  };
}

export async function createAccount(
  client: FireflyClient,
  params: {
    name: string;
    type: 'asset' | 'expense' | 'revenue' | 'liability';
    account_role?: 'defaultAsset' | 'sharedAsset' | 'savingAsset' | 'ccAsset' | 'cashWalletAsset';
    liability_type?: (typeof LIABILITY_TYPES)[number];
    liability_direction?: (typeof LIABILITY_DIRECTIONS)[number];
    liability_amount?: string;
    liability_start_date?: string;
    interest?: string;
    interest_period?: (typeof CREATE_INTEREST_PERIODS)[number];
    currency_code?: string;
    iban?: string;
    opening_balance?: string;
    opening_balance_date?: string;
    include_net_worth?: boolean;
    notes?: string;
  },
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
    liability_type?: (typeof LIABILITY_TYPES)[number];
    liability_direction?: (typeof LIABILITY_DIRECTIONS)[number];
    liability_amount?: string;
    liability_start_date?: string;
    interest?: string;
    interest_period?: (typeof UPDATE_INTEREST_PERIODS)[number];
  },
): Promise<UnwrappedSingle> {
  const response = await client.put<JsonApiSingleResponse>(`/accounts/${id}`, params);
  return unwrapSingle(response);
}

export async function deleteAccount(client: FireflyClient, id: string): Promise<{ deleted: true; id: string }> {
  await client.delete(`/accounts/${id}`);
  return { deleted: true, id };
}

export async function fetchAccountTransactions(
  client: FireflyClient,
  id: string,
  params: { start?: string; end?: string; type?: string; page?: number; limit?: number },
): Promise<UnwrappedList> {
  const query = buildTransactionListQuery(params);
  const response = await client.get<JsonApiListResponse>(`/accounts/${id}/transactions`, query);
  return unwrapList(response);
}

export async function searchAccounts(
  client: FireflyClient,
  params: { query: string; field?: string; page?: number; limit?: number },
): Promise<UnwrappedList> {
  const query: QueryParams = { query: params.query, page: params.page, limit: params.limit };
  if (params.field) query.field = params.field;
  const response = await client.get<JsonApiListResponse>('/search/accounts', query);
  return unwrapList(response);
}

// Module-scoped so the cache survives across the stateless HTTP requests autocomplete fires;
// keyed per identity inside the completion handler so one user never sees another's accounts.
const accountsCache = createTtlCache<UnwrappedList>();

export function clearAccountsCache(): void {
  accountsCache.clear();
}

export function registerAccountTools(server: McpServer, client: FireflyClient): void {
  defineTool(
    server,
    'get_accounts',
    {
      title: 'Get Accounts',
      description:
        'Get all accounts from Firefly III. Filter by type: asset (bank/cash accounts), expense (merchants), revenue (income sources), liability (loans/debts), or all. Use get_account to fetch a single account by ID.',
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
    ({ type, page, limit }) =>
      fetchAccounts(client, {
        type: type,
        page: page,
        limit: limit,
      }),
  );

  const accountIdSchema = completable(
    z.string().describe('Account ID — use get_accounts to find valid IDs'),
    async (value) => {
      debugLog(`[Autocomplete] Account search input: "${value}"`);
      try {
        const accounts = await accountsCache.get(client.cacheKey(), () =>
          fetchAccounts(client, { limit: AUTOCOMPLETE_FETCH_LIMIT }),
        );
        const suggestions = accounts.data
          .map((a) => `${a.id} (${a.name ?? ''} - ${a.type ?? ''})`)
          .filter((label) => label.toLowerCase().includes(value.toLowerCase()))
          .slice(0, AUTOCOMPLETE_MAX_SUGGESTIONS);
        debugLog(`[Autocomplete] Account suggestions found: ${suggestions.length}`);
        return suggestions;
      } catch (err) {
        debugLog('[Autocomplete Error - Account]:', err);
        return [];
      }
    },
  );

  defineTool(
    server,
    'get_account',
    {
      title: 'Get Account',
      description:
        'Get a single Firefly III account by its numeric ID, including the current balance. Use get_accounts to find valid account IDs.',
      inputSchema: { id: accountIdSchema },
      annotations: READ_ANNOTATIONS,
    },
    ({ id }) => fetchAccount(client, parseId(id)),
  );

  defineTool(
    server,
    'create_account',
    {
      title: 'Create Account',
      description: 'Create a new account in Firefly III.',
      inputSchema: {
        name: z.string().describe('Account name'),
        type: z.enum(['asset', 'expense', 'revenue', 'liability']).describe('Account type'),
        account_role: z
          .enum(['defaultAsset', 'sharedAsset', 'savingAsset', 'ccAsset', 'cashWalletAsset'])
          .optional()
          .describe('Role for asset accounts (required when type is asset)'),
        ...liabilityFields('create'),
        currency_code: z.string().optional().describe('Currency code (e.g. EUR, USD)'),
        iban: z.string().optional().describe('IBAN number'),
        opening_balance: z.string().optional().describe('Opening balance as a number string'),
        opening_balance_date: dateSchema.optional().describe('Opening balance date (YYYY-MM-DD)'),
        include_net_worth: z.boolean().optional().describe('Include in net worth calculations'),
        notes: z.string().optional().describe('Notes'),
      },
      annotations: WRITE_ANNOTATIONS,
    },
    (params) => createAccount(client, params),
  );

  defineTool(
    server,
    'update_account',
    {
      title: 'Update Account',
      description:
        'Update an existing account in Firefly III. Only fields provided will be changed. Use get_account to confirm the ID.',
      inputSchema: {
        id: accountIdSchema,
        name: z.string().optional().describe('Account name'),
        currency_code: z.string().optional().describe('Currency code (e.g. EUR, USD)'),
        iban: z.string().optional().describe('IBAN number'),
        opening_balance: z.string().optional().describe('Opening balance as a number string'),
        opening_balance_date: dateSchema.optional().describe('Opening balance date (YYYY-MM-DD)'),
        include_net_worth: z.boolean().optional().describe('Include in net worth calculations'),
        active: z.boolean().optional().describe('Whether the account is active'),
        notes: z.string().optional().describe('Notes'),
        ...liabilityFields('update'),
      },
      annotations: UPDATE_ANNOTATIONS,
    },
    ({ id, ...params }) => updateAccount(client, parseId(id), params),
  );

  defineTool(
    server,
    'delete_account',
    {
      title: 'Delete Account',
      description:
        'Permanently delete an account from Firefly III. **This action cannot be undone.** Accounts with linked transactions cannot be deleted. Use get_account to confirm before deleting.',
      inputSchema: { id: accountIdSchema },
      annotations: DELETE_ANNOTATIONS,
    },
    ({ id }) => deleteAccount(client, parseId(id)),
  );

  defineTool(
    server,
    'get_account_transactions',
    {
      title: 'Get Account Transactions',
      description: 'Get all transactions for a specific account. Use get_accounts to find valid account IDs.',
      inputSchema: {
        id: accountIdSchema,
        start: dateSchema.optional().describe('Start date (YYYY-MM-DD)'),
        end: dateSchema.optional().describe('End date (YYYY-MM-DD)'),
        type: z
          .enum(['all', 'withdrawal', 'deposit', 'transfer', 'opening_balance', 'reconciliation', 'special', 'default'])
          .optional()
          .describe('Filter by transaction type'),
        page: z.number().int().positive().optional().default(1).describe('Page number'),
        limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
      },
      annotations: READ_ANNOTATIONS,
    },
    ({ id, start, end, type, page, limit }) =>
      fetchAccountTransactions(client, parseId(id), {
        start: start,
        end: end,
        type: type,
        page: page,
        limit: limit,
      }),
  );

  defineTool(
    server,
    'search_accounts',
    {
      title: 'Search Accounts',
      description: 'Search for accounts by name, IBAN, account number, or ID.',
      inputSchema: {
        query: z.string().describe('Search query'),
        field: z
          .enum(['all', 'id', 'name', 'iban', 'number', 'account_number'])
          .optional()
          .default('all')
          .describe('Field to search in'),
        page: z.number().int().positive().optional().default(1).describe('Page number'),
        limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
      },
      annotations: READ_ANNOTATIONS,
    },
    ({ query, field, page, limit }) =>
      searchAccounts(client, {
        query: query,
        field: field,
        page: page,
        limit: limit,
      }),
  );

  server.registerPrompt(
    'account-transactions',
    {
      title: 'Get Transactions by Account',
      description: 'Get transactions for a specific account with autocomplete.',
      argsSchema: {
        account: accountIdSchema,
      },
    },
    async ({ account }) => {
      const id = parseId(account);
      return {
        description: `Get transactions for account ID ${id}`,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Show me the recent transactions for account ID "${id}".`,
            },
          },
        ],
      };
    },
  );
}
