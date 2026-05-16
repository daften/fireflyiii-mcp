import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { type FireflyClient, formatError } from '../client.js';

export async function fetchPiggyBanks(
  client: FireflyClient,
  params: { page?: number; limit?: number }
): Promise<unknown> {
  return client.get('/piggy-banks', { page: params.page, limit: params.limit });
}

export function registerPiggyBankTools(server: McpServer, client: FireflyClient): void {
  server.tool(
    'get_piggy_banks',
    'Get all piggy banks (savings goals) from Firefly III, including current saved amount and target amount.',
    {
      page: z.number().int().positive().optional().default(1).describe('Page number'),
      limit: z.number().int().positive().optional().default(50).describe('Results per page'),
    },
    async ({ page, limit }) => {
      try {
        const result = await fetchPiggyBanks(client, { page, limit });
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
      }
    }
  );
}
