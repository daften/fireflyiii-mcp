import * as http from 'node:http';
import { AsyncLocalStorage } from 'node:async_hooks';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

interface RequestContext {
  token: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let data = '';
    req.on('data', (chunk: Buffer) => { data += chunk.toString(); });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

const LOOPBACK_REDIRECT_PREFIXES = ['http://127.0.0.1:', 'http://localhost:', 'http://[::1]:'];

function isRedirectUriAllowed(uri: string): boolean {
  if (LOOPBACK_REDIRECT_PREFIXES.some((p) => uri.startsWith(p))) return true;
  const extra = process.env['MCP_ALLOWED_REDIRECT_PREFIXES']?.trim();
  if (!extra) return false;
  return extra.split(',').map((s) => s.trim()).some((p) => p && uri.startsWith(p));
}

export function createOAuthHandler(
  fireflyUrl: string,
  oauthClientId: string,
  mcpHandler: (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>
): (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void> {
  const FLOW_TTL_MS = 10 * 60 * 1000;
  const pendingFlows = new Map<string, { redirectUri: string; createdAt: number }>();

  function evictExpiredFlows(): void {
    const now = Date.now();
    for (const [key, entry] of pendingFlows) {
      if (now - entry.createdAt > FLOW_TTL_MS) pendingFlows.delete(key);
    }
  }

  return async (req, res) => {
    const baseUrl =
      (process.env['MCP_BASE_URL']?.trim().replace(/\/$/, '') || null) ??
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
      if (clientRedirectUri && !isRedirectUriAllowed(clientRedirectUri)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_redirect_uri', error_description: 'redirect_uri is not allowed' }));
        return;
      }
      const state = incomingUrl.searchParams.get('state');
      if (clientRedirectUri && state) {
        evictExpiredFlows();
        pendingFlows.set(state, { redirectUri: clientRedirectUri, createdAt: Date.now() });
      }
      const fireflyAuthUrl = new URL(`${fireflyUrl}/oauth/authorize`);
      incomingUrl.searchParams.forEach((value, key) => {
        fireflyAuthUrl.searchParams.set(
          key,
          key === 'redirect_uri' ? `${baseUrl}/oauth/callback` : value
        );
      });
      res.writeHead(302, { Location: fireflyAuthUrl.toString() });
      res.end();
      return;
    }

    // Dynamic client registration stub (RFC 7591) — no auth required.
    // Firefly III does not support dynamic registration, so we handle it here.
    if (req.method === 'POST' && req.url === '/oauth/register') {
      const body = await readBody(req);
      let redirectUris: string[] = [];
      try {
        const parsed = JSON.parse(body) as Record<string, unknown>;
        if (Array.isArray(parsed['redirect_uris'])) {
          redirectUris = parsed['redirect_uris'] as string[];
        }
      } catch {
        // no body or invalid JSON — return empty redirect_uris
      }
      if (redirectUris[0] && !isRedirectUriAllowed(redirectUris[0])) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_redirect_uri', error_description: 'redirect_uri is not allowed' }));
        return;
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
      const state = incomingUrl.searchParams.get('state');
      if (!state) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('No pending OAuth flow for this state. Start authorization from your MCP client.');
        return;
      }
      const entry = pendingFlows.get(state);
      const isExpired = entry ? Date.now() - entry.createdAt > FLOW_TTL_MS : false;
      if (!entry || isExpired) {
        evictExpiredFlows();
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end(
          isExpired
            ? 'OAuth flow expired. Start authorization again from your MCP client.'
            : 'No pending OAuth flow for this state. Start authorization from your MCP client.'
        );
        return;
      }
      pendingFlows.delete(state);
      const target = new URL(entry.redirectUri);
      incomingUrl.searchParams.forEach((value, key) => target.searchParams.set(key, value));
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

export function classifyHost(host: string): 'loopback' | 'non-loopback' {
  return ['127.0.0.1', '::1', 'localhost'].includes(host) ? 'loopback' : 'non-loopback';
}

async function tryListen(httpServer: http.Server, host: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, host, () => {
      httpServer.removeListener('error', reject);
      resolve();
    });
  });
}

export async function startHttpServer(
  createMcpServer: () => McpServer,
  host: string,
  requestedPort: number,
  portWasExplicit: boolean,
  oauthClientId: string,
  fireflyUrl: string
): Promise<void> {
  if (!process.env['MCP_BASE_URL']?.trim()) {
    if (classifyHost(host) === 'non-loopback') {
      process.stderr.write(
        `Error: MCP_BASE_URL must be set when binding to a non-loopback interface (--host ${host}).\n` +
        `Without it, the Host header controls OAuth callback URLs — an attacker can forge it.\n` +
        `Set MCP_BASE_URL to the public URL of this server, e.g.:\n` +
        `  MCP_BASE_URL=https://mcp.example.com\n`
      );
      process.exit(1);
    } else {
      process.stderr.write(
        `Warning: MCP_BASE_URL is not set. OAuth URLs use the Host header — safe for local use only.\n`
      );
    }
  }

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
    } catch (err) {
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
    } catch (err: unknown) {
      const nodeErr = err as NodeJS.ErrnoException;
      if (nodeErr.code !== 'EADDRINUSE') {
        throw err;
      }
      if (portWasExplicit) {
        process.stderr.write(`Error: Port ${port} on ${host} is already in use. Choose a different port with --port.\n`);
        process.exit(1);
      }
      const attempted = port - requestedPort;
      if (attempted >= 10) {
        process.stderr.write(
          `Error: Ports ${requestedPort}–${requestedPort + 10} on ${host} are all in use. Specify an available port with --port.\n`
        );
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
