import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type FireflyClient } from '../client.js';
import { type UnwrappedList, type UnwrappedSingle } from '../transform.js';
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
export declare function createCategory(client: FireflyClient, params: {
    name: string;
    notes?: string;
}): Promise<UnwrappedSingle>;
export declare function updateCategory(client: FireflyClient, id: string, params: {
    name?: string;
    notes?: string;
}): Promise<UnwrappedSingle>;
export declare function deleteCategory(client: FireflyClient, id: string): Promise<{
    deleted: true;
    id: string;
}>;
export declare function registerCategoryTools(server: McpServer, client: FireflyClient): void;
//# sourceMappingURL=categories.d.ts.map