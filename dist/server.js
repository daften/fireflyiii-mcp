import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAllTools } from './tools/index.js';
export function createServer(client) {
    const server = new McpServer({
        name: 'firefly-iii-mcp',
        version: '0.1.0',
    });
    registerAllTools(server, client);
    return server;
}
//# sourceMappingURL=server.js.map