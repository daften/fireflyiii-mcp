import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

type Handler = (args: Record<string, unknown>) => Promise<unknown>;

export function createMockServer(): { server: McpServer; handlers: Map<string, Handler> } {
  const handlers = new Map<string, Handler>();
  const server = {
    registerTool(_name: string, _config: unknown, handler: Handler) {
      handlers.set(_name, handler);
    },
  };
  return { server: server as unknown as McpServer, handlers };
}
