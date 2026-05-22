import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type FireflyClient } from '../client.js';
import { type UnwrappedList, type UnwrappedSingle } from '../transform.js';
export declare function fetchObjectGroups(client: FireflyClient, params: {
    page?: number;
    limit?: number;
}): Promise<UnwrappedList>;
export declare function fetchObjectGroup(client: FireflyClient, id: string): Promise<UnwrappedSingle>;
export declare function createObjectGroup(client: FireflyClient, params: {
    title: string;
    order?: number;
}): Promise<UnwrappedSingle>;
export declare function updateObjectGroup(client: FireflyClient, id: string, params: {
    title?: string;
    order?: number;
}): Promise<UnwrappedSingle>;
export declare function deleteObjectGroup(client: FireflyClient, id: string): Promise<{
    deleted: true;
    id: string;
}>;
export declare function fetchObjectGroupBills(client: FireflyClient, id: string, params: {
    page?: number;
    limit?: number;
}): Promise<UnwrappedList>;
export declare function fetchObjectGroupPiggyBanks(client: FireflyClient, id: string, params: {
    page?: number;
    limit?: number;
}): Promise<UnwrappedList>;
export declare function registerObjectGroupTools(server: McpServer, client: FireflyClient): void;
//# sourceMappingURL=object-groups.d.ts.map