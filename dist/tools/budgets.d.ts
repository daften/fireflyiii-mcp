import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type FireflyClient } from '../client.js';
import { type UnwrappedList } from '../transform.js';
export declare function fetchBudgets(client: FireflyClient, params: {
    page?: number;
    limit?: number;
}): Promise<UnwrappedList>;
export declare function fetchBudgetLimits(client: FireflyClient, budgetId: string, start?: string, end?: string): Promise<UnwrappedList>;
export declare function registerBudgetTools(server: McpServer, client: FireflyClient): void;
//# sourceMappingURL=budgets.d.ts.map