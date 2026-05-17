import { z } from 'zod';
import { formatError } from '../client.js';
import { unwrapList } from '../transform.js';
export async function fetchPiggyBanks(client, params) {
    const response = await client.get('/piggy-banks', { page: params.page, limit: params.limit });
    return unwrapList(response);
}
const READ_ANNOTATIONS = {
    readOnlyHint: true,
    openWorldHint: true,
    idempotentHint: true,
};
export function registerPiggyBankTools(server, client) {
    server.registerTool('get_piggy_banks', {
        title: 'Get Piggy Banks',
        description: 'Get all piggy banks (savings goals) from Firefly III, including current saved amount and target amount.',
        inputSchema: {
            page: z.number().int().positive().optional().default(1).describe('Page number'),
            limit: z.number().int().positive().max(100).optional().default(50).describe('Results per page (max 100)'),
        },
        annotations: READ_ANNOTATIONS,
    }, async ({ page, limit }) => {
        try {
            const result = await fetchPiggyBanks(client, { page, limit });
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        catch (err) {
            return { content: [{ type: 'text', text: formatError(err) }], isError: true };
        }
    });
}
//# sourceMappingURL=piggy-banks.js.map