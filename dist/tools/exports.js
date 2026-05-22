import { READ_ANNOTATIONS } from './_annotations.js';
import { defineTool, dateSchema } from './_helpers.js';
export async function exportEntity(client, entity, params) {
    const query = { type: 'csv' };
    if (params.start)
        query['start'] = params.start;
    if (params.end)
        query['end'] = params.end;
    return client.getText(`/data/export/${entity}`, query);
}
const EXPORT_TOOLS = [
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
export function registerExportTools(server, client) {
    for (const { name, title, entity, hasDates } of EXPORT_TOOLS) {
        const inputSchema = {};
        if (hasDates) {
            inputSchema['start'] = dateSchema.optional().describe('Start date (YYYY-MM-DD)');
            inputSchema['end'] = dateSchema.optional().describe('End date (YYYY-MM-DD)');
        }
        defineTool(server, name, {
            title,
            description: `Export all ${entity} as a CSV file. Returns raw CSV text.${hasDates ? ' Optionally filter by date range.' : ''}`,
            inputSchema,
            annotations: READ_ANNOTATIONS,
        }, ({ start, end }) => exportEntity(client, entity, { start: start, end: end }));
    }
}
//# sourceMappingURL=exports.js.map