// End-to-end input checks through a real MCP client and server (in-memory transport), so the SDK's
// own schema validation runs exactly as it does for a connected AI client.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assertSafeApiPath, FireflyClient } from '../client.js';
import { createServer } from '../server.js';

describe('path IDs are validated before any request is made', () => {
  let client: Client;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    fetchSpy = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchSpy);
    const server = createServer(new FireflyClient('https://firefly.example.com', 'token'));
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    client = new Client({ name: 'test', version: '0.0.0' });
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
    vi.unstubAllGlobals();
  });

  const call = (name: string, args: Record<string, unknown>) =>
    client.callTool({ name, arguments: args }) as Promise<{ isError?: boolean; content: Array<{ text: string }> }>;

  it.each([
    // [tool, arguments]: each id would otherwise resolve to a different resource or leave /api/v1
    ['delete_bill', { id: '../budgets/5' }],
    ['delete_rule', { id: '%2e%2e/budgets/5' }],
    ['get_transaction', { id: '5?include=all' }],
    ['delete_account', { id: '../../../../admin' }], // autocomplete-label field, checked by parseId
    ['delete_budget_limit', { budget_id: '3', id: '../../accounts/1' }],
    ['get_transaction_links', { journal_id: '../9' }],
  ])('%s refuses %j', async (name, args) => {
    const result = await call(name, args);
    expect(result.isError).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('still accepts a plain numeric id and an autocomplete label', async () => {
    await call('delete_bill', { id: '12' });
    await call('delete_account', { id: '42 (Checking - asset)' });
    expect(fetchSpy.mock.calls.map(([url, init]) => `${(init as RequestInit).method} ${url}`)).toEqual([
      'DELETE https://firefly.example.com/api/v1/bills/12',
      'DELETE https://firefly.example.com/api/v1/accounts/42',
    ]);
  });

  it('percent-encodes a tag name, which Firefly III also accepts in place of an id', async () => {
    await call('delete_tag', { id: 'rent & bills/2026' });
    expect(fetchSpy.mock.calls[0][0]).toBe('https://firefly.example.com/api/v1/tags/rent%20%26%20bills%2F2026');
  });
});

describe('assertSafeApiPath', () => {
  it.each([
    '/accounts/../budgets/5',
    '/accounts/%2e%2e/budgets/5',
    '/accounts/%2E./x',
    '/accounts/./5',
    '/accounts/5?force=1',
    '/accounts/5#x',
    '/accounts/..\\budgets',
    '/accounts/.\n./budgets/5', // the URL parser strips the newline and would see `..`
    '/accounts/%zz',
    'accounts/5',
  ])('rejects %j', (path) => {
    expect(() => assertSafeApiPath(path)).toThrow('Refusing to call an unsafe Firefly III API path');
  });

  it.each(['/accounts', '/accounts/5', '/tags/rent%20%26%20bills', '/budgets/3/limits/7', '/data/export/piggy-banks'])(
    'accepts %j',
    (path) => {
      expect(() => assertSafeApiPath(path)).not.toThrow();
    },
  );

  it('is enforced by every FireflyClient request', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const ff = new FireflyClient('https://firefly.example.com', 'token');
    await expect(ff.delete('/accounts/../budgets/5')).rejects.toThrow('unsafe Firefly III API path');
    await expect(ff.getText('/data/export/../../x')).rejects.toThrow('unsafe Firefly III API path');
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
