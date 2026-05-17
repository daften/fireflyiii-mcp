import { describe, it, expect, vi } from 'vitest';
import type { FireflyClient } from '../client.js';
import { fetchTransactions, fetchTransaction } from '../tools/transactions.js';

const mockClient = { get: vi.fn() } as unknown as FireflyClient;

const listFixture = {
  data: [
    {
      id: '101',
      type: 'transactions',
      attributes: { description: 'Groceries', amount: '-45.00', date: '2026-01-15' },
      links: { self: 'https://firefly.example.com/api/v1/transactions/101' },
    },
  ],
  meta: { pagination: { current_page: 1, total_pages: 3, total: 120 } },
};

const singleFixture = {
  data: {
    id: '123',
    type: 'transactions',
    attributes: { description: 'Salary', amount: '3000.00', date: '2026-01-01' },
    links: { self: 'https://firefly.example.com/api/v1/transactions/123' },
  },
};

describe('fetchTransactions', () => {
  it('calls /transactions with all provided filters', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    await fetchTransactions(mockClient, {
      type: 'withdrawal',
      accountId: '5',
      start: '2026-01-01',
      end: '2026-01-31',
      page: 1,
      limit: 50,
    });
    expect(mockClient.get).toHaveBeenCalledWith('/transactions', {
      type: 'withdrawal',
      account_id: '5',
      start: '2026-01-01',
      end: '2026-01-31',
      page: 1,
      limit: 50,
    });
  });

  it('omits undefined filters', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    await fetchTransactions(mockClient, { page: 1, limit: 20 });
    expect(mockClient.get).toHaveBeenCalledWith('/transactions', { page: 1, limit: 20 });
  });

  it('returns flat items with pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    const result = await fetchTransactions(mockClient, { page: 1, limit: 50 });
    expect(result.data[0]).toEqual({ description: 'Groceries', amount: '-45.00', date: '2026-01-15', id: '101' });
    expect(result.pagination).toEqual({ page: 1, totalPages: 3, total: 120 });
  });
});

describe('fetchTransaction', () => {
  it('calls /transactions/:id', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(singleFixture);
    await fetchTransaction(mockClient, '123');
    expect(mockClient.get).toHaveBeenCalledWith('/transactions/123');
  });

  it('returns flat item', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(singleFixture);
    const result = await fetchTransaction(mockClient, '123');
    expect(result).toEqual({ description: 'Salary', amount: '3000.00', date: '2026-01-01', id: '123' });
  });
});
