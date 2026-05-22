import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type FireflyClient } from '../client.js';
type ExportEntity = 'transactions' | 'accounts' | 'bills' | 'budgets' | 'categories' | 'tags' | 'recurring' | 'rules' | 'piggy-banks';
export declare function exportEntity(client: FireflyClient, entity: ExportEntity, params: {
    start?: string;
    end?: string;
}): Promise<string>;
export declare function registerExportTools(server: McpServer, client: FireflyClient): void;
export {};
//# sourceMappingURL=exports.d.ts.map