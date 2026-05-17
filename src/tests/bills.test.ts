import { describe, it, expect, vi } from 'vitest';
import type { FireflyClient } from '../client.js';
import { fetchBills } from '../tools/bills.js';

const mockClient = { get: vi.fn() } as unknown as FireflyClient;

const listFixture = {
  data: [
    {
      id: '5',
      type: 'bills',
      attributes: { name: 'Rent', amount_min: '800.00', amount_max: '800.00', active: true },
      links: { self: 'https://firefly.example.com/api/v1/bills/5' },
    },
  ],
  meta: { pagination: { current_page: 1, total_pages: 1, total: 1 } },
};

describe('fetchBills', () => {
  it('calls /bills with date range and pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    await fetchBills(mockClient, { start: '2026-01-01', end: '2026-01-31', page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/bills', {
      start: '2026-01-01',
      end: '2026-01-31',
      page: 1,
      limit: 50,
    });
  });

  it('omits undefined date params', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    await fetchBills(mockClient, { page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/bills', { page: 1, limit: 50 });
  });

  it('returns flat items with pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    const result = await fetchBills(mockClient, { page: 1, limit: 50 });
    expect(result.data[0]).toEqual({ name: 'Rent', amount_min: '800.00', amount_max: '800.00', active: true, id: '5' });
    expect(result.pagination).toEqual({ page: 1, totalPages: 1, total: 1 });
  });
});
