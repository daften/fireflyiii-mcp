import { describe, it, expect, vi } from 'vitest';
import type { FireflyClient } from '../client.js';
import { fetchAccounts, fetchAccount } from '../tools/accounts.js';

const mockClient = { get: vi.fn() } as unknown as FireflyClient;

const listFixture = {
  data: [
    {
      id: '1',
      type: 'accounts',
      attributes: { name: 'Checking', current_balance: '1000.00', active: true },
      links: { self: 'https://firefly.example.com/api/v1/accounts/1' },
    },
  ],
  meta: { pagination: { current_page: 1, total_pages: 1, total: 1 } },
};

const singleFixture = {
  data: {
    id: '42',
    type: 'accounts',
    attributes: { name: 'Savings', current_balance: '5000.00', active: true },
    links: { self: 'https://firefly.example.com/api/v1/accounts/42' },
  },
};

describe('fetchAccounts', () => {
  it('calls /accounts with type filter when type is not "all"', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    await fetchAccounts(mockClient, { type: 'asset', page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/accounts', { type: 'asset', page: 1, limit: 50 });
  });

  it('omits type param when type is "all"', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    await fetchAccounts(mockClient, { type: 'all', page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/accounts', { page: 1, limit: 50 });
  });

  it('omits type param when type is undefined', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    await fetchAccounts(mockClient, { page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/accounts', { page: 1, limit: 50 });
  });

  it('returns flat items with pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    const result = await fetchAccounts(mockClient, { page: 1, limit: 50 });
    expect(result.data[0]).toEqual({ name: 'Checking', current_balance: '1000.00', active: true, id: '1' });
    expect(result.pagination).toEqual({ page: 1, totalPages: 1, total: 1 });
  });
});

describe('fetchAccount', () => {
  it('calls /accounts/:id', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(singleFixture);
    await fetchAccount(mockClient, '42');
    expect(mockClient.get).toHaveBeenCalledWith('/accounts/42');
  });

  it('returns flat item', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(singleFixture);
    const result = await fetchAccount(mockClient, '42');
    expect(result).toEqual({ name: 'Savings', current_balance: '5000.00', active: true, id: '42' });
  });
});
