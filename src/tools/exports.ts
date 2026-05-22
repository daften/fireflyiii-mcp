import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { type FireflyClient, formatError } from '../client.js';
import type { QueryParams } from '../types.js';

type ExportEntity = 'transactions' | 'accounts' | 'bills' | 'budgets' | 'categories' | 'tags' | 'recurring' | 'rules' | 'piggy-banks';

export async function exportEntity(
  client: FireflyClient,
  entity: ExportEntity,
  params: { start?: string; end?: string }
): Promise<string> {
  const query: QueryParams = { type: 'csv' };
  if (params.start) query['start'] = params.start;
  if (params.end) query['end'] = params.end;
  return client.getText(`/data/export/${entity}`, query);
}

const READ_ANNOTATIONS = {
  readOnlyHint: true,
  openWorldHint: true,
  idempotentHint: true,
} as const;

const EXPORT_TOOLS: Array<{ name: string; title: string; entity: ExportEntity; hasDates: boolean }> = [
  { name: 'export_transactions', title: 'Export Transactions', entity: 'transactions', hasDates: true },
  { name: 'export_accounts', title: 'Export Accounts', entity: 'accounts', hasDates: false },
  { name: 'export_bills', title: 'Export Bills', entity: 'bills', hasDates: false },
  { name: 'export_budgets', title: 'Export Budgets', entity: 'budgets', hasDates: false },
  { name: 'export_categories', title: 'Export Categories', entity: 'categories', hasDates: false },
  { name: 'export_tags', title: 'Export Tags', entity: 'tags', hasDates: false },
  { name: 'export_recurring', title: 'Export Recurring Transactions', entity: 'recurring', hasDates: false },
  { name: 'export_rules', title: 'Export Rules', entity: 'rules', hasDates: false },
  { name: 'export_piggy_banks', title: 'Export Piggy Banks', entity: 'piggy-banks', hasDates: false },
];

export function registerExportTools(server: McpServer, client: FireflyClient): void {
  for (const { name, title, entity, hasDates } of EXPORT_TOOLS) {
    const inputSchema: Record<string, z.ZodTypeAny> = {};
    if (hasDates) {
      inputSchema['start'] = z.string().optional().describe('Start date (YYYY-MM-DD)');
      inputSchema['end'] = z.string().optional().describe('End date (YYYY-MM-DD)');
    }

    server.registerTool(
      name,
      {
        title,
        description: `Export all ${entity} as a CSV file. Returns raw CSV text.${hasDates ? ' Optionally filter by date range.' : ''}`,
        inputSchema,
        annotations: READ_ANNOTATIONS,
      },
      async (params: Record<string, unknown>) => {
        try {
          const { start, end } = params as { start?: string; end?: string };
          const csv = await exportEntity(client, entity, { start, end });
          return { content: [{ type: 'text' as const, text: csv }] };
        } catch (err) {
          return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
        }
      }
    );
  }
}
