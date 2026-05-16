import { describe, it, expect, vi } from 'vitest';
import type { FireflyClient } from '../client.js';
import { fetchBills } from '../tools/bills.js';

const mockClient = { get: vi.fn() } as unknown as FireflyClient;

describe('fetchBills', () => {
  it('calls /bills with pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce({ data: [] });
    await fetchBills(mockClient, { page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/bills', { page: 1, limit: 50 });
  });

  it('includes date range when provided', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce({ data: [] });
    await fetchBills(mockClient, { start: '2026-01-01', end: '2026-12-31', page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/bills', {
      start: '2026-01-01',
      end: '2026-12-31',
      page: 1,
      limit: 50,
    });
  });
});
