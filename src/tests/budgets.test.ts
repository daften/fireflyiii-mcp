import { describe, it, expect, vi } from 'vitest';
import type { FireflyClient } from '../client.js';
import { fetchBudgets, fetchBudgetLimits } from '../tools/budgets.js';

const mockClient = { get: vi.fn() } as unknown as FireflyClient;

const listFixture = {
  data: [
    {
      id: '3',
      type: 'budgets',
      attributes: { name: 'Groceries', active: true },
      links: { self: 'https://firefly.example.com/api/v1/budgets/3' },
    },
  ],
  meta: { pagination: { current_page: 1, total_pages: 1, total: 1 } },
};

describe('fetchBudgets', () => {
  it('calls /budgets with pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    await fetchBudgets(mockClient, { page: 1, limit: 50 });
    expect(mockClient.get).toHaveBeenCalledWith('/budgets', { page: 1, limit: 50 });
  });

  it('returns flat items with pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    const result = await fetchBudgets(mockClient, { page: 1, limit: 50 });
    expect(result.data[0]).toEqual({ name: 'Groceries', active: true, id: '3' });
    expect(result.pagination).toEqual({ page: 1, totalPages: 1, total: 1 });
  });
});

describe('fetchBudgetLimits', () => {
  it('calls /budgets/:id/limits with date range', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    await fetchBudgetLimits(mockClient, '3', '2026-01-01', '2026-01-31');
    expect(mockClient.get).toHaveBeenCalledWith('/budgets/3/limits', {
      start: '2026-01-01',
      end: '2026-01-31',
    });
  });

  it('calls /budgets/:id/limits without dates when not provided', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    await fetchBudgetLimits(mockClient, '3');
    expect(mockClient.get).toHaveBeenCalledWith('/budgets/3/limits', {});
  });

  it('returns flat items with pagination', async () => {
    mockClient.get = vi.fn().mockResolvedValueOnce(listFixture);
    const result = await fetchBudgetLimits(mockClient, '3', '2026-01-01', '2026-01-31');
    expect(result.data[0]).toEqual({ name: 'Groceries', active: true, id: '3' });
  });
});
