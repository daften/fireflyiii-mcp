import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type FireflyClient } from '../client.js';
import { type UnwrappedList, type UnwrappedSingle } from '../transform.js';
export declare function fetchBills(client: FireflyClient, params: {
    start?: string;
    end?: string;
    page?: number;
    limit?: number;
}): Promise<UnwrappedList>;
export declare function createBill(client: FireflyClient, params: {
    name: string;
    amount_min: string;
    amount_max: string;
    date: string;
    repeat_freq: 'weekly' | 'monthly' | 'quarterly' | 'half-year' | 'yearly';
    currency_code?: string;
    end_date?: string;
    active?: boolean;
    notes?: string;
}): Promise<UnwrappedSingle>;
export declare function updateBill(client: FireflyClient, id: string, params: {
    name?: string;
    amount_min?: string;
    amount_max?: string;
    date?: string;
    repeat_freq?: 'weekly' | 'monthly' | 'quarterly' | 'half-year' | 'yearly';
    currency_code?: string;
    end_date?: string;
    active?: boolean;
    notes?: string;
}): Promise<UnwrappedSingle>;
export declare function deleteBill(client: FireflyClient, id: string): Promise<{
    deleted: true;
    id: string;
}>;
export declare function registerBillTools(server: McpServer, client: FireflyClient): void;
//# sourceMappingURL=bills.d.ts.map