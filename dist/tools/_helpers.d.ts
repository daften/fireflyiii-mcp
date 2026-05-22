import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
type ToolConfig = {
    title?: string;
    description?: string;
    inputSchema?: Record<string, z.ZodTypeAny>;
    annotations?: {
        readOnlyHint?: boolean;
        destructiveHint?: boolean;
        idempotentHint?: boolean;
        openWorldHint?: boolean;
    };
};
export declare function defineTool(server: McpServer, name: string, config: ToolConfig, fetch: (args: Record<string, unknown>) => Promise<unknown>): void;
export declare const dateSchema: z.ZodString;
export {};
//# sourceMappingURL=_helpers.d.ts.map