import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type FireflyClient } from '../client.js';
export declare function fetchAccounts(client: FireflyClient, params: {
    type?: string;
    page?: number;
    limit?: number;
}): Promise<unknown>;
export declare function fetchAccount(client: FireflyClient, id: string): Promise<unknown>;
export declare function registerAccountTools(server: McpServer, client: FireflyClient): void;
//# sourceMappingURL=accounts.d.ts.map