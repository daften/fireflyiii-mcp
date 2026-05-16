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
export function registerBillTools(server, client) {
    server.tool('get_bills', 'Get all recurring bills from Firefly III, including the next expected match date and payment status. Optionally filter by date range (YYYY-MM-DD).', {
        start: z.string().optional().describe('Start date (YYYY-MM-DD)'),
        end: z.string().optional().describe('End date (YYYY-MM-DD)'),
        page: z.number().int().positive().optional().default(1).describe('Page number'),
        limit: z.number().int().positive().optional().default(50).describe('Results per page'),
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