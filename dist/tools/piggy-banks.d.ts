import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FireflyClient } from '../client.js';
import { type UnwrappedList, type UnwrappedSingle } from '../transform.js';
export declare function fetchPiggyBanks(client: FireflyClient, params: {
    page?: number;
    limit?: number;
}): Promise<UnwrappedList>;
export declare function createPiggyBank(client: FireflyClient, params: {
    name: string;
    account_id: string;
    target_amount?: string;
    start_date?: string;
    target_date?: string;
    notes?: string;
}): Promise<UnwrappedSingle>;
export declare function updatePiggyBank(client: FireflyClient, id: string, params: {
    name?: string;
    account_id?: string;
    target_amount?: string;
    start_date?: string;
    target_date?: string;
    notes?: string;
}): Promise<UnwrappedSingle>;
export declare function deletePiggyBank(client: FireflyClient, id: string): Promise<{
    deleted: true;
    id: string;
}>;
export declare function fetchPiggyBankEvents(client: FireflyClient, id: string, params: {
    page?: number;
    limit?: number;
}): Promise<UnwrappedList>;
export declare function createPiggyBankEvent(client: FireflyClient, id: string, params: {
    amount: string;
    date: string;
}): Promise<UnwrappedSingle>;
export declare function deletePiggyBankEvent(client: FireflyClient, id: string, eventId: string): Promise<{
    deleted: true;
    id: string;
}>;
export declare function registerPiggyBankTools(server: McpServer, client: FireflyClient): void;
//# sourceMappingURL=piggy-banks.d.ts.map