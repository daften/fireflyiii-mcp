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

/** A pre-built MCP tool result. Used by tools that return native content blocks
 * (e.g. an `image` block) instead of letting {@link defineTool} JSON-stringify a
 * plain value into a single text block. */
export type ContentResult = {
  content: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }>;
  isError?: boolean;
};

/**
 * Like {@link defineTool}, but the handler returns a ready-made MCP result
 * (content blocks) rather than a plain value. Error handling is identical:
 * thrown errors become an `isError` text block via {@link formatError}.
 */
export function defineContentTool(
  server: McpServer,
  name: string,
  config: ToolConfig,
  fetch: (args: Record<string, unknown>) => Promise<ContentResult>,
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server as any).registerTool(name, config, async (args: Record<string, unknown>) => {
    try {
      return await fetch(args);
    } catch (err) {
      return { content: [{ type: 'text' as const, text: formatError(err) }], isError: true };
    }
  });
}

export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');
