import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { formatError } from '../client.js';

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

export function defineTool(
  server: McpServer,
  name: string,
  config: ToolConfig,
  fetch: (args: Record<string, unknown>) => Promise<unknown>,
): void {
  // registerTool is generic in the SDK; the cast avoids fighting its complex overload resolution
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server as any).registerTool(name, config, async (args: Record<string, unknown>) => {
    try {
      const result = await fetch(args);
      return {
        content: [
          {
            type: 'text' as const,
            text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  });
}

export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

export function parseId(id: string): string {
  const match = id.match(/^(\d+)/);
  return match ? match[1] : id;
}
