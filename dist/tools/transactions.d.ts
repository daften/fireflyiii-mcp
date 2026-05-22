import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FireflyClient } from '../client.js';
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
export declare function createTransaction(client: FireflyClient, params: {
    type: 'withdrawal' | 'deposit' | 'transfer';
    date: string;
    amount: string;
    description: string;
    source_id?: string;
    destination_id?: string;
    category_name?: string;
    budget_id?: string;
    currency_code?: string;
    notes?: string;
    tags?: string[];
}): Promise<UnwrappedSingle>;
export declare function updateTransaction(client: FireflyClient, id: string, params: {
    type?: 'withdrawal' | 'deposit' | 'transfer';
    date?: string;
    amount?: string;
    description?: string;
    source_id?: string;
    destination_id?: string;
    category_name?: string;
    budget_id?: string;
    currency_code?: string;
    notes?: string;
    tags?: string[];
}): Promise<UnwrappedSingle>;
export declare function deleteTransaction(client: FireflyClient, id: string): Promise<{
    deleted: true;
    id: string;
}>;
export declare function searchTransactions(client: FireflyClient, params: {
    query: string;
    page?: number;
    limit?: number;
}): Promise<UnwrappedList>;
export declare function bulkUpdateTransactions(client: FireflyClient, params: {
    query: string;
    category_name?: string;
    budget_id?: string;
    tags?: string[];
    notes?: string;
}): Promise<unknown>;
export declare function createSplitTransaction(client: FireflyClient, params: {
    type: 'withdrawal' | 'deposit' | 'transfer';
    date: string;
    source_id?: string;
    destination_id?: string;
    currency_code?: string;
    group_title?: string;
    splits: Array<{
        amount: string;
        description: string;
        category_name?: string;
        budget_id?: string;
        tags?: string[];
        notes?: string;
    }>;
}): Promise<UnwrappedSingle>;
export declare function registerTransactionTools(server: McpServer, client: FireflyClient): void;
//# sourceMappingURL=transactions.d.ts.map