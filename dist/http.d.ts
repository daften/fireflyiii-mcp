import * as http from 'node:http';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
interface RequestContext {
    token: string;
}
export declare const requestContext: AsyncLocalStorage<RequestContext>;
export declare function createOAuthHandler(fireflyUrl: string, oauthClientId: string, mcpHandler: (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>): (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>;
export declare function classifyHost(host: string): 'loopback' | 'non-loopback';
export declare function startHttpServer(createMcpServer: () => McpServer, host: string, requestedPort: number, portWasExplicit: boolean, oauthClientId: string, fireflyUrl: string): Promise<void>;
export {};
//# sourceMappingURL=http.d.ts.map