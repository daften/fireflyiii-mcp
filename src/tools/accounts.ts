import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { type FireflyClient, formatError } from '../client.js';
import type { QueryParams } from '../types.js';

export async function fetchAccounts(
  client: FireflyClient,
  params: { type?: string; page?: number; limit?: number }
): Promise<unknown> {
  const query: QueryParams = { page: params.page, limit: params.limit };
  if (params.type && params.type !== 'all') query['type'] = params.type;
  return client.get('/accounts', query);
}

export async function fetchAccount(client: FireflyClient, id: string): Promise<unknown> {
  return client.get(`/accounts/${id}`);
}

export function registerAccountTools(server: McpServer, client: FireflyClient): void {
  server.tool(
    'get_accounts',
    'Get all accounts from Firefly III. Filter by type: asset (bank/cash accounts), expense (merchants), revenue (income sources), liability (loans/debts), or all.',
    {
      type: z
        .enum(['asset', 'expense', 'revenue', 'liability', 'all'])
        .optional()
        .default('all')
        .describe('Account type filter'),
      page: z.number().int().positive().optional().default(1).describe('Page number'),
      limit: z.number().int().positive().optional().default(50).describe('Results per page'),
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

  server.tool(
    'get_account',
    'Get a single Firefly III account by its numeric ID, including the current balance.',
    {
      id: z.string().describe('Account ID'),
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
