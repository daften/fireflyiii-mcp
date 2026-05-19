import { describe, it, expect, vi } from 'vitest';
import type { FireflyClient } from '../client.js';
import { fetchRecurrences, fetchRecurrence } from '../tools/recurring.js';

const mockClient = { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } as unknown as FireflyClient;

const listFixture = {
  data: [
    {
      id: '1',
      type: 'recurrences',
      attributes: { title: 'Monthly rent', type: 'withdrawal', first_date: '2026-06-01', active: true },
      links: { self: 'https://firefly.example.com/api/v1/recurrences/1' },
    },
  ],
  meta: { pagination: { current_page: 1, total_pages: 1, total: 1 } },
};

const singleFixture = {
  data: {
    id: '1',
    type: 'recurrences',
    attributes: { title: 'Monthly rent', type: 'withdrawal', first_date: '2026-06-01', active: true },
    links: { self: 'https://firefly.example.com/api/v1/recurrences/1' },
  },
};

describe('fetchRecurrences', () => {
  it('calls /recurrences with pagination params', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    await fetchRecurrences(mockClient, { page: 1, limit: 20 });
    expect(mockClient.get).toHaveBeenCalledWith('/recurrences', { page: 1, limit: 20 });
  });

  it('returns flat items with pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    const result = await fetchRecurrences(mockClient, { page: 1, limit: 50 });
    expect(result.data[0]).toEqual({ title: 'Monthly rent', type: 'withdrawal', first_date: '2026-06-01', active: true, id: '1' });
    expect(result.pagination).toEqual({ page: 1, totalPages: 1, total: 1 });
  });
});

describe('fetchRecurrence', () => {
  it('calls /recurrences/:id', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(singleFixture);
    await fetchRecurrence(mockClient, '1');
    expect(mockClient.get).toHaveBeenCalledWith('/recurrences/1');
  });

  it('returns flat item', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(singleFixture);
    const result = await fetchRecurrence(mockClient, '1');
    expect(result).toEqual({ title: 'Monthly rent', type: 'withdrawal', first_date: '2026-06-01', active: true, id: '1' });
  });
});
