import { AsyncLocalStorage } from 'node:async_hooks';
import * as http from 'node:http';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

interface RequestContext {
  token: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let data = '';
    req.on('data', (chunk: Buffer) => {
      data += chunk.toString();
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

// Hostnames only — matched against parsed.hostname, never against the raw string.
// Note new URL('http://[::1]:3000/').hostname is '[::1]' WITH brackets in Node.
const LOOPBACK_REDIRECT_HOSTNAMES = ['127.0.0.1', 'localhost', '[::1]'];

// Claude's hosted surfaces (claude.ai web, Desktop, mobile, Cowork) all complete
// OAuth against this single callback. Matched exactly on origin+pathname — a prefix
// match would also admit https://claude.ai/api/mcp/auth_callbackEVIL.
const CLAUDE_HOSTED_REDIRECT_URI = 'https://claude.ai/api/mcp/auth_callback';

// Matching is done on components of the PARSED URL, never on the raw string. A raw
// `uri.startsWith(...)` check is unsafe: URL userinfo lets the raw string lie about
// the real host, e.g. 'http://127.0.0.1:@evil.example.com/steal' starts with
// 'http://127.0.0.1:' but its parsed origin is 'http://evil.example.com'. Such a URI
// reached /oauth/callback, which redirected the authorization code to the attacker.
// Rejecting any URI that carries userinfo closes that bypass for every branch below,
// including the env-var prefix branch (an entry like 'https://my-client.example.com'
// would otherwise also match 'https://my-client.example.com@evil.example.com/').
// Do not reintroduce a startsWith(rawUri) check.
//
// A *bare-origin* prefix — one with nothing after the host, e.g. 'https://example.com'
// — needs an extra boundary on top of that: raw startsWith also matches
// 'https://example.com.attacker.test/steal', since the hostname is merely extended
// (no userinfo involved). Bare-origin prefixes are therefore matched by comparing the
// *parsed* URI's origin to the prefix, never by raw startsWith. A prefix with a path, a
// trailing slash, or one that doesn't parse as a URL (e.g. the port-prefix form
// 'http://192.168.1.10:') keeps the raw startsWith behavior, which is safe there: a `/`
// or `:` right after the host already delimits it, so the hostname cannot be extended.
function isRedirectUriAllowed(uri: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return false;
  }
  if (parsed.username !== '' || parsed.password !== '') return false;
  if (parsed.protocol === 'http:' && LOOPBACK_REDIRECT_HOSTNAMES.includes(parsed.hostname)) return true;
  if (`${parsed.origin}${parsed.pathname}` === CLAUDE_HOSTED_REDIRECT_URI) return true;
  const extra = process.env.MCP_ALLOWED_REDIRECT_PREFIXES?.trim();
  if (!extra) return false;
  return extra
    .split(',')
    .map((s) => s.trim())
    .some((p) => {
      if (!p) return false;
      let parsedPrefix: URL;
      try {
        parsedPrefix = new URL(p);
      } catch {
        return uri.startsWith(p);
      }
      if (parsedPrefix.origin === p) return parsed.origin === p;
      return uri.startsWith(p);
    });
}

// Both /oauth/authorize and /oauth/register reject with the same shape. The error
// code stays RFC-compliant; the description names the escape hatch so an operator
// can act on it without reading the source.
function rejectRedirectUri(res: http.ServerResponse): void {
  res.writeHead(400, { 'Content-Type': 'application/json' });
  res.end(
    JSON.stringify({
      error: 'invalid_redirect_uri',
      error_description:
        "redirect_uri is not allowed. Loopback addresses and Claude's hosted callback are allowed by default; " +
        'add any other prefix to MCP_ALLOWED_REDIRECT_PREFIXES (comma-separated).',
    }),
  );
}

// Mirrors the route matching used by the branches below — kept in sync so that
// disabling OAuth (no client ID) cleanly 404s the same surface it would otherwise serve.
function isOAuthProxyPath(url: string): boolean {
  return (
    url === '/.well-known/oauth-authorization-server' ||
    url === '/.well-known/oauth-protected-resource' ||
    url.startsWith('/oauth/authorize') ||
    url === '/oauth/register' ||
    url === '/oauth/token' ||
    url.startsWith('/oauth/callback')
  );
}

export function createOAuthHandler(
  fireflyUrl: string,
  oauthClientId: string | undefined,
  mcpHandler: (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>,
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
    // Liveness probe — no auth, mode-agnostic. Always 200 whether OAuth is
    // enabled or not, so container/orchestrator health checks don't depend on
    // the OAuth surface (which 404s in PAT-only mode).
    if ((req.method === 'GET' || req.method === 'HEAD') && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ status: 'ok' }));
      return;
    }

    const baseUrl =
      (process.env.MCP_BASE_URL?.trim().replace(/\/$/, '') || null) ?? `http://${req.headers.host ?? '127.0.0.1:3000'}`;

    // PAT-only mode (no FIREFLY_OAUTH_CLIENT_ID): the OAuth proxy surface isn't
    // backed by a real client, so report it as absent rather than serving a
    // half-working flow. Clients fall back to a manually configured Bearer token.
    if (!oauthClientId && req.url && isOAuthProxyPath(req.url)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'not_found',
          error_description: 'OAuth is not enabled on this server. Authenticate with a Bearer token instead.',
        }),
      );
      return;
    }

    // RFC 9728 protected resource metadata — no auth required.
    // Claude's connector flow starts here: it reads the 401 challenge, fetches this
    // document to learn which authorization server guards the resource, then fetches
    // that server's own metadata. `resource` must match the URL the user typed into
    // Claude exactly, which is what makes MCP_BASE_URL load-bearing for connectors.
    if (req.method === 'GET' && req.url === '/.well-known/oauth-protected-resource') {
      const metadata = {
        resource: baseUrl,
        authorization_servers: [baseUrl],
        bearer_methods_supported: ['header'],
      };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(metadata));
      return;
    }

    if (req.method === 'GET' && req.url === '/.well-known/oauth-authorization-server') {
      const metadata = {
        issuer: baseUrl,
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
        rejectRedirectUri(res);
        return;
      }
      const state = incomingUrl.searchParams.get('state');
      if (clientRedirectUri && state) {
        evictExpiredFlows();
        pendingFlows.set(state, { redirectUri: clientRedirectUri, createdAt: Date.now() });
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
      let redirectUris: string[] = [];
      try {
        const parsed = JSON.parse(body) as Record<string, unknown>;
        if (Array.isArray(parsed.redirect_uris)) {
          redirectUris = parsed.redirect_uris as string[];
        }
      } catch {
        // no body or invalid JSON — return empty redirect_uris
      }
      if (redirectUris.some((uri) => !isRedirectUriAllowed(uri))) {
        rejectRedirectUri(res);
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
      const tokenController = new AbortController();
      const tokenTimer = setTimeout(() => tokenController.abort(), 30_000);
      let tokenResponse: Response;
      try {
        tokenResponse = await fetch(`${fireflyUrl}/oauth/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString(),
          signal: tokenController.signal,
        });
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          res.writeHead(504, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'timeout' }));
          return;
        }
        throw err;
      } finally {
        clearTimeout(tokenTimer);
      }
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
            : 'No pending OAuth flow for this state. Start authorization from your MCP client.',
        );
        return;
      }
      pendingFlows.delete(state);
      const target = new URL(entry.redirectUri);
      incomingUrl.searchParams.forEach((value, key) => {
        target.searchParams.set(key, value);
      });
      res.writeHead(302, { Location: target.toString() });
      res.end();
      return;
    }

    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
      // RFC 9728 §5.1: the resource_metadata parameter is how a client discovers
      // where to authenticate. PAT-only mode serves no metadata document, so it
      // sends a bare challenge rather than pointing at a 404.
      const challenge = oauthClientId
        ? `Bearer resource_metadata="${baseUrl}/.well-known/oauth-protected-resource"`
        : 'Bearer';
      res.writeHead(401, {
        'WWW-Authenticate': challenge,
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

export async function tryListen(httpServer: http.Server, host: string, port: number): Promise<void> {
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
  oauthClientId: string | undefined,
  fireflyUrl: string,
  tryListenFn: (server: http.Server, host: string, port: number) => Promise<void> = tryListen,
): Promise<void> {
  // MCP_BASE_URL only matters for constructing OAuth redirect URIs — irrelevant
  // in PAT-only mode (no oauthClientId), since no OAuth surface is served.
  if (oauthClientId && !process.env.MCP_BASE_URL?.trim()) {
    if (classifyHost(host) === 'non-loopback') {
      process.stderr.write(
        `Error: MCP_BASE_URL must be set when binding to a non-loopback interface (--host ${host}).\n` +
          `Without it, the Host header controls OAuth callback URLs — an attacker can forge it.\n` +
          `Set MCP_BASE_URL to the public URL of this server, e.g.:\n` +
          `  MCP_BASE_URL=https://mcp.example.com\n`,
      );
      process.exit(1);
    } else {
      process.stderr.write(
        `Warning: MCP_BASE_URL is not set. OAuth URLs use the Host header — safe for local use only.\n`,
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
      await tryListenFn(httpServer, host, port);
      break;
    } catch (err: unknown) {
      const nodeErr = err as NodeJS.ErrnoException;
      if (nodeErr.code !== 'EADDRINUSE') {
        throw err;
      }
      if (portWasExplicit) {
        process.stderr.write(
          `Error: Port ${port} on ${host} is already in use. Choose a different port with --port.\n`,
        );
        process.exit(1);
      }
      const attempted = port - requestedPort;
      if (attempted >= 10) {
        process.stderr.write(
          `Error: Ports ${requestedPort}–${requestedPort + 10} on ${host} are all in use. Specify an available port with --port.\n`,
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

  process.stdout.write(`MCP server for Firefly III listening on http://${host}:${port}\n`);
  if (moved) {
    process.stdout.write(`(port ${requestedPort} was in use — moved up automatically)\n`);
  }
}
