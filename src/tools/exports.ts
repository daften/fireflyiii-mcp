import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type FireflyClient, ResponseTooLargeError } from '../client.js';
import type { QueryParams } from '../types.js';
import { READ_ANNOTATIONS } from './_annotations.js';
import { dateSchema, defineTool } from './_helpers.js';

type ExportEntity =
  | 'transactions'
  | 'accounts'
  | 'bills'
  | 'budgets'
  | 'categories'
  | 'tags'
  | 'recurring'
  | 'rules'
  | 'piggy-banks';

// Exports are returned to the model as raw CSV text; past this size they cost more context than any
// answer is worth (an undated export_transactions covers every transaction ever recorded).
export const EXPORT_MAX_BYTES = 512 * 1024;

export async function exportEntity(
  client: FireflyClient,
  entity: ExportEntity,
  params: { start?: string; end?: string },
): Promise<string> {
  // Firefly III only accepts a complete range with start strictly before end.
  if (Boolean(params.start) !== Boolean(params.end)) throw new Error('Pass start and end together, or neither.');
  const query: QueryParams = { type: 'csv' };
  if (params.start) query.start = params.start;
  if (params.end) query.end = params.end;
  try {
    return await client.getText(`/data/export/${entity}`, query, { maxBytes: EXPORT_MAX_BYTES });
  } catch (err) {
    if (!(err instanceof ResponseTooLargeError)) throw err;
    const hint =
      entity === 'transactions'
        ? ' Narrow it with a shorter start/end range, or use get_transactions / search_transactions.'
        : ' Use the matching get_* tool, which pages through the results, instead.';
    throw new Error(
      `The ${entity} export is larger than ${EXPORT_MAX_BYTES / 1024} KiB, too large to return here.${hint}`,
    );
  }
}

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
    const description = hasDates
      ? `Export all ${entity} as a CSV file. Returns raw CSV text (text/csv), up to ${EXPORT_MAX_BYTES / 1024} KiB; use a date range to stay under it.`
      : `Export all ${entity} as a CSV file. Returns raw CSV text (text/csv), up to ${EXPORT_MAX_BYTES / 1024} KiB.`;
    defineTool(
      server,
      name,
      {
        title,
        description,
        inputSchema: hasDates
          ? {
              start: dateSchema.optional().describe('Start date (YYYY-MM-DD); pass together with end'),
              end: dateSchema.optional().describe('End date (YYYY-MM-DD), after start; pass together with start'),
            }
          : {},
        annotations: READ_ANNOTATIONS,
      },
      (args) =>
        exportEntity(
          client,
          entity,
          hasDates ? { start: args.start as string | undefined, end: args.end as string | undefined } : {},
        ),
    );
  }
}
