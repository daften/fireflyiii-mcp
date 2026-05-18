import * as http from 'node:http';
import { AsyncLocalStorage } from 'node:async_hooks';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
export const requestContext = new AsyncLocalStorage();
export function createOAuthHandler(fireflyUrl, oauthClientId, mcpHandler) {
    return async (req, res) => {
        if (req.method === 'GET' && req.url === '/.well-known/oauth-authorization-server') {
            const metadata = {
                issuer: fireflyUrl,
                authorization_endpoint: `${fireflyUrl}/oauth/authorize`,
                token_endpoint: `${fireflyUrl}/oauth/token`,
                response_types_supported: ['code'],
                grant_types_supported: ['authorization_code', 'refresh_token'],
                code_challenge_methods_supported: ['S256'],
                client_id: oauthClientId,
            };
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(metadata));
            return;
        }
        const authHeader = req.headers['authorization'];
        const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
        if (!token) {
            res.writeHead(401, {
                'WWW-Authenticate': 'Bearer resource="Firefly III MCP"',
                'Content-Type': 'application/json',
            });
            res.end(JSON.stringify({ error: 'unauthorized', error_description: 'Bearer token required' }));
            return;
        }
        await requestContext.run({ token }, () => mcpHandler(req, res));
    };
}
async function tryListen(httpServer, host, port) {
    return new Promise((resolve, reject) => {
        httpServer.once('error', reject);
        httpServer.listen(port, host, () => {
            httpServer.removeListener('error', reject);
            resolve();
        });
    });
}
export async function startHttpServer(server, host, requestedPort, portWasExplicit, oauthClientId, fireflyUrl) {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    const oauthHandler = createOAuthHandler(fireflyUrl, oauthClientId, (req, res) => transport.handleRequest(req, res));
    const httpServer = http.createServer(async (req, res) => {
        try {
            await oauthHandler(req, res);
        }
        catch (err) {
            process.stderr.write(`HTTP request handler error: ${err}\n`);
            if (!res.headersSent) {
                res.writeHead(500);
                res.end('Internal server error');
            }
        }
    });
    let port = requestedPort;
    let moved = false;
    while (true) {
        try {
            await tryListen(httpServer, host, port);
            break;
        }
        catch (err) {
            const nodeErr = err;
            if (nodeErr.code !== 'EADDRINUSE') {
                throw err;
            }
            if (portWasExplicit) {
                process.stderr.write(`Error: Port ${port} on ${host} is already in use. Choose a different port with --port.\n`);
                process.exit(1);
            }
            const attempted = port - requestedPort;
            if (attempted >= 10) {
                process.stderr.write(`Error: Ports ${requestedPort}–${requestedPort + 10} on ${host} are all in use. Specify an available port with --port.\n`);
                process.exit(1);
            }
            port++;
            moved = true;
        }
    }
    httpServer.on('error', (err) => {
        process.stderr.write(`HTTP server error: ${err}\n`);
    });
    await server.connect(transport);
    process.stdout.write(`Firefly III MCP server listening on http://${host}:${port}\n`);
    if (moved) {
        process.stdout.write(`(port ${requestedPort} was in use — moved up automatically)\n`);
    }
}
//# sourceMappingURL=http.js.map