import * as http from 'node:http';
import { AsyncLocalStorage } from 'node:async_hooks';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
export const requestContext = new AsyncLocalStorage();
function readBody(req) {
    return new Promise((resolve, reject) => {
        let data = '';
        req.on('data', (chunk) => { data += chunk.toString(); });
        req.on('end', () => resolve(data));
        req.on('error', reject);
    });
}
export function createOAuthHandler(fireflyUrl, oauthClientId, mcpHandler) {
    // Stores Claude's dynamic callback URL across the authorize → callback → token flow.
    let pendingClientRedirectUri = null;
    return async (req, res) => {
        const baseUrl = (process.env['MCP_BASE_URL']?.replace(/\/$/, '') || null) ??
            `http://${req.headers['host'] ?? '127.0.0.1:3000'}`;
        if (req.method === 'GET' && req.url === '/.well-known/oauth-authorization-server') {
            const metadata = {
                issuer: fireflyUrl,
                // Point both endpoints at our proxy so we can substitute redirect_uri transparently.
                authorization_endpoint: `${baseUrl}/oauth/authorize`,
                token_endpoint: `${baseUrl}/oauth/token`,
                registration_endpoint: `${baseUrl}/oauth/register`,
                response_types_supported: ['code'],
                grant_types_supported: ['authorization_code', 'refresh_token'],
                code_challenge_methods_supported: ['S256'],
                client_id: oauthClientId,
            };
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(metadata));
            return;
        }
        // Authorization proxy — no auth required.
        // Claude sends its dynamic redirect_uri here. We store it, substitute our stable callback URL,
        // then 302 the browser to Firefly III's real authorize endpoint.
        // Firefly III does exact URI matching, so substituting here is the only way to make it work
        // without updating the registered URI on every new Claude session.
        if (req.method === 'GET' && req.url?.startsWith('/oauth/authorize')) {
            const incomingUrl = new URL(req.url, baseUrl);
            const clientRedirectUri = incomingUrl.searchParams.get('redirect_uri');
            if (clientRedirectUri) {
                pendingClientRedirectUri = clientRedirectUri;
            }
            const fireflyAuthUrl = new URL(`${fireflyUrl}/oauth/authorize`);
            incomingUrl.searchParams.forEach((value, key) => {
                fireflyAuthUrl.searchParams.set(key, key === 'redirect_uri' ? `${baseUrl}/oauth/callback` : value);
            });
            res.writeHead(302, { Location: fireflyAuthUrl.toString() });
            res.end();
            return;
        }
        // Dynamic client registration stub (RFC 7591) — no auth required.
        // Firefly III does not support dynamic registration, so we handle it here.
        if (req.method === 'POST' && req.url === '/oauth/register') {
            const body = await readBody(req);
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
            if (redirectUris[0]) {
                pendingClientRedirectUri = redirectUris[0];
            }
            const registration = {
                client_id: oauthClientId,
                client_id_issued_at: Math.floor(Date.now() / 1000),
                client_secret_expires_at: 0,
                token_endpoint_auth_method: 'none',
                grant_types: ['authorization_code', 'refresh_token'],
                response_types: ['code'],
                redirect_uris: redirectUris.length > 0 ? [`${baseUrl}/oauth/callback`] : [],
            };
            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(registration));
            return;
        }
        // Token proxy — no auth required.
        // Claude sends its dynamic redirect_uri in the token exchange, but Firefly III validates that
        // it matches the one used in the authorization request (our stable callback URL). Substitute here.
        if (req.method === 'POST' && req.url === '/oauth/token') {
            const body = await readBody(req);
            const params = new URLSearchParams(body);
            if (params.get('redirect_uri')) {
                params.set('redirect_uri', `${baseUrl}/oauth/callback`);
            }
            const tokenResponse = await fetch(`${fireflyUrl}/oauth/token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: params.toString(),
            });
            const responseBody = await tokenResponse.text();
            const contentType = tokenResponse.headers.get('Content-Type') ?? 'application/json';
            res.writeHead(tokenResponse.status, { 'Content-Type': contentType });
            res.end(responseBody);
            return;
        }
        // Callback proxy — no auth required.
        // Firefly III redirects here after authorization. We forward code+state to Claude's actual
        // dynamic-port callback so Claude can complete the token exchange.
        if (req.method === 'GET' && req.url?.startsWith('/oauth/callback')) {
            const incomingUrl = new URL(req.url, baseUrl);
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
export async function startHttpServer(createMcpServer, host, requestedPort, portWasExplicit, oauthClientId, fireflyUrl) {
    // Stateless HTTP transport requires a fresh transport + server per request.
    // The WebStandardStreamableHTTPServerTransport throws if reused across requests.
    const oauthHandler = createOAuthHandler(fireflyUrl, oauthClientId, async (req, res) => {
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
        const server = createMcpServer();
        await server.connect(transport);
        await transport.handleRequest(req, res);
    });
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
    process.stdout.write(`Firefly III MCP server listening on http://${host}:${port}\n`);
    if (moved) {
        process.stdout.write(`(port ${requestedPort} was in use — moved up automatically)\n`);
    }
}
//# sourceMappingURL=http.js.map