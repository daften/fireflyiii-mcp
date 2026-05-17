import { describe, it, expect, vi } from 'vitest';
import type { FireflyClient } from '../client.js';
import { fetchPiggyBanks } from '../tools/piggy-banks.js';

const mockClient = { get: vi.fn() } as unknown as FireflyClient;

const listFixture = {
  data: [
    {
      id: '2',
      type: 'piggy_banks',
      attributes: { name: 'Holiday Fund', current_amount: '500.00', target_amount: '2000.00' },
      links: { self: 'https://firefly.example.com/api/v1/piggy-banks/2' },
    },
  ],
  meta: { pagination: { current_page: 1, total_pages: 1, total: 1 } },
};

describe('fetchPiggyBanks', () => {
  it('calls /piggy-banks with pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    await fetchPiggyBanks(mockClient, { page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/piggy-banks', { page: 1, limit: 50 });
  });

  it('returns flat items with pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    const result = await fetchPiggyBanks(mockClient, { page: 1, limit: 50 });
    expect(result.data[0]).toEqual({
      name: 'Holiday Fund',
      current_amount: '500.00',
      target_amount: '2000.00',
      id: '2',
    });
    expect(result.pagination).toEqual({ page: 1, totalPages: 1, total: 1 });
  });
});
