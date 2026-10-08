import { describe, expect, it, vi } from 'vitest';
import type { FireflyClient } from '../client.js';
import { FireflyClient as RealFireflyClient } from '../client.js';
import { EXPORT_MAX_BYTES, exportEntity, registerExportTools } from '../tools/exports.js';
import { createMockServer } from './_helpers.js';

const LIMIT = { maxBytes: EXPORT_MAX_BYTES };

const mockClient = {
  getText: vi.fn(),
} as unknown as FireflyClient;

describe('exportEntity', () => {
  it('calls getText with /data/export/transactions and type=csv', async () => {
    mockClient.getText = vi.fn().mockResolvedValueOnce('id,date,amount\n1,2026-01-01,50');
    const result = await exportEntity(mockClient, 'transactions', {});
    expect(mockClient.getText).toHaveBeenCalledWith('/data/export/transactions', { type: 'csv' }, LIMIT);
    expect(result).toBe('id,date,amount\n1,2026-01-01,50');
  });

  it('passes start/end for transactions', async () => {
    mockClient.getText = vi.fn().mockResolvedValueOnce('csv data');
    await exportEntity(mockClient, 'transactions', { start: '2026-01-01', end: '2026-01-31' });
    expect(mockClient.getText).toHaveBeenCalledWith(
      '/data/export/transactions',
      {
        type: 'csv',
        start: '2026-01-01',
        end: '2026-01-31',
      },
      LIMIT,
    );
  });

  it('calls getText with /data/export/accounts', async () => {
    mockClient.getText = vi.fn().mockResolvedValueOnce('id,name\n1,Checking');
    await exportEntity(mockClient, 'accounts', {});
    expect(mockClient.getText).toHaveBeenCalledWith('/data/export/accounts', { type: 'csv' }, LIMIT);
  });

  it('calls getText with /data/export/bills', async () => {
    mockClient.getText = vi.fn().mockResolvedValueOnce('id,name\n1,Rent');
    await exportEntity(mockClient, 'bills', {});
    expect(mockClient.getText).toHaveBeenCalledWith('/data/export/bills', { type: 'csv' }, LIMIT);
  });

  it('calls getText with /data/export/budgets', async () => {
    mockClient.getText = vi.fn().mockResolvedValueOnce('id,name\n1,Groceries');
    await exportEntity(mockClient, 'budgets', {});
    expect(mockClient.getText).toHaveBeenCalledWith('/data/export/budgets', { type: 'csv' }, LIMIT);
  });

  it('calls getText with /data/export/categories', async () => {
    mockClient.getText = vi.fn().mockResolvedValueOnce('id,name\n1,Food');
    await exportEntity(mockClient, 'categories', {});
    expect(mockClient.getText).toHaveBeenCalledWith('/data/export/categories', { type: 'csv' }, LIMIT);
  });

  it('calls getText with /data/export/tags', async () => {
    mockClient.getText = vi.fn().mockResolvedValueOnce('id,name\n1,urgent');
    await exportEntity(mockClient, 'tags', {});
    expect(mockClient.getText).toHaveBeenCalledWith('/data/export/tags', { type: 'csv' }, LIMIT);
  });

  it('calls getText with /data/export/recurring', async () => {
    mockClient.getText = vi.fn().mockResolvedValueOnce('id,name\n1,Monthly Rent');
    await exportEntity(mockClient, 'recurring', {});
    expect(mockClient.getText).toHaveBeenCalledWith('/data/export/recurring', { type: 'csv' }, LIMIT);
  });

  it('calls getText with /data/export/rules', async () => {
    mockClient.getText = vi.fn().mockResolvedValueOnce('id,name\n1,Auto Tag');
    await exportEntity(mockClient, 'rules', {});
    expect(mockClient.getText).toHaveBeenCalledWith('/data/export/rules', { type: 'csv' }, LIMIT);
  });

  it('calls getText with /data/export/piggy-banks', async () => {
    mockClient.getText = vi.fn().mockResolvedValueOnce('id,name\n1,Vacation Fund');
    await exportEntity(mockClient, 'piggy-banks', {});
    expect(mockClient.getText).toHaveBeenCalledWith('/data/export/piggy-banks', { type: 'csv' }, LIMIT);
  });
});

describe('handler smoke — exports', () => {
  it('export_transactions handler returns text content on success', async () => {
    const { server, handlers } = createMockServer();
    const client = { getText: vi.fn().mockResolvedValueOnce('csv data') } as unknown as FireflyClient;
    registerExportTools(server, client);
    const result = await handlers.get('export_transactions')!({});
    expect(result).toMatchObject({ content: [{ type: 'text', text: expect.any(String) }] });
  });

  it('export_transactions handler returns isError on failure', async () => {
    const { server, handlers } = createMockServer();
    const client = { getText: vi.fn().mockRejectedValueOnce(new Error('Network error')) } as unknown as FireflyClient;
    registerExportTools(server, client);
    const result = await handlers.get('export_transactions')!({});
    expect(result).toMatchObject({ isError: true });
  });
});

describe('export size limit', () => {
  it('refuses an export over EXPORT_MAX_BYTES with advice instead of returning it', async () => {
    const big = 'x'.repeat(EXPORT_MAX_BYTES + 1);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(big, { status: 200 })),
    );
    const client = new RealFireflyClient('https://firefly.example.com', 'token');
    await expect(exportEntity(client, 'transactions', {})).rejects.toThrow(
      /transactions export is larger than 512 KiB.*shorter start\/end range/,
    );
    await expect(exportEntity(client, 'tags', {})).rejects.toThrow(/Use the matching get_\* tool/);
    vi.unstubAllGlobals();
  });

  it('returns an export under the limit unchanged', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('id,amount\n1,5', { status: 200 })),
    );
    const client = new RealFireflyClient('https://firefly.example.com', 'token');
    await expect(exportEntity(client, 'bills', {})).resolves.toBe('id,amount\n1,5');
    vi.unstubAllGlobals();
  });
});

describe('export date range', () => {
  it.each([[{ start: '2026-01-01' }], [{ end: '2026-01-31' }]])(
    'rejects a half-open range %j before calling Firefly',
    async (range) => {
      mockClient.getText = vi.fn();
      await expect(exportEntity(mockClient, 'transactions', range)).rejects.toThrow('Pass start and end together');
      expect(mockClient.getText).not.toHaveBeenCalled();
    },
  );
});
