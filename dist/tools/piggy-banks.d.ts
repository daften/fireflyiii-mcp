import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type FireflyClient } from '../client.js';
import { type UnwrappedList } from '../transform.js';
export declare function fetchPiggyBanks(client: FireflyClient, params: {
    page?: number;
    limit?: number;
}): Promise<UnwrappedList>;
export declare function registerPiggyBankTools(server: McpServer, client: FireflyClient): void;
//# sourceMappingURL=piggy-banks.d.ts.map