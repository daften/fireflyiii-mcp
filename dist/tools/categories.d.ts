import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type FireflyClient } from '../client.js';
import { type UnwrappedList } from '../transform.js';
export declare function fetchCategories(client: FireflyClient, params: {
    page?: number;
    limit?: number;
}): Promise<UnwrappedList>;
export declare function fetchCategoryTransactions(client: FireflyClient, categoryId: string, params: {
    start?: string;
    end?: string;
    page?: number;
    limit?: number;
}): Promise<UnwrappedList>;
export declare function registerCategoryTools(server: McpServer, client: FireflyClient): void;
//# sourceMappingURL=categories.d.ts.map