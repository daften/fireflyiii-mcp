import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type FireflyClient } from '../client.js';
import { type UnwrappedList, type UnwrappedSingle } from '../transform.js';
export declare function fetchLinkTypes(client: FireflyClient, params: {
    page?: number;
    limit?: number;
}): Promise<UnwrappedList>;
export declare function fetchTransactionLinks(client: FireflyClient, journalId: string, params: {
    page?: number;
    limit?: number;
}): Promise<UnwrappedList>;
export declare function fetchTransactionLink(client: FireflyClient, id: string): Promise<UnwrappedSingle>;
export declare function createTransactionLink(client: FireflyClient, params: {
    link_type_id: string;
    in_id: string;
    out_id: string;
    notes?: string;
}): Promise<UnwrappedSingle>;
export declare function updateTransactionLink(client: FireflyClient, id: string, params: {
    link_type_id?: string;
    in_id?: string;
    out_id?: string;
    notes?: string;
}): Promise<UnwrappedSingle>;
export declare function deleteTransactionLink(client: FireflyClient, id: string): Promise<{
    deleted: true;
    id: string;
}>;
export declare function registerTransactionLinkTools(server: McpServer, client: FireflyClient): void;
//# sourceMappingURL=transaction-links.d.ts.map