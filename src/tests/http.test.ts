import { describe, it, expect, vi } from 'vitest';
import * as http from 'node:http';
import { createOAuthHandler, requestContext } from '../http.js';

function mockReq(
  method: string,
  url: string,
  headers: Record<string, string> = {}
): http.IncomingMessage {
  return { method, url, headers } as unknown as http.IncomingMessage;
}

function mockRes() {
  const result = {
    statusCode: 200,
    writtenHeaders: {} as Record<string, string | string[]>,
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
      mcpHandler as unknown as (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>
    );

    const req = mockReq('GET', '/.well-known/oauth-authorization-server');
    const res = mockRes();

    await handler(req as http.IncomingMessage, res as unknown as http.ServerResponse);

    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body) as Record<string, unknown>;
    expect(parsed['issuer']).toBe('https://firefly.example.com');
    expect(parsed['authorization_endpoint']).toBe('https://firefly.example.com/oauth/authorize');
    expect(parsed['token_endpoint']).toBe('https://firefly.example.com/oauth/token');
    expect(parsed['response_types_supported']).toEqual(['code']);
    expect(parsed['grant_types_supported']).toEqual(['authorization_code', 'refresh_token']);
    expect(parsed['code_challenge_methods_supported']).toEqual(['S256']);
    expect(parsed['client_id']).toBe('client-id-123');
    expect(mcpHandler).not.toHaveBeenCalled();
  });

  it('does not require Authorization header for metadata endpoint', async () => {
    const mcpHandler = vi.fn();
    const handler = createOAuthHandler(
      'https://firefly.example.com',
      'client-id-123',
      mcpHandler as unknown as (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>
    );

    const req = mockReq('GET', '/.well-known/oauth-authorization-server');
    const res = mockRes();

    await handler(req as http.IncomingMessage, res as unknown as http.ServerResponse);

    expect(res.statusCode).toBe(200);
  });
});

describe('createOAuthHandler — Bearer guard', () => {
  it('returns 401 with WWW-Authenticate when Authorization header is missing', async () => {
    const mcpHandler = vi.fn();
    const handler = createOAuthHandler(
      'https://firefly.example.com',
      'client-id-123',
      mcpHandler as unknown as (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>
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
      mcpHandler as unknown as (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>
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
      mcpHandler as unknown as (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>
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
      mcpHandler as unknown as (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>
    );

    const req = mockReq('POST', '/mcp', { authorization: 'Bearer isolated-token' });
    const res = mockRes();

    await handler(req as http.IncomingMessage, res as unknown as http.ServerResponse);

    expect(requestContext.getStore()).toBeUndefined();
  });
});
