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

const READ_ANNOTATIONS = {
  readOnlyHint: true,
  openWorldHint: true,
  idempotentHint: true,
} as const;

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
}
