import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FireflyClient } from '../client.js';
export declare const TOOL_GROUPS: readonly ["accounts", "transactions", "budgets", "categories", "bills", "piggy-banks", "reports", "rules", "recurring", "attachments"];
export type ToolGroup = typeof TOOL_GROUPS[number];
export declare const PRESETS: Record<string, ToolGroup[]>;
export type PresetName = keyof typeof PRESETS;
export interface ToolFilterOptions {
    preset?: PresetName;
    groups?: ToolGroup[];
    readOnly?: boolean;
}
export declare function registerAllTools(server: McpServer, client: FireflyClient, options?: ToolFilterOptions): void;
//# sourceMappingURL=index.d.ts.map