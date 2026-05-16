import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { type FireflyClient, formatError } from '../client.js';
import type { QueryParams } from '../types.js';

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
): Promise<unknown> {
  const query: QueryParams = { page: params.page, limit: params.limit };
  if (params.type) query['type'] = params.type;
  if (params.accountId) query['account_id'] = params.accountId;
  if (params.start) query['start'] = params.start;
  if (params.end) query['end'] = params.end;
  return client.get('/transactions', query);
}

export async function fetchTransaction(client: FireflyClient, id: string): Promise<unknown> {
  return client.get(`/transactions/${id}`);
}

export function registerTransactionTools(server: McpServer, client: FireflyClient): void {
  server.tool(
    'get_transactions',
    'Get transactions from Firefly III. Filter by transaction type (withdrawal/deposit/transfer/reconciliation), account ID, date range, and pagination. Dates must be YYYY-MM-DD format.',
    {
      type: z
        .enum(['withdrawal', 'deposit', 'transfer', 'reconciliation'])
        .optional()
        .describe('Transaction type filter'),
      accountId: z.string().optional().describe('Filter by account ID'),
      start: z.string().optional().describe('Start date (YYYY-MM-DD)'),
      end: z.string().optional().describe('End date (YYYY-MM-DD)'),
      page: z.number().int().positive().optional().default(1).describe('Page number'),
      limit: z.number().int().positive().optional().default(50).describe('Results per page'),
    },
    async ({ type, accountId, start, end, page, limit }) => {
      try {
        const result = await fetchTransactions(client, { type, accountId, start, end, page, limit });
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );

  server.tool(
    'get_transaction',
    'Get a single Firefly III transaction by its numeric ID, including all splits.',
    {
      id: z.string().describe('Transaction ID'),
    },
    async ({ id }) => {
      try {
        const result = await fetchTransaction(client, id);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );
}
