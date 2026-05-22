import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FireflyClient, FireflyError, formatError } from '../client.js';

describe('FireflyClient', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends request with correct Authorization header', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [] }), { status: 200 })
    );
    const client = new FireflyClient('https://firefly.example.com', 'my-token');
    await client.get('/accounts');
    expect(fetch).toHaveBeenCalledWith(
      'https://firefly.example.com/api/v1/accounts',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer my-token' }),
      })
    );
  });

  it('strips trailing slash from base URL', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 })
    );
    const client = new FireflyClient('https://firefly.example.com/', 'token');
    await client.get('/accounts');
    const calledUrl = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(calledUrl).toBe('https://firefly.example.com/api/v1/accounts');
  });

  it('appends query params to URL', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 })
    );
    const client = new FireflyClient('https://firefly.example.com', 'token');
    await client.get('/accounts', { page: 2, limit: 10 });
    const calledUrl = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(calledUrl).toContain('page=2');
    expect(calledUrl).toContain('limit=10');
  });

  it('omits undefined query params', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 })
    );
    const client = new FireflyClient('https://firefly.example.com', 'token');
    await client.get('/accounts', { page: 1, type: undefined });
    const calledUrl = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(calledUrl).not.toContain('type');
  });

  it('throws FireflyError on 401', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }));
    const client = new FireflyClient('https://firefly.example.com', 'bad-token');
    await expect(client.get('/accounts')).rejects.toThrow(FireflyError);
  });

  it('throws on network error with descriptive message', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('fetch failed'));
    const client = new FireflyClient('https://firefly.example.com', 'token');
    await expect(client.get('/accounts')).rejects.toThrow('fetch failed');
  });

  it('throws FireflyError on 404', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('Not Found', { status: 404 }));
    const client = new FireflyClient('https://firefly.example.com', 'token');
    await expect(client.get('/accounts/999')).rejects.toThrow(FireflyError);
  });

  it('throws FireflyError with correct status on 500', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('Server Error', { status: 500 }));
    const client = new FireflyClient('https://firefly.example.com', 'token');
    const err = await client.get('/accounts').catch((e) => e);
    expect(err).toBeInstanceOf(FireflyError);
    expect((err as FireflyError).status).toBe(500);
  });

  it('calls token resolver function at request time', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [] }), { status: 200 })
    );
    const resolver = vi.fn().mockReturnValue('resolved-token');
    const client = new FireflyClient('https://firefly.example.com', resolver);
    await client.get('/accounts');
    expect(resolver).toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer resolved-token' }),
      })
    );
  });

  it('resolver is called on every request, not just construction', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }));
    let callCount = 0;
    const resolver = vi.fn().mockImplementation(() => `token-${++callCount}`);
    const client = new FireflyClient('https://firefly.example.com', resolver);
    await client.get('/accounts');
    await client.get('/budgets');
    expect(resolver).toHaveBeenCalledTimes(2);
    const firstCall = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    const secondCall = vi.mocked(fetch).mock.calls[1][1] as RequestInit;
    expect((firstCall.headers as Record<string, string>)['Authorization']).toBe('Bearer token-1');
    expect((secondCall.headers as Record<string, string>)['Authorization']).toBe('Bearer token-2');
  });

  it('appends repeated query params for number[] values in get()', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [] }), { status: 200 })
    );
    const client = new FireflyClient('https://firefly.example.com', 'token');
    await client.get('/rule-groups/1/test', { 'accounts[]': [1, 2, 3] });
    const calledUrl = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(calledUrl).toContain('accounts%5B%5D=1');
    expect(calledUrl).toContain('accounts%5B%5D=2');
    expect(calledUrl).toContain('accounts%5B%5D=3');
  });

  it('post() appends query params to URL when provided', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }));
    const client = new FireflyClient('https://firefly.example.com', 'token');
    await client.post('/rule-groups/1/trigger', undefined, { start: '2026-01-01', end: '2026-12-31' });
    const calledUrl = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(calledUrl).toContain('start=2026-01-01');
    expect(calledUrl).toContain('end=2026-12-31');
  });
});

describe('formatError', () => {
  it('returns auth message for 401', () => {
    const err = new FireflyError(401, 'https://example.com', 'Unauthorized');
    expect(formatError(err)).toBe('Authentication failed. Check your FIREFLY_TOKEN.');
  });

  it('returns not found message for 404', () => {
    const err = new FireflyError(404, 'https://example.com', 'Not Found');
    expect(formatError(err)).toBe('Resource not found.');
  });

  it('returns invalid params message for 422', () => {
    const err = new FireflyError(422, 'https://example.com', 'Unprocessable');
    expect(formatError(err)).toBe('Invalid request parameters.');
  });

  it('returns server error message for 500', () => {
    const err = new FireflyError(500, 'https://example.com', 'Internal Server Error');
    expect(formatError(err)).toBe('Firefly III server error. Try again later.');
  });

  it('returns message for generic Error', () => {
    expect(formatError(new Error('something went wrong'))).toBe('something went wrong');
  });

  it('returns fallback for unknown errors', () => {
    expect(formatError('oops')).toBe('An unknown error occurred.');
  });
});

describe('FireflyClient write methods', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('post() sends POST with JSON body and returns parsed response', async () => {
    const body = { name: 'Test' };
    const responseData = { data: { id: '1', type: 'accounts', attributes: { name: 'Test' }, links: {} } };
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(responseData), { status: 200 }));
    const client = new FireflyClient('https://firefly.example.com', 'token');
    const result = await client.post('/accounts', body);
    expect(fetch).toHaveBeenCalledWith(
      'https://firefly.example.com/api/v1/accounts',
      expect.objectContaining({ method: 'POST', body: JSON.stringify(body) })
    );
    expect(result).toEqual(responseData);
  });

  it('put() sends PUT with JSON body and returns parsed response', async () => {
    const body = { name: 'Updated' };
    const responseData = { data: { id: '1', type: 'accounts', attributes: { name: 'Updated' }, links: {} } };
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(responseData), { status: 200 }));
    const client = new FireflyClient('https://firefly.example.com', 'token');
    const result = await client.put('/accounts/1', body);
    expect(fetch).toHaveBeenCalledWith(
      'https://firefly.example.com/api/v1/accounts/1',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify(body) })
    );
    expect(result).toEqual(responseData);
  });

  it('delete() sends DELETE and returns undefined on 204', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }));
    const client = new FireflyClient('https://firefly.example.com', 'token');
    const result = await client.delete('/accounts/1');
    expect(fetch).toHaveBeenCalledWith(
      'https://firefly.example.com/api/v1/accounts/1',
      expect.objectContaining({ method: 'DELETE' })
    );
    expect(result).toBeUndefined();
  });

  it('post() throws FireflyError on 422', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('{"message":"invalid"}', { status: 422 }));
    const client = new FireflyClient('https://firefly.example.com', 'token');
    await expect(client.post('/accounts', {})).rejects.toThrow(FireflyError);
  });

  it('FireflyError exposes body string', () => {
    const err = new FireflyError(422, 'https://example.com', '{"message":"bad"}');
    expect(err.body).toBe('{"message":"bad"}');
  });

  it('put() throws FireflyError on non-2xx response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('Not Found', { status: 404 }));
    const client = new FireflyClient('https://firefly.example.com', 'token');
    await expect(client.put('/accounts/999', {})).rejects.toThrow(FireflyError);
  });

  it('delete() throws FireflyError on non-2xx response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('Not Found', { status: 404 }));
    const client = new FireflyClient('https://firefly.example.com', 'token');
    await expect(client.delete('/accounts/999')).rejects.toThrow(FireflyError);
  });

  it('postBinary() sends POST with octet-stream Content-Type and returns undefined on 204', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }));
    const client = new FireflyClient('https://firefly.example.com', 'token');
    const data = new Uint8Array([1, 2, 3]);
    const result = await client.postBinary('/attachments/1/upload', data);
    expect(fetch).toHaveBeenCalledWith(
      'https://firefly.example.com/api/v1/attachments/1/upload',
      expect.objectContaining({
        method: 'POST',
        body: data,
        headers: expect.objectContaining({ 'Content-Type': 'application/octet-stream' }),
      })
    );
    expect(result).toBeUndefined();
  });

  it('postBinary() throws FireflyError on non-2xx response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('Not Found', { status: 404 }));
    const client = new FireflyClient('https://firefly.example.com', 'token');
    await expect(client.postBinary('/attachments/999/upload', new Uint8Array([]))).rejects.toThrow(FireflyError);
  });

  it('getText returns raw response text', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('id,name\n1,Checking', { status: 200 })
    );
    const client = new FireflyClient('https://firefly.example.com', 'my-token');
    const result = await client.getText('/data/export/accounts', { type: 'csv' });
    expect(result).toBe('id,name\n1,Checking');
    expect(fetch).toHaveBeenCalledWith(
      'https://firefly.example.com/api/v1/data/export/accounts?type=csv',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('serializes string[] params as repeated query params', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('csv data', { status: 200 })
    );
    const client = new FireflyClient('https://firefly.example.com', 'my-token');
    await client.getText('/data/export/transactions', { 'columns[]': ['id', 'name'] });
    const calledUrl = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(calledUrl).toContain('columns%5B%5D=id');
    expect(calledUrl).toContain('columns%5B%5D=name');
  });
});

describe('formatError — updated cases', () => {
  it('returns bad request message for 400', () => {
    const err = new FireflyError(400, 'https://example.com', 'Bad Request');
    expect(formatError(err)).toBe('Bad request — check your input parameters.');
  });

  it('formats field errors from 422 JSON body', () => {
    const body = JSON.stringify({
      message: 'The given data was invalid.',
      errors: {
        'transactions.0.amount': ['The amount field is required.'],
        'transactions.0.type': ['Invalid type.'],
      },
    });
    const err = new FireflyError(422, 'https://example.com', body);
    const msg = formatError(err);
    expect(msg).toContain('transactions.0.amount');
    expect(msg).toContain('The amount field is required.');
  });

  it('falls back to generic 422 message when body is not JSON', () => {
    const err = new FireflyError(422, 'https://example.com', 'Unprocessable Entity');
    expect(formatError(err)).toBe('Invalid request parameters.');
  });

  it('does not include query string in error message', () => {
    const err = new FireflyError(
      404,
      'https://firefly.example.com/api/v1/accounts?page=1&secret=abc',
      'Not Found'
    );
    expect(err.message).not.toContain('secret=abc');
    expect(err.message).not.toContain('?page=1');
    expect(err.message).toContain('/api/v1/accounts');
  });
});
