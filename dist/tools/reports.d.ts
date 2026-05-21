import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type FireflyClient } from '../client.js';
import { type CleanSummaryItem, type UnwrappedList, type UnwrappedSingle } from '../transform.js';
export declare function fetchTags(client: FireflyClient, params: {
    page?: number;
    limit?: number;
}): Promise<UnwrappedList>;
export declare function fetchTagTransactions(client: FireflyClient, tag: string, params: {
    start?: string;
    end?: string;
    page?: number;
    limit?: number;
}): Promise<UnwrappedList>;
export declare function fetchSummary(client: FireflyClient, start: string, end: string, currencyCode?: string): Promise<CleanSummaryItem[]>;
export declare function fetchInsightExpenses(client: FireflyClient, start: string, end: string): Promise<unknown>;
export declare function fetchInsightIncome(client: FireflyClient, start: string, end: string): Promise<unknown>;
type InsightNoXEndpoint = '/insight/expense/no-bill' | '/insight/expense/no-budget' | '/insight/expense/no-category' | '/insight/expense/no-tag' | '/insight/income/no-category' | '/insight/income/no-tag' | '/insight/transfer/no-category' | '/insight/transfer/no-tag';
export declare function fetchInsightNoX(client: FireflyClient, endpoint: InsightNoXEndpoint, start: string, end: string): Promise<unknown>;
export declare function createTag(client: FireflyClient, params: {
    tag: string;
    date?: string;
    description?: string;
}): Promise<UnwrappedSingle>;
export declare function updateTag(client: FireflyClient, id: string, params: {
    tag?: string;
    date?: string;
    description?: string;
}): Promise<UnwrappedSingle>;
export declare function deleteTag(client: FireflyClient, id: string): Promise<{
    deleted: true;
    id: string;
}>;
export declare function fetchAbout(client: FireflyClient): Promise<unknown>;
export declare function fetchNetWorth(client: FireflyClient, start: string, end: string, currencyCode?: string): Promise<unknown>;
export declare function fetchChart(client: FireflyClient, endpoint: string, start: string, end: string): Promise<unknown>;
export declare function fetchExchangeRate(client: FireflyClient, from: string, to: string, date?: string): Promise<unknown>;
export declare function registerReportTools(server: McpServer, client: FireflyClient): void;
export {};
//# sourceMappingURL=reports.d.ts.map