import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type FireflyClient } from '../client.js';
export declare function fetchPiggyBanks(client: FireflyClient, params: {
    page?: number;
    limit?: number;
}): Promise<unknown>;
export declare function registerPiggyBankTools(server: McpServer, client: FireflyClient): void;
//# sourceMappingURL=piggy-banks.d.ts.map