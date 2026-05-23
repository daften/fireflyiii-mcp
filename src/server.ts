import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FireflyClient } from './client.js';
import { registerAllTools, type ToolFilterOptions } from './tools/index.js';

const pkg = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8')
) as { version: string };

export function createServer(client: FireflyClient, filterOptions: ToolFilterOptions = {}): McpServer {
  const server = new McpServer({
    name: 'firefly-iii-mcp',
    version: pkg.version,
  });

  registerAllTools(server, client, filterOptions);

  return server;
}
