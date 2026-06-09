import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

type Handler = (args: Record<string, unknown>) => Promise<unknown>;

export function createMockServer(): {
  server: McpServer;
  handlers: Map<string, Handler>;
  prompts: Map<string, (args: Record<string, unknown>) => Promise<unknown>>;
  toolConfigs: Map<string, unknown>;
  promptConfigs: Map<string, unknown>;
} {
  const handlers = new Map<string, Handler>();
  const prompts = new Map<string, (args: Record<string, unknown>) => Promise<unknown>>();
  const toolConfigs = new Map<string, unknown>();
  const promptConfigs = new Map<string, unknown>();
  const server = {
    registerTool(_name: string, _config: unknown, handler: Handler) {
      handlers.set(_name, handler);
      toolConfigs.set(_name, _config);
    },
    registerPrompt(_name: string, _config: unknown, cb: (args: Record<string, unknown>) => Promise<unknown>) {
      prompts.set(_name, cb);
      promptConfigs.set(_name, _config);
    },
  };
  return { server: server as unknown as McpServer, handlers, prompts, toolConfigs, promptConfigs };
}
