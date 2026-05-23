import type * as http from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { classifyHost, createOAuthHandler, requestContext, startHttpServer } from '../http.js';

type MockRequest = {
  method: string;
  url: string;
  headers: Record<string, string>;
  on: (event: string, listener: (...args: unknown[]) => void) => MockRequest;
};

type MockResponse = {
  statusCode: number;
  writtenHeaders: Record<string, string | string[]>;
  body: string;
  headersSent: boolean;
  writeHead: (code: number, hdrs?: Record<string, string>) => void;
  end: (data?: string) => void;
};

function mockReq(method: string, url: string, headers: Record<string, string> = {}, body = ''): MockRequest {
  const req: MockRequest = {
    method,
    url,
    headers,
    on(event: string, listener: (...args: unknown[]) => void) {
      if (event === 'data' && body) listener(Buffer.from(body));
      if (event === 'end') listener();
      return req;
    },
  };
  return req;
}

function mockRes(): MockResponse {
  const result: MockResponse = {
    statusCode: 200,
    writtenHeaders: {},
    body: '',
    headersSent: false,
    writeHead(code: number, hdrs?: Record<string, string>) {
      result.statusCode = code;
      if (hdrs) Object.assign(result.writtenHeaders, hdrs);
      result.headersSent = true;
    },
    end(data?: string) {
      if (data) result.body = data;
    },
  };
  return result;
}

describe('createOAuthHandler — metadata endpoint', () => {
  it('returns OAuth metadata JSON for GET /.well-known/oauth-authorization-server', async () => {
    const mcpHandler = vi.fn();
    const handler = createOAuthHandler(
      'https://firefly.example.com',
      'client-id-123',
      mcpHandler as unknown as (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>,
    );

    const req = mockReq('GET', '/.well-known/oauth-authorization-server', { host: '127.0.0.1:3000' });
    const res = mockRes();

    await handler(req as http.IncomingMessage, res as unknown as http.ServerResponse);

    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body) as Record<string, unknown>;
    expect(parsed.issuer).toBe('http://127.0.0.1:3000');
    // Both OAuth endpoints are served by our proxy so we can substitute redirect_uri transparently.
    expect(parsed.authorization_endpoint).toBe('http://127.0.0.1:3000/oauth/authorize');
    expect(parsed.token_endpoint).toBe('http://127.0.0.1:3000/oauth/token');
    expect(parsed.registration_endpoint).toBe('http://127.0.0.1:3000/oauth/register');
    expect(parsed.response_types_supported).toEqual(['code']);
    expect(parsed.grant_types_supported).toEqual(['authorization_code', 'refresh_token']);
    expect(parsed.code_challenge_methods_supported).toEqual(['S256']);
    expect(parsed.client_id).toBe('client-id-123');
    expect(mcpHandler).not.toHaveBeenCalled();
  });

  it('does not require Authorization header for metadata endpoint', async () => {
    const mcpHandler = vi.fn();
    const handler = createOAuthHandler(
      'https://firefly.example.com',
      'client-id-123',
      mcpHandler as unknown as (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>,
    );

    const req = mockReq('GET', '/.well-known/oauth-authorization-server');
    const res = mockRes();

    await handler(req as http.IncomingMessage, res as unknown as http.ServerResponse);

    expect(res.statusCode).toBe(200);
  });
});

describe('createOAuthHandler — authorize proxy', () => {
  it('302s to Firefly III with stable redirect_uri substituted', async () => {
    const mcpHandler = vi.fn();
    const handler = createOAuthHandler(
      'https://firefly.example.com',
      'client-id-123',
      mcpHandler as unknown as (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>,
    );

    const req = mockReq(
      'GET',
      '/oauth/authorize?response_type=code&client_id=client-id-123&redirect_uri=http%3A%2F%2Flocalhost%3A9999%2Fcallback&state=abc&code_challenge=xyz&code_challenge_method=S256',
      { host: '127.0.0.1:3000' },
    );
    const res = mockRes();

    await handler(req as http.IncomingMessage, res as unknown as http.ServerResponse);

    expect(res.statusCode).toBe(302);
    const location = res.writtenHeaders.Location as string;
    const locationUrl = new URL(location);
    expect(`${locationUrl.origin}${locationUrl.pathname}`).toBe('https://firefly.example.com/oauth/authorize');
    expect(locationUrl.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:3000/oauth/callback');
    expect(locationUrl.searchParams.get('response_type')).toBe('code');
    expect(locationUrl.searchParams.get('code_challenge')).toBe('xyz');
    expect(locationUrl.searchParams.get('state')).toBe('abc');
    expect(mcpHandler).not.toHaveBeenCalled();
  });

  it('does not require Authorization header', async () => {
    const mcpHandler = vi.fn();
    const handler = createOAuthHandler(
      'https://firefly.example.com',
      'client-id-123',
      mcpHandler as unknown as (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>,
    );

    const req = mockReq('GET', '/oauth/authorize?redirect_uri=http%3A%2F%2Flocalhost%3A9999%2Fcallback', {
      host: '127.0.0.1:3000',
    });
    const res = mockRes();

    await handler(req as http.IncomingMessage, res as unknown as http.ServerResponse);

    expect(res.statusCode).toBe(302);
  });

  it('callback works after authorize proxy stores the client redirect URI', async () => {
    const mcpHandler = vi.fn();
    const handler = createOAuthHandler(
      'https://firefly.example.com',
      'client-id-123',
      mcpHandler as unknown as (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>,
    );

    // Step 1: authorize proxy stores Claude's real redirect URI
    const authReq = mockReq('GET', '/oauth/authorize?redirect_uri=http%3A%2F%2Flocalhost%3A9999%2Fcallback&state=abc', {
      host: '127.0.0.1:3000',
    });
    await handler(authReq as http.IncomingMessage, mockRes() as unknown as http.ServerResponse);

    // Step 2: Firefly III redirects to our stable callback
    const callbackReq = mockReq('GET', '/oauth/callback?code=authcode&state=abc', { host: '127.0.0.1:3000' });
    const callbackRes = mockRes();
    await handler(callbackReq as http.IncomingMessage, callbackRes as unknown as http.ServerResponse);

    expect(callbackRes.statusCode).toBe(302);
    const location = callbackRes.writtenHeaders.Location as string;
    expect(location).toContain('http://localhost:9999/callback');
    expect(location).toContain('code=authcode');
    expect(location).toContain('state=abc');
    expect(mcpHandler).not.toHaveBeenCalled();
  });
});

describe('createOAuthHandler — registration endpoint', () => {
  it('returns 201 with stable proxy callback URL instead of client redirect_uri', async () => {
    const mcpHandler = vi.fn();
    const handler = createOAuthHandler(
      'https://firefly.example.com',
      'client-id-123',
      mcpHandler as unknown as (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>,
    );

    const body = JSON.stringify({ redirect_uris: ['http://127.0.0.1:9999/callback'] });
    const req = mockReq('POST', '/oauth/register', { host: '127.0.0.1:3000' }, body);
    const res = mockRes();

    await handler(req as http.IncomingMessage, res as unknown as http.ServerResponse);

    expect(res.statusCode).toBe(201);
    const parsed = JSON.parse(res.body) as Record<string, unknown>;
    expect(parsed.client_id).toBe('client-id-123');
    expect(parsed.client_secret_expires_at).toBe(0);
    expect(parsed.token_endpoint_auth_method).toBe('none');
    expect(parsed.grant_types).toEqual(['authorization_code', 'refresh_token']);
    expect(parsed.response_types).toEqual(['code']);
    expect(parsed.redirect_uris).toEqual(['http://127.0.0.1:3000/oauth/callback']);
    expect(mcpHandler).not.toHaveBeenCalled();
  });

  it('returns empty redirect_uris when none provided in request', async () => {
    const mcpHandler = vi.fn();
    const handler = createOAuthHandler(
      'https://firefly.example.com',
      'client-id-123',
      mcpHandler as unknown as (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>,
    );

    const req = mockReq('POST', '/oauth/register');
    const res = mockRes();

    await handler(req as http.IncomingMessage, res as unknown as http.ServerResponse);

    expect(res.statusCode).toBe(201);
    const parsed = JSON.parse(res.body) as Record<string, unknown>;
    expect(parsed.redirect_uris).toEqual([]);
    expect(mcpHandler).not.toHaveBeenCalled();
  });

  it('does not require Authorization header for registration endpoint', async () => {
    const mcpHandler = vi.fn();
    const handler = createOAuthHandler(
      'https://firefly.example.com',
      'client-id-123',
      mcpHandler as unknown as (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>,
    );

    const req = mockReq('POST', '/oauth/register');
    const res = mockRes();

    await handler(req as http.IncomingMessage, res as unknown as http.ServerResponse);

    expect(res.statusCode).toBe(201);
    expect(mcpHandler).not.toHaveBeenCalled();
  });
});

describe('createOAuthHandler — token proxy', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('proxies POST /oauth/token to Firefly III substituting redirect_uri', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ access_token: 'at123', token_type: 'Bearer' })),
      headers: { get: (_: string) => 'application/json' },
    });
    vi.stubGlobal('fetch', mockFetch);

    const mcpHandler = vi.fn();
    const handler = createOAuthHandler(
      'https://firefly.example.com',
      'client-id-123',
      mcpHandler as unknown as (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>,
    );

    const body =
      'grant_type=authorization_code&code=abc123&redirect_uri=http%3A%2F%2Flocalhost%3A9999%2Fcallback&code_verifier=verifier123';
    const req = mockReq('POST', '/oauth/token', { host: '127.0.0.1:3000' }, body);
    const res = mockRes();

    await handler(req as http.IncomingMessage, res as unknown as http.ServerResponse);

    expect(res.statusCode).toBe(200);
    expect(mockFetch).toHaveBeenCalledOnce();
    const [fetchUrl, fetchInit] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(fetchUrl).toBe('https://firefly.example.com/oauth/token');
    const sentParams = new URLSearchParams(fetchInit.body as string);
    expect(sentParams.get('redirect_uri')).toBe('http://127.0.0.1:3000/oauth/callback');
    expect(sentParams.get('code')).toBe('abc123');
    expect(sentParams.get('code_verifier')).toBe('verifier123');
    expect(mcpHandler).not.toHaveBeenCalled();
  });

  it('does not require Authorization header for token endpoint', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        text: () => Promise.resolve('{}'),
        headers: { get: () => 'application/json' },
      }),
    );

    const mcpHandler = vi.fn();
    const handler = createOAuthHandler(
      'https://firefly.example.com',
      'client-id-123',
      mcpHandler as unknown as (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>,
    );

    const req = mockReq('POST', '/oauth/token', { host: '127.0.0.1:3000' }, 'grant_type=authorization_code');
    const res = mockRes();

    await handler(req as http.IncomingMessage, res as unknown as http.ServerResponse);

    expect(res.statusCode).toBe(200);
    expect(mcpHandler).not.toHaveBeenCalled();
  });

  it('forwards Firefly III error responses unchanged', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 401,
        text: () => Promise.resolve(JSON.stringify({ error: 'invalid_client' })),
        headers: { get: () => 'application/json' },
      }),
    );

    const mcpHandler = vi.fn();
    const handler = createOAuthHandler(
      'https://firefly.example.com',
      'client-id-123',
      mcpHandler as unknown as (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>,
    );

    const req = mockReq('POST', '/oauth/token', { host: '127.0.0.1:3000' }, 'grant_type=authorization_code');
    const res = mockRes();

    await handler(req as http.IncomingMessage, res as unknown as http.ServerResponse);

    expect(res.statusCode).toBe(401);
    expect(mcpHandler).not.toHaveBeenCalled();
  });

  it('returns 504 if Firefly III token endpoint does not respond within 30 seconds', async () => {
    vi.useFakeTimers();
    // Mock fetch that hangs until the AbortSignal fires, then rejects with AbortError
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
        return new Promise<never>((_resolve, reject) => {
          const signal = init?.signal as AbortSignal | undefined;
          if (signal) {
            signal.addEventListener('abort', () => {
              const err = new Error('The operation was aborted');
              err.name = 'AbortError';
              reject(err);
            });
          }
        });
      }),
    );

    const mcpHandler = vi.fn();
    const handler = createOAuthHandler(
      'https://firefly.example.com',
      'client-id-123',
      mcpHandler as unknown as (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>,
    );

    const req = mockReq('POST', '/oauth/token', { host: '127.0.0.1:3000' }, 'grant_type=authorization_code');
    const res = mockRes();

    const handlerPromise = handler(req as http.IncomingMessage, res as unknown as http.ServerResponse);

    // Advance fake timers by 30 seconds to trigger the abort
    await vi.advanceTimersByTimeAsync(30_000);
    await handlerPromise;

    expect(res.statusCode).toBe(504);
    const parsed = JSON.parse(res.body) as Record<string, unknown>;
    expect(parsed.error).toBe('timeout');

    vi.useRealTimers();
  });
});

describe('createOAuthHandler — OAuth callback proxy', () => {
  it('redirects to stored client URI with forwarded query params after authorize', async () => {
    const mcpHandler = vi.fn();
    const handler = createOAuthHandler(
      'https://firefly.example.com',
      'client-id-123',
      mcpHandler as unknown as (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>,
    );

    // Step 1: authorize proxy stores Claude's real redirect URI by state
    const authReq = mockReq('GET', '/oauth/authorize?redirect_uri=http%3A%2F%2F127.0.0.1%3A9999%2Fcallback&state=xyz', {
      host: '127.0.0.1:3000',
    });
    await handler(authReq as http.IncomingMessage, mockRes() as unknown as http.ServerResponse);

    // Step 2: Firefly III redirects to our stable callback
    const callbackReq = mockReq('GET', '/oauth/callback?code=auth-code-abc&state=xyz', { host: '127.0.0.1:3000' });
    const callbackRes = mockRes();
    await handler(callbackReq as http.IncomingMessage, callbackRes as unknown as http.ServerResponse);

    expect(callbackRes.statusCode).toBe(302);
    const location = callbackRes.writtenHeaders.Location as string;
    expect(location).toContain('http://127.0.0.1:9999/callback');
    expect(location).toContain('code=auth-code-abc');
    expect(location).toContain('state=xyz');
    expect(mcpHandler).not.toHaveBeenCalled();
  });

  it('returns 400 when callback arrives with no pending OAuth flow', async () => {
    const mcpHandler = vi.fn();
    const handler = createOAuthHandler(
      'https://firefly.example.com',
      'client-id-123',
      mcpHandler as unknown as (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>,
    );

    const req = mockReq('GET', '/oauth/callback?code=abc&state=xyz', { host: '127.0.0.1:3000' });
    const res = mockRes();

    await handler(req as http.IncomingMessage, res as unknown as http.ServerResponse);

    expect(res.statusCode).toBe(400);
    expect(mcpHandler).not.toHaveBeenCalled();
  });

  it('clears pending state entry after first callback use', async () => {
    const mcpHandler = vi.fn();
    const handler = createOAuthHandler(
      'https://firefly.example.com',
      'client-id-123',
      mcpHandler as unknown as (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>,
    );

    // Authorize to set pending entry for state=abc
    const authReq = mockReq('GET', '/oauth/authorize?redirect_uri=http%3A%2F%2F127.0.0.1%3A9999%2Fcallback&state=abc', {
      host: '127.0.0.1:3000',
    });
    await handler(authReq as http.IncomingMessage, mockRes() as unknown as http.ServerResponse);

    // First callback — should succeed
    const cb1Req = mockReq('GET', '/oauth/callback?code=code1&state=abc', { host: '127.0.0.1:3000' });
    const cb1Res = mockRes();
    await handler(cb1Req as http.IncomingMessage, cb1Res as unknown as http.ServerResponse);
    expect(cb1Res.statusCode).toBe(302);

    // Second callback with same state — entry is deleted, should 400
    const cb2Req = mockReq('GET', '/oauth/callback?code=code2&state=abc', { host: '127.0.0.1:3000' });
    const cb2Res = mockRes();
    await handler(cb2Req as http.IncomingMessage, cb2Res as unknown as http.ServerResponse);
    expect(cb2Res.statusCode).toBe(400);
  });
});

describe('createOAuthHandler — Bearer guard', () => {
  it('returns 401 with WWW-Authenticate when Authorization header is missing', async () => {
    const mcpHandler = vi.fn();
    const handler = createOAuthHandler(
      'https://firefly.example.com',
      'client-id-123',
      mcpHandler as unknown as (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>,
    );

    const req = mockReq('POST', '/mcp');
    const res = mockRes();

    await handler(req as http.IncomingMessage, res as unknown as http.ServerResponse);

    expect(res.statusCode).toBe(401);
    expect(res.writtenHeaders['WWW-Authenticate']).toBe('Bearer resource="Firefly III MCP"');
    expect(mcpHandler).not.toHaveBeenCalled();
  });

  it('returns 401 when Authorization header is not a Bearer token', async () => {
    const mcpHandler = vi.fn();
    const handler = createOAuthHandler(
      'https://firefly.example.com',
      'client-id-123',
      mcpHandler as unknown as (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>,
    );

    const req = mockReq('POST', '/mcp', { authorization: 'Basic dXNlcjpwYXNz' });
    const res = mockRes();

    await handler(req as http.IncomingMessage, res as unknown as http.ServerResponse);

    expect(res.statusCode).toBe(401);
    expect(mcpHandler).not.toHaveBeenCalled();
  });

  it('calls mcpHandler and stores Bearer token in requestContext', async () => {
    let capturedToken: string | undefined;
    const mcpHandler = vi.fn().mockImplementation(async () => {
      capturedToken = requestContext.getStore()?.token;
    });
    const handler = createOAuthHandler(
      'https://firefly.example.com',
      'client-id-123',
      mcpHandler as unknown as (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>,
    );

    const req = mockReq('POST', '/mcp', { authorization: 'Bearer test-token-xyz' });
    const res = mockRes();

    await handler(req as http.IncomingMessage, res as unknown as http.ServerResponse);

    expect(mcpHandler).toHaveBeenCalled();
    expect(capturedToken).toBe('test-token-xyz');
  });

  it('token in requestContext is not available outside the request', async () => {
    const mcpHandler = vi.fn().mockResolvedValue(undefined);
    const handler = createOAuthHandler(
      'https://firefly.example.com',
      'client-id-123',
      mcpHandler as unknown as (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>,
    );

    const req = mockReq('POST', '/mcp', { authorization: 'Bearer isolated-token' });
    const res = mockRes();

    await handler(req as http.IncomingMessage, res as unknown as http.ServerResponse);

    expect(requestContext.getStore()).toBeUndefined();
  });
});

describe('createOAuthHandler — concurrent OAuth flows (P0-1)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('routes two interleaved authorize→callback pairs to the correct redirect URI each time', async () => {
    const mcpHandler = vi.fn();
    const handler = createOAuthHandler(
      'https://firefly.example.com',
      'client-id-123',
      mcpHandler as unknown as (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>,
    );

    // Flow A: user A starts authorize with state=stateA
    await handler(
      mockReq('GET', '/oauth/authorize?redirect_uri=http%3A%2F%2F127.0.0.1%3A1111%2FcbA&state=stateA', {
        host: '127.0.0.1:3000',
      }) as http.IncomingMessage,
      mockRes() as unknown as http.ServerResponse,
    );

    // Flow B: user B starts authorize with state=stateB
    await handler(
      mockReq('GET', '/oauth/authorize?redirect_uri=http%3A%2F%2F127.0.0.1%3A2222%2FcbB&state=stateB', {
        host: '127.0.0.1:3000',
      }) as http.IncomingMessage,
      mockRes() as unknown as http.ServerResponse,
    );

    // Flow A completes its callback
    const resA = mockRes();
    await handler(
      mockReq('GET', '/oauth/callback?code=codeA&state=stateA', { host: '127.0.0.1:3000' }) as http.IncomingMessage,
      resA as unknown as http.ServerResponse,
    );
    expect(resA.statusCode).toBe(302);
    expect(resA.writtenHeaders.Location).toContain('127.0.0.1:1111/cbA');
    expect(resA.writtenHeaders.Location).not.toContain('2222');

    // Flow B completes its callback
    const resB = mockRes();
    await handler(
      mockReq('GET', '/oauth/callback?code=codeB&state=stateB', { host: '127.0.0.1:3000' }) as http.IncomingMessage,
      resB as unknown as http.ServerResponse,
    );
    expect(resB.statusCode).toBe(302);
    expect(resB.writtenHeaders.Location).toContain('127.0.0.1:2222/cbB');
    expect(resB.writtenHeaders.Location).not.toContain('1111');
  });

  it('returns 400 for callback with unknown state', async () => {
    const mcpHandler = vi.fn();
    const handler = createOAuthHandler(
      'https://firefly.example.com',
      'client-id-123',
      mcpHandler as unknown as (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>,
    );

    const req = mockReq('GET', '/oauth/callback?code=x&state=unknown-state', { host: '127.0.0.1:3000' });
    const res = mockRes();
    await handler(req as http.IncomingMessage, res as unknown as http.ServerResponse);

    expect(res.statusCode).toBe(400);
  });

  it('rejects callback for a state entry that has exceeded the 10-minute TTL', async () => {
    const mcpHandler = vi.fn();
    const handler = createOAuthHandler(
      'https://firefly.example.com',
      'client-id-123',
      mcpHandler as unknown as (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>,
    );

    const startTime = 1_000_000_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(startTime);

    // Authorize at startTime
    await handler(
      mockReq('GET', '/oauth/authorize?redirect_uri=http%3A%2F%2F127.0.0.1%3A9999%2Fcb&state=expiring', {
        host: '127.0.0.1:3000',
      }) as http.IncomingMessage,
      mockRes() as unknown as http.ServerResponse,
    );

    // Advance time by 11 minutes (past the 10-minute TTL)
    vi.spyOn(Date, 'now').mockReturnValue(startTime + 11 * 60 * 1000);

    const callbackReq = mockReq('GET', '/oauth/callback?code=x&state=expiring', { host: '127.0.0.1:3000' });
    const callbackRes = mockRes();
    await handler(callbackReq as http.IncomingMessage, callbackRes as unknown as http.ServerResponse);

    expect(callbackRes.statusCode).toBe(400);
  });
});

describe('createOAuthHandler — redirect URI allow-list (P0-2)', () => {
  afterEach(() => {
    delete process.env.MCP_ALLOWED_REDIRECT_PREFIXES;
  });

  it('rejects registration with a non-loopback redirect URI (400 invalid_redirect_uri)', async () => {
    const mcpHandler = vi.fn();
    const handler = createOAuthHandler(
      'https://firefly.example.com',
      'client-id-123',
      mcpHandler as unknown as (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>,
    );

    const body = JSON.stringify({ redirect_uris: ['http://evil.example.com/steal'] });
    const req = mockReq('POST', '/oauth/register', { host: '127.0.0.1:3000' }, body);
    const res = mockRes();

    await handler(req as http.IncomingMessage, res as unknown as http.ServerResponse);

    expect(res.statusCode).toBe(400);
    const parsed = JSON.parse(res.body) as Record<string, unknown>;
    expect(parsed.error).toBe('invalid_redirect_uri');
  });

  it('accepts registration with a loopback redirect URI (127.0.0.1)', async () => {
    const mcpHandler = vi.fn();
    const handler = createOAuthHandler(
      'https://firefly.example.com',
      'client-id-123',
      mcpHandler as unknown as (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>,
    );

    const body = JSON.stringify({ redirect_uris: ['http://127.0.0.1:54321/callback'] });
    const req = mockReq('POST', '/oauth/register', { host: '127.0.0.1:3000' }, body);
    const res = mockRes();

    await handler(req as http.IncomingMessage, res as unknown as http.ServerResponse);

    expect(res.statusCode).toBe(201);
  });

  it('accepts registration when redirect URI matches MCP_ALLOWED_REDIRECT_PREFIXES', async () => {
    process.env.MCP_ALLOWED_REDIRECT_PREFIXES = 'https://claude.ai';
    const mcpHandler = vi.fn();
    const handler = createOAuthHandler(
      'https://firefly.example.com',
      'client-id-123',
      mcpHandler as unknown as (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>,
    );

    const body = JSON.stringify({ redirect_uris: ['https://claude.ai/api/mcp/callback'] });
    const req = mockReq('POST', '/oauth/register', { host: '127.0.0.1:3000' }, body);
    const res = mockRes();

    await handler(req as http.IncomingMessage, res as unknown as http.ServerResponse);

    expect(res.statusCode).toBe(201);
  });

  it('rejects authorize with a non-loopback redirect URI (400 invalid_redirect_uri)', async () => {
    const mcpHandler = vi.fn();
    const handler = createOAuthHandler(
      'https://firefly.example.com',
      'client-id-123',
      mcpHandler as unknown as (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>,
    );

    const req = mockReq('GET', '/oauth/authorize?redirect_uri=http%3A%2F%2Fevil.example.com%2Fsteal&state=abc', {
      host: '127.0.0.1:3000',
    });
    const res = mockRes();

    await handler(req as http.IncomingMessage, res as unknown as http.ServerResponse);

    expect(res.statusCode).toBe(400);
    const parsed = JSON.parse(res.body) as Record<string, unknown>;
    expect(parsed.error).toBe('invalid_redirect_uri');
  });
});

describe('createOAuthHandler — MCP_BASE_URL override', () => {
  afterEach(() => {
    delete process.env.MCP_BASE_URL;
    vi.restoreAllMocks();
  });

  it('uses MCP_BASE_URL for OAuth metadata endpoints when set', async () => {
    process.env.MCP_BASE_URL = 'https://mcp.example.com';
    const mcpHandler = vi.fn();
    const handler = createOAuthHandler(
      'https://firefly.example.com',
      'client-id-123',
      mcpHandler as unknown as (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>,
    );

    const req = mockReq('GET', '/.well-known/oauth-authorization-server', { host: '127.0.0.1:3000' });
    const res = mockRes();

    await handler(req as http.IncomingMessage, res as unknown as http.ServerResponse);

    const parsed = JSON.parse(res.body) as Record<string, unknown>;
    expect(parsed.issuer).toBe('https://mcp.example.com');
    expect(parsed.authorization_endpoint).toBe('https://mcp.example.com/oauth/authorize');
    expect(parsed.token_endpoint).toBe('https://mcp.example.com/oauth/token');
    expect(parsed.registration_endpoint).toBe('https://mcp.example.com/oauth/register');
  });

  it('uses MCP_BASE_URL for stable redirect_uri in authorize proxy', async () => {
    process.env.MCP_BASE_URL = 'https://mcp.example.com';
    const mcpHandler = vi.fn();
    const handler = createOAuthHandler(
      'https://firefly.example.com',
      'client-id-123',
      mcpHandler as unknown as (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>,
    );

    const req = mockReq(
      'GET',
      '/oauth/authorize?response_type=code&redirect_uri=http%3A%2F%2Flocalhost%3A9999%2Fcallback',
      { host: '127.0.0.1:3000' },
    );
    const res = mockRes();

    await handler(req as http.IncomingMessage, res as unknown as http.ServerResponse);

    const location = res.writtenHeaders.Location as string;
    const locationUrl = new URL(location);
    expect(locationUrl.searchParams.get('redirect_uri')).toBe('https://mcp.example.com/oauth/callback');
  });

  it('strips trailing slash from MCP_BASE_URL', async () => {
    process.env.MCP_BASE_URL = 'https://mcp.example.com/';
    const mcpHandler = vi.fn();
    const handler = createOAuthHandler(
      'https://firefly.example.com',
      'client-id-123',
      mcpHandler as unknown as (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>,
    );

    const req = mockReq('GET', '/.well-known/oauth-authorization-server', { host: '127.0.0.1:3000' });
    const res = mockRes();

    await handler(req as http.IncomingMessage, res as unknown as http.ServerResponse);

    const parsed = JSON.parse(res.body) as Record<string, unknown>;
    expect(parsed.authorization_endpoint).toBe('https://mcp.example.com/oauth/authorize');
  });

  it('uses MCP_BASE_URL for redirect_uri in token proxy', async () => {
    process.env.MCP_BASE_URL = 'https://mcp.example.com';
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      text: () => Promise.resolve('{}'),
      headers: { get: () => 'application/json' },
    });
    vi.stubGlobal('fetch', mockFetch);

    const mcpHandler = vi.fn();
    const handler = createOAuthHandler(
      'https://firefly.example.com',
      'client-id-123',
      mcpHandler as unknown as (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>,
    );

    const body = 'grant_type=authorization_code&code=abc&redirect_uri=http%3A%2F%2Flocalhost%3A9999%2Fcallback';
    const req = mockReq('POST', '/oauth/token', { host: '127.0.0.1:3000' }, body);
    const res = mockRes();

    await handler(req as http.IncomingMessage, res as unknown as http.ServerResponse);

    const [, fetchInit] = mockFetch.mock.calls[0] as [string, RequestInit];
    const sentParams = new URLSearchParams(fetchInit.body as string);
    expect(sentParams.get('redirect_uri')).toBe('https://mcp.example.com/oauth/callback');
  });
});

describe('classifyHost', () => {
  it('classifies 127.0.0.1 as loopback', () => {
    expect(classifyHost('127.0.0.1')).toBe('loopback');
  });

  it('classifies ::1 as loopback', () => {
    expect(classifyHost('::1')).toBe('loopback');
  });

  it('classifies localhost as loopback', () => {
    expect(classifyHost('localhost')).toBe('loopback');
  });

  it('classifies 0.0.0.0 as non-loopback', () => {
    expect(classifyHost('0.0.0.0')).toBe('non-loopback');
  });

  it('classifies an arbitrary IP as non-loopback', () => {
    expect(classifyHost('192.168.1.10')).toBe('non-loopback');
  });

  it('classifies an arbitrary hostname as non-loopback', () => {
    expect(classifyHost('mcp.example.com')).toBe('non-loopback');
  });
});

describe('startHttpServer — EADDRINUSE port-bump behaviour', () => {
  beforeEach(() => {
    // Suppress the MCP_BASE_URL warning by providing a value
    process.env.MCP_BASE_URL = 'https://mcp.example.com';

    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    delete process.env.MCP_BASE_URL;
    vi.restoreAllMocks();
  });

  it('bumps port once on a single EADDRINUSE then resolves', async () => {
    const eaddrinuse = Object.assign(new Error('listen EADDRINUSE'), { code: 'EADDRINUSE' });
    let callCount = 0;
    const mockTryListen = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) throw eaddrinuse;
      // second call resolves — simulates successful bind on port+1
    });

    const createMcpServer = vi.fn().mockReturnValue({
      connect: vi.fn().mockResolvedValue(undefined),
    });

    await expect(
      startHttpServer(
        createMcpServer as unknown as () => import('@modelcontextprotocol/sdk/server/mcp.js').McpServer,
        '127.0.0.1',
        3000,
        false,
        'client-id',
        'https://firefly.example.com',
        mockTryListen,
      ),
    ).resolves.toBeUndefined();

    expect(mockTryListen).toHaveBeenCalledTimes(2);
    // First call with original port
    expect(mockTryListen.mock.calls[0]?.[2]).toBe(3000);
    // Second call with incremented port
    expect(mockTryListen.mock.calls[1]?.[2]).toBe(3001);

    // stdout should mention the port move
    const stdoutCalls = (process.stdout.write as ReturnType<typeof vi.fn>).mock.calls
      .map((c: unknown[]) => String(c[0]))
      .join('');
    expect(stdoutCalls).toMatch(/moved up|3001/);
  });

  it('calls process.exit(1) after 10 consecutive EADDRINUSE failures', async () => {
    const eaddrinuse = Object.assign(new Error('listen EADDRINUSE'), { code: 'EADDRINUSE' });
    const mockTryListen = vi.fn().mockRejectedValue(eaddrinuse);

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((_code?: number | string | null) => {
      throw new Error('process.exit called');
    });

    const createMcpServer = vi.fn().mockReturnValue({
      connect: vi.fn().mockResolvedValue(undefined),
    });

    await expect(
      startHttpServer(
        createMcpServer as unknown as () => import('@modelcontextprotocol/sdk/server/mcp.js').McpServer,
        '127.0.0.1',
        3000,
        false,
        'client-id',
        'https://firefly.example.com',
        mockTryListen,
      ),
    ).rejects.toThrow('process.exit called');

    expect(exitSpy).toHaveBeenCalledWith(1);
    // tryListen should have been called 11 times (ports 3000–3010, failing at 3010 triggers exit)
    expect(mockTryListen).toHaveBeenCalledTimes(11);
  });

  it('calls process.exit(1) on the first EADDRINUSE when portWasExplicit = true', async () => {
    const eaddrinuse = Object.assign(new Error('listen EADDRINUSE'), { code: 'EADDRINUSE' });
    const mockTryListen = vi.fn().mockRejectedValue(eaddrinuse);

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((_code?: number | string | null) => {
      throw new Error('process.exit called');
    });

    const createMcpServer = vi.fn().mockReturnValue({
      connect: vi.fn().mockResolvedValue(undefined),
    });

    await expect(
      startHttpServer(
        createMcpServer as unknown as () => import('@modelcontextprotocol/sdk/server/mcp.js').McpServer,
        '127.0.0.1',
        3000,
        true,
        'client-id',
        'https://firefly.example.com',
        mockTryListen,
      ),
    ).rejects.toThrow('process.exit called');

    expect(exitSpy).toHaveBeenCalledWith(1);
    // Should have only tried once since the port was explicit
    expect(mockTryListen).toHaveBeenCalledTimes(1);
  });
});
