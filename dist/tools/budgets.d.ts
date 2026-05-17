import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type FireflyClient } from '../client.js';
import { type UnwrappedList, type UnwrappedSingle } from '../transform.js';
export declare function fetchBudgets(client: FireflyClient, params: {
    page?: number;
    limit?: number;
}): Promise<UnwrappedList>;
export declare function fetchBudgetLimits(client: FireflyClient, budgetId: string, start?: string, end?: string): Promise<UnwrappedList>;
export declare function createBudget(client: FireflyClient, params: {
    name: string;
    active?: boolean;
    auto_budget_type?: 'reset' | 'rollover' | 'none';
    auto_budget_currency_code?: string;
    auto_budget_amount?: string;
    auto_budget_period?: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'half-year' | 'yearly';
}): Promise<UnwrappedSingle>;
export declare function updateBudget(client: FireflyClient, id: string, params: {
    name?: string;
    active?: boolean;
    auto_budget_type?: 'reset' | 'rollover' | 'none';
    auto_budget_currency_code?: string;
    auto_budget_amount?: string;
    auto_budget_period?: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'half-year' | 'yearly';
}): Promise<UnwrappedSingle>;
export declare function deleteBudget(client: FireflyClient, id: string): Promise<{
    deleted: true;
    id: string;
}>;
export declare function createBudgetLimit(client: FireflyClient, budgetId: string, params: {
    start: string;
    end: string;
    amount: string;
    currency_code?: string;
    period?: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'half_year' | 'yearly';
}): Promise<UnwrappedSingle>;
export declare function updateBudgetLimit(client: FireflyClient, id: string, params: {
    start?: string;
    end?: string;
    amount?: string;
    currency_code?: string;
    period?: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'half_year' | 'yearly';
}): Promise<UnwrappedSingle>;
export declare function deleteBudgetLimit(client: FireflyClient, id: string): Promise<{
    deleted: true;
    id: string;
}>;
export declare function registerBudgetTools(server: McpServer, client: FireflyClient): void;
//# sourceMappingURL=budgets.d.ts.map