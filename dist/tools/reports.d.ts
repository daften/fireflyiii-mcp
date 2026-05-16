import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type FireflyClient } from '../client.js';
export declare function fetchTags(client: FireflyClient, params: {
    page?: number;
    limit?: number;
}): Promise<unknown>;
export declare function fetchTagTransactions(client: FireflyClient, tag: string, params: {
    start?: string;
    end?: string;
    page?: number;
    limit?: number;
}): Promise<unknown>;
export declare function fetchSummary(client: FireflyClient, start: string, end: string, currencyCode?: string): Promise<unknown>;
export declare function fetchInsightExpenses(client: FireflyClient, start: string, end: string): Promise<unknown>;
export declare function fetchInsightIncome(client: FireflyClient, start: string, end: string): Promise<unknown>;
export declare function registerReportTools(server: McpServer, client: FireflyClient): void;
//# sourceMappingURL=reports.d.ts.map