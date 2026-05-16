import { z } from 'zod';
import { formatError } from '../client.js';
export async function fetchPiggyBanks(client, params) {
    return client.get('/piggy-banks', { page: params.page, limit: params.limit });
}
export function registerPiggyBankTools(server, client) {
    server.tool('get_piggy_banks', 'Get all piggy banks (savings goals) from Firefly III, including current saved amount and target amount.', {
        page: z.number().int().positive().optional().default(1).describe('Page number'),
        limit: z.number().int().positive().optional().default(50).describe('Results per page'),
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