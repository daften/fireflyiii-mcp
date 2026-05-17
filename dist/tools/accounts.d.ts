import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type FireflyClient } from '../client.js';
import { type UnwrappedList, type UnwrappedSingle } from '../transform.js';
export declare function fetchAccounts(client: FireflyClient, params: {
    type?: string;
    page?: number;
    limit?: number;
}): Promise<UnwrappedList>;
export declare function fetchAccount(client: FireflyClient, id: string): Promise<UnwrappedSingle>;
export declare function registerAccountTools(server: McpServer, client: FireflyClient): void;
//# sourceMappingURL=accounts.d.ts.map