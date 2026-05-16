import { describe, it, expect, vi } from 'vitest';
import type { FireflyClient } from '../client.js';
import { fetchAccounts, fetchAccount } from '../tools/accounts.js';

const mockClient = { get: vi.fn() } as unknown as FireflyClient;

describe('fetchAccounts', () => {
  it('calls /accounts with type filter when type is not "all"', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce({ data: [] });
    await fetchAccounts(mockClient, { type: 'asset', page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/accounts', {
      type: 'asset',
      page: 1,
      limit: 50,
    });
  });

  it('omits type param when type is "all"', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce({ data: [] });
    await fetchAccounts(mockClient, { type: 'all', page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/accounts', { page: 1, limit: 50 });
  });

  it('omits type param when type is undefined', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce({ data: [] });
    await fetchAccounts(mockClient, { page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/accounts', { page: 1, limit: 50 });
  });
});

describe('fetchAccount', () => {
  it('calls /accounts/:id', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce({ data: {} });
    await fetchAccount(mockClient, '42');
    expect(mockClient.get).toHaveBeenCalledWith('/accounts/42');
  });
});
