import { z } from 'zod';
import { formatError } from '../client.js';
export async function fetchBills(client, params) {
    const query = { page: params.page, limit: params.limit };
    if (params.start)
        query['start'] = params.start;
    if (params.end)
        query['end'] = params.end;
    return client.get('/bills', query);
}
const READ_ANNOTATIONS = {
    readOnlyHint: true,
    openWorldHint: true,
    idempotentHint: true,
};
export function registerBillTools(server, client) {
    server.registerTool('get_bills', {
        title: 'Get Bills',
        description: 'Get all recurring bills from Firefly III, including the next expected match date and payment status. Optionally filter by date range (YYYY-MM-DD).',
        inputSchema: {
            start: z.string().optional().describe('Start date (YYYY-MM-DD)'),
            end: z.string().optional().describe('End date (YYYY-MM-DD)'),
            page: z.number().int().positive().optional().default(1).describe('Page number'),
            limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
        },
        annotations: READ_ANNOTATIONS,
    }, async ({ start, end, page, limit }) => {
        try {
            const result = await fetchBills(client, { start, end, page, limit });
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        catch (err) {
            return { content: [{ type: 'text', text: formatError(err) }], isError: true };
        }
    });
}
//# sourceMappingURL=bills.js.map