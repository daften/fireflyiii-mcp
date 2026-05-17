import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type FireflyClient } from '../client.js';
import { type UnwrappedList } from '../transform.js';
export declare function fetchBills(client: FireflyClient, params: {
    start?: string;
    end?: string;
    page?: number;
    limit?: number;
}): Promise<UnwrappedList>;
export declare function registerBillTools(server: McpServer, client: FireflyClient): void;
//# sourceMappingURL=bills.d.ts.map