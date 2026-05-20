import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type FireflyClient } from '../client.js';
import { type UnwrappedList, type UnwrappedSingle } from '../transform.js';
export declare function fetchAttachments(client: FireflyClient, params: {
    page?: number;
    limit?: number;
}): Promise<UnwrappedList>;
export declare function fetchAttachment(client: FireflyClient, id: string): Promise<UnwrappedSingle>;
export declare function createAttachment(client: FireflyClient, params: {
    filename: string;
    attachable_type: string;
    attachable_id: string;
    title?: string;
    notes?: string;
}): Promise<UnwrappedSingle>;
export declare function updateAttachment(client: FireflyClient, id: string, params: {
    filename?: string;
    title?: string;
    notes?: string;
}): Promise<UnwrappedSingle>;
export declare function deleteAttachment(client: FireflyClient, id: string): Promise<{
    deleted: true;
    id: string;
}>;
export declare function uploadAttachment(client: FireflyClient, id: string, content: Uint8Array): Promise<{
    uploaded: true;
    id: string;
}>;
export declare function registerAttachmentTools(server: McpServer, client: FireflyClient): void;
//# sourceMappingURL=attachments.d.ts.map