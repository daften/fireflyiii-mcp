import { describe, it, expect, vi } from 'vitest';
import type { FireflyClient } from '../client.js';
import { fetchTransactions, fetchTransaction, createTransaction, updateTransaction, deleteTransaction, searchTransactions, createSplitTransaction } from '../tools/transactions.js';

const mockClient = { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } as unknown as FireflyClient;

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

const writeSingleFixture = {
  data: {
    id: '5',
    type: 'transactions',
    attributes: { description: 'Groceries', amount: '42.50', type: 'withdrawal' },
    links: {},
  },
};

describe('createTransaction', () => {
  it('posts to /transactions with wrapped body', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(writeSingleFixture);
    await createTransaction(mockClient, {
      type: 'withdrawal',
      date: '2024-01-15',
      amount: '42.50',
      description: 'Groceries',
      source_id: '1',
    });
    expect(mockClient.post).toHaveBeenCalledWith('/transactions', {
      apply_rules: true,
      fire_webhooks: true,
      transactions: [
        expect.objectContaining({
          type: 'withdrawal',
          date: '2024-01-15',
          amount: '42.50',
          description: 'Groceries',
          source_id: '1',
        }),
      ],
    });
  });

  it('returns unwrapped single', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(writeSingleFixture);
    const result = await createTransaction(mockClient, {
      type: 'withdrawal',
      date: '2024-01-15',
      amount: '42.50',
      description: 'Groceries',
    });
    expect(result).toEqual({ description: 'Groceries', amount: '42.50', type: 'withdrawal', id: '5' });
  });
});

describe('updateTransaction', () => {
  it('puts to /transactions/:id with wrapped body', async () => {
    mockClient.put = vi.fn().mockResolvedValueOnce(writeSingleFixture);
    await updateTransaction(mockClient, '5', { description: 'Updated' });
    expect(mockClient.put).toHaveBeenCalledWith('/transactions/5', {
      apply_rules: true,
      fire_webhooks: true,
      transactions: [{ description: 'Updated' }],
    });
  });

  it('returns unwrapped single', async () => {
    mockClient.put = vi.fn().mockResolvedValueOnce(writeSingleFixture);
    const result = await updateTransaction(mockClient, '5', { amount: '50.00' });
    expect(result).toEqual({ description: 'Groceries', amount: '42.50', type: 'withdrawal', id: '5' });
  });
});

describe('deleteTransaction', () => {
  it('calls delete on /transactions/:id', async () => {
    mockClient.delete = vi.fn().mockResolvedValueOnce(undefined);
    await deleteTransaction(mockClient, '5');
    expect(mockClient.delete).toHaveBeenCalledWith('/transactions/5');
  });

  it('returns deleted confirmation', async () => {
    mockClient.delete = vi.fn().mockResolvedValueOnce(undefined);
    const result = await deleteTransaction(mockClient, '5');
    expect(result).toEqual({ deleted: true, id: '5' });
  });
});

describe('searchTransactions', () => {
  it('calls /search/transactions with query and pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    await searchTransactions(mockClient, { query: 'groceries', page: 1, limit: 20 });
    expect(mockClient.get).toHaveBeenCalledWith('/search/transactions', {
      query: 'groceries',
      page: 1,
      limit: 20,
    });
  });

  it('returns flat items with pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    const result = await searchTransactions(mockClient, { query: 'groceries' });
    expect(result.data[0]).toEqual({ description: 'Groceries', amount: '-45.00', date: '2026-01-15', id: '101' });
    expect(result.pagination).toEqual({ page: 1, totalPages: 3, total: 120 });
  });
});

describe('createSplitTransaction', () => {
  it('posts to /transactions with shared fields copied into each split', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(writeSingleFixture);
    await createSplitTransaction(mockClient, {
      type: 'withdrawal',
      date: '2026-05-01',
      source_id: '1',
      splits: [
        { amount: '30.00', description: 'Groceries', category_name: 'Food' },
        { amount: '12.50', description: 'Cleaning supplies', category_name: 'Household' },
      ],
    });
    expect(mockClient.post).toHaveBeenCalledWith('/transactions', {
      apply_rules: true,
      fire_webhooks: true,
      transactions: [
        { type: 'withdrawal', date: '2026-05-01', source_id: '1', amount: '30.00', description: 'Groceries', category_name: 'Food' },
        { type: 'withdrawal', date: '2026-05-01', source_id: '1', amount: '12.50', description: 'Cleaning supplies', category_name: 'Household' },
      ],
    });
  });

  it('includes group_title when provided', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(writeSingleFixture);
    await createSplitTransaction(mockClient, {
      type: 'withdrawal',
      date: '2026-05-01',
      group_title: 'Supermarket run',
      splits: [
        { amount: '30.00', description: 'Groceries' },
        { amount: '12.50', description: 'Cleaning supplies' },
      ],
    });
    expect(mockClient.post).toHaveBeenCalledWith('/transactions', expect.objectContaining({
      group_title: 'Supermarket run',
    }));
  });

  it('returns unwrapped single', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(writeSingleFixture);
    const result = await createSplitTransaction(mockClient, {
      type: 'withdrawal',
      date: '2026-05-01',
      splits: [
        { amount: '30.00', description: 'Groceries' },
        { amount: '12.50', description: 'Cleaning supplies' },
      ],
    });
    // amount comes from the mock fixture, not a computed sum
    expect(result).toEqual({ description: 'Groceries', amount: '42.50', type: 'withdrawal', id: '5' });
  });

  it('omits undefined shared optional fields from each split', async () => {
    mockClient.post = vi.fn().mockResolvedValueOnce(writeSingleFixture);
    await createSplitTransaction(mockClient, {
      type: 'withdrawal',
      date: '2026-05-01',
      splits: [
        { amount: '30.00', description: 'Groceries' },
        { amount: '12.50', description: 'Cleaning supplies' },
      ],
    });
    const body = (mockClient.post as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(body.transactions[0]).not.toHaveProperty('source_id');
    expect(body.transactions[0]).not.toHaveProperty('destination_id');
    expect(body.transactions[0]).not.toHaveProperty('currency_code');
  });
});
