import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type FireflyClient } from '../client.js';
import { type UnwrappedList, type UnwrappedSingle } from '../transform.js';
export declare function fetchTransactions(client: FireflyClient, params: {
    type?: string;
    accountId?: string;
    start?: string;
    end?: string;
    page?: number;
    limit?: number;
}): Promise<UnwrappedList>;
export declare function fetchTransaction(client: FireflyClient, id: string): Promise<UnwrappedSingle>;
export declare function registerTransactionTools(server: McpServer, client: FireflyClient): void;
//# sourceMappingURL=transactions.d.ts.map