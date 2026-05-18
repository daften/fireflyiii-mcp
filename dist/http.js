import * as http from 'node:http';
import { AsyncLocalStorage } from 'node:async_hooks';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
export const requestContext = new AsyncLocalStorage();
export function createOAuthHandler(fireflyUrl, oauthClientId, mcpHandler) {
    let pendingClientRedirectUri = null;
    return async (req, res) => {
        if (req.method === 'GET' && req.url === '/.well-known/oauth-authorization-server') {
            const host = req.headers['host'] ?? '127.0.0.1:3000';
            const metadata = {
                issuer: fireflyUrl,
                authorization_endpoint: `${fireflyUrl}/oauth/authorize`,
                token_endpoint: `${fireflyUrl}/oauth/token`,
                registration_endpoint: `http://${host}/oauth/register`,
                response_types_supported: ['code'],
                grant_types_supported: ['authorization_code', 'refresh_token'],
                code_challenge_methods_supported: ['S256'],
                client_id: oauthClientId,
            };
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(metadata));
            return;
        }
        // Dynamic client registration stub (RFC 7591) — no auth required.
        // Firefly III does not support dynamic registration, so we handle it here.
        // Always returns the pre-configured client_id; echoes back redirect_uris from the request.
        if (req.method === 'POST' && req.url === '/oauth/register') {
            const body = await new Promise((resolve, reject) => {
                let data = '';
                req.on('data', (chunk) => { data += chunk.toString(); });
                req.on('end', () => resolve(data));
                req.on('error', reject);
            });
            const host = req.headers['host'] ?? '127.0.0.1:3000';
            let redirectUris = [];
            try {
                const parsed = JSON.parse(body);
                if (Array.isArray(parsed['redirect_uris'])) {
                    redirectUris = parsed['redirect_uris'];
                }
            }
            catch {
                // no body or invalid JSON — return empty redirect_uris
            }
            // Store Claude's real redirect URI and tell it to use our stable proxy instead.
            // Firefly III does exact URI matching, so Claude's dynamic-port callback would never match.
            if (redirectUris[0]) {
                pendingClientRedirectUri = redirectUris[0];
            }
            const stableCallbackUri = `http://${host}/oauth/callback`;
            const registration = {
                client_id: oauthClientId,
                client_id_issued_at: Math.floor(Date.now() / 1000),
                client_secret_expires_at: 0,
                token_endpoint_auth_method: 'none',
                grant_types: ['authorization_code', 'refresh_token'],
                response_types: ['code'],
                redirect_uris: redirectUris.length > 0 ? [stableCallbackUri] : [],
            };
            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(registration));
            return;
        }
        // Callback proxy: Firefly III redirects here after authorization.
        // We forward the code + state to Claude's real (dynamic-port) callback URL.
        if (req.method === 'GET' && req.url?.startsWith('/oauth/callback')) {
            const incomingUrl = new URL(req.url, `http://${req.headers['host'] ?? 'localhost'}`);
            if (!pendingClientRedirectUri) {
                res.writeHead(400, { 'Content-Type': 'text/plain' });
                res.end('No pending OAuth flow. Start authorization from your MCP client.');
                return;
            }
            const target = new URL(pendingClientRedirectUri);
            incomingUrl.searchParams.forEach((value, key) => target.searchParams.set(key, value));
            pendingClientRedirectUri = null;
            res.writeHead(302, { Location: target.toString() });
            res.end();
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