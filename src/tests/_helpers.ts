import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { z } from 'zod';

type Handler = (args: Record<string, unknown>) => Promise<unknown>;

/** The registerTool config shape as the tools pass it, for tests that inspect schemas and annotations. */
export type MockToolConfig = {
  title?: string;
  description?: string;
  inputSchema: Record<string, z.ZodType>;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
};

export function createMockServer(): {
  server: McpServer;
  handlers: Map<string, Handler>;
  prompts: Map<string, (args: Record<string, unknown>) => Promise<unknown>>;
  toolConfigs: Map<string, MockToolConfig>;
  promptConfigs: Map<string, unknown>;
} {
  const handlers = new Map<string, Handler>();
  const prompts = new Map<string, (args: Record<string, unknown>) => Promise<unknown>>();
  const toolConfigs = new Map<string, MockToolConfig>();
  const promptConfigs = new Map<string, unknown>();
  const server = {
    registerTool(_name: string, _config: MockToolConfig, handler: Handler) {
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
